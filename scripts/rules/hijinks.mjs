/**
 * Hideouts and hijinks (pp. 360-369).
 *
 * Pure — no Foundry globals, no `Roll` — so every figure here can be asserted
 * against the rulebook's own worked examples under plain `node --test`.
 *
 * Two people earn from a hijink and they earn differently, which is the shape
 * of this whole chapter: a **member** takes XP equal to half the gp value of
 * what he personally pulled off, while a **boss** takes his whole month's take
 * less what it cost him, measured against his threshold (p. 423). Neither
 * figure is derivable from the other, so both live here side by side.
 *
 * Throws are not computed. The book resolves hijinks against thief skills, and
 * the ACKS system cannot express a character's thief skill values in a form
 * worth trusting any more than it can express proficiency ranks — so the Judge
 * enters what was needed and what was rolled, and this module says what that
 * means.
 */

import {
  CAUGHT,
  CRIME_FINES,
  HIDEOUTS,
  FINE_BUYOUT_MULTIPLE,
  HIJINK_IDS,
  LAY_LOW_DICE,
  MEMBER_XP_FRACTION,
  PERFORM_PLANNED_DAYS,
  TIME_LANGUISHING,
  ZEROTH_LEVEL_VICTIM_FRACTION,
  hideout,
  hijink,
  hijinkFee,
  hijinkTiming,
  memberTribute
} from "./tables.mjs";

import { average, isExpression } from "./dice.mjs";

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const whole = (v) => Math.max(0, Math.floor(num(v)));

/** Two decimal places, which is the smallest coin the rules ever quote. */
const gp = (v) => Math.round(num(v) * 100) / 100;

/* ------------------------------------------------------------------ *
 * Where a syndicate operates (p. 360)
 * ------------------------------------------------------------------ */

/**
 * How big a syndicate can grow, and how high it can reach.
 *
 * Two independent caps meet here. A hideout worth at least a tier's listed
 * value supports that tier's membership; the settlement's own class caps both
 * the membership and the effective level, and no amount of building gets past
 * it — Viktir's 75,000gp mansion in a Class IV town still runs 100 members.
 */
export function syndicateLimits(marketClassId, hideoutValue = 0) {
  const settlement = hideout(marketClassId);
  const spend = Math.max(0, num(hideoutValue));

  // The largest membership tier the hideout itself pays for, read off the same
  // table, whatever market the hideout happens to stand in.
  const afforded = Object.values(HIDEOUTS).filter((tier) => spend >= tier.minHideout);
  const byHideout = afforded.length ? Math.max(...afforded.map((t) => t.maxMembers)) : 0;

  return {
    maxMembers: Math.min(byHideout, settlement.maxMembers),
    byHideout,
    maxEffectiveLevel: settlement.maxEffectiveLevel,
    marketCap: settlement.maxMembers,
    /** The settlement, not the purse, is what is holding the syndicate back. */
    cappedByMarket: byHideout > settlement.maxMembers,
    /** More hideout would buy more members here. */
    couldGrow: byHideout < settlement.maxMembers
  };
}

/**
 * The level a perpetrator counts as for rewards and targets (p. 360).
 *
 * "A perpetrator whose class level is higher than the maximum effective level
 * permitted by the market class he is in must use the maximum effective level
 * to determine the level of his target and the amount of earnings. The
 * perpetrator still uses his class level for calculating his throw values."
 *
 * A 0th level perpetrator counts as 1st for reward (p. 360).
 */
export function effectiveLevel(classLevel, marketClassId) {
  const own = Math.max(1, whole(classLevel));
  const cap = hideout(marketClassId).maxEffectiveLevel;
  return { level: Math.min(own, cap), own, cap, capped: own > cap };
}

/* ------------------------------------------------------------------ *
 * What a hijink is worth (p. 361 and the List of Hijinks)
 * ------------------------------------------------------------------ */

/**
 * The expected gp a successful hijink brings the boss.
 *
 * `basis` decides what the reward scales with:
 *
 *   perpetrator  the perpetrator's effective level, or a crew's summed levels
 *   victim       the victim's level, which the perpetrator's own level sets
 *   none         arson, escaping, infiltrating, sabotaging, slandering and
 *                subverting have no cash value at all; they are done for other
 *                reasons and the results panel says so rather than showing 0gp
 *                as though something had gone wrong
 *
 * Deterministic: the dice in the table are averaged, exactly as the spellcasting
 * activity averages its one-in-six. `rollHijink` throws them for real.
 */
export function hijinkValue({
  hijinkId = "carousing",
  level = 1,
  victimLevel = null,
  hasty = false
} = {}) {
  const job = hijink(hijinkId);

  if (job.basis === "none") {
    return { gold: 0, cash: false, expression: null, perLevel: 0, level: whole(level), share: 1 };
  }

  const expression = hasty && job.hasty ? job.hastyGp : job.gp;

  // Hasty carousing yields a rumour with a one-in-four chance of being true
  // rather than a smaller sum, so there is no figure to report.
  if (expression === null || expression === undefined) {
    return { gold: 0, cash: true, expression: null, perLevel: 0, level: whole(level), share: 1, unpriced: true };
  }

  const perLevel = isExpression(expression) ? average(expression) : num(expression);
  const share = job.share ?? 1;

  if (job.basis === "victim") {
    // A 0th level victim is worth half a level's bounty or ransom.
    const victim = victimLevel === null ? whole(level) : Math.max(0, num(victimLevel));
    const levels = victim === 0 ? ZEROTH_LEVEL_VICTIM_FRACTION : victim;
    return {
      gold: gp(perLevel * levels * share),
      cash: true, expression, perLevel, level: levels, share, victimLevel: victim
    };
  }

  const levels = Math.max(1, whole(level));
  return { gold: gp(perLevel * levels * share), cash: true, expression, perLevel, level: levels, share };
}

/** The band of victim levels a hijink may be aimed at (pp. 363, 365). */
export function victimBand(hijinkId, level) {
  const job = hijink(hijinkId);
  if (!job.victimSpread) return null;
  const centre = Math.max(1, whole(level));
  return { from: Math.max(0, centre - job.victimSpread), to: centre + job.victimSpread };
}

/* ------------------------------------------------------------------ *
 * Crews (pp. 362-363)
 * ------------------------------------------------------------------ */

/**
 * Resolve a crew's hijink.
 *
 * The rules here are unusually interlocking and each clause matters:
 *
 *   - the honcho is the highest-level perpetrator, ties broken by Charisma;
 *   - a crew may hold as many as the honcho has henchman slots, and every
 *     member beyond that is -1 on *everyone's* throw;
 *   - one success is enough for the hijink to succeed;
 *   - the levels of everyone who succeeded are added together, and that sum is
 *     the perpetrator level the reward scales with;
 *   - if anybody is caught, everybody who did not succeed is caught too — so a
 *     hijink can succeed and still cost you half the crew;
 *   - the gp and the XP are split pro rata by level among those who got away.
 *
 * @param {object[]} crew  each `{ name, classLevel, cha, succeeded, caught }`
 */
export function crewResolution({ crew = [], hijinkId = "stealing", marketClassId = "IV", victimLevel = null, hasty = false } = {}) {
  const members = (Array.isArray(crew) ? crew : []).map((row, index) => ({
    index,
    name: String(row?.name ?? "").trim(),
    classLevel: whole(row?.classLevel),
    cha: num(row?.cha),
    succeeded: !!row?.succeeded,
    caughtRolled: !!row?.caught
  }));

  if (!members.length) {
    return { members: [], honcho: null, sizePenalty: 0, succeeded: false, effectiveLevel: 0, gold: 0, shares: [] };
  }

  // Highest level, then highest Charisma.
  const honcho = [...members].sort(
    (a, b) => b.classLevel - a.classLevel || b.cha - a.cha || a.index - b.index
  )[0];

  const slots = henchmanSlots(honcho.cha);
  const sizePenalty = Math.max(0, members.length - slots);

  // Anyone caught drags down everyone who did not succeed.
  const anyCaught = members.some((m) => m.caughtRolled);
  const resolved = members.map((m) => {
    // The market's ceiling limits what any one perpetrator can reach (p. 360),
    // so it is applied per head and the capped levels are then summed — two
    // 7th level thieves in a Class IV town are worth 14 levels of loot between
    // them, where one 14th level thief alone would be worth 7.
    const effective = effectiveLevel(m.classLevel, marketClassId);
    return {
      ...m,
      isHoncho: m.index === honcho.index,
      effectiveLevel: effective.level,
      levelCapped: effective.capped,
      caught: m.caughtRolled || (anyCaught && !m.succeeded)
    };
  });

  const succeeded = resolved.some((m) => m.succeeded);
  const summedLevel = resolved
    .filter((m) => m.succeeded)
    .reduce((sum, m) => sum + m.effectiveLevel, 0);

  const value = succeeded
    ? hijinkValue({ hijinkId, level: summedLevel, victimLevel, hasty })
    : { gold: 0, cash: hijink(hijinkId).basis !== "none" };

  // Split pro rata by level among everyone who got away — which is not the same
  // set as those who succeeded: a crew mate who failed but was not caught still
  // shares, and one who succeeded is never caught.
  const sharers = resolved.filter((m) => !m.caught);
  const sharedLevels = sharers.reduce((sum, m) => sum + Math.max(1, m.classLevel), 0);

  const shares = resolved.map((m) => {
    const weight = m.caught || sharedLevels === 0 ? 0 : Math.max(1, m.classLevel) / sharedLevels;
    const gold = gp(value.gold * weight);
    return { ...m, weight, gold, xp: Math.max(0, Math.round(gold * MEMBER_XP_FRACTION)) };
  });

  return {
    members: resolved,
    honcho: honcho.index,
    slots,
    sizePenalty,
    succeeded,
    summedLevel,
    gold: value.gold,
    cash: value.cash !== false,
    shares
  };
}

/**
 * How many henchmen a Charisma score allows (p. 168), which is also how large a
 * crew the honcho can run without penalty: four, adjusted by his modifier.
 */
export function henchmanSlots(cha = 0) {
  return Math.max(1, 4 + chaModifier(cha));
}

/** The ACKS ability modifier ladder, for the one place this module needs it. */
function chaModifier(score) {
  const n = num(score, 10);
  if (n >= 18) return 3;
  if (n >= 16) return 2;
  if (n >= 13) return 1;
  if (n >= 9) return 0;
  if (n >= 6) return -1;
  if (n >= 4) return -2;
  return -3;
}

/* ------------------------------------------------------------------ *
 * Getting caught (pp. 360, 362-363, 367-368)
 * ------------------------------------------------------------------ */

/**
 * Whether a throw got the perpetrator arrested.
 *
 * Ordinarily a throw failed by 14 or more, or an unmodified 1. A perpetrator
 * who skipped laying low after his last job is watched much more closely: 11 or
 * an unmodified 1 to 3. A hasty hijink is the one that forgives — the throw is
 * repeated, and only a second failure is an arrest.
 *
 * @param {object} args
 * @param {number} args.target   the throw the perpetrator needed
 * @param {number} args.rolled   the adjusted result
 * @param {number} args.natural  the unmodified die
 */
export function caughtCheck({ target = 0, rolled = 0, natural = null, laidLow = true, hasty = false, secondRolled = null } = {}) {
  const band = laidLow ? CAUGHT.normal : CAUGHT.didNotLayLow;
  const margin = num(rolled) - num(target);
  const succeeded = margin >= 0;

  const die = natural === null ? null : whole(natural);
  const triggered = !succeeded && (margin <= -band.failBy || (die !== null && die <= band.naturalAtMost));

  if (!triggered) return { succeeded, caught: false, margin, band, reprieved: false };

  // A hasty hijink throws again; only a second failure is an arrest.
  if (hasty) {
    if (secondRolled === null) return { succeeded, caught: false, margin, band, pendingSecondThrow: true };
    const second = num(secondRolled) - num(target);
    return { succeeded, caught: second < 0, margin, band, reprieved: second >= 0, secondMargin: second };
  }

  return { succeeded, caught: true, margin, band, reprieved: false };
}

/** What a caught perpetrator is charged with, on the hijink's own 1d6 (p. 367). */
export function chargeFor(hijinkId, d6) {
  const charges = hijink(hijinkId).charges;
  if (!charges) return null;
  const roll = Math.max(1, Math.min(6, whole(d6) || 1));
  return charges[roll - 1];
}

/** How long the accused sits in a cell before trial (p. 367). */
export function timeLanguishing(crime) {
  return TIME_LANGUISHING[crime] ?? null;
}

/**
 * What a conviction costs the boss (p. 368).
 *
 * Only the fine is computed. The stocks, the whip, the brand, the amputations
 * and the executions beside it in the table are named and cited but not
 * reproduced: they decide a character's fate rather than his boss's ledger, and
 * that is the Judge's business, not a calculator's.
 *
 * Paying three times a fine buys off everything else that came with it, which
 * is the one place the corporal punishments touch the money.
 */
export function convictionCost(crime, severity = "standard", { buyOut = false } = {}) {
  const fines = CRIME_FINES[crime];
  if (!fines) return null;

  const fine = fines[severity] ?? fines.standard;
  return {
    crime,
    severity,
    fine,
    /** Three times the fine, to avoid the punishment that came with it. */
    buyOutCost: fine * FINE_BUYOUT_MULTIPLE,
    payable: buyOut ? fine * FINE_BUYOUT_MULTIPLE : fine,
    /** Above this band the table stops levying fines and starts taking lives. */
    fatal: fine === 0
  };
}

/* ------------------------------------------------------------------ *
 * The boss's month (pp. 361, 423)
 * ------------------------------------------------------------------ */

/**
 * Tribute from members who were given no work (p. 361).
 *
 * "A syndicate member who is not assigned a hijink by his boss receives no
 * wages that month and still earns money for his boss." The tribute table is
 * tuned to the average profit of ordering a hijink, so a boss who does not want
 * to roll anything can simply collect it — which is what the XP chapter means
 * by its "Monthly Hijink Income table".
 *
 * @param {object} members  a count of members by level, `{ 0: 50, 1: 30, ... }`
 */
export function tributeIncome(members = {}, marketClassId = "IV") {
  const cap = hideout(marketClassId).maxEffectiveLevel;

  const rows = Object.keys(members ?? {})
    .map(Number)
    .filter((level) => Number.isFinite(level) && level >= 0)
    .sort((a, b) => a - b)
    .map((level) => {
      const count = whole(members[level]);
      // "Members whose level exceeds the maximum effective level for their
      // market pay tribute based on the maximum effective level."
      const paying = Math.min(level, cap);
      const each = memberTribute(paying);
      return { level, paying, capped: paying < level, count, each, total: count * each };
    })
    .filter((row) => row.count > 0);

  return {
    rows,
    headcount: rows.reduce((sum, r) => sum + r.count, 0),
    total: gp(rows.reduce((sum, r) => sum + r.total, 0))
  };
}

/**
 * What it costs to put a syndicate to work (p. 361): a fee per member ordered,
 * 6gp at 0th level and a month's henchman wages above it.
 */
export function assignmentCost(assignments = {}) {
  const rows = Object.keys(assignments ?? {})
    .map(Number)
    .filter((level) => Number.isFinite(level) && level >= 0)
    .sort((a, b) => a - b)
    .map((level) => {
      const count = whole(assignments[level]);
      const each = hijinkFee(level);
      return { level, count, each, total: count * each };
    })
    .filter((row) => row.count > 0);

  return {
    rows,
    ordered: rows.reduce((sum, r) => sum + r.count, 0),
    total: gp(rows.reduce((sum, r) => sum + r.total, 0))
  };
}

/**
 * How many days of the boss's month go on giving orders (p. 361): twelve
 * hijinks fit into an ancillary activity, a hundred into a dedicated one.
 */
export const HIJINKS_PER_ANCILLARY = 12;
export const HIJINKS_PER_DEDICATED = 100;

export function assignmentDays(ordered) {
  const n = whole(ordered);
  return {
    ordered: n,
    ancillary: n <= HIJINKS_PER_ANCILLARY,
    dedicatedDays: Math.ceil(n / HIJINKS_PER_DEDICATED)
  };
}

/** How long each stage of a hijink takes, for the perpetrator's level (p. 362). */
export function hijinkSchedule(hijinkId, level, { hasty = false } = {}) {
  const job = hijink(hijinkId);
  const band = hijinkTiming(level);

  if (hasty && job.hasty) {
    return { plan: null, perform: band.hasty, layLow: null, hasty: true, planned: false };
  }

  return {
    plan: job.plans ? band.plan : null,
    perform: job.plans ? String(PERFORM_PLANNED_DAYS) : band.performOngoing,
    layLow: job.plans ? LAY_LOW_DICE : null,
    hasty: false,
    planned: job.plans
  };
}

/** Every hijink that pays the boss in coin, for the activity's own choice list. */
export const CASH_HIJINK_IDS = HIJINK_IDS.filter((id) => hijink(id).basis !== "none");
