/**
 * Hideouts and hijinks, checked against the rulebook's own worked examples.
 *
 * Every figure asserted here is printed in the book.
 *
 *   node --test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  assignmentCost,
  assignmentDays,
  caughtCheck,
  chargeFor,
  convictionCost,
  crewResolution,
  effectiveLevel,
  henchmanSlots,
  hijinkSchedule,
  hijinkValue,
  syndicateLimits,
  timeLanguishing,
  tributeIncome,
  victimBand,
  CASH_HIJINK_IDS
} from "../scripts/rules/hijinks.mjs";

import {
  HENCHMAN_WAGE_BY_LEVEL,
  HIJINKS,
  HIJINK_IDS,
  hijinkFee,
  memberTribute
} from "../scripts/rules/tables.mjs";

import { isExpression, parse } from "../scripts/rules/dice.mjs";

/* ------------------------------------------------------------------ *
 * The tables themselves
 * ------------------------------------------------------------------ */

test("the hijink table holds the fifteen the book lists", () => {
  assert.equal(HIJINK_IDS.length, 15);

  // Six of them are done for reasons other than money.
  assert.deepEqual(
    HIJINK_IDS.filter((id) => HIJINKS[id].basis === "none").sort(),
    ["arson", "escaping", "infiltrating", "sabotaging", "slandering", "subverting"]
  );
  assert.equal(CASH_HIJINK_IDS.length, 9);
});

test("every reward expression in the hijink table parses, or is a flat figure", () => {
  for (const id of HIJINK_IDS) {
    for (const value of [HIJINKS[id].gp, HIJINKS[id].hastyGp]) {
      if (value === null || value === undefined) continue;
      if (isExpression(value)) assert.doesNotThrow(() => parse(value), `${id}: ${value}`);
      else assert.ok(Number.isFinite(Number(value)), `${id}: ${value} is neither dice nor a number`);
    }
  }
});

test("a caught perpetrator's charge is read off his own hijink's 1d6", () => {
  // Stealing: theft (1-3), burglary (4-5) or robbery (6).
  assert.equal(chargeFor("stealing", 1), "theft");
  assert.equal(chargeFor("stealing", 3), "theft");
  assert.equal(chargeFor("stealing", 4), "burglary");
  assert.equal(chargeFor("stealing", 6), "robbery");

  // Arson: vandalism (1-3), mayhem (4-5), or arson (6).
  assert.equal(chargeFor("arson", 2), "vandalism");
  assert.equal(chargeFor("arson", 6), "arson");
});

test("the henchman wage table does not simply double", () => {
  // Read off p. 168. The 8th level figure is the one an assumption gets wrong.
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[0], 12);
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[1], 25);
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[7], 1600);
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[8], 3000, "not 3,200");
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[9], 7250, "and not 6,400 either");
  assert.equal(HENCHMAN_WAGE_BY_LEVEL[14], 350000);
});

test("a hijink fee is a month's henchman wages, but 6gp at 0th level", () => {
  // "a 1st level thief must be paid 25gp ... a 4th level assassin 200gp" (p. 361)
  assert.equal(hijinkFee(1), 25);
  assert.equal(hijinkFee(4), 200);
  assert.equal(hijinkFee(0), 6, "half a 0th level henchman's 12gp wage");
});

/* ------------------------------------------------------------------ *
 * Hideouts and effective level (p. 360)
 * ------------------------------------------------------------------ */

test("Viktir's hideout buys him 50 members, then 100, then no more", () => {
  // Siadanos is a Class IV market, so 100 is the ceiling however much he spends.
  const small = syndicateLimits("IV", 10000);
  assert.equal(small.maxMembers, 50);
  assert.equal(small.couldGrow, true, "more hideout would buy more members here");

  const bigger = syndicateLimits("IV", 20000);
  assert.equal(bigger.maxMembers, 100);

  const mansion = syndicateLimits("IV", 75000);
  assert.equal(mansion.maxMembers, 100, "a Class IV market sustains no more");
  assert.equal(mansion.cappedByMarket, true);
});

test("a hideout too cheap to register supports nobody", () => {
  assert.equal(syndicateLimits("I", 4999).maxMembers, 0);
  assert.equal(syndicateLimits("I", 5000).maxMembers, 25, "the smallest tier");
});

test("a village caps a 9th level thief at 3rd level of loot, but not of skill", () => {
  // "the maximum effective level is 3rd, so Viktir can only kidnap someone of
  // 1st to 5th level" — while still throwing as the 9th level thief he is.
  const capped = effectiveLevel(9, "VI");
  assert.equal(capped.level, 3);
  assert.equal(capped.own, 9, "his throws are unaffected");
  assert.equal(capped.capped, true);

  assert.deepEqual(victimBand("kidnapping", capped.level), { from: 1, to: 5 });
});

test("a 0th level perpetrator counts as 1st for reward", () => {
  assert.equal(effectiveLevel(0, "I").level, 1);
});

/* ------------------------------------------------------------------ *
 * What a hijink is worth (pp. 361-367)
 * ------------------------------------------------------------------ */

test("a first level member carouses his way to about 50 XP a month", () => {
  // The book's own sanity check on the whole subsystem (p. 423): "A 1st level
  // syndicate member will earn an average of 50 XP per month from hijinks."
  // 3d12 x 5gp per level averages 97.5gp, and the member keeps half as XP.
  const value = hijinkValue({ hijinkId: "carousing", level: 1 });
  assert.equal(value.gold, 97.5);
  assert.equal(Math.round(value.gold * 0.5), 49, "within a point of the book's 50");
});

test("the boss's cut of a smuggling run is a tenth of the goods", () => {
  // 3,000gp of merchandise per class level, of which the boss collects 10%.
  const value = hijinkValue({ hijinkId: "smuggling", level: 4 });
  assert.equal(value.perLevel, 3000);
  assert.equal(value.share, 0.1);
  assert.equal(value.gold, 1200, "12,000gp of goods, 1,200gp to the boss");
});

test("stealing hands the boss the whole market value", () => {
  assert.equal(hijinkValue({ hijinkId: "stealing", level: 11 }).gold, 3300);
});

test("a bounty scales with the victim, not the killer", () => {
  // 1,000gp per level of the victim (p. 363).
  assert.equal(hijinkValue({ hijinkId: "assassinating", level: 9, victimLevel: 7 }).gold, 7000);
  assert.equal(hijinkValue({ hijinkId: "kidnapping", level: 9, victimLevel: 7 }).gold, 3500);

  // "0th level victims count as half level for purposes of bounties."
  assert.equal(hijinkValue({ hijinkId: "assassinating", level: 5, victimLevel: 0 }).gold, 500);
  assert.equal(hijinkValue({ hijinkId: "kidnapping", level: 5, victimLevel: 0 }).gold, 250);
});

test("a hasty hijink pays much less, and carousing's payoff stops being a number", () => {
  assert.equal(hijinkValue({ hijinkId: "racketeering", level: 3 }).gold, 525, "5d6 x 10 averages 175");
  assert.equal(hijinkValue({ hijinkId: "racketeering", level: 3, hasty: true }).gold, 90, "30gp a level");

  assert.equal(hijinkValue({ hijinkId: "soliciting", level: 2, hasty: true }).gold, 21, "3d6 averages 10.5");

  // Hasty carousing yields a rumour with a one-in-four chance of being true,
  // which is not a sum at all.
  const rumour = hijinkValue({ hijinkId: "carousing", level: 3, hasty: true });
  assert.equal(rumour.unpriced, true);
  assert.equal(rumour.gold, 0);
});

test("the six hijinks done for other reasons report no cash value, not zero gold", () => {
  for (const id of ["arson", "escaping", "infiltrating", "sabotaging", "slandering", "subverting"]) {
    const value = hijinkValue({ hijinkId: id, level: 9 });
    assert.equal(value.cash, false, id);
    assert.equal(value.gold, 0, id);
  }
});

/* ------------------------------------------------------------------ *
 * Crews (pp. 362-363)
 * ------------------------------------------------------------------ */

/** Viktir's crew, exactly as the book runs it (p. 363). */
const viktirsCrew = [
  { name: "Viktir", classLevel: 9, cha: 13, succeeded: true, caught: false },
  { name: "Gordon", classLevel: 6, cha: 10, succeeded: true, caught: false },
  { name: "Bingo", classLevel: 1, cha: 10, succeeded: false, caught: false },
  { name: "Reingo", classLevel: 1, cha: 10, succeeded: false, caught: true }
];

test("Viktir's crew steals 4,500gp and splits it 2,700 to 1,800", () => {
  // Class II so the market's 11th level ceiling does not bind on anyone.
  const result = crewResolution({ crew: viktirsCrew, hijinkId: "stealing", marketClassId: "II" });

  assert.equal(result.honcho, 0, "the highest level perpetrator");
  assert.equal(result.slots, 5, "CHA 13 allows five");
  assert.equal(result.sizePenalty, 0, "four is within it");

  assert.equal(result.summedLevel, 15, "9 + 6, the two who succeeded");
  assert.equal(result.gold, 4500, "300gp per level");

  const by = (name) => result.shares.find((s) => s.name === name);
  assert.equal(by("Viktir").gold, 2700);
  assert.equal(by("Gordon").gold, 1800);
});

test("one crew member caught takes every failure down with him", () => {
  const result = crewResolution({ crew: viktirsCrew, hijinkId: "stealing", marketClassId: "II" });
  const by = (name) => result.shares.find((s) => s.name === name);

  assert.equal(by("Reingo").caught, true, "he failed by 14");
  assert.equal(by("Bingo").caught, true, "and he failed at all");
  assert.equal(by("Viktir").caught, false, "success is safety");

  assert.equal(by("Bingo").gold, 0, "the caught share nothing");
  assert.equal(by("Reingo").gold, 0);
});

test("nobody caught means even the failures share", () => {
  // The split is among "all the perpetrators who don't get caught" — which is
  // a wider set than those who succeeded, when the throws are merely bad.
  const crew = [
    { name: "A", classLevel: 3, cha: 10, succeeded: true, caught: false },
    { name: "B", classLevel: 1, cha: 10, succeeded: false, caught: false }
  ];
  const result = crewResolution({ crew, hijinkId: "stealing", marketClassId: "II" });

  assert.equal(result.summedLevel, 3, "only the successful set the reward");
  assert.equal(result.gold, 900);
  assert.equal(result.shares[0].gold, 675, "3 of 4 levels");
  assert.equal(result.shares[1].gold, 225, "1 of 4 levels");
});

test("XP is half of whatever gold a perpetrator got away with", () => {
  const result = crewResolution({ crew: viktirsCrew, hijinkId: "stealing", marketClassId: "II" });
  const by = (name) => result.shares.find((s) => s.name === name);

  assert.equal(by("Viktir").xp, 1350, "half of 2,700gp");
  assert.equal(by("Gordon").xp, 900);
  assert.equal(by("Bingo").xp, 0, "caught men earn nothing");
});

test("a crew larger than the honcho's henchman slots penalises everyone", () => {
  const crowd = Array.from({ length: 7 }, (_, i) => ({
    name: `thug${i}`, classLevel: 2, cha: 10, succeeded: false, caught: false
  }));
  crowd[0] = { name: "boss", classLevel: 9, cha: 10, succeeded: true, caught: false };

  const result = crewResolution({ crew: crowd, hijinkId: "stealing", marketClassId: "II" });
  assert.equal(result.slots, 4, "CHA 10 is no modifier");
  assert.equal(result.sizePenalty, 3, "-1 per member over the limit");
});

test("Charisma sets the crew size and breaks a tie for honcho", () => {
  assert.equal(henchmanSlots(10), 4);
  assert.equal(henchmanSlots(13), 5);
  assert.equal(henchmanSlots(18), 7);
  assert.equal(henchmanSlots(3), 1);

  const tied = [
    { name: "dull", classLevel: 5, cha: 9, succeeded: true, caught: false },
    { name: "charming", classLevel: 5, cha: 16, succeeded: true, caught: false }
  ];
  assert.equal(crewResolution({ crew: tied, hijinkId: "stealing", marketClassId: "II" }).honcho, 1);
});

test("the market's ceiling applies to each perpetrator, not to the crew's total", () => {
  // Two 7th level thieves in a Class IV town are worth 14 levels between them;
  // one 14th level thief alone would be worth 7.
  const pair = [
    { name: "a", classLevel: 7, cha: 10, succeeded: true, caught: false },
    { name: "b", classLevel: 7, cha: 10, succeeded: true, caught: false }
  ];
  assert.equal(crewResolution({ crew: pair, hijinkId: "stealing", marketClassId: "IV" }).summedLevel, 14);

  const alone = [{ name: "a", classLevel: 14, cha: 10, succeeded: true, caught: false }];
  assert.equal(crewResolution({ crew: alone, hijinkId: "stealing", marketClassId: "IV" }).summedLevel, 7);
});

/* ------------------------------------------------------------------ *
 * Getting caught (pp. 362-363, 367-368)
 * ------------------------------------------------------------------ */

test("a throw failed by fourteen, or an unmodified 1, is an arrest", () => {
  assert.equal(caughtCheck({ target: 17, rolled: 3, natural: 3 }).caught, true, "failed by 14");
  assert.equal(caughtCheck({ target: 17, rolled: 4, natural: 4 }).caught, false, "failed by 13 only");
  assert.equal(caughtCheck({ target: 6, rolled: 1, natural: 1 }).caught, true, "an unmodified 1");
  assert.equal(caughtCheck({ target: 6, rolled: 16, natural: 16 }).succeeded, true);
});

test("skipping laying low makes an arrest far likelier", () => {
  const skipped = { target: 17, rolled: 6, natural: 6, laidLow: false };
  assert.equal(caughtCheck(skipped).caught, true, "failed by 11");
  assert.equal(caughtCheck({ ...skipped, laidLow: true }).caught, false, "which is fine if he lay low");

  assert.equal(caughtCheck({ target: 6, rolled: 3, natural: 3, laidLow: false }).caught, true);
  assert.equal(caughtCheck({ target: 6, rolled: 3, natural: 3, laidLow: true }).caught, false);
});

test("a hasty hijink gets a second throw before the cell door shuts", () => {
  const bad = { target: 17, rolled: 3, natural: 3, hasty: true };

  assert.equal(caughtCheck(bad).pendingSecondThrow, true, "the second throw has not been made");
  assert.equal(caughtCheck({ ...bad, secondRolled: 18 }).caught, false);
  assert.equal(caughtCheck({ ...bad, secondRolled: 18 }).reprieved, true);
  assert.equal(caughtCheck({ ...bad, secondRolled: 4 }).caught, true);
});

test("Reingo's theft costs him 300gp, or 150 if he pleads guilty first", () => {
  // "He is placed in stocks 2d6 days and fined 150gp" on a first offence;
  // "He'd be whipped and fined 300gp" on a second (p. 367).
  assert.equal(convictionCost("theft", "lesser").fine, 150);
  assert.equal(convictionCost("theft", "standard").fine, 300);
  assert.equal(convictionCost("theft", "punitive").fine, 450);

  // And paying three times a fine buys off the whipping that came with it.
  assert.equal(convictionCost("theft", "standard").buyOutCost, 900);
  assert.equal(convictionCost("theft", "standard", { buyOut: true }).payable, 900);
});

test("above racketeering the table stops levying fines and starts taking lives", () => {
  assert.equal(convictionCost("murder", "standard").fatal, true);
  assert.equal(convictionCost("treason", "punitive").fatal, true);
  assert.equal(convictionCost("theft", "standard").fatal, false);
});

test("time awaiting trial is read off the crime, in its own units", () => {
  assert.deepEqual(timeLanguishing("theft"), { dice: "1d6", unit: "day" });
  assert.deepEqual(timeLanguishing("smuggling"), { dice: "1d4", unit: "week" });
  assert.deepEqual(timeLanguishing("murder"), { dice: "1d12", unit: "month" });
  assert.deepEqual(timeLanguishing("regicide"), { dice: "2d12", unit: "month" });

  // Every crime any hijink can produce has a listed sentence.
  for (const id of HIJINK_IDS) {
    for (const crime of HIJINKS[id].charges ?? []) {
      assert.ok(timeLanguishing(crime), `${id} can be charged with ${crime}, which has no entry`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * The boss's month (p. 361)
 * ------------------------------------------------------------------ */

test("Viktir collects 1,650gp of tribute from a syndicate he gave no orders", () => {
  // 50 x 1gp + 30 x 5gp + 15 x 30gp + 5 x 200gp (p. 361).
  const tribute = tributeIncome({ 0: 50, 1: 30, 2: 15, 3: 5 }, "IV");

  assert.equal(tribute.total, 1650);
  assert.equal(tribute.headcount, 100);
  assert.deepEqual(tribute.rows.map((r) => r.total), [50, 150, 450, 1000]);
});

test("a member above his market's ceiling pays tribute at the ceiling", () => {
  // "Members whose level exceeds the maximum effective level for their market
  // pay tribute based on the maximum effective level" — Class VI stops at 3rd.
  const village = tributeIncome({ 8: 1 }, "VI");
  assert.equal(village.total, memberTribute(3));
  assert.equal(village.rows[0].capped, true);

  const city = tributeIncome({ 8: 1 }, "I");
  assert.equal(city.total, 2000, "a metropolis reaches 14th level, so he pays in full");
});

test("ordering hijinks costs a fee for every member ordered", () => {
  const cost = assignmentCost({ 0: 50, 1: 30, 4: 5 });
  assert.equal(cost.ordered, 85);
  assert.equal(cost.total, 50 * 6 + 30 * 25 + 5 * 200);
});

test("a boss can give twelve orders in passing, or a hundred in a day", () => {
  assert.equal(assignmentDays(12).ancillary, true);
  assert.equal(assignmentDays(13).ancillary, false);
  assert.equal(assignmentDays(100).dedicatedDays, 1);
  assert.equal(assignmentDays(101).dedicatedDays, 2);
  // "Assigning hijinks to a 3,000-member syndicate would keep its boss busy
  // every day of the month."
  assert.equal(assignmentDays(3000).dedicatedDays, 30);
});

/* ------------------------------------------------------------------ *
 * Timing (p. 362)
 * ------------------------------------------------------------------ */

test("a high-level honcho plans and performs faster", () => {
  assert.deepEqual(hijinkSchedule("stealing", 1), {
    plan: "2d8+3", perform: "1", layLow: "2d8+3", hasty: false, planned: true
  });
  assert.equal(hijinkSchedule("stealing", 5).plan, "2d6+3");
  assert.equal(hijinkSchedule("stealing", 9).plan, "2d4+3");
});

test("an ongoing hijink neither plans nor lies low", () => {
  const carousing = hijinkSchedule("carousing", 1);
  assert.equal(carousing.plan, null);
  assert.equal(carousing.perform, "3d6+10");
  assert.equal(carousing.layLow, null);

  assert.equal(hijinkSchedule("carousing", 5).perform, "3d4+8");
  assert.equal(hijinkSchedule("carousing", 9).perform, "2d6+5");
});

test("rushing one of the three hasty hijinks collapses the whole schedule", () => {
  const hasty = hijinkSchedule("carousing", 1, { hasty: true });
  assert.equal(hasty.perform, "1d6+3");
  assert.equal(hasty.plan, null);
  assert.equal(hasty.layLow, null);

  assert.equal(hijinkSchedule("carousing", 9, { hasty: true }).perform, "1d3+2");
  // Stealing cannot be rushed, so asking for haste changes nothing.
  assert.equal(hijinkSchedule("stealing", 1, { hasty: true }).plan, "2d8+3");
});
