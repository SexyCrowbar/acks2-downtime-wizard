/**
 * The dice pooling that keeps a throw rollable at any size.
 *
 * `resolve.mjs` reaches for Foundry's `Roll` and `ChatMessage`, but only inside
 * its functions, so the module imports cleanly under plain node and the pure
 * formula builder can be tested on its own.
 *
 *   node --test
 */

import test from "node:test";
import assert from "node:assert/strict";

const { pooledFormula } = await import("../scripts/resolve.mjs");

/** Foundry's own ceiling, from client/dice/terms/dice.mjs. */
const MAX = 999;

/** Every `NdX` term in a formula, as numbers. */
function termSizes(formula) {
  return [...formula.matchAll(/(\d+)d\d+/g)].map((m) => Number(m[1]));
}

test("a small pool is a single ordinary term", () => {
  assert.equal(pooledFormula(210, 6, "cs>=6"), "210d6cs>=6");
  assert.equal(pooledFormula(12, 6, "x"), "12d6x");
  assert.equal(pooledFormula(1, 6), "1d6");
});

test("a pool at the ceiling is still one term", () => {
  assert.equal(pooledFormula(MAX, 6, "cs>=6"), "999d6cs>=6");
});

test("a pool over the ceiling is split, and every term stays under it", () => {
  // Foundry throws on a term of more than 999 dice rather than truncating it,
  // so this is the difference between a working button and a dead one.
  const formula = pooledFormula(1200, 6, "cs>=6");
  const sizes = termSizes(formula);

  assert.deepEqual(sizes, [999, 201]);
  assert.equal(formula, "999d6cs>=6 + 201d6cs>=6");
  assert.ok(sizes.every((n) => n <= MAX), "no term may exceed Foundry's ceiling");
});

test("however large the pool, the dice all get rolled and nothing exceeds the cap", () => {
  for (const count of [1000, 2000, 4995, 5000, 12345]) {
    const sizes = termSizes(pooledFormula(count, 6, "cs>=6"));

    assert.equal(sizes.reduce((s, n) => s + n, 0), count,
      `${count} dice must be rolled in full, not truncated`);
    assert.ok(sizes.every((n) => n >= 1 && n <= MAX),
      `${count} split into a term outside 1..${MAX}`);
    assert.equal(sizes.length, Math.ceil(count / MAX), `${count} used more terms than it needs`);
  }
});

test("the modifier is repeated on every term", () => {
  // A modifier on only the first term would count successes in one chunk and
  // sum raw pips in the rest, which is a wrong total rather than a failure.
  const formula = pooledFormula(2500, 6, "cs>=6");
  const terms = formula.split(" + ");

  assert.equal(terms.length, 3);
  assert.ok(terms.every((t) => t.endsWith("cs>=6")), formula);
});

test("exploding dice split the same way", () => {
  const formula = pooledFormula(1500, 6, "x");
  assert.equal(formula, "999d6x + 501d6x");
});

test("an empty pool produces no formula at all", () => {
  // `new Roll("")` throws; the callers skip a row before reaching this, and it
  // must not invent a `0d6` that would.
  assert.equal(pooledFormula(0, 6, "cs>=6"), "");
  assert.equal(pooledFormula(-5, 6), "");
  assert.equal(pooledFormula(NaN, 6), "");
});

test("a fractional count is floored rather than written into the formula", () => {
  assert.equal(pooledFormula(10.7, 6), "10d6");
});
