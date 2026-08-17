/**
 * Where the rulebook prints a worked example, it is asserted here. If one of
 * these fails, the calculator disagrees with the book.
 *
 *   node --test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { calculate, campaignXp, rollCompetition, rollIncome } from "../scripts/rules/calculator.mjs";
import {
  earnsXp, spellcastingRows, tradeIncomePerMonth,
  ACTIVITY_TYPES, ACTIVITY_TYPE_IDS, XP_EARNING_IDS
} from "../scripts/rules/activity-types.mjs";
import { average, parse, range, roll } from "../scripts/rules/dice.mjs";
import { SPELL_COST_BY_LEVEL, saleCapPerDay, xpThreshold } from "../scripts/rules/tables.mjs";

/** Minimal well-formed state; individual tests override what they care about. */
const baseState = (overrides = {}) => ({
  character: { classLevel: 7 },
  activity: "spellcasting",
  inputs: {},
  overrides: {},
  ...overrides
});

/** A deterministic stand-in for Math.random: cycles a fixed list of values. */
const fixedRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/* ------------------------------------------------------------------ *
 * Dice
 * ------------------------------------------------------------------ */

test("the dice grammar covers every expression the tables use", () => {
  // Multipliers are written with a times sign in the book; all three forms parse.
  for (const expr of ["4d4x100", "4d4*100", "4d4×100"]) {
    assert.deepEqual(
      { ...parse(expr) },
      { count: 4, sides: 4, explodes: false, multiplier: 100, modifier: 0 },
      expr
    );
  }
  assert.deepEqual({ ...parse("1d4-3") }, { count: 1, sides: 4, explodes: false, multiplier: 1, modifier: -3 });
  assert.deepEqual({ ...parse("12d6") }, { count: 12, sides: 6, explodes: false, multiplier: 1, modifier: 0 });
  assert.deepEqual({ ...parse("1d6!") }, { count: 1, sides: 6, explodes: true, multiplier: 1, modifier: 0 });
  assert.deepEqual({ ...parse("d8") }, { count: 1, sides: 8, explodes: false, multiplier: 1, modifier: 0 });
});

test("a typo in a table fails loudly rather than scoring zero", () => {
  assert.throws(() => parse("4k4"), /Unparseable/);
  assert.throws(() => parse(""), /Unparseable/);
  assert.throws(() => parse("2d1"), /at least 2 sides/);
});

test("an exploding d6 averages 4.2, not 3.5", () => {
  // The geometric series of re-rolls: 3.5 x 6/5.
  assert.equal(average("1d6!"), 4.2);
  assert.equal(average("1d6"), 3.5);
  assert.equal(average("4d4x100"), 1000, "4 x 2.5 x 100");
  assert.equal(average("1d4-3"), -0.5, "not clamped: the losing faces are real");
});

test("a maximum roll on an exploding die adds another", () => {
  // 6 then 6 then 3 = 15, and the chain stops at the first non-maximum.
  const rng = fixedRng([0.99, 0.99, 0.4]);
  assert.equal(roll("1d6!", { rng }).total, 15);
  // Without the bang, the same first roll just gives 6.
  assert.equal(roll("1d6", { rng: fixedRng([0.99]) }).total, 6);
});

test("clampMin floors the availability expressions that can go negative", () => {
  const lowest = fixedRng([0]);
  assert.equal(roll("1d4-3", { rng: lowest }).total, -2, "raw, by default");
  assert.equal(roll("1d4-3", { rng: lowest, clampMin: 0 }).total, 0, "no such thing as -2 casters");
  assert.equal(range("1d6!").unbounded, true);
});

/* ------------------------------------------------------------------ *
 * Selling spellcasting services (pp. 172-173)
 * ------------------------------------------------------------------ */

test("Elaria earns 310gp a day in theory and 1,550gp over the month", () => {
  // "Elaria is a 7th level mage able to cast 3 1st, 2 2nd, 2 3rd, and 1 4th
  // spell per day... (3 x 5) + (2 x 10) + (2 x 45) + (1 x 185) = 310gp per day
  // ... she will tend to sell only 1 in 6 ... Over 30 days ... 1,550gp" (p. 173)
  const state = baseState({
    activity: "spellcasting",
    inputs: {
      castings: { 1: 3, 2: 2, 3: 2, 4: 1 },
      marketClass: "IV",
      daysWorked: 30
    }
  });

  const r = calculate(state);
  assert.equal(r.figures.grossPerDay, 310, "theoretical gross per day");
  assert.equal(Math.round(r.figures.expectedPerDay * 100) / 100, 51.67, "51gp 66cp, to the copper");
  assert.equal(Math.round(r.income.gold), 1550, "the month");
  assert.equal(r.earnsXp, false);
  assert.equal(r.xp.earned, 0, "wages earn no campaign XP (p. 423)");
});

test("a market absorbs at most 9 - (class + level) castings a day", () => {
  // p. 172. Elaria's spread fits inside a Class IV market, which is why the
  // book's own example reaches its full 310gp.
  assert.equal(saleCapPerDay("IV", 1), 4);
  assert.equal(saleCapPerDay("IV", 4), 1);
  assert.equal(saleCapPerDay("I", 1), 7);
  assert.equal(saleCapPerDay("VI", 3), 0, "no 3rd level trade at all in a village");
  assert.equal(saleCapPerDay("VI", 6), 0, "and the formula never goes below zero");
});

test("the same caster in a village is capped hard, and told why", () => {
  const r = calculate(baseState({
    activity: "spellcasting",
    inputs: { castings: { 1: 3, 2: 2, 3: 2, 4: 1 }, marketClass: "VI", daysWorked: 30 }
  }));

  const rows = Object.fromEntries(r.rows.map((row) => [row.level, row]));
  assert.equal(rows[1].sellable, 2, "cap 9 - (6+1) = 2");
  assert.equal(rows[2].sellable, 1);
  assert.equal(rows[3].sellable, 0, "cap is zero");
  assert.equal(r.figures.grossPerDay, 2 * 5 + 1 * 10);

  assert.equal(rows[4].sellable, 0, "cap 9 - (6+4) is negative, so zero");

  const blocked = r.warnings.filter((w) => w.key === "marketWillNotAbsorb");
  assert.equal(blocked.length, 4, "every level she offers has castings the village refuses");
});

test("spellcasting sales are rolled a d6 per casting per day, selling on a 6", () => {
  const state = baseState({
    activity: "spellcasting",
    inputs: { castings: { 1: 2 }, marketClass: "I", daysWorked: 3 }
  });

  // Six attempts (2 castings x 3 days). Every roll a 6 -> every casting sells.
  const all = rollIncome(state, () => 0.999);
  assert.equal(all.rows[0].attempts, 6);
  assert.equal(all.rows[0].sold, 6);
  assert.equal(all.gold, 6 * SPELL_COST_BY_LEVEL[1]);

  // No roll a 6 -> nothing sells, and that is a legitimate month.
  const none = rollIncome(state, () => 0);
  assert.equal(none.rows[0].sold, 0);
  assert.equal(none.gold, 0);
});

test("the availability table is rolled for the competition, dashes meaning none", () => {
  // Quintus in Siadanos, a Class IV market: cure disease is 3rd level divine,
  // "so the Judge rolls 2d4" (p. 172).
  const rows = rollCompetition("divine", "IV", () => 0.999);
  const third = rows.find((r) => r.level === 3);
  assert.equal(third.expression, "2d4");
  assert.equal(third.available, 8, "two maximum d4s");

  // Restore life and limb is 5th level: 1d4-3, which is usually nobody.
  const fifth = rows.find((r) => r.level === 5);
  assert.equal(fifth.expression, "1d4-3");
  assert.equal(rollCompetition("divine", "IV", () => 0).find((r) => r.level === 5).available, 0);

  // 6th level divine in a Class IV market is a dash in the book.
  assert.equal(rows.find((r) => r.level === 6).absent, true);
});

/* ------------------------------------------------------------------ *
 * Perpetual spellcasting (p. 173)
 * ------------------------------------------------------------------ */

test("ten perpetual illuminations cost 1,600gp plus 50gp a month", () => {
  // "A decadent noble wishes to illuminate his villa with 10 perpetual
  // illuminations (3rd level). This costs him 1,600gp plus 50gp per month."
  const r = calculate(baseState({
    activity: "perpetualSpellcasting",
    inputs: { perpetualRows: [{ level: 3, count: 10 }] }
  }));

  assert.equal(r.income.upfront, 1600);
  assert.equal(r.income.monthly, 50);
  assert.equal(r.income.gold, 1600, "the upfront fee is this month's income");
  assert.equal(r.earnsXp, false);
});

/* ------------------------------------------------------------------ *
 * Trade ladders (pp. 107, 116)
 * ------------------------------------------------------------------ */

test("a grand master artisan and his workshop make 440gp a month", () => {
  // "...increasing their productivity by 50% (for a total construction rate of
  // 440gp per month)" (p. 107)
  const income = tradeIncomePerMonth("artCraft", 4, { 1: 8, 2: 4, 3: 2 });
  assert.equal(income.own, 80);
  assert.equal(income.supervised, 360, "2x40 + 4x20 + 8x10, each at 1.5");
  assert.equal(income.total, 440);
});

test("a master armorer with two journeymen and four apprentices makes 160gp", () => {
  // "...a master armorer... with two journeymen and four apprentices produces
  // 160gp per month" (p. 170). Their output follows the Art/Craft ladder.
  const income = tradeIncomePerMonth("artCraft", 3, { 1: 4, 2: 2 });
  assert.equal(income.own, 40);
  assert.equal(income.total, 160);
});

test("each ladder tops out where the book says", () => {
  assert.equal(tradeIncomePerMonth("profession", 3, { 1: 4, 2: 2 }).total, 400, "100 + 2x50x1.5 + 4x25x1.5");
  assert.equal(tradeIncomePerMonth("performance", 3, { 1: 4, 2: 2 }).total, 160, "40 + 2x20x1.5 + 4x10x1.5");
  assert.equal(tradeIncomePerMonth("artCraft", 1, {}).total, 10, "an apprentice supervises nobody");
});

test("subordinates beyond what a rank may supervise are not counted, and warn", () => {
  const r = calculate(baseState({
    activity: "artCraft",
    inputs: { rank: 2, workers: { 1: 10 }, months: 1 }
  }));
  // A journeyman may supervise 3 apprentices, no more.
  assert.equal(r.income.gold, 20 + 3 * 10 * 1.5);
  const over = r.warnings.find((w) => w.key === "workersOverLimit");
  assert.ok(over, "employing 10 apprentices under a journeyman is flagged");
  assert.equal(over.allowed, 3);
  assert.equal(over.employed, 10);
});

test("rank 0 earns nothing and says so", () => {
  const r = calculate(baseState({ activity: "profession", inputs: { rank: 0, months: 6 } }));
  assert.equal(r.income.gold, 0);
  assert.ok(r.warnings.some((w) => w.key === "noRank"));
});

/* ------------------------------------------------------------------ *
 * Specialists, labor, gambling
 * ------------------------------------------------------------------ */

test("a sage hires out for 500gp a month", () => {
  const r = calculate(baseState({
    activity: "specialist",
    inputs: { specialistId: "sage", gradeId: "standard", quantity: 3 }
  }));
  assert.equal(r.income.gold, 1500);
  assert.equal(r.figures.unit, "month");
});

test("a chirurgeon paid by the day bills per patient", () => {
  const r = calculate(baseState({
    activity: "specialist",
    inputs: { specialistId: "healer", gradeId: "chirurgeonDay", quantity: 10, patients: 3 }
  }));
  assert.equal(r.income.gold, 4 * 10 * 3, "4gp per patient per day, 3 patients, 10 days");
});

test("piece work is priced per page", () => {
  const r = calculate(baseState({
    activity: "specialist",
    inputs: { specialistId: "writer", gradeId: "rank4", quantity: 12 }
  }));
  assert.equal(r.income.gold, 120);
  assert.equal(r.figures.unit, "page");
});

test("labor earns a flat 6gp a month and does not improve with ranks", () => {
  const r = calculate(baseState({ activity: "labor", inputs: { months: 4 } }));
  assert.equal(r.income.gold, 24);
});

test("gambling averages 4.2gp per rank per week and rolls exploding dice", () => {
  const state = baseState({ activity: "gambling", inputs: { ranks: 2, weeks: 3 } });
  const r = calculate(state);
  assert.equal(Math.round(r.income.gold * 100) / 100, 25.2, "2 ranks x 4.2 x 3 weeks");
  assert.equal(r.figures.dieCount, 6);

  const rolled = rollIncome(state, () => 0);
  assert.equal(rolled.gold, 6, "six dice, all showing 1");
  assert.equal(rolled.rows[0].dieCount, 6);
});

/* ------------------------------------------------------------------ *
 * Arbitrage trading (pp. 373-377)
 * ------------------------------------------------------------------ */

/** Caleför's salt deal at Alakyrum, as the book walks it (pp. 371-377). */
const saltDeal = (extra = {}) => baseState({
  activity: "arbitrage",
  character: { classLevel: 6 },
  inputs: {
    marketClass: "I",
    urbanFamilies: 20000,
    cargoCapacity: 40 * 640,
    merchandiseId: "salt",
    side: "buy",
    demandModifier: -3,
    priceRoll: -1,
    mercantileNetwork: true,
    steadyRoute: true,
    negotiation: "grudging",
    stone: 5000,
    ...extra
  }
});

test("Caleför buys 5,000 stone of salt a day for 250gp", () => {
  // 1,000 st of salt at market impact 5, at the 0.05gp he haggled to.
  const r = calculate(saltDeal());

  assert.equal(r.figures.impact, 5);
  assert.equal(r.figures.available, 5000);
  assert.equal(r.figures.unitPrice, 0.05);
  assert.equal(r.income.gold, 250);

  // Over the three days the book describes, 15,000 st for 750gp.
  assert.equal(r.income.gold * 3, 750);
});

test("more stone than the market offers is not bought", () => {
  const r = calculate(saltDeal({ stone: 9000 }));
  assert.equal(r.figures.traded, 5000);
  assert.equal(r.income.gold, 250, "the extra 4,000 st is not priced");
  assert.ok(r.warnings.some((w) => w.key === "quantityCapped"));
});

test("the toll is reported beside the deal, not charged on it", () => {
  const r = calculate(saltDeal());
  assert.equal(r.figures.toll, 51.2, "25,600 st at 0.2cp");
  assert.equal(r.figures.tariff, 0, "he is buying, not importing goods to sell");
  assert.equal(r.income.gold, 250, "and neither is taken out of the deal");
});

test("a market that steps a caravan down says so, without calling it a warning", () => {
  const r = calculate(baseState({
    activity: "arbitrage",
    inputs: { marketClass: "II", cargoCapacity: 3000, merchandiseId: "salt", stone: 1 }
  }));

  assert.ok(r.notes.some((n) => n.key === "impactSteppedDown"));
  assert.equal(r.warnings.some((w) => w.key === "impactSteppedDown"), false);
});

test("a day of arbitrage earns no campaign XP by itself", () => {
  // Mercantile income is a month's figure for the venture as a whole (p. 424).
  const r = calculate(saltDeal());
  assert.equal(r.earnsXp, false);
  assert.equal(r.xp.applies, false);
  assert.equal(r.xp.earned, 0);
});

/* ------------------------------------------------------------------ *
 * Mercantile ventures (pp. 423-425)
 * ------------------------------------------------------------------ */

/**
 * The venture Caleför, Foggy and Norden run between Istakahr and Zidium
 * (p. 424) — the only place the book prints a whole month of trade with every
 * figure shown, which makes it the check on the entire ledger.
 */
const calefarVenture = (extra = {}) => baseState({
  activity: "mercantileVenture",
  character: { classLevel: 6 },
  inputs: {
    venture: {
      revenue: { passengers: 60, carriage: 360, arbitrageSales: 29700 },
      expenses: {
        costOfGoods: 23750, tariffs: 4750, wages: 233,
        moorage: 92, tolls: 60, rations: 47.5
      },
      capital: 50000
    },
    ventureParticipants: [
      { name: "Caleför", role: "pc", ownership: 30000, classLevel: 6, isSelf: true },
      { name: "Foggy", role: "pc", ownership: 10000, classLevel: 6 },
      { name: "Norden", role: "pc", ownership: 10000, classLevel: 6 }
    ],
    ...extra
  }
});

test("the venture's month comes to 1,187.5gp of mercantile income", () => {
  const r = calculate(calefarVenture());

  assert.equal(r.figures.revenue, 30120);
  assert.equal(r.figures.expenses, 28932.5);
  assert.equal(r.figures.income, 1187.5);
  assert.equal(r.figures.returnPct, 2.38, "the book calls it a 2.375% month");
});

test("half the profit goes to the owners and half to the crew", () => {
  const shares = calculate(calefarVenture()).xp.shares;
  const by = (name) => shares.find((s) => s.name === name);

  // 593.75gp each way. Caleför owns 60% of the assets; all three ran the ship.
  assert.equal(by("Caleför").ownerShare, 356.25);
  assert.equal(by("Foggy").ownerShare, 118.75);
  assert.equal(by("Caleför").operatorShare, 197.92, "the book truncates this to 197.91");

  assert.equal(by("Caleför").share, 554.17);
  assert.equal(by("Foggy").share, 316.67);
  assert.equal(by("Norden").share, 316.67);
});

test("and none of them earns any XP from it, because a 6th level threshold is 1,200gp", () => {
  const r = calculate(calefarVenture());
  for (const share of r.xp.shares) assert.equal(share.earned, 0, share.name);
  assert.equal(r.xp.earned, 0);

  // The same month makes a 1st level hand 292 XP: 316.67gp over a 25gp threshold.
  const junior = calculate(calefarVenture({
    ventureParticipants: [
      { name: "Caleför", role: "pc", ownership: 30000, classLevel: 6 },
      { name: "Foggy", role: "pc", ownership: 10000, classLevel: 1, isSelf: true },
      { name: "Norden", role: "pc", ownership: 10000, classLevel: 6 }
    ]
  }));
  assert.equal(junior.xp.earned, 292);
});

test("the same ship carrying only cargo earns 780gp and 3.8% a month", () => {
  // The book's own variant of the venture, with no arbitrage at all. Its listed
  // rations sum to 30gp but are totalled as 31gp; the printed total is what the
  // 780gp answer depends on, so it is entered as printed.
  const r = calculate(baseState({
    activity: "mercantileVenture",
    inputs: {
      venture: {
        revenue: { carriage: 1260 },
        expenses: { wages: 233, tolls: 180, rations: 31, moorage: 36 },
        capital: 20480
      },
      ventureParticipants: []
    }
  }));

  assert.equal(r.figures.revenue, 1260);
  assert.equal(r.figures.expenses, 480);
  assert.equal(r.figures.income, 780);
  assert.equal(Math.round(r.figures.returnPct * 10) / 10, 3.8);
});

test("treasure sold into the market costs its base price", () => {
  // Caleför's 4 stone of ivory: 400gp of adventuring XP already claimed, so the
  // base price is the cost of goods and only the margin is mercantile income.
  const r = calculate(baseState({
    activity: "mercantileVenture",
    character: { classLevel: 1 },
    inputs: {
      venture: { revenue: { arbitrageSales: 600 }, expenses: { costOfGoods: 400 } },
      ventureParticipants: [{ name: "Caleför", role: "pc", ownership: 100, classLevel: 1, isSelf: true }]
    }
  }));

  assert.equal(r.figures.income, 200);
  assert.equal(r.xp.shares[0].share, 200, "sole owner and sole operator");
  assert.equal(r.xp.earned, 175, "200gp over a 1st level threshold of 25gp");
});

test("a henchman draws half a share and a hireling none at all", () => {
  const r = calculate(baseState({
    activity: "mercantileVenture",
    inputs: {
      venture: { revenue: { carriage: 1000 }, expenses: {} },
      ventureParticipants: [
        { name: "Captain", role: "pc", ownership: 100, classLevel: 1, isSelf: true },
        { name: "Squire", role: "henchman", ownership: 0, classLevel: 1 },
        { name: "Sellsword", role: "hireling", ownership: 0, classLevel: 1 }
      ]
    }
  }));

  const [captain, squire, sellsword] = r.xp.shares;

  assert.equal(captain.ownerShare, 500, "he owns every asset");
  assert.equal(captain.operatorShare, 333.33, "one full share of 500gp against a half");
  assert.equal(squire.operatorShare, 166.67);
  assert.equal(sellsword.share, 0, "hired swords are paid a wage, not a share");
  assert.equal(sellsword.excluded, true);
});

test("ownership typed against a hireling is not counted, and says so", () => {
  const r = calculate(baseState({
    activity: "mercantileVenture",
    inputs: {
      venture: { revenue: { carriage: 1000 }, expenses: {} },
      ventureParticipants: [
        { name: "Captain", role: "pc", ownership: 50, classLevel: 1, isSelf: true },
        { name: "Sellsword", role: "hireling", ownership: 50, classLevel: 1 }
      ]
    }
  }));

  assert.equal(r.xp.shares[0].ownerShare, 500, "the whole owner pool, not half of it");
  assert.equal(r.xp.shares[1].ownerShare, 0);
  assert.ok(r.warnings.some((w) => w.key === "hirelingHasNoShare"));
});

test("a venture that lost money divides nothing", () => {
  const r = calculate(calefarVenture({
    venture: {
      revenue: { arbitrageSales: 1000 },
      expenses: { costOfGoods: 5000 },
      capital: 50000
    }
  }));

  assert.equal(r.figures.income, -4000);
  assert.equal(r.income.gold, -4000, "a loss is reported as a loss");
  for (const share of r.xp.shares) assert.equal(share.share, 0);
  assert.equal(r.xp.earned, 0);
  assert.ok(r.warnings.some((w) => w.key === "ventureAtALoss"));
});

test("exactly three activities earn campaign XP, each by its own rule", () => {
  // Campaign XP comes from six sources (p. 423). Three of them are this
  // module's: mercantile income, and both sides of a criminal guild.
  assert.deepEqual(XP_EARNING_IDS.sort(), ["hijink", "mercantileVenture", "syndicate"]);

  assert.equal(ACTIVITY_TYPES.mercantileVenture.xpMode, "mercantileSplit");
  assert.equal(ACTIVITY_TYPES.syndicate.xpMode, "threshold");
  assert.equal(ACTIVITY_TYPES.hijink.xpMode, "hijinkShare");

  // A day's trade is not a month's income, so arbitrage earns none.
  assert.equal(earnsXp(ACTIVITY_TYPES.arbitrage), false);

  // And every record classifies itself, in one field, one way.
  for (const id of ACTIVITY_TYPE_IDS) {
    assert.equal("earnsXp" in ACTIVITY_TYPES[id], false, `${id} must declare xpMode alone`);
    assert.ok(ACTIVITY_TYPES[id].xpMode, `${id} declares no xpMode`);
  }
});

/* ------------------------------------------------------------------ *
 * Hijinks (pp. 360-369, 423)
 * ------------------------------------------------------------------ */

test("a first level thief's carousing earns him about 50 XP and no threshold", () => {
  // The book's own figure (p. 423). A member is measured on half the value of
  // what he pulled off, not on the value less his threshold — which for a 1st
  // level character would be 25gp and would leave him almost nothing.
  const r = calculate(baseState({
    activity: "hijink",
    character: { classLevel: 1 },
    inputs: {
      hijinkId: "carousing", marketClass: "III",
      crew: [{ name: "Reingo", classLevel: 1, cha: 10, succeeded: true, caught: false }]
    }
  }));

  assert.equal(r.income.gold, 97.5, "3d12 x 5gp to the boss");
  assert.equal(r.earnsXp, true);
  assert.equal(r.xp.mode, "hijinkShare");
  assert.equal(r.xp.thresholdApplies, false);
  assert.equal(r.xp.earned, 49, "half the take, within a point of the book's 50");
});

test("Viktir's crew splits its 4,500gp haul through the wizard as well", () => {
  const r = calculate(baseState({
    activity: "hijink",
    character: { classLevel: 9 },
    inputs: {
      hijinkId: "stealing", marketClass: "II",
      crew: [
        { name: "Viktir", classLevel: 9, cha: 13, succeeded: true, caught: false },
        { name: "Gordon", classLevel: 6, cha: 10, succeeded: true, caught: false },
        { name: "Bingo", classLevel: 1, cha: 10, succeeded: false, caught: false },
        { name: "Reingo", classLevel: 1, cha: 10, succeeded: false, caught: true }
      ]
    }
  }));

  assert.equal(r.income.gold, 4500);
  assert.equal(r.figures.summedLevel, 15);

  const by = (name) => r.xp.shares.find((s) => s.name === name);
  assert.equal(by("Viktir").gold, 2700);
  assert.equal(by("Gordon").gold, 1800);
  assert.equal(by("Viktir").xp, 1350, "half his own share");

  // The panel reports the honcho's figure, since he is the character in hand.
  assert.equal(r.xp.earned, 1350);
  assert.ok(r.warnings.some((w) => w.key === "perpetratorsCaught"));
});

test("a hijink with no cash value says so instead of reporting nothing", () => {
  const r = calculate(baseState({
    activity: "hijink",
    inputs: {
      hijinkId: "arson", marketClass: "III",
      crew: [{ name: "", classLevel: 4, cha: 10, succeeded: true, caught: false }]
    }
  }));

  assert.equal(r.income.gold, 0);
  assert.equal(r.figures.cash, false);
  assert.ok(r.notes.some((n) => n.key === "hijinkHasNoCashValue"));
  assert.equal(r.warnings.some((w) => w.key === "hijinkFailed"), false, "it succeeded");
});

test("a village caps the loot and says which market did it", () => {
  const r = calculate(baseState({
    activity: "hijink",
    inputs: {
      hijinkId: "stealing", marketClass: "VI",
      crew: [{ name: "Viktir", classLevel: 9, cha: 13, succeeded: true, caught: false }]
    }
  }));

  assert.equal(r.figures.summedLevel, 3, "a Class VI market reaches 3rd level");
  assert.equal(r.income.gold, 900, "300gp a level, not 2,700");
  assert.ok(r.notes.some((n) => n.key === "effectiveLevelCapped"));
});

test("Viktir's syndicate brings him 1,650gp of tribute and not one point of XP", () => {
  // The tribute example of p. 361. Viktir is a 9th level thief, so his monthly
  // threshold is 10,000gp — a hundred-member syndicate collecting tribute does
  // not come close, which is exactly the pressure the chapter is built around:
  // a boss who wants to advance has to put his people to work.
  const boss = (classLevel) => calculate(baseState({
    activity: "syndicate",
    character: { classLevel },
    inputs: {
      marketClass: "IV",
      syndicate: { hideoutValue: 20000, members: { 0: 50, 1: 30, 2: 15, 3: 5 } }
    }
  }));

  const viktir = boss(9);
  assert.equal(viktir.figures.tribute, 1650);
  assert.equal(viktir.figures.headcount, 100);
  assert.equal(viktir.income.gold, 1650);
  assert.equal(viktir.xp.mode, "threshold");
  assert.equal(viktir.xp.threshold, 10000);
  assert.equal(viktir.xp.earned, 0);

  // The same syndicate under a 6th level boss, whose threshold is 1,200gp.
  assert.equal(boss(6).xp.earned, 450);
});

test("the wage bill for orders given is taken out of the boss's month", () => {
  const r = calculate(baseState({
    activity: "syndicate",
    character: { classLevel: 5 },
    inputs: {
      marketClass: "III",
      syndicate: {
        hideoutValue: 75000,
        members: { 1: 10 },
        assigned: { 1: 10 },
        revenue: { hijinkEarnings: 1000 },
        expenses: { attorneys: 100, bribes: 350 }
      }
    }
  }));

  // Ten first-level members ordered out at 25gp each, and no tribute from any
  // of them, because a member given work is paid instead of paying.
  assert.equal(r.figures.assignmentCost, 250);
  assert.equal(r.figures.tribute, 50, "the membership still pays; the Judge zeroes it if not");
  assert.equal(r.figures.expenses, 700, "250 wages + 100 attorneys + 350 bribes");
  assert.equal(r.figures.revenue, 1050);
  assert.equal(r.income.gold, 350);
});

test("a syndicate bigger than its hideout or its town is flagged", () => {
  const r = calculate(baseState({
    activity: "syndicate",
    inputs: {
      marketClass: "VI",
      syndicate: { hideoutValue: 5000, members: { 0: 40 } }
    }
  }));

  assert.equal(r.figures.maxMembers, 25, "a village sustains no more");
  assert.ok(r.warnings.some((w) => w.key === "overMaxMembers"));
});

/* ------------------------------------------------------------------ *
 * Experience
 * ------------------------------------------------------------------ */

/**
 * The wage-work activities, named one by one rather than swept from the
 * registry. Phase 2 added records that *do* earn XP, so a sweep would quietly
 * shrink to whatever is left; naming them means a new record has to be
 * classified deliberately in both directions.
 */
const WAGE_ACTIVITY_IDS = [
  "spellcasting", "perpetualSpellcasting", "specialist",
  "artCraft", "profession", "performance", "labor", "gambling"
];

test("no wage activity ever reports campaign XP", () => {
  // Campaign XP comes only from construction, domains, hijinks, mercantile
  // income, magic research and divine power (p. 423). Wage work is none of
  // those, so none of these may claim any.
  for (const id of WAGE_ACTIVITY_IDS) {
    assert.equal(earnsXp(ACTIVITY_TYPES[id]), false, `${id} must not earn XP`);
    const r = calculate(baseState({
      activity: id,
      character: { classLevel: 1 },
      inputs: {
        castings: { 1: 9 }, marketClass: "I", daysWorked: 30,
        perpetualRows: [{ level: 6, count: 50 }],
        specialistId: "mercenaryOfficer", gradeId: "general", quantity: 12,
        rank: 4, workers: { 1: 8, 2: 4, 3: 2 }, months: 12,
        ranks: 3, weeks: 52
      }
    }));
    assert.equal(r.xp.applies, false, `${id} reported XP`);
    assert.equal(r.xp.earned, 0, `${id} reported XP`);
    assert.ok(r.income.gold > 0, `${id} should have earned gold in this fixture`);
  }
});

test("the campaign XP threshold matches the book", () => {
  // p. 423, and the same figures the magic research wizard uses.
  assert.equal(xpThreshold(1), 25);
  assert.equal(xpThreshold(9), 10000);
  assert.equal(xpThreshold(14), 425000);
  assert.equal(xpThreshold(0), 0);
  assert.equal(xpThreshold(99), 425000, "clamped");
});

test("campaign XP is income above the threshold, never below zero", () => {
  // Marcus's domain: 16,000gp income against a 9th level threshold of 10,000
  // earns 6,000 XP (p. 423). Domains are not in this module, but the arithmetic
  // is the shared one every campaign income source uses.
  assert.deepEqual(campaignXp(16000, 9), { threshold: 10000, earned: 6000 });
  assert.equal(campaignXp(500, 9).earned, 0, "a bad month earns nothing, not a debt");
});

/* ------------------------------------------------------------------ *
 * The Judge's override
 * ------------------------------------------------------------------ */

test("an overridden figure replaces the derived one and is flagged", () => {
  const state = baseState({
    activity: "labor",
    inputs: { months: 4 },
    overrides: { gold: 500 }
  });
  const r = calculate(state);
  assert.equal(r.income.gold, 500);
  assert.equal(r.income.computed, 24, "the derived figure is kept for display");
  assert.equal(r.income.overridden, true);
});

test("a blank override is not zero", () => {
  // FormDataExtended sends null for a cleared number box and "" for text.
  for (const blank of ["", null, undefined]) {
    const r = calculate(baseState({
      activity: "labor", inputs: { months: 4 }, overrides: { gold: blank }
    }));
    assert.equal(r.income.gold, 24, `${JSON.stringify(blank)} should mean "use the derived figure"`);
    assert.equal(r.income.overridden, false);
  }
});

test("every activity survives an empty form without producing NaN", () => {
  for (const id of ACTIVITY_TYPE_IDS) {
    const r = calculate({ activity: id });
    assert.ok(Number.isFinite(r.income.gold), `${id} produced ${r.income.gold}`);
    assert.equal(r.income.gold, 0);
    assert.ok(Array.isArray(r.warnings));
  }
});

test("spellcastingRows is stable when no castings are entered", () => {
  const rows = spellcastingRows({});
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.sellable === 0 && r.grossPerDay === 0));
});
