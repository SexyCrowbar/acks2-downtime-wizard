/**
 * Dice expressions, evaluated purely.
 *
 * The rulebook states several downtime figures as dice rather than constants —
 * spell availability by market class (p. 172) is a whole table of them, and
 * Gambling earns 1d6! per rank per week (p. 111). Those expressions live in
 * `tables.mjs` as strings so the tables stay readable against the book, and
 * this module turns them into numbers.
 *
 * Pure: no Foundry globals and no `Roll`. The random source is injected, so
 * tests are deterministic and the Foundry-facing `resolve.mjs` can hand in
 * dice the players actually watched being rolled.
 *
 * Grammar: `<count>d<sides>[!][x<multiplier>][+|-<modifier>]`
 *
 *   4d4x100   spell availability in a Class I market
 *   1d4-3     6th level divine casters in a Class IV market — often none
 *   1d6!      exploding, for Gambling
 *
 * The book writes multipliers with a times sign; `parse` accepts `x`, `*` and
 * the literal U+00D7 so a table entry can be copied straight out of the text.
 */

/** A max roll on an exploding die adds another. Cap the chain rather than trust it. */
const EXPLODE_LIMIT = 100;

const PATTERN = /^\s*(\d*)d(\d+)(!?)\s*(?:[x*×]\s*(\d+))?\s*(?:([+-])\s*(\d+))?\s*$/i;

/**
 * Break an expression into its parts.
 *
 * @param {string} expression
 * @returns {{count: number, sides: number, explodes: boolean, multiplier: number, modifier: number}}
 * @throws {Error} on anything the grammar does not cover, so a typo in a table
 *   fails loudly at the test that reads it rather than silently scoring zero.
 */
export function parse(expression) {
  const match = PATTERN.exec(String(expression ?? ""));
  if (!match) throw new Error(`Unparseable dice expression: ${expression}`);

  const [, count, sides, bang, multiplier, sign, modifier] = match;
  const faces = Number(sides);
  if (faces < 2) throw new Error(`A die needs at least 2 sides: ${expression}`);

  return {
    count: count === "" ? 1 : Number(count),
    sides: faces,
    explodes: bang === "!",
    multiplier: multiplier === undefined ? 1 : Number(multiplier),
    modifier: modifier === undefined ? 0 : Number(modifier) * (sign === "-" ? -1 : 1)
  };
}

/** Whether a string is a dice expression at all, for tables that mix dice and constants. */
export function isExpression(value) {
  return typeof value === "string" && PATTERN.test(value);
}

const defaultRng = () => Math.random();

/** One die, following the explosion chain when the expression allows it. */
function rollDie(sides, explodes, rng) {
  let total = 0;
  for (let i = 0; i < EXPLODE_LIMIT; i++) {
    const face = 1 + Math.floor(rng() * sides);
    total += face;
    if (!explodes || face < sides) break;
  }
  return total;
}

/**
 * Roll an expression.
 *
 * @param {string} expression
 * @param {object} [options]
 * @param {() => number} [options.rng]  returns [0, 1); injected for determinism
 * @param {number|null} [options.clampMin]  floor for the result. Availability
 *   tables use expressions like `1d4-3` that can go negative, and "minus two
 *   spellcasters" is not a thing — those callers pass 0.
 * @returns {{total: number, dice: number[], spec: object}}
 */
export function roll(expression, { rng = defaultRng, clampMin = null } = {}) {
  const spec = parse(expression);
  const dice = [];
  for (let i = 0; i < spec.count; i++) dice.push(rollDie(spec.sides, spec.explodes, rng));

  const raw = dice.reduce((sum, d) => sum + d, 0) * spec.multiplier + spec.modifier;
  const total = clampMin === null ? raw : Math.max(clampMin, raw);

  return { total, dice, spec };
}

/**
 * What an expression averages, for showing an expected figure without rolling.
 *
 * An ordinary die averages (sides + 1) / 2. An exploding die multiplies that by
 * sides / (sides - 1), the sum of the geometric series of re-rolls: a d6!
 * averages 4.2, not 3.5.
 *
 * Not clamped — clamping the average of `1d4-3` at 0 would overstate it, since
 * the three losing faces are real and the caller may be summing many rolls.
 */
export function average(expression) {
  const { count, sides, explodes, multiplier, modifier } = parse(expression);
  const perDie = ((sides + 1) / 2) * (explodes ? sides / (sides - 1) : 1);
  return count * perDie * multiplier + modifier;
}

/** The smallest and largest an expression can produce, before any clamp. */
export function range(expression) {
  const { count, sides, explodes, multiplier, modifier } = parse(expression);
  return {
    min: count * 1 * multiplier + modifier,
    // An exploding die has no maximum; report the un-exploded one and say so.
    max: count * sides * multiplier + modifier,
    unbounded: explodes
  };
}
