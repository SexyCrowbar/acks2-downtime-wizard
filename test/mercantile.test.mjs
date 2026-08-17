/**
 * The market rules, checked against the rulebook's own worked examples.
 *
 * Every figure asserted here is printed in the book. Where the book's own
 * arithmetic does not reconcile, the printed answer is what is asserted and the
 * discrepancy is written down beside it rather than quietly corrected.
 *
 *   node --test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  assessmentOutcome,
  cargoHandling,
  dailySupply,
  marketPrice,
  maximumImpact,
  moorageFor,
  negotiationModifier,
  negotiationOutcome,
  resolveMarketImpact,
  roundHalfToEven,
  supervisorsFor,
  tollAndTariff,
  warehouseRent
} from "../scripts/rules/mercantile.mjs";

import {
  CARGO_COST_ROUNDED_IDS,
  CARGO_HANDLING,
  MARKET_CLASSES,
  MARKET_CLASS_IDS,
  MERCHANDISE,
  MERCHANDISE_IDS
} from "../scripts/rules/tables.mjs";

import { parse, range } from "../scripts/rules/dice.mjs";

const noteKeys = (result) => result.notes.map((n) => n.key);

const tollOf = (args) => tollAndTariff(args).toll;
const tariffOf = (args) => tollAndTariff(args).tariff;

/* ------------------------------------------------------------------ *
 * The tables themselves
 * ------------------------------------------------------------------ */

test("the merchandise table has the 19 common and 10 precious types the book lists", () => {
  // p. 370: "There are 19 different types of common merchandise and 10 types of
  // precious merchandise available in each market."
  const kinds = MERCHANDISE_IDS.map((id) => MERCHANDISE[id].kind);
  assert.equal(kinds.filter((k) => k === "common").length, 19);
  assert.equal(kinds.filter((k) => k === "precious").length, 10);
  assert.equal(MERCHANDISE_IDS.length, 29);

  for (const id of MERCHANDISE_IDS) {
    assert.equal(MERCHANDISE[id].byClass.length, 6, `${id} needs a figure for every market class`);
    assert.ok(MERCHANDISE[id].priceStep > 0, `${id} has no price step`);
  }
});

test("every dice expression in the market tables parses", () => {
  for (const id of MARKET_CLASS_IDS) {
    const expression = MARKET_CLASSES[id].passengerDice;
    assert.doesNotThrow(() => parse(expression), `${id}: ${expression}`);
  }

  // The book prints Class I passengers as "2d6+1 × 10", which the grammar here
  // writes as a multiplier and a modifier: 30 to 130 either way.
  const classOne = range(MARKET_CLASSES.I.passengerDice);
  assert.equal(classOne.min, 30);
  assert.equal(classOne.max, 130);
});

/* ------------------------------------------------------------------ *
 * Rounding (p. 371)
 * ------------------------------------------------------------------ */

test("an exact half rounds to even, which Math.round does not do", () => {
  assert.equal(roundHalfToEven(0.5), 0, "and Math.round would say 1");
  assert.equal(roundHalfToEven(1.5), 2);
  assert.equal(roundHalfToEven(2.5), 2, "and Math.round would say 3");
  assert.equal(roundHalfToEven(3.5), 4);

  // Everything off the boundary behaves normally.
  assert.equal(roundHalfToEven(0.85), 1);
  assert.equal(roundHalfToEven(0.4), 0);
  assert.equal(roundHalfToEven(170.67), 171);
});

/* ------------------------------------------------------------------ *
 * Market impact (p. 371)
 * ------------------------------------------------------------------ */

test("Caleför's forty wagons make an impact of 1 in a Class I market", () => {
  // 40 four-horse wagons at 640 st each is 25,600 st against a 30,000 st
  // baseline: 0.85, rounded to 1.
  const result = resolveMarketImpact({ totalLoad: 40 * 640, marketClassId: "I", urbanFamilies: 20000 });
  assert.equal(result.impact, 1);
  assert.equal(result.effectiveClass, "I");
});

test("the same caravan floods a village and is capped at 10", () => {
  // 25,600 / 150 is 171, but "it's easy to flood small markets".
  const result = resolveMarketImpact({ totalLoad: 25600, marketClassId: "VI" });
  assert.equal(result.impact, 10);
  assert.ok(noteKeys(result).includes("impactCapped"));
});

test("only a Class I market scales past an impact of 10", () => {
  assert.equal(maximumImpact("II", 100000), 10);
  assert.equal(maximumImpact("I", 20000), 10, "10 or families/2,000, whichever is greater");
  assert.equal(maximumImpact("I", 60000), 30);
});

test("three merchants may enter together for 4 or separately for 1 each", () => {
  const together = resolveMarketImpact({ totalLoad: 30000, marketClassId: "II" });
  assert.equal(together.impact, 4);

  const alone = resolveMarketImpact({ totalLoad: 10000, marketClassId: "II", partySize: 3 });
  assert.equal(alone.impact, 1, "1.33 rounds down, and is under the 10/3 party share anyway");
});

test("a fleet too small for a market trades it as a smaller one", () => {
  // Viktir's 3,000 st is 0.4 of a Class II baseline, but 0.8 of a Class III one.
  const result = resolveMarketImpact({ totalLoad: 3000, marketClassId: "II" });
  assert.equal(result.effectiveClass, "III");
  assert.equal(result.impact, 1);
  assert.ok(noteKeys(result).includes("impactSteppedDown"));
});

test("a village can always be traded in", () => {
  const result = resolveMarketImpact({ totalLoad: 1, marketClassId: "VI" });
  assert.equal(result.impact, 1);
  assert.ok(noteKeys(result).includes("villageFloor"));
});

test("Caleför's reputation and salt route take him from 5,000 stone", () => {
  // A 6th level venturer who has traded in Alakyrum before, with a steady salt
  // route: impact 1, then 2 for the network, then 5 for half his class level.
  const result = resolveMarketImpact({
    totalLoad: 25600,
    marketClassId: "I",
    urbanFamilies: 20000,
    mercantileNetwork: true,
    steadyRoute: true,
    classLevel: 6,
    merchandiseId: "salt"
  });

  assert.equal(result.impact, 5);
  assert.equal(result.effectiveClass, "I", "Class I is already the largest; the network raises impact instead");

  const supply = dailySupply("salt", result.effectiveClass, result.impact);
  assert.equal(supply.stone, 5000, "1,000 st of salt a day at market impact 5");
});

test("a network takes the larger market when that shifts more goods", () => {
  // "whichever is more beneficial" (p. 371). Grain in a Class IV market is 60 st
  // a day, so a second point of impact is worth 60 more — but Class III trades
  // 250 st, so the larger market is worth four times as much.
  const grain = resolveMarketImpact({
    totalLoad: 1000, marketClassId: "IV", mercantileNetwork: true, merchandiseId: "grainVegetables"
  });
  assert.equal(grain.effectiveClass, "III");
  assert.ok(noteKeys(grain).includes("networkClass"));

  // Salt doubles between every class, so the two options tie exactly and the
  // extra point of impact is taken — which is also what happens in a Class I
  // market, where there is no larger class to move to.
  const salt = resolveMarketImpact({
    totalLoad: 3750, marketClassId: "III", mercantileNetwork: true, merchandiseId: "salt"
  });
  assert.equal(salt.effectiveClass, "III");
  assert.equal(salt.impact, 2);
  assert.ok(noteKeys(salt).includes("networkImpact"));
});

/* ------------------------------------------------------------------ *
 * Daily supply and demand (pp. 374-375)
 * ------------------------------------------------------------------ */

test("under a stone a day cannot be traded, only accumulated", () => {
  // Silk in a Class IV market is 0.2 st a day at impact 1.
  const silk = dailySupply("silk", "IV", 1);
  assert.equal(silk.stone, 0.2);
  assert.equal(silk.tradable, 0);
  assert.equal(silk.fractional, true);
  assert.equal(silk.daysToOneStone, 5);
});

test("gems trade in the smallest markets only where demand is extreme", () => {
  // The merchandise table's only footnote (p. 374).
  assert.equal(dailySupply("gems", "V", 1, { side: "sell", demandModifier: 2 }).unavailable, false);
  assert.equal(dailySupply("gems", "V", 1, { side: "sell", demandModifier: 1 }).unavailable, true);
  assert.equal(dailySupply("gems", "V", 1, { side: "buy", demandModifier: -2 }).unavailable, false);
  assert.equal(dailySupply("gems", "V", 1, { side: "buy", demandModifier: 0 }).unavailable, true);

  // Above Class V the footnote does not apply at all.
  assert.equal(dailySupply("gems", "IV", 1, { side: "sell", demandModifier: 0 }).unavailable, false);
});

/* ------------------------------------------------------------------ *
 * Market price (pp. 375-376)
 * ------------------------------------------------------------------ */

test("Caleför buys salt in Alakyrum at 0.07gp, then haggles it to 0.05gp", () => {
  // The book walks every step: 0.15 base, -1 on the price roll to 0.13, +1 for
  // Class I to 0.15, -3 for the demand modifier to 0.09, and one step for the
  // steady route to 0.07.
  const listed = marketPrice({
    merchandiseId: "salt", side: "buy", marketClassId: "I",
    priceRoll: -1, demandModifier: -3, steadyRoute: true
  });
  assert.equal(listed.price, 0.07);
  assert.equal(listed.steps, -4);

  // The Salter's Guild agent then grants a grudging agreement: one more step.
  const haggled = marketPrice({
    merchandiseId: "salt", side: "buy", marketClassId: "I",
    priceRoll: -1, demandModifier: -3, steadyRoute: true, negotiation: "grudging"
  });
  assert.equal(haggled.price, 0.05);
});

test("a step in the arbitrager's favour goes the other way when he is selling", () => {
  const buying = marketPrice({ merchandiseId: "salt", side: "buy", marketClassId: "III", steadyRoute: true });
  const selling = marketPrice({ merchandiseId: "salt", side: "sell", marketClassId: "III", steadyRoute: true });

  assert.equal(buying.price, 0.13, "0.15 less one step");
  assert.equal(selling.price, 0.17, "0.15 plus one step");
});

test("a big market pays more and a small one pays less", () => {
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "I" }).steps, 1);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "II" }).steps, 1);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "III" }).steps, 0);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "IV" }).steps, 0);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "V" }).steps, -1);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "VI" }).steps, -1);
});

test("the season moves grain and nothing else", () => {
  assert.equal(marketPrice({ merchandiseId: "grainVegetables", marketClassId: "III", season: "spring" }).steps, 1);
  assert.equal(marketPrice({ merchandiseId: "grainVegetables", marketClassId: "III", season: "autumn" }).steps, -1);
  assert.equal(marketPrice({ merchandiseId: "grainVegetables", marketClassId: "III", season: "summer" }).steps, 0);
  assert.equal(marketPrice({ merchandiseId: "salt", marketClassId: "III", season: "autumn" }).steps, 0);
});

test("working a market dry moves the price against whoever is working it", () => {
  const buying = marketPrice({ merchandiseId: "salt", marketClassId: "III", side: "buy", exhaustionSteps: 2 });
  const selling = marketPrice({ merchandiseId: "salt", marketClassId: "III", side: "sell", exhaustionSteps: 2 });

  assert.equal(buying.price, 0.19, "a buyer's price rises");
  assert.equal(selling.price, 0.11, "a seller's falls");
});

test("a price never falls below one step, and says so", () => {
  // The book prints no floor, and grain fourteen steps down would be worth
  // -0.02gp per stone.
  const result = marketPrice({
    merchandiseId: "grainVegetables", marketClassId: "VI",
    priceRoll: -6, demandModifier: -6, season: "autumn"
  });
  assert.equal(result.steps, -14);
  assert.equal(result.floored, true);
  assert.equal(result.price, 0.01, "held at one price step");
});

/* ------------------------------------------------------------------ *
 * Tolls and tariffs (p. 372)
 * ------------------------------------------------------------------ */

test("the toll is charged on cargo capacity, not on the cargo carried", () => {
  // Caleför's caravan: 25,600 st x 0.2cp = 5,120cp = 51.2gp.
  assert.equal(tollOf({ cargoCapacity: 25600, marketClassId: "I" }), 51.2);

  // And the p. 424 venture pays 60gp on a 30,000 st ship carrying 175 st.
  assert.equal(tollOf({ cargoCapacity: 30000, marketClassId: "I" }), 60);
});

test("a fifth of precious goods and a twentieth of common ones, but nothing on grain", () => {
  const precious = tariffOf({ goodsValue: 23750, merchandiseId: "spices", marketClassId: "I" });
  assert.equal(precious, 4750, "20% of 23,750gp");

  assert.equal(tariffOf({ goodsValue: 1000, merchandiseId: "pottery", marketClassId: "I" }), 50);
  assert.equal(tariffOf({ goodsValue: 1000, merchandiseId: "grainVegetables", marketClassId: "I" }), 0);
});

test("a village levies nothing, and neither does a market you rule", () => {
  const village = tollAndTariff({ cargoCapacity: 25600, goodsValue: 1000, merchandiseId: "spices", marketClassId: "VI" });
  assert.equal(village.total, 0);
  assert.equal(village.exempt, true);

  const ruled = tollAndTariff({
    cargoCapacity: 25600, goodsValue: 1000, merchandiseId: "spices",
    marketClassId: "I", rulersPrivilege: true
  });
  assert.equal(ruled.total, 0);
});

/* ------------------------------------------------------------------ *
 * Cargo handling (p. 377)
 * ------------------------------------------------------------------ */

test("every printed handling time regenerates from stone, work rate and crew", () => {
  // The book's own figures, in hours, at eight working hours to the day.
  const printed = {
    packDonkey: 0.75, packMule: 1.25, packCamel: 1.5, packHorse: 2,
    cart: 4, wagon: 4,
    bargeSmall: 20, bargeLarge: 45, bargeHuge: 180,
    shipSmall: 42, shipLarge: 75, shipHuge: 62
  };

  for (const [id, hours] of Object.entries(printed)) {
    const row = CARGO_HANDLING[id];
    const computed = row.stone / row.workRate / row.crew;
    // The small sailing ship is rounded up (41.67 to 42) and the huge one down
    // (62.5 to 62); everything else is exact.
    assert.ok(Math.abs(computed - hours) <= 0.5, `${id}: computed ${computed}, printed ${hours}`);
    assert.equal(cargoHandling(id).hours, computed, `${id} disagrees with its own row`);
  }
});

test("the printed handling fee is a copper per hour of work", () => {
  for (const id of Object.keys(CARGO_HANDLING)) {
    const row = CARGO_HANDLING[id];
    if (CARGO_COST_ROUNDED_IDS.includes(id)) continue;
    assert.equal(row.costCp, row.stone / row.workRate, `${id}`);
  }

  // The two the book rounds down rather than printing three farthings.
  assert.equal(CARGO_HANDLING.packDonkey.costCp, 0.5, "0.75 in the formula");
  assert.equal(CARGO_HANDLING.packMule.costCp, 1, "1.25 in the formula");
});

test("forty wagons load as fast as one, and cost forty times as much", () => {
  const one = cargoHandling("wagon", { count: 1 });
  const forty = cargoHandling("wagon", { count: 40 });

  assert.equal(one.hours, 4);
  assert.equal(forty.hours, 4, "all of the wagons can be loaded simultaneously");
  assert.equal(forty.costGp, 6.4, "40 x 16cp");
  assert.equal(forty.crew, 160);
});

test("a warehouse moves 200 stone an hour and charges by the hundred", () => {
  // The Salter's Guild delivering 5,000 st: "25 hours, or 3 days".
  const load = cargoHandling("warehouse", { stone: 5000 });
  assert.equal(load.hours, 25);
  assert.equal(load.days, 3);
  assert.equal(load.remainderHours, 1, "the book truncates its own figure; the hour is still there");
  assert.equal(load.costGp, 50);
});

test("lying at anchor doubles the time and the cost", () => {
  const moored = cargoHandling("warehouse", { stone: 5000 });
  const anchored = cargoHandling("warehouse", { stone: 5000, atAnchor: true });

  assert.equal(anchored.hours, moored.hours * 2);
  assert.equal(anchored.costGp, moored.costGp * 2);
  assert.equal(cargoHandling("wagon", { count: 40, atAnchor: true }).hours, 8);
});

test("one character can watch over ten wagons, or a hundred and twenty all day", () => {
  assert.equal(supervisorsFor("wagon", 40), 4);
  assert.equal(supervisorsFor("wagon", 40, { dedicated: true }), 1);
  assert.equal(supervisorsFor("shipLarge", 1), 1);
  assert.equal(supervisorsFor("packHorse", 40), 1);
  assert.equal(supervisorsFor("packHorse", 41), 2);
});

test("moorage and stabling match the book's own bills", () => {
  // 200 shp at 1gp per 50 shp for 13 days.
  assert.equal(moorageFor("ship", { shp: 200, days: 13 }), 52);
  assert.equal(moorageFor("ship", { shp: 200, days: 10 }), 40);

  // 40 wagons at 2gp a day for 10 days.
  assert.equal(moorageFor("wagon", { count: 40, days: 10 }), 800);

  // A ship at anchor pays a flat gold piece, whatever its size.
  assert.equal(moorageFor("ship", { shp: 200, days: 13, loose: true }), 13);
});

test("warehousing goods costs a copper a stone a month", () => {
  assert.equal(warehouseRent(5000, 1), 50);
  assert.equal(warehouseRent(5000, 3), 150);
});

/* ------------------------------------------------------------------ *
 * The two reaction tables (pp. 373, 376)
 * ------------------------------------------------------------------ */

test("the assessment table reads the way the book prints it", () => {
  assert.equal(assessmentOutcome(2), "false");
  assert.equal(assessmentOutcome(1), "false", "2- means 2 or less");
  assert.equal(assessmentOutcome(3), "failed");
  assert.equal(assessmentOutcome(5), "failed");
  assert.equal(assessmentOutcome(8), "expertise", "Caleför's roll: he learns the price of salt alone");
  assert.equal(assessmentOutcome(11), "partial");
  assert.equal(assessmentOutcome(12), "successful");
  assert.equal(assessmentOutcome(20), "successful");
});

test("Caleför's haggling comes to no modifier at all, and a 9 is grudging agreement", () => {
  // +3 CHA and one rank of Bargaining against the agent's +1 CHA and two ranks.
  const modifier = negotiationModifier({ cha: 3, bargaining: 1, kind: "common", merchantExtraRank: true });
  assert.equal(modifier, 0, "+3 +2 -1 -4");
  assert.equal(negotiationOutcome(9 + modifier), "grudging");
});

test("a merchant in precious goods is a harder bargain than one in common", () => {
  assert.equal(negotiationModifier({ cha: 0, bargaining: 0, kind: "common" }), -3);
  assert.equal(negotiationModifier({ cha: 0, bargaining: 0, kind: "precious" }), -4);
  // Once it becomes a matter of will, the same sum is taken over WIL instead.
  assert.equal(negotiationModifier({ wil: 2, bargaining: 0, kind: "precious", phase: "will" }), -1);
});

test("a natural 2 and a natural 12 survive any modifier", () => {
  // "a natural roll of 2 always counts as 2-, and a natural roll of 12 always
  // counts as 12+, regardless of any adjustments" (p. 376).
  assert.equal(negotiationOutcome(12, { natural: 2 }), "outraged");
  assert.equal(negotiationOutcome(2, { natural: 12 }), "agreement");
  assert.equal(negotiationOutcome(9, { natural: 7 }), "grudging", "an ordinary roll reads normally");
});

