/**
 * The downtime work calculator.
 *
 * Pure functions over plain objects — no Foundry globals — so this module can be
 * exercised by `node --test` against the worked examples in the rulebook.
 *
 * `calculate` is deterministic: it reports what an activity is *expected* to
 * earn, which is what the results panel shows as you type. Activities decided by
 * dice are rolled through `rollIncome`, which takes its randomness as an
 * argument, so a re-render never re-rolls and a test never flakes.
 */

import {
  DAYS_PER_MONTH,
  GAMBLING_DIE,
  SPELL_SALE_ON,
  availabilityFor,
  marketClass,
  specialistGrade,
  tradeLadder,
  xpThreshold
} from "./tables.mjs";

import { earnsXp, getActivityType, spellcastingRows } from "./activity-types.mjs";
import { roll } from "./dice.mjs";

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Whether an optional numeric field was actually filled in. Foundry hands back
 * null for a cleared number input and "" for a cleared text input, and
 * Number(null) is 0 — so both have to be screened out explicitly.
 */
const isBlank = (v) => v === null || v === undefined || v === "";

/* ------------------------------------------------------------------ *
 * Campaign XP
 * ------------------------------------------------------------------ */

/**
 * Campaign XP from a month's income (p. 423): only the part above the
 * character's monthly XP threshold counts.
 *
 * A 0th level character has no listed threshold but is treated as having 25gp
 * for domain and mercantile income (p. 425), which `xpThreshold` returns.
 *
 * This is the only place a threshold is ever subtracted. Every XP-earning
 * activity reaches it through `buildXp` below, because the same clause written
 * out at several call sites is how `mrw-007` and `mrw-008` both happened.
 */
export function campaignXp(income, classLevel) {
  const threshold = xpThreshold(classLevel);
  return { threshold, earned: Math.max(0, Math.round(num(income) - threshold)) };
}

/** An operator's weight in the profit split: a henchman or follower gets half (p. 424). */
const OPERATOR_WEIGHT = { pc: 1, henchman: 0.5, follower: 0.5, hireling: 0 };

/**
 * Split a venture's mercantile income for XP purposes (p. 424).
 *
 * Half the profit goes to whoever owns the venture's assets, pro rata by share,
 * and half is divided among the people who ran it — henchmen and followers at a
 * half share each. Hired mercenaries and specialists get nothing either way.
 * Only then is each character's own share measured against his own threshold,
 * which is what stops one large venture from levelling up a whole crew.
 *
 * `ownership` is taken pro rata over whatever is entered, so a column of
 * percentages and a column of gold contributed both work: Caleför's 30,000gp
 * against 50,000gp total is the same 60% either way.
 *
 * A venture that lost money has no profit to divide, and the book only splits
 * profits — so every share is zero and `profitable` says why.
 */
export function mercantileSplit(income, participants = []) {
  const list = (Array.isArray(participants) ? participants : []).map((row, index) => ({
    index,
    name: String(row?.name ?? "").trim(),
    role: OPERATOR_WEIGHT[row?.role] === undefined ? "pc" : row.role,
    ownership: Math.max(0, num(row?.ownership)),
    classLevel: Math.max(0, Math.floor(num(row?.classLevel))),
    isSelf: !!row?.isSelf
  }));

  const profit = num(income);
  const profitable = profit > 0;
  const pool = profitable ? profit / 2 : 0;

  // A hireling is paid a wage, not a share, so neither pool reaches him.
  const sharers = list.filter((p) => p.role !== "hireling");
  const ownedTotal = sharers.reduce((sum, p) => sum + p.ownership, 0);
  const operatorWeight = sharers.reduce((sum, p) => sum + OPERATOR_WEIGHT[p.role], 0);

  const shares = list.map((p) => {
    const excluded = p.role === "hireling";
    const ownerShare = !excluded && ownedTotal > 0 ? (pool * p.ownership) / ownedTotal : 0;
    const operatorShare = !excluded && operatorWeight > 0
      ? (pool * OPERATOR_WEIGHT[p.role]) / operatorWeight
      : 0;
    const share = ownerShare + operatorShare;

    return {
      ...p,
      excluded,
      ownershipFraction: ownedTotal > 0 ? p.ownership / ownedTotal : 0,
      ownerShare: Math.round(ownerShare * 100) / 100,
      operatorShare: Math.round(operatorShare * 100) / 100,
      share: Math.round(share * 100) / 100,
      ...campaignXp(share, p.classLevel)
    };
  });

  return {
    income: profit,
    profitable,
    ownerPool: Math.round(pool * 100) / 100,
    operatorPool: Math.round(pool * 100) / 100,
    ownedTotal,
    operatorWeight,
    shares
  };
}

/**
 * The XP an activity earns, dispatched on the record's declared `xpMode`.
 *
 * One switch rather than a branch per activity: Phase 4's hijinks pay a boss on
 * his income over threshold and a member on half the value of what he stole,
 * and both drop in here without touching anything that already works.
 */
function buildXp(activity, income, classLevel, inputs, earned) {
  const mode = activity.xpMode ?? "none";

  if (mode === "threshold") {
    return { applies: true, mode, income, shares: null, ...campaignXp(income, classLevel) };
  }

  // A syndicate member is the one earner in the book who is not measured
  // against a threshold at all: he takes half the gp value of what he pulled
  // off, however small (p. 423). A 1st level thief who carouses his way to
  // 100gp for his boss keeps 50 XP, where 100gp of income would have left him
  // 75 XP short of his threshold and earned nothing.
  if (mode === "hijinkShare") {
    const shares = earned.rows ?? [];
    const self = shares.find((s) => s.isHoncho) ?? shares[0] ?? null;
    return {
      applies: true,
      mode,
      income,
      threshold: xpThreshold(classLevel),
      thresholdApplies: false,
      earned: self ? self.xp : 0,
      shares
    };
  }

  if (mode === "mercantileSplit") {
    const split = mercantileSplit(income, inputs.ventureParticipants);
    // The results panel shows one number, so it shows this character's — the
    // row he marked as his own, or his own threshold if he named nobody.
    const self = split.shares.find((s) => s.isSelf) ?? null;
    return {
      applies: true,
      mode,
      income,
      threshold: self ? self.threshold : xpThreshold(classLevel),
      earned: self ? self.earned : 0,
      split,
      shares: split.shares
    };
  }

  return { applies: false, mode: "none", income, shares: null, threshold: xpThreshold(classLevel), earned: 0 };
}

/* ------------------------------------------------------------------ *
 * The whole projection
 * ------------------------------------------------------------------ */

/**
 * Compute everything the wizard displays.
 *
 * @param {object} state  the form state (see the wizard app for its shape)
 * @returns {object} income, rows, figures, xp, warnings
 */
export function calculate(state = {}) {
  const warnings = [];
  /** Things the Judge should see that are not problems — see `notes` below. */
  const notes = [];

  const activity = getActivityType(state.activity);
  const inputs = state.inputs ?? {};
  const character = state.character ?? {};
  const classLevel = Math.max(0, Math.floor(num(character.classLevel)));

  // The character's own level reaches the rules layer here rather than being
  // asked for a second time on the form; arbitrage needs it for steady routes.
  const earned = activity.earn(inputs, { classLevel });

  /* ---- income, and the Judge's override ---- */
  const overrides = state.overrides ?? {};
  const goldOverridden = !isBlank(overrides.gold);
  const gold = goldOverridden ? Math.max(0, num(overrides.gold)) : earned.gold;

  /* ---- XP ---- */
  // Wage work earns gold and nothing else. Saying so is the point: this is the
  // rule a table gets wrong, because every other downtime chapter grants XP.
  const xp = buildXp(activity, gold, classLevel, inputs, earned);

  /* ---- per-activity warnings ---- */
  if (activity.id === "spellcasting") {
    const blocked = earned.rows.filter((r) => r.blocked > 0);
    for (const row of blocked) {
      warnings.push({
        key: "marketWillNotAbsorb",
        level: row.level,
        offered: row.offered,
        cap: row.cap,
        marketClass: inputs.marketClass ?? "IV"
      });
    }
    if (earned.figures.grossPerDay === 0 && earned.rows.some((r) => r.offered > 0)) {
      warnings.push({ key: "marketTooSmall", marketClass: inputs.marketClass ?? "IV" });
    }
    if (earned.figures.days === 0) warnings.push({ key: "noDaysWorked" });
  }

  if (activity.ladderId) {
    const ladder = tradeLadder(activity.ladderId);
    const rank = Math.floor(num(inputs.rank));
    if (rank <= 0) warnings.push({ key: "noRank", ladder: ladder.id });
    if (rank > ladder.maxRank) {
      warnings.push({ key: "rankTooHigh", ladder: ladder.id, maxRank: ladder.maxRank });
    }
    for (const row of earned.rows) {
      if (row.over > 0) {
        warnings.push({
          key: "workersOverLimit",
          rank: row.rank,
          employed: row.employed,
          allowed: row.allowed
        });
      }
    }
    if (num(inputs.months) === 0) warnings.push({ key: "noMonthsWorked" });
  }

  if (activity.id === "labor" && num(inputs.months) === 0) {
    warnings.push({ key: "noMonthsWorked" });
  }

  if (activity.id === "gambling" && num(inputs.weeks) === 0) {
    warnings.push({ key: "noWeeksWorked" });
  }

  if (activity.id === "perpetualSpellcasting" && earned.rows.length === 0) {
    warnings.push({ key: "noPerpetualRows" });
  }

  if (activity.id === "specialist" && num(inputs.quantity) === 0) {
    warnings.push({ key: "noQuantity" });
  }

  if (activity.id === "arbitrage") {
    const f = earned.figures;

    if (f.unavailable) warnings.push({ key: "merchandiseUnavailable", merchandiseId: inputs.merchandiseId });
    else if (f.fractional) {
      warnings.push({ key: "belowOneStone", available: f.available, days: f.daysToOneStone });
    }

    if (f.requested > f.tradable && !f.fractional && !f.unavailable) {
      warnings.push({ key: "quantityCapped", requested: f.requested, available: f.tradable });
    }
    if (f.requested === 0) warnings.push({ key: "noStone" });
    if (f.priceFloored) warnings.push({ key: "priceFloored", steps: f.priceSteps });

    // Not a warning: the market rules the character into a different market or
    // a larger caravan, and he needs to see which, but nothing is wrong.
    notes.push(...(f.notes ?? []));
  }

  if (activity.id === "hijink") {
    const f = earned.figures;

    if (!f.cash) notes.push({ key: "hijinkHasNoCashValue", hijinkId: f.hijinkId });
    if (f.levelCapped) {
      notes.push({ key: "effectiveLevelCapped", cap: f.maxEffectiveLevel, market: inputs.marketClass ?? "IV" });
    }
    if (f.sizePenalty > 0) {
      warnings.push({ key: "crewOverSlots", penalty: f.sizePenalty, slots: f.slots });
    }
    if (!f.succeeded) warnings.push({ key: "hijinkFailed" });
    if (f.caughtCount > 0) warnings.push({ key: "perpetratorsCaught", count: f.caughtCount });
  }

  if (activity.id === "syndicate") {
    const f = earned.figures;

    if (f.headcount > f.maxMembers) {
      warnings.push({ key: "overMaxMembers", headcount: f.headcount, max: f.maxMembers });
    }
    if (f.ordered > f.headcount) {
      warnings.push({ key: "ordersExceedMembers", ordered: f.ordered, headcount: f.headcount });
    }
    if (f.income <= 0) warnings.push({ key: "syndicateAtALoss", income: f.income });
    if (f.cappedByMarket) {
      notes.push({ key: "syndicateCappedByMarket", max: f.maxMembers, market: inputs.marketClass ?? "IV" });
    }
    if (f.couldGrow) {
      // A bigger hideout would buy more members here; the market is not yet
      // what is holding him back.
      notes.push({ key: "hideoutCouldGrow", byHideout: f.byHideout, marketCap: f.marketCap });
    }
  }

  if (activity.id === "mercantileVenture") {
    const split = xp.split;

    if (earned.figures.income <= 0) {
      warnings.push({ key: "ventureAtALoss", income: earned.figures.income });
    }
    if (!split.shares.length) warnings.push({ key: "noParticipants" });
    else {
      if (!split.shares.some((s) => s.isSelf)) warnings.push({ key: "noSelfParticipant" });
      if (split.ownedTotal === 0 && split.profitable) warnings.push({ key: "noOwnership" });

      for (const share of split.shares) {
        // A hired mercenary or specialist gets no share of profit, so an
        // ownership figure typed against one is not quietly counted.
        if (share.excluded && share.ownership > 0) {
          warnings.push({ key: "hirelingHasNoShare", name: share.name, index: share.index });
        }
      }
    }
  }

  /* ---- the competition, for context ---- */
  // Availability is what a *buyer* rolls to find casters for hire (p. 172). It
  // does not change what the seller earns, but it is the size of the field he
  // is selling into, so it is reported rather than hidden.
  const competition = activity.id === "spellcasting"
    ? spellcastingRows(inputs).map((row) => ({
        level: row.level,
        expression: availabilityFor(inputs.magicType ?? "arcane", row.level, inputs.marketClass ?? "IV")
      }))
    : null;

  return {
    activity: activity.id,
    page: activity.page,
    earnsXp: earnsXp(activity),

    income: {
      gold: Math.round(gold * 100) / 100,
      computed: Math.round(earned.gold * 100) / 100,
      overridden: goldOverridden,
      /** Perpetual spellcasting bills a one-off fee and a recurring one. */
      upfront: Math.round(num(earned.upfront) * 100) / 100,
      monthly: Math.round(num(earned.monthly) * 100) / 100,
      perDay: DAYS_PER_MONTH > 0 ? Math.round((gold / DAYS_PER_MONTH) * 100) / 100 : 0
    },

    rows: earned.rows,
    figures: earned.figures,
    competition,
    dice: activity.dice ?? null,
    xp,
    warnings,
    /**
     * Adjustments the rules made that the reader needs to know about but which
     * are not faults — a market traded as a smaller one, a reputation worth an
     * extra point of impact. Kept apart from `warnings` so that a benefit is
     * never rendered as a caution.
     */
    notes
  };
}

/* ------------------------------------------------------------------ *
 * Rolled outcomes
 * ------------------------------------------------------------------ */

/**
 * Roll what an activity actually earned, rather than what it averages.
 *
 * @param {object} state  the same form state `calculate` reads
 * @param {() => number} rng  returns [0, 1); injected so this is testable
 * @returns {object|null} null for activities the dice do not decide
 */
export function rollIncome(state = {}, rng = Math.random) {
  const activity = getActivityType(state.activity);
  const inputs = state.inputs ?? {};

  if (activity.id === "spellcasting") {
    const days = Math.max(0, Math.floor(num(inputs.daysWorked)));
    const rows = spellcastingRows(inputs)
      .filter((row) => row.sellable > 0)
      .map((row) => {
        // One d6 per offered casting per day; each 6 is a sale (p. 172).
        const attempts = row.sellable * days;
        let sold = 0;
        for (let i = 0; i < attempts; i++) {
          if (1 + Math.floor(rng() * 6) >= SPELL_SALE_ON) sold++;
        }
        return { level: row.level, attempts, sold, fee: row.fee, gold: sold * row.fee };
      });
    return {
      activity: activity.id,
      gold: rows.reduce((s, r) => s + r.gold, 0),
      rows
    };
  }

  if (activity.id === "gambling") {
    const ranks = Math.max(0, Math.floor(num(inputs.ranks)));
    const weeks = Math.max(0, Math.floor(num(inputs.weeks)));
    const rolls = [];
    for (let w = 0; w < weeks; w++) {
      for (let r = 0; r < ranks; r++) rolls.push(roll(GAMBLING_DIE, { rng }).total);
    }
    return {
      activity: activity.id,
      gold: rolls.reduce((s, v) => s + v, 0),
      rows: [{ dieCount: rolls.length, die: GAMBLING_DIE, rolls }]
    };
  }

  return null;
}

/**
 * Roll how many rival castings of each level are for hire in this market
 * (p. 172). Informational: it sizes the competition, and a Judge may prefer to
 * roll it privately, which is why it is a separate call rather than part of
 * `calculate`.
 */
export function rollCompetition(magicType, marketClassId, rng = Math.random) {
  return [1, 2, 3, 4, 5, 6].map((level) => {
    const expression = availabilityFor(magicType, level, marketClassId);
    if (!expression) return { level, expression: null, available: 0, absent: true };
    // Expressions like 1d4-3 can go negative, which means none to be found.
    return { level, expression, available: roll(expression, { rng, clampMin: 0 }).total, absent: false };
  });
}

/** Convenience for the sheet: the market's own label. */
export function marketLabel(marketClassId) {
  return marketClass(marketClassId).label;
}

/** Convenience for the sheet: a specialist grade's wage and unit. */
export function specialistWage(specialistId, gradeId) {
  const grade = specialistGrade(specialistId, gradeId);
  return { wage: grade.wage, unit: grade.unit, label: grade.label };
}
