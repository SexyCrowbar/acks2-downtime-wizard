/**
 * Rolls the dice an activity is decided by, and posts the result to chat.
 *
 * The arithmetic lives in `rules/calculator.mjs` and is rolled there against an
 * injected random source. This module exists so the players actually *see* the
 * dice: it builds real Foundry Roll objects, which means dice-so-nice fires and
 * the roll is auditable in the log, then hands the totals back.
 */

import { MODULE_ID } from "./constants.mjs";
import { GAMBLING_DIE, PRICE_ROLL, SPELL_SALE_ON, merchandise } from "./rules/tables.mjs";
import { spellcastingRows } from "./rules/activity-types.mjs";
import { assessmentOutcome, negotiationModifier, negotiationOutcome } from "./rules/mercantile.mjs";

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const isBlank = (v) => v === null || v === undefined || v === "";

/**
 * Foundry refuses to evaluate a single DiceTerm of more than 999 dice — see
 * `client/dice/terms/dice.mjs`, "You may not evaluate a DiceTerm with more than
 * 999 requested results". It throws rather than truncating.
 */
const MAX_DICE_PER_TERM = 999;

/**
 * A formula for `count` dice of one kind, split across as many terms as it
 * takes to stay under Foundry's per-term ceiling.
 *
 * A busy caster's month, or a long stretch at the tables, goes past 999 dice,
 * and the throw button has to keep working there: the alternative is an
 * exception on the way to `evaluate()` and a button that visibly does nothing.
 * Several terms of the same die in one formula roll and total exactly as one
 * big pool would — `999d6cs>=6 + 201d6cs>=6` counts the same successes as an
 * unsplittable `1200d6cs>=6` — and it stays a single Roll, so it animates once
 * and lands in the log as one auditable entry.
 *
 * Pure string-building: no Foundry globals, so it is testable under node.
 *
 * @param {number} count      how many dice to roll in total
 * @param {number} faces      the die's faces
 * @param {string} [modifiers] appended to every term, e.g. `cs>=6` or `x`
 * @returns {string} a formula, or "" when there is nothing to roll
 */
export function pooledFormula(count, faces, modifiers = "") {
  let remaining = Math.max(0, Math.floor(Number(count) || 0));
  const terms = [];

  while (remaining > 0) {
    const take = Math.min(remaining, MAX_DICE_PER_TERM);
    terms.push(`${take}d${faces}${modifiers}`);
    remaining -= take;
  }

  return terms.join(" + ");
}

/**
 * Roll a month of spellcasting sales (p. 172).
 *
 * One d6 per offered casting per day, each 6 a sale. Rolled as one pooled
 * formula per spell level rather than a die at a time, because thirty days of a
 * busy caster is a few hundred dice and nobody wants that as separate messages.
 */
async function rollSpellcasting(state) {
  const inputs = state.inputs ?? {};
  const days = Math.max(0, Math.floor(num(inputs.daysWorked)));
  const rows = [];

  for (const row of spellcastingRows(inputs)) {
    const attempts = row.sellable * days;
    if (attempts <= 0) continue;

    // `csN` counts how many dice met the target, which is exactly the rule.
    const roll = new Roll(pooledFormula(attempts, 6, `cs>=${SPELL_SALE_ON}`));
    await roll.evaluate();
    const sold = roll.total;

    rows.push({
      level: row.level,
      attempts,
      sold,
      fee: row.fee,
      gold: sold * row.fee,
      // Printed on the card beside the result. Hundreds of dice are more than
      // Dice So Nice will animate (its `maxDiceNumber` defaults to 20), so
      // without the formula in front of them a player has only the module's
      // word that anything was rolled at all.
      formula: roll.formula,
      roll
    });
  }

  return { rows, gold: rows.reduce((s, r) => s + r.gold, 0) };
}

/** Roll a stretch of gambling: 1d6! per rank per week (p. 111). */
async function rollGambling(state) {
  const inputs = state.inputs ?? {};
  const ranks = Math.max(0, Math.floor(num(inputs.ranks)));
  const weeks = Math.max(0, Math.floor(num(inputs.weeks)));
  const dice = ranks * weeks;
  if (dice <= 0) return { rows: [], gold: 0 };

  // Foundry writes exploding dice as `x`; the book writes them as `!`.
  const roll = new Roll(pooledFormula(dice, 6, "x"));
  await roll.evaluate();

  return {
    rows: [{ dieCount: dice, die: GAMBLING_DIE, gold: roll.total, formula: roll.formula, roll }],
    gold: roll.total
  };
}

/**
 * Roll whichever dice the current activity uses.
 *
 * @param {object} state  the wizard's form state
 * @param {object} [options]
 * @param {number|string} [options.entered]  a total typed in from physical dice,
 *   which replaces the roll entirely
 * @returns {Promise<object|null>} null for activities the dice do not decide
 */
export async function rollActivity(state, { entered } = {}) {
  const activity = state?.activity;

  if (!isBlank(entered)) {
    // Physical dice at the table. Nothing is rolled and the card says so.
    return { activity, gold: Math.max(0, num(entered)), rows: [], entered: true };
  }

  if (activity === "spellcasting") return { activity, ...(await rollSpellcasting(state)), entered: false };
  if (activity === "gambling") return { activity, ...(await rollGambling(state)), entered: false };
  return null;
}

/* ------------------------------------------------------------------ *
 * The market's own dice (pp. 373-376)
 * ------------------------------------------------------------------ */

/**
 * Roll one of the figures the market decides, and hand back the value the
 * matching form field should take.
 *
 * Three different dice, one shape: the caller writes `value` into the field the
 * button sits beside, and everything downstream treats it as though it had been
 * typed. The `Roll` object goes to chat so the dice animate and the table can
 * see what happened — a negotiation nobody watched is not much of a
 * negotiation.
 *
 * @param {string} field  the input this roll fills: priceRoll, negotiation, assessment
 * @param {object} state  the wizard's form state
 * @returns {Promise<object|null>}
 */
export async function rollMarketDie(field, state) {
  const inputs = state?.inputs ?? {};

  if (field === "priceRoll") {
    // 4d4-10: six steps either way, and a mean of none.
    const roll = new Roll(PRICE_ROLL);
    await roll.evaluate();
    return { field, kind: "priceRoll", value: roll.total, total: roll.total, formula: PRICE_ROLL, roll };
  }

  if (field === "assessment") {
    const modifier = num(inputs.chaMod);
    const roll = new Roll(`2d6 ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}`);
    await roll.evaluate();
    return {
      field, kind: "assessment", value: assessmentOutcome(roll.total),
      total: roll.total, modifier, formula: roll.formula, roll
    };
  }

  if (field === "negotiation") {
    const kindOfGoods = merchandise(inputs.merchandiseId).kind;
    const modifier = negotiationModifier({
      cha: num(inputs.chaMod),
      wil: num(inputs.wilMod),
      bargaining: num(inputs.bargainingRanks),
      kind: kindOfGoods,
      merchantExtraRank: !!inputs.merchantExtraRank
    });

    const roll = new Roll(`2d6 ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}`);
    await roll.evaluate();

    // A natural 2 or 12 overrides the adjusted total, so the bare dice matter.
    const natural = roll.dice[0]?.total ?? null;

    return {
      field, kind: "negotiation", value: negotiationOutcome(roll.total, { natural }),
      total: roll.total, natural, modifier, formula: roll.formula, roll
    };
  }

  return null;
}

/** Post a single market roll, so the dice animate and the log keeps it. */
export async function postMarketRoll(outcome, actor = null) {
  if (!outcome?.roll) return null;

  const flavor = game.i18n.localize(`DW.roll.${outcome.kind}`);
  return outcome.roll.toMessage({
    speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
    flavor,
    flags: { [MODULE_ID]: { marketRoll: outcome.kind } }
  });
}

/**
 * Post a downtime result to chat.
 *
 * @param {object} args
 * @param {Actor|null} args.actor
 * @param {object} args.result      from `calculate`
 * @param {object|null} args.resolution  from `rollActivity`
 * @param {string} args.html        rendered card body
 */
export async function postDowntimeCard({ actor, result, resolution, html }) {
  const rolls = (resolution?.rows ?? []).map((r) => r.roll).filter(Boolean);

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
    content: html,
    // Attaching the Rolls makes the dice animate and keeps them auditable.
    rolls,
    flags: { [MODULE_ID]: { downtime: true, activity: result.activity } }
  });
}
