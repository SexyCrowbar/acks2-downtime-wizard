/**
 * Static rule tables from the ACKS II Revised Rulebook.
 * Pure data — no Foundry globals — so this module is testable under plain node.
 *
 * Page references are to the printed page numbers in the rulebook.
 *
 * English labels live in the data rather than in `lang/en.json`, following the
 * construction wizard's catalogue: there are too many specialist grades to make
 * a translator carry them all before the module is usable in their language.
 * The app checks for a `DW.specialist.*` key first, so any one of them can still
 * be overridden by a translation.
 */

/* ------------------------------------------------------------------ *
 * Markets
 * ------------------------------------------------------------------ */

/**
 * Market classes I-VI (p. 123), with the Market Characteristics each one carries
 * for mercantile ventures (p. 370).
 *
 * `index` orders the class across the availability and merchandise tables;
 * `number` is the class as an arabic numeral, which several formulae use
 * arithmetically (the spell sale cap, the merchant's extra Bargaining rank).
 *
 * `baselineCargo` is the fleet or caravan size a market is scaled for, and is
 * what market impact is measured against. `tollCpPerStone` is charged on cargo
 * *capacity*, not on the cargo actually carried. Class VI charges neither toll
 * nor tariff.
 */
export const MARKET_CLASSES = {
  I: {
    id: "I", label: "Class I (metropolis)", index: 0, number: 1,
    baselineCargo: 30000, tollCpPerStone: 0.2, taxed: true,
    baselineConsignments: 4000, passengerDice: "2d6x10+10"
  },
  II: {
    id: "II", label: "Class II (large city)", index: 1, number: 2,
    baselineCargo: 7500, tollCpPerStone: 0.2, taxed: true,
    baselineConsignments: 1000, passengerDice: "6d6"
  },
  III: {
    id: "III", label: "Class III (small city)", index: 2, number: 3,
    baselineCargo: 3750, tollCpPerStone: 0.2, taxed: true,
    baselineConsignments: 500, passengerDice: "4d4"
  },
  IV: {
    id: "IV", label: "Class IV (large town)", index: 3, number: 4,
    baselineCargo: 1000, tollCpPerStone: 0.1, taxed: true,
    baselineConsignments: 120, passengerDice: "2d3"
  },
  V: {
    id: "V", label: "Class V (small town)", index: 4, number: 5,
    baselineCargo: 400, tollCpPerStone: 0.1, taxed: true,
    baselineConsignments: 50, passengerDice: "1d4"
  },
  VI: {
    id: "VI", label: "Class VI (village)", index: 5, number: 6,
    baselineCargo: 150, tollCpPerStone: 0, taxed: false,
    baselineConsignments: 20, passengerDice: "1d2-1"
  }
};

export const MARKET_CLASS_IDS = Object.keys(MARKET_CLASSES);

export function marketClass(id) {
  return MARKET_CLASSES[id] ?? MARKET_CLASSES.IV;
}

/** The class one step larger or smaller, or null at either end of the table. */
export function marketClassByIndex(index) {
  return MARKET_CLASS_IDS.map((id) => MARKET_CLASSES[id]).find((m) => m.index === index) ?? null;
}

/* ------------------------------------------------------------------ *
 * Spellcasting services (pp. 172-173)
 * ------------------------------------------------------------------ */

/** Cost per casting by spell level. Arcane and divine charge alike (p. 172). */
export const SPELL_COST_BY_LEVEL = { 1: 5, 2: 10, 3: 45, 4: 185, 5: 900, 6: 3600 };

export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * Spell Availability by Market (p. 172): how many castings of a given level can
 * be found for hire, by market class I-VI in order.
 *
 * These are the numbers a caster is competing against when selling his own
 * services, which is why they matter to this module. Expressions like `1d4-3`
 * are the book's own and mean "usually none at all" — clamp at 0 when rolling.
 */
export const SPELL_AVAILABILITY = {
  divine: {
    1: ["4d4x100", "4d10x10", "4d4x10", "6d10", "4d6", "2d4"],
    2: ["4d6x10", "12d6", "4d6", "4d4", "2d4", "1d6"],
    3: ["8d6", "4d6", "2d6", "2d4", "1d6", null],
    4: ["6d6", "2d6", "2d3", "1d3", null, null],
    5: ["4d4", "2d3", "1d4", "1d4-3", null, null],
    6: ["2d3", "1d3", "1d8-6", null, null, null]
  },
  arcane: {
    1: ["2d4x100", "2d10x10", "2d4x10", "3d10", "2d6", "1d4"],
    2: ["2d6x10", "6d6", "2d6", "2d4", "1d4", "1d3"],
    3: ["4d6", "2d6", "2d3", "1d4", "1d3", null],
    4: ["3d6", "2d2", "1d3", "1d3-1", null, null],
    5: ["2d4", "1d3", "1d2", "1d10-9", null, null],
    6: ["1d3", "1d3-1", "1d8-7", null, null, null]
  }
};

export const MAGIC_TYPES = ["arcane", "divine"];

/**
 * The availability expression for a level in a market, or null where the book
 * prints a dash — no caster of that level is to be found there at all.
 */
export function availabilityFor(magicType, spellLevel, marketClassId) {
  const byLevel = SPELL_AVAILABILITY[magicType];
  if (!byLevel) return null;
  const row = byLevel[Math.max(1, Math.min(6, Math.floor(Number(spellLevel) || 1)))];
  if (!row) return null;
  return row[marketClass(marketClassId).index] ?? null;
}

/**
 * Selling spellcasting services (p. 172).
 *
 * A caster who dedicates a day to it rolls 1d6 for *each* casting he can make
 * that day and sells that casting on a 6. So the fraction below is the average
 * of a real roll, not a shortcut: it is what Elaria's worked example uses to
 * turn a theoretical 310gp/day into an expected 51gp 66cp.
 */
export const SPELL_SALE_DIE = "1d6";
export const SPELL_SALE_ON = 6;
export const SPELL_SALE_FRACTION = 1 / 6;

/**
 * A caster cannot flood a market: at most `9 - (market class + spell level)`
 * castings of a given level sell in a day (p. 172). The figure goes to zero and
 * below in small markets for high levels, which simply means no sale there.
 *
 * Class numbers are I = 1 through VI = 6.
 */
export function saleCapPerDay(marketClassId, spellLevel) {
  const level = Math.max(1, Math.min(6, Math.floor(Number(spellLevel) || 1)));
  return Math.max(0, 9 - (marketClass(marketClassId).number + level));
}

/**
 * Perpetual spellcasting as a service (p. 173): an upfront fee plus a monthly
 * maintenance fee, because a caster is limited in how many perpetual effects
 * he can sustain at once.
 */
export const PERPETUAL_SPELL_COST = {
  1: { upfront: 40, monthly: 1 },
  2: { upfront: 55, monthly: 2 },
  3: { upfront: 160, monthly: 5 },
  4: { upfront: 440, monthly: 15 },
  5: { upfront: 1365, monthly: 40 },
  6: { upfront: 4515, monthly: 135 }
};

/* ------------------------------------------------------------------ *
 * Specialists (pp. 170-172)
 * ------------------------------------------------------------------ *
 * The listed figure is the wage an employer pays, which is exactly what a
 * character hiring himself out earns. `unit` says what the wage is per:
 *
 *   month         a monthly salary
 *   day           a daily wage
 *   page          piece work
 *   dayPerPatient a daily wage per patient under care
 */

export const WAGE_UNITS = ["month", "day", "page", "dayPerPatient"];

export const SPECIALISTS = {
  alchemist: {
    id: "alchemist", label: "Alchemist", page: 170,
    grades: [{ id: "standard", label: "Alchemist", wage: 250, unit: "month" }]
  },
  animalTrainer: {
    id: "animalTrainer", label: "Animal trainer", page: 170,
    grades: [
      { id: "domestic", label: "Domestic animals", wage: 25, unit: "month" },
      { id: "wild", label: "Wild animals", wage: 75, unit: "month" },
      { id: "dire", label: "Dire, giant or prehistoric animals", wage: 150, unit: "month" },
      { id: "monstrous", label: "Monstrosities or vermin", wage: 250, unit: "month" }
    ]
  },
  armorer: {
    id: "armorer", label: "Armorer", page: 170,
    grades: [
      { id: "apprentice", label: "Apprentice", wage: 10, unit: "month" },
      { id: "journeyman", label: "Journeyman", wage: 20, unit: "month" },
      { id: "master", label: "Master", wage: 75, unit: "month" }
    ]
  },
  artisan: {
    id: "artisan", label: "Artisan", page: 170,
    grades: [
      { id: "apprentice", label: "Apprentice", wage: 10, unit: "month" },
      { id: "journeyman", label: "Journeyman", wage: 20, unit: "month" },
      { id: "master", label: "Master", wage: 75, unit: "month" }
    ]
  },
  artillerist: {
    id: "artillerist", label: "Artillerist", page: 170,
    grades: [{ id: "standard", label: "Artillerist", wage: 25, unit: "month" }]
  },
  copyist: {
    id: "copyist", label: "Copyist", page: 171,
    grades: [{ id: "standard", label: "Copyist", wage: 0.2, unit: "page" }]
  },
  creatureHandler: {
    id: "creatureHandler", label: "Creature handler", page: 171,
    grades: [
      { id: "domestic", label: "Domestic animals", wage: 25, unit: "month" },
      { id: "wild", label: "Wild animals", wage: 75, unit: "month" },
      { id: "dire", label: "Dire, giant or prehistoric animals", wage: 150, unit: "month" },
      { id: "monstrous", label: "Monstrosities or vermin", wage: 250, unit: "month" }
    ]
  },
  engineer: {
    id: "engineer", label: "Engineer", page: 171,
    grades: [{ id: "standard", label: "Engineer", wage: 250, unit: "month" }]
  },
  /**
   * Healers may be engaged either by the month or by the day per patient
   * (p. 171). Both ways are listed as grades of their own rather than handled
   * with a flag, so the arithmetic stays one multiplication for every grade in
   * the table.
   */
  healer: {
    id: "healer", label: "Healer", page: 171,
    grades: [
      { id: "healerMonth", label: "Healer, monthly", wage: 25, unit: "month" },
      { id: "healerDay", label: "Healer, per patient per day", wage: 1, unit: "dayPerPatient" },
      { id: "physickerMonth", label: "Physicker, monthly", wage: 50, unit: "month" },
      { id: "physickerDay", label: "Physicker, per patient per day", wage: 2, unit: "dayPerPatient" },
      { id: "chirurgeonMonth", label: "Chirurgeon, monthly", wage: 100, unit: "month" },
      { id: "chirurgeonDay", label: "Chirurgeon, per patient per day", wage: 4, unit: "dayPerPatient" }
    ]
  },
  laborer: {
    id: "laborer", label: "Laborer", page: 171,
    grades: [
      { id: "unskilled", label: "Unskilled", wage: 0.1, unit: "day" },
      { id: "skilled", label: "Skilled", wage: 0.2, unit: "day" }
    ]
  },
  lawyer: {
    id: "lawyer", label: "Lawyer", page: 171,
    grades: [
      { id: "apprentice", label: "Apprentice", wage: 25, unit: "month" },
      { id: "licensed", label: "Licensed practitioner", wage: 50, unit: "month" },
      { id: "master", label: "Master practitioner", wage: 100, unit: "month" }
    ]
  },
  mariner: {
    id: "mariner", label: "Mariner", page: 171,
    grades: [
      { id: "rower", label: "Rower", wage: 6, unit: "month" },
      { id: "sailor", label: "Sailor", wage: 6, unit: "month" },
      { id: "navigator", label: "Navigator", wage: 25, unit: "month" },
      { id: "captain", label: "Captain", wage: 100, unit: "month" },
      { id: "masterMariner", label: "Master mariner", wage: 250, unit: "month" }
    ]
  },
  marshal: {
    id: "marshal", label: "Marshal", page: 171,
    grades: [
      { id: "lightInfantry", label: "Light infantry", wage: 30, unit: "month" },
      { id: "missile", label: "Bow, crossbow or sling", wage: 60, unit: "month" },
      { id: "heavyInfantry", label: "Heavy infantry", wage: 60, unit: "month" },
      { id: "lightCavalry", label: "Light cavalry", wage: 60, unit: "month" },
      { id: "heavyCavalry", label: "Heavy cavalry", wage: 120, unit: "month" },
      { id: "horseArcher", label: "Horse archer", wage: 120, unit: "month" },
      { id: "cataphract", label: "Cataphract", wage: 240, unit: "month" }
    ]
  },
  mercenaryOfficer: {
    id: "mercenaryOfficer", label: "Mercenary officer", page: 171,
    grades: [
      { id: "lieutenant", label: "Lieutenant (4th level)", wage: 200, unit: "month" },
      { id: "captain", label: "Captain (6th level)", wage: 800, unit: "month" },
      { id: "colonel", label: "Colonel (8th level)", wage: 3000, unit: "month" },
      { id: "general", label: "General (10th level)", wage: 12000, unit: "month" }
    ]
  },
  quartermaster: {
    id: "quartermaster", label: "Quartermaster", page: 171,
    grades: [{ id: "standard", label: "Quartermaster", wage: 40, unit: "month" }]
  },
  ruffian: {
    id: "ruffian", label: "Ruffian", page: 172,
    grades: [
      { id: "carouser", label: "Carouser", wage: 7, unit: "month" },
      { id: "footpad", label: "Footpad", wage: 30, unit: "month" },
      { id: "reciter", label: "Reciter", wage: 30, unit: "month" },
      { id: "thug", label: "Thug", wage: 30, unit: "month" },
      { id: "slayer", label: "Slayer", wage: 625, unit: "month" },
      { id: "spy", label: "Spy", wage: 625, unit: "month" }
    ]
  },
  sage: {
    id: "sage", label: "Sage", page: 172,
    grades: [{ id: "standard", label: "Sage", wage: 500, unit: "month" }]
  },
  scout: {
    id: "scout", label: "Scout", page: 172,
    grades: [
      { id: "pathfinder", label: "Pathfinder", wage: 25, unit: "month" },
      { id: "landSurveyor", label: "Land surveyor", wage: 25, unit: "month" }
    ]
  },
  siegeEngineer: {
    id: "siegeEngineer", label: "Siege engineer", page: 172,
    grades: [{ id: "standard", label: "Siege engineer", wage: 50, unit: "month" }]
  },
  translator: {
    id: "translator", label: "Translator", page: 172,
    grades: [{ id: "standard", label: "Translator", wage: 1, unit: "page" }]
  },
  writer: {
    id: "writer", label: "Writer", page: 172,
    grades: [
      { id: "rank1", label: "Rank 1", wage: 1, unit: "page" },
      { id: "rank2", label: "Rank 2", wage: 2, unit: "page" },
      { id: "rank3", label: "Rank 3", wage: 4, unit: "page" },
      { id: "rank4", label: "Rank 4", wage: 10, unit: "page" }
    ]
  }
};

export const SPECIALIST_IDS = Object.keys(SPECIALISTS);

export function specialist(id) {
  return SPECIALISTS[id] ?? SPECIALISTS.sage;
}

/** A specialist's grade record, falling back to its first grade. */
export function specialistGrade(specialistId, gradeId) {
  const spec = specialist(specialistId);
  return spec.grades.find((g) => g.id === gradeId) ?? spec.grades[0];
}

/* ------------------------------------------------------------------ *
 * Earning proficiencies
 * ------------------------------------------------------------------ *
 * Art/Craft (p. 107), Profession (p. 116) and Performance (p. 116) share one
 * shape: a monthly figure per rank, and from the second rank onwards a number
 * of subordinates whose own output rises by 50% under supervision.
 *
 * `workers` is indexed by rank and lists how many of each *rank* may be
 * supervised, so a grand master's total is his own 80gp plus 2 masters, 4
 * journeymen and 8 apprentices all at 1.5x — the 440gp the book quotes.
 */

/** Supervised subordinates produce half again as much (pp. 107, 116). */
export const SUPERVISION_MULTIPLIER = 1.5;

export const TRADE_LADDERS = {
  artCraft: {
    id: "artCraft", label: "Art/Craft", page: 107, maxRank: 4,
    rankLabels: [null, "Apprentice", "Journeyman", "Master", "Grand master"],
    monthlyByRank: [0, 10, 20, 40, 80],
    // workers[rank][subordinateRank] = how many may be supervised
    workers: [
      null,
      { 1: 0 },
      { 1: 3 },
      { 1: 4, 2: 2 },
      { 1: 8, 2: 4, 3: 2 }
    ]
  },
  profession: {
    id: "profession", label: "Profession", page: 116, maxRank: 3,
    rankLabels: [null, "Apprentice", "Licensed practitioner", "Master"],
    monthlyByRank: [0, 25, 50, 100],
    workers: [
      null,
      { 1: 0 },
      { 1: 3 },
      { 1: 4, 2: 2 }
    ]
  },
  performance: {
    id: "performance", label: "Performance", page: 116, maxRank: 3,
    rankLabels: [null, "Apprentice", "Journeyman", "Master"],
    monthlyByRank: [0, 10, 20, 40],
    workers: [
      null,
      { 1: 0 },
      { 1: 3 },
      { 1: 4, 2: 2 }
    ]
  }
};

export const TRADE_LADDER_IDS = Object.keys(TRADE_LADDERS);

export function tradeLadder(id) {
  return TRADE_LADDERS[id] ?? TRADE_LADDERS.artCraft;
}

/**
 * Labor earns a flat 6gp per month and, unusually, does not improve with
 * further ranks — the book says so outright (p. 113).
 */
export const LABOR_MONTHLY = 6;

/** Labor's construction rate, for a character labouring on a project (p. 113). */
export const LABOR_CONSTRUCTION_PER_DAY = 0.2;

/**
 * Gambling earns 1d6! per week of dedicated activity, plus a further 1d6! for
 * each additional rank (p. 111). Exploding, hence the `!`.
 */
export const GAMBLING_DIE = "1d6!";
export const DAYS_PER_GAMBLING_WEEK = 7;

/* ------------------------------------------------------------------ *
 * Mercantile ventures (pp. 370-377)
 * ------------------------------------------------------------------ */

/**
 * Common and precious merchandise (p. 374).
 *
 * `byClass` is the base stone available to buy or sell each day at market
 * impact 1, in market class order I-VI, so it indexes with `marketClass().index`
 * exactly as the spell availability table does.
 *
 * The book also prints the container each type ships in — bags, amphorae,
 * crates. That column decides nothing, so it is not reproduced: this module
 * copies the numbers it cannot calculate without and paraphrases the rest.
 *
 * Labels live in the data rather than in `lang/en.json`, as the specialist
 * catalogue does; `DW.merchandise.<id>` overrides one where a translation
 * exists.
 */
export const MERCHANDISE = {
  grainVegetables: { id: "grainVegetables", label: "Grain & vegetables", kind: "common", pricePerStone: 0.12, priceStep: 0.01, byClass: [2000, 500, 250, 60, 25, 10] },
  salt: { id: "salt", label: "Salt", kind: "common", pricePerStone: 0.15, priceStep: 0.02, byClass: [1000, 250, 125, 30, 12, 5] },
  beerAle: { id: "beerAle", label: "Beer & ale", kind: "common", pricePerStone: 0.15, priceStep: 0.02, byClass: [1000, 250, 125, 30, 12, 5] },
  pottery: { id: "pottery", label: "Pottery", kind: "common", pricePerStone: 0.15, priceStep: 0.02, byClass: [1000, 250, 125, 30, 12, 5] },
  commonWood: { id: "commonWood", label: "Common wood", kind: "common", pricePerStone: 0.17, priceStep: 0.02, byClass: [1000, 250, 125, 30, 12, 5] },
  wineSpirits: { id: "wineSpirits", label: "Wine & spirits", kind: "common", pricePerStone: 0.19, priceStep: 0.02, byClass: [1000, 250, 125, 30, 12, 5] },
  oilsSauces: { id: "oilsSauces", label: "Oils & sauces", kind: "common", pricePerStone: 0.30, priceStep: 0.03, byClass: [500, 125, 60, 15, 6, 3] },
  preservedFish: { id: "preservedFish", label: "Preserved fish", kind: "common", pricePerStone: 0.45, priceStep: 0.04, byClass: [500, 125, 60, 15, 6, 3] },
  preservedMeat: { id: "preservedMeat", label: "Preserved meat", kind: "common", pricePerStone: 1, priceStep: 0.1, byClass: [500, 125, 60, 15, 6, 3] },
  glassware: { id: "glassware", label: "Glassware", kind: "common", pricePerStone: 1.5, priceStep: 0.15, byClass: [250, 60, 30, 8, 3, 1] },
  rareWood: { id: "rareWood", label: "Rare wood", kind: "common", pricePerStone: 2, priceStep: 0.2, byClass: [150, 40, 20, 5, 2, 1] },
  commonMetal: { id: "commonMetal", label: "Common metal", kind: "common", pricePerStone: 2, priceStep: 0.2, byClass: [150, 40, 20, 5, 2, 1] },
  commonFurs: { id: "commonFurs", label: "Common furs", kind: "common", pricePerStone: 4.5, priceStep: 0.45, byClass: [100, 25, 12, 3, 1, 1] },
  textiles: { id: "textiles", label: "Textiles", kind: "common", pricePerStone: 7.5, priceStep: 0.75, byClass: [100, 25, 12, 3, 1, 1] },
  dyePigment: { id: "dyePigment", label: "Dye & pigment", kind: "common", pricePerStone: 10, priceStep: 1, byClass: [75, 20, 10, 2, 1, 0.4] },
  botanicals: { id: "botanicals", label: "Botanicals", kind: "common", pricePerStone: 15, priceStep: 1.5, byClass: [75, 20, 10, 2, 1, 0.4] },
  clothing: { id: "clothing", label: "Clothing", kind: "common", pricePerStone: 15, priceStep: 1.5, byClass: [75, 20, 10, 2, 1, 0.4] },
  tools: { id: "tools", label: "Tools", kind: "common", pricePerStone: 15, priceStep: 1.5, byClass: [75, 20, 10, 2, 1, 0.4] },
  armorWeapons: { id: "armorWeapons", label: "Armor & weapons", kind: "common", pricePerStone: 22, priceStep: 2.2, byClass: [75, 20, 10, 2, 1, 0.4] },

  monsterParts: { id: "monsterParts", label: "Monster parts", kind: "precious", pricePerStone: 60, priceStep: 6, byClass: [33, 8, 4, 1, 0.4, 0.2] },
  ivory: { id: "ivory", label: "Ivory", kind: "precious", pricePerStone: 100, priceStep: 10, byClass: [20, 5, 3, 1, 0.25, 0.1] },
  rareFurs: { id: "rareFurs", label: "Rare furs", kind: "precious", pricePerStone: 100, priceStep: 10, byClass: [20, 5, 3, 1, 0.25, 0.1] },
  spices: { id: "spices", label: "Spices", kind: "precious", pricePerStone: 100, priceStep: 10, byClass: [20, 5, 3, 1, 0.25, 0.1] },
  finePorcelain: { id: "finePorcelain", label: "Fine porcelain", kind: "precious", pricePerStone: 100, priceStep: 10, byClass: [20, 5, 3, 1, 0.25, 0.1] },
  preciousMetals: { id: "preciousMetals", label: "Precious metals", kind: "precious", pricePerStone: 100, priceStep: 10, byClass: [20, 5, 3, 1, 0.25, 0.1] },
  silk: { id: "silk", label: "Silk", kind: "precious", pricePerStone: 333, priceStep: 33, byClass: [6, 2, 1, 0.2, 0.1, 0.03] },
  rareBooksArt: { id: "rareBooksArt", label: "Rare books & art", kind: "precious", pricePerStone: 333, priceStep: 33, byClass: [6, 2, 1, 0.2, 0.1, 0.03] },
  semipreciousStones: { id: "semipreciousStones", label: "Semiprecious stones", kind: "precious", pricePerStone: 1000, priceStep: 100, byClass: [2, 1, 0.25, 0.06, 0.03, 0.01] },
  /**
   * Gems carry the table's only footnote: in a Class V or VI market the listed
   * 0.01 stone can only be sold where the demand modifier is +2 or better, and
   * only bought where it is -2 or worse. Otherwise there is no trade in gems
   * there at all.
   */
  gems: {
    id: "gems", label: "Gems", kind: "precious", pricePerStone: 7500, priceStep: 750,
    byClass: [0.25, 0.07, 0.03, 0.01, 0.01, 0.01],
    footnote: { fromClassIndex: 4, sellNeedsDemandAtLeast: 2, buyNeedsDemandAtMost: -2 }
  }
};

export const MERCHANDISE_IDS = Object.keys(MERCHANDISE);

export function merchandise(id) {
  return MERCHANDISE[id] ?? MERCHANDISE.salt;
}

/** Tariff on the base cost of imported goods (p. 372). */
export const TARIFF_PRECIOUS = 0.2;
export const TARIFF_COMMON = 0.05;

/** Grain and vegetables are exempt from the common tariff (p. 372). */
export const TARIFF_EXEMPT_IDS = ["grainVegetables"];

/** Copper pieces to the gold piece, for turning the toll rate into gold. */
export const CP_PER_GP = 100;

/**
 * The price roll (p. 375): 4d4-10, so -6 to +6 price steps with a mean of zero.
 * The Judge rolls it once per merchandise per market per month.
 */
export const PRICE_ROLL = "4d4-10";

/** Market impact caps (p. 371). */
export const MAX_MARKET_IMPACT = 10;
export const CLASS_I_FAMILIES_PER_IMPACT = 2000;

/**
 * Seasonal price shift, which applies to grain and vegetables alone (p. 375):
 * up while it is being sown, down while it is being harvested.
 */
export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const SEASONAL_IDS = ["grainVegetables"];

/**
 * Assessment of Supply & Demand (p. 373) and Reaction to Negotiation (p. 376).
 *
 * Both are 2d6 tables sharing one set of bands. `min` is the lowest adjusted
 * roll that reaches the row, read downwards.
 */
const BANDS = [
  { min: 12 }, { min: 9 }, { min: 6 }, { min: 3 }, { min: -Infinity }
];

const withResults = (results) => BANDS.map((band, i) => ({ ...band, result: results[i] }));

export const ASSESSMENT_TABLE = withResults([
  "successful", "partial", "expertise", "failed", "false"
]);

export const NEGOTIATION_TABLE = withResults([
  "agreement", "grudging", "continue", "refusal", "outraged"
]);

/**
 * A merchant's default negotiating strength (p. 376). The Judge also rolls 1d6
 * secretly when bargaining opens: over the market class, the merchant has one
 * more rank of Bargaining.
 */
export const MERCHANT_DEFAULTS = {
  common: { cha: 1, wil: 0, bargaining: 1 },
  precious: { cha: 2, wil: 1, bargaining: 1 }
};

/** Each rank of Bargaining is worth two points to whoever holds it (p. 376). */
export const BARGAINING_PER_RANK = 2;

/** The extra-rank roll: a 1d6 over the market's class number (p. 376). */
export const MERCHANT_EXTRA_RANK_DIE = "1d6";

/**
 * Cargo Handling Time and Cost (p. 377).
 *
 * Every printed row reproduces from `stone / workRate / crew` at eight working
 * hours to the day, which is asserted in the tests rather than assumed — the
 * table is the check on the formula and the formula is the check on the table.
 *
 * `costCp` is the fee printed in the book. It works out at one copper piece per
 * hour of total work — `stone / workRate` — for every row except the donkey and
 * the mule, whose figures the book rounds down to a half and a whole copper.
 *
 * `supervision` says which of the supervision limits a row counts against.
 * Time and cost both double when a ship lies at anchor or a caravan waits in
 * pasture.
 */
export const WORK_HOURS_PER_DAY = 8;

export const CARGO_HANDLING = {
  packDonkey: { id: "packDonkey", label: "Pack donkey", stone: 30, crew: 1, workRate: 40, costCp: 0.5, supervision: "animal" },
  packMule: { id: "packMule", label: "Pack mule", stone: 50, crew: 1, workRate: 40, costCp: 1, supervision: "animal" },
  packCamel: { id: "packCamel", label: "Pack camel", stone: 60, crew: 1, workRate: 40, costCp: 1.5, supervision: "animal" },
  packHorse: { id: "packHorse", label: "Pack horse", stone: 80, crew: 1, workRate: 40, costCp: 2, supervision: "animal" },
  cart: { id: "cart", label: "Cart", stone: 320, crew: 2, workRate: 40, costCp: 8, supervision: "wagon" },
  wagon: { id: "wagon", label: "Wagon", stone: 640, crew: 4, workRate: 40, costCp: 16, supervision: "wagon" },
  bargeSmall: { id: "bargeSmall", label: "Barge, small", stone: 2000, crew: 5, workRate: 20, costCp: 100, supervision: "boat" },
  bargeLarge: { id: "bargeLarge", label: "Barge, large", stone: 9000, crew: 10, workRate: 20, costCp: 450, supervision: "boat" },
  bargeHuge: { id: "bargeHuge", label: "Barge, huge", stone: 180000, crew: 50, workRate: 20, costCp: 9000, supervision: "ship" },
  shipSmall: { id: "shipSmall", label: "Sailing ship, small", stone: 10000, crew: 12, workRate: 20, costCp: 500, supervision: "ship" },
  shipLarge: { id: "shipLarge", label: "Sailing ship, large", stone: 30000, crew: 20, workRate: 20, costCp: 1500, supervision: "ship" },
  shipHuge: { id: "shipHuge", label: "Sailing ship, huge", stone: 50000, crew: 40, workRate: 20, costCp: 2500, supervision: "ship" }
};

/** The two rows whose printed fee is rounded rather than derived (p. 377). */
export const CARGO_COST_ROUNDED_IDS = ["packDonkey", "packMule"];

export const CARGO_HANDLING_IDS = Object.keys(CARGO_HANDLING);

/**
 * A warehouse is rated per stone rather than per vehicle: one hour of work and
 * 1gp of labour per 200 and 100 stone respectively (p. 377).
 */
export const WAREHOUSE_HANDLING = { stonePerHour: 200, gpPerHundredStone: 1 };

/** Storing goods for later: 1cp per stone per month (p. 377). */
export const WAREHOUSE_RENT_CP_PER_STONE_MONTH = 1;

/**
 * How much loading one character can watch over as an ancillary activity
 * (p. 377), and up to twelve times as much if it is all he does that day.
 * Unsupervised loading loses 2d10% of the goods to theft.
 */
export const SUPERVISION_LIMITS = { ship: 1, warehouse: 1, boat: 10, wagon: 10, animal: 40 };
export const SUPERVISION_DEDICATED_MULTIPLIER = 12;
export const UNSUPERVISED_LOSS_DIE = "2d10";

/**
 * Moorage and stabling per day (p. 372), and the cheaper price of lying at
 * anchor or waiting in pasture — which doubles every loading time instead.
 * Ships are charged by shipping points rather than per hull.
 */
export const MOORAGE = {
  ship: { id: "ship", label: "Ship", perShp: 50, mooredGp: 1, looseGp: 1 },
  wagon: { id: "wagon", label: "Wagon", mooredGp: 2, looseGp: 0.5 },
  cart: { id: "cart", label: "Cart or elephant", mooredGp: 1, looseGp: 0.2 },
  horse: { id: "horse", label: "Horse", mooredGp: 0.5, looseGp: 0.1 },
  pack: { id: "pack", label: "Camel, donkey or ox", mooredGp: 0.2, looseGp: 0.04 }
};

/**
 * Exhaustion of arbitrage (p. 375, optional): a cumulative 20% chance each day
 * that the price moves one step against a trader who keeps working the same
 * merchandise, resetting once it does.
 */
export const EXHAUSTION_CHANCE_PER_DAY = 0.2;

/**
 * A venture's month, line by line (p. 423).
 *
 * "Mercantile income is the total of gp earned from arbitraging goods and
 * transporting cargo and passengers, less the cost of goods sold, wages,
 * rations, tolls, tariffs, moorage and stabling, and labor fees." The lines are
 * the book's own list, in the book's own order, with one free line on each side
 * for whatever a table does that the list does not name.
 */
export const VENTURE_REVENUE_LINES = ["arbitrageSales", "carriage", "passengers", "otherRevenue"];

export const VENTURE_EXPENSE_LINES = [
  "costOfGoods", "wages", "rations", "tolls", "tariffs", "moorage", "labor", "otherExpenses"
];

/**
 * What each participant is worth when the profit is divided (p. 424): a full
 * share to a player character, half to a henchman or follower, and nothing at
 * all to a hired mercenary or specialist.
 */
export const VENTURE_ROLES = ["pc", "henchman", "follower", "hireling"];

/* ------------------------------------------------------------------ *
 * Hideouts and hijinks (pp. 360-369)
 * ------------------------------------------------------------------ */

/**
 * Hideout Size, Cost, and Level (p. 360), in market class order I-VI.
 *
 * Two separate caps come out of this one table. A hideout worth at least
 * `minHideout` supports `maxMembers`, and the settlement's own class caps both
 * that membership and the `maxEffectiveLevel` a perpetrator may operate at —
 * Viktir's 75,000gp mansion in a Class IV town still runs only 100 members.
 *
 * `maxEffectiveLevel` caps rewards and target levels, never the throw: a 9th
 * level thief in a village still throws as a 9th level thief, he just cannot
 * find anyone worth more than 3rd level to rob.
 */
export const HIDEOUTS = {
  I: { id: "I", maxMembers: 3000, minHideout: 600000, maxEffectiveLevel: 14 },
  II: { id: "II", maxMembers: 750, minHideout: 150000, maxEffectiveLevel: 11 },
  III: { id: "III", maxMembers: 375, minHideout: 75000, maxEffectiveLevel: 9 },
  IV: { id: "IV", maxMembers: 100, minHideout: 20000, maxEffectiveLevel: 7 },
  V: { id: "V", maxMembers: 50, minHideout: 10000, maxEffectiveLevel: 5 },
  VI: { id: "VI", maxMembers: 25, minHideout: 5000, maxEffectiveLevel: 3 }
};

export function hideout(marketClassId) {
  return HIDEOUTS[marketClassId] ?? HIDEOUTS.IV;
}

/**
 * Hijink Outcomes (p. 361) and the detail from the List of Hijinks (pp. 363-367).
 *
 * `skill` is the thief skill the throw is made against — the module does not
 * compute the target number, because the ACKS system cannot be trusted for a
 * character's thief skill values any more than it can for proficiency ranks.
 * The Judge enters the throw and the margin.
 *
 * `gp` is what reaches the boss on a success, as an expression per *level*:
 *
 *   perpetrator  scales with the perpetrator's (or crew's summed) level
 *   victim       scales with the victim's level, itself set from the perpetrator's
 *   none         the hijink has no cash value at all
 *
 * `share` is the fraction of the goods' value the boss actually collects, which
 * is everything except smuggling's 10% fee. `plans` marks the hijinks that need
 * planning first and laying low afterwards; `hasty` marks the three that can be
 * rushed for a smaller reward.
 */
export const HIJINKS = {
  arson: {
    id: "arson", label: "Arson", page: 363, skill: "sneaking",
    gp: null, basis: "none", plans: true, hasty: false,
    charges: ["vandalism", "vandalism", "vandalism", "mayhem", "mayhem", "arson"]
  },
  assassinating: {
    id: "assassinating", label: "Assassinating", page: 363, skill: "hiding",
    // "a victim within ±2 levels of the perpetrator's level (i.e. 1d10/2 - 3 +
    // perpetrator's level)" — a spread the dice grammar cannot express, so the
    // permitted band is reported and the Judge names the victim.
    gp: "1000", basis: "victim", plans: true, hasty: false, victimSpread: 2,
    charges: ["assault", "assault", "assault", "mayhem", "mayhem", "murder"]
  },
  carousing: {
    id: "carousing", label: "Carousing", page: 364, skill: "listening",
    gp: "3d12x5", basis: "perpetrator", plans: false, hasty: true, hastyGp: null,
    charges: ["drunkenness", "drunkenness", "drunkenness", "gambling", "gambling", "vandalism"]
  },
  escaping: {
    id: "escaping", label: "Escaping", page: 364, skill: "lockpicking",
    gp: null, basis: "none", plans: true, hasty: false, charges: null
  },
  infiltrating: {
    id: "infiltrating", label: "Infiltrating", page: 364, skill: "hiding",
    gp: null, basis: "none", plans: true, hasty: false,
    charges: ["sedition", "sedition", "sedition", "sedition", "sedition", "sedition"]
  },
  kidnapping: {
    id: "kidnapping", label: "Kidnapping", page: 365, skill: "hiding",
    // "a valuable victim within 1d2 levels of the perpetrator's level" — which
    // the book's own example reads as a band of ±2 (a 3rd level effective
    // perpetrator kidnaps 1st to 5th).
    gp: "500", basis: "victim", plans: true, hasty: false, victimSpread: 2,
    charges: ["assault", "assault", "assault", "kidnapping", "kidnapping", "racketeering"]
  },
  racketeering: {
    id: "racketeering", label: "Racketeering", page: 365, skill: "attackAc6",
    gp: "5d6x10", basis: "perpetrator", plans: false, hasty: true, hastyGp: "30",
    charges: ["trespassing", "trespassing", "trespassing", "assault", "assault", "racketeering"]
  },
  sabotaging: {
    id: "sabotaging", label: "Sabotaging", page: 365, skill: "sneaking",
    gp: null, basis: "none", plans: true, hasty: false,
    charges: ["arson", "arson", "arson", "arson", "arson", "arson"]
  },
  slandering: {
    id: "slandering", label: "Slandering", page: 365, skill: "listening",
    gp: null, basis: "none", plans: false, hasty: false,
    charges: ["outrage", "outrage", "outrage", "sedition", "sedition", "treason"]
  },
  smuggling: {
    id: "smuggling", label: "Smuggling", page: 365, skill: "sneaking",
    // The goods are worth 3,000gp a level, but the boss's cut is a tenth.
    gp: "3000", basis: "perpetrator", share: 0.1, plans: true, hasty: false,
    charges: ["contraband", "contraband", "contraband", "smuggling", "smuggling", "racketeering"]
  },
  soliciting: {
    id: "soliciting", label: "Soliciting", page: 366, skill: "listening",
    gp: "3d12x5", basis: "perpetrator", plans: false, hasty: true, hastyGp: "3d6",
    charges: ["outrage", "outrage", "outrage", "solicitation", "solicitation", "consortium"]
  },
  spying: {
    id: "spying", label: "Spying", page: 366, skill: "hiding",
    gp: "2d12x100", basis: "perpetrator", plans: false, hasty: false,
    charges: ["eavesdropping", "eavesdropping", "eavesdropping", "sedition", "sedition", "treason"]
  },
  stealing: {
    id: "stealing", label: "Stealing", page: 366, skill: "pickpocketing",
    gp: "300", basis: "perpetrator", plans: true, hasty: false,
    charges: ["theft", "theft", "theft", "burglary", "burglary", "robbery"]
  },
  subverting: {
    id: "subverting", label: "Subverting", page: 367, skill: "lockpicking",
    gp: null, basis: "none", plans: true, hasty: false, charges: null
  },
  treasureHunting: {
    id: "treasureHunting", label: "Treasure-hunting", page: 367, skill: "searching",
    gp: "1d6x1000", basis: "perpetrator", plans: false, hasty: false,
    charges: ["trespassing", "trespassing", "trespassing", "theft", "theft", "burglary"]
  }
};

export const HIJINK_IDS = Object.keys(HIJINKS);

export function hijink(id) {
  return HIJINKS[id] ?? HIJINKS.carousing;
}

/** A 0th level victim is worth half a level's bounty or ransom (pp. 363, 365). */
export const ZEROTH_LEVEL_VICTIM_FRACTION = 0.5;

/**
 * Monthly Member Tribute (p. 361), by the member's level.
 *
 * This is the table the XP chapter calls the "Monthly Hijink Income table in the
 * Managing Criminal Guilds section" (p. 423) — no table of that name is printed
 * anywhere, and this one carries the designer's note saying exactly what that
 * sentence describes: it is tuned to equal the average profit from ordering a
 * hijink, so a boss can collect it and skip the dice entirely.
 */
export const MEMBER_TRIBUTE = [1, 5, 30, 200, 425, 650, 835, 1500, 2000];

export function memberTribute(level) {
  const clamped = Math.max(0, Math.min(MEMBER_TRIBUTE.length - 1, Math.floor(Number(level) || 0)));
  return MEMBER_TRIBUTE[clamped];
}

/**
 * Henchmen Monthly Wage (p. 168), by class level. Reproduced here because the
 * hijink fee is defined in terms of it — and note that it does *not* simply
 * double: it is 3,000gp at 8th level, not 3,200.
 */
export const HENCHMAN_WAGE_BY_LEVEL = [
  12, 25, 50, 100, 200, 400, 800, 1600, 3000, 7250, 12000, 32000, 50000, 135000, 350000
];

/**
 * What a boss pays a member to undertake a hijink (p. 361): 6gp at 0th level,
 * and one month's henchman wages above that. Deliberately far less than hiring
 * a ruffian off the street, who would pass his own boss's cut on to you — and
 * at 0th level it is half the henchman wage rather than equal to it.
 */
export const HIJINK_FEE_ZEROTH = 6;

export function hijinkFee(level) {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  if (n === 0) return HIJINK_FEE_ZEROTH;
  return HENCHMAN_WAGE_BY_LEVEL[Math.min(HENCHMAN_WAGE_BY_LEVEL.length - 1, n)];
}

/**
 * How long each stage takes, by the perpetrator's level band (p. 362). A crew
 * rolls once, using the honcho's level, which is how a high-level honcho drags
 * a gang of first-level thieves through a job quickly.
 */
export const HIJINK_TIMING = [
  { minLevel: 9, plan: "2d4+3", performOngoing: "2d6+5", hasty: "1d3+2" },
  { minLevel: 5, plan: "2d6+3", performOngoing: "3d4+8", hasty: "1d4+3" },
  { minLevel: 1, plan: "2d8+3", performOngoing: "3d6+10", hasty: "1d6+3" }
];

/** Planned hijinks are performed in a day, and laying low never varies (p. 362). */
export const PERFORM_PLANNED_DAYS = 1;
export const LAY_LOW_DICE = "2d8+3";

export function hijinkTiming(level) {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return HIJINK_TIMING.find((band) => n >= band.minLevel) ?? HIJINK_TIMING.at(-1);
}

/**
 * Getting caught (pp. 360, 362-363).
 *
 * The ordinary threshold is a throw failed by 14 or more, or an unmodified 1.
 * A perpetrator who skipped laying low is caught far more easily. A hasty
 * hijink gets a second chance instead: he is caught only if that throw fails too.
 */
export const CAUGHT = {
  normal: { failBy: 14, naturalAtMost: 1 },
  didNotLayLow: { failBy: 11, naturalAtMost: 3 }
};

/**
 * Time awaiting trial, by the crime charged (p. 367). The unit is carried
 * separately rather than suffixed onto the expression, so every string here
 * still parses as dice.
 */
const languish = (dice, unit) => ({ dice, unit });

export const TIME_LANGUISHING = {
  drunkenness: languish("1d2", "day"), outrage: languish("1d2", "day"),
  eavesdropping: languish("1d4", "day"), trespassing: languish("1d4", "day"),
  gambling: languish("1d4", "day"), solicitation: languish("1d4", "day"),
  consortium: languish("1d4", "day"),
  bribery: languish("1d6", "day"), theft: languish("1d6", "day"),
  contraband: languish("1d6", "day"),
  assault: languish("1d8", "day"), vandalism: languish("1d8", "day"),
  burglary: languish("1d4", "week"), smuggling: languish("1d4", "week"),
  kidnapping: languish("1d4", "month"), manslaughter: languish("1d4", "month"),
  mayhem: languish("1d4", "month"),
  robbery: languish("1d6", "month"), racketeering: languish("1d6", "month"),
  arson: languish("1d12", "month"), desertion: languish("1d12", "month"),
  murder: languish("1d12", "month"), sedition: languish("1d12", "month"),
  heresy: languish("2d12", "month"), treason: languish("2d12", "month"),
  regicide: languish("2d12", "month")
};

/**
 * The fines from the Retribution by Crime table (p. 368), which are the part of
 * a punishment the boss actually pays: "the syndicate boss is expected to pay
 * for the lawyers, bribes, fines, and healing of members who get caught."
 *
 * The corporal punishments beside them — the stocks, the whip, the amputations,
 * the executions — are named in the results panel with their page cite and not
 * reproduced. They decide a character's fate, not his boss's ledger, and that
 * is the Judge's business.
 */
export const CRIME_FINES = {
  drunkenness: { punitive: 5, standard: 2, lesser: 1 },
  outrage: { punitive: 5, standard: 2, lesser: 1 },
  eavesdropping: { punitive: 25, standard: 10, lesser: 5 },
  solicitation: { punitive: 25, standard: 10, lesser: 5 },
  trespassing: { punitive: 50, standard: 25, lesser: 10 },
  gambling: { punitive: 50, standard: 25, lesser: 10 },
  consortium: { punitive: 50, standard: 25, lesser: 10 },
  bribery: { punitive: 150, standard: 50, lesser: 25 },
  theft: { punitive: 450, standard: 300, lesser: 150 },
  contraband: { punitive: 450, standard: 300, lesser: 150 },
  assault: { punitive: 600, standard: 450, lesser: 300 },
  vandalism: { punitive: 600, standard: 450, lesser: 300 },
  burglary: { punitive: 900, standard: 600, lesser: 450 },
  smuggling: { punitive: 900, standard: 600, lesser: 450 },
  // From here the punishments stop being fines and start being fates.
  kidnapping: { punitive: 0, standard: 750, lesser: 600 },
  manslaughter: { punitive: 0, standard: 750, lesser: 600 },
  mayhem: { punitive: 0, standard: 750, lesser: 600 },
  robbery: { punitive: 1200, standard: 900, lesser: 750 },
  racketeering: { punitive: 1200, standard: 900, lesser: 750 },
  arson: { punitive: 0, standard: 0, lesser: 0 },
  desertion: { punitive: 0, standard: 0, lesser: 0 },
  murder: { punitive: 0, standard: 0, lesser: 0 },
  sedition: { punitive: 0, standard: 0, lesser: 0 },
  heresy: { punitive: 0, standard: 0, lesser: 0 },
  treason: { punitive: 0, standard: 0, lesser: 0 },
  regicide: { punitive: 0, standard: 0, lesser: 0 }
};

/** A perpetrator who cannot pay works a fine off at this rate (p. 368). */
export const FINE_WORKED_OFF_PER_MONTH = 3;

/** Paying three times a fine buys off everything else that came with it (p. 368). */
export const FINE_BUYOUT_MULTIPLE = 3;

/**
 * What the courts cost when a boss decides to look after his own (pp. 367-368):
 * bribes by the length of a magistrate's wages, and attorneys by rank.
 */
export const BRIBE_TIERS = { day: 50, week: 350, month: 1500, year: 18000 };
export const ATTORNEY_COST_BY_RANK = [0, 25, 50, 100];

/**
 * A boss's month, line by line, from the book's own list (p. 423): hijink
 * earnings "less the cost of wages, attorneys, bribes, fines, and magical
 * healing".
 *
 * Tribute and wages are deliberately *not* here. Both are computed from the
 * membership and assignment tables above, and a second hand-entered field for
 * either would silently double the figure the moment somebody filled in both.
 */
export const SYNDICATE_REVENUE_LINES = ["hijinkEarnings", "otherRevenue"];

export const SYNDICATE_EXPENSE_LINES = [
  "attorneys", "bribes", "fines", "healing", "otherExpenses"
];

/** A member earns XP equal to half what his hijinks were worth (p. 423). */
export const MEMBER_XP_FRACTION = 0.5;

/* ------------------------------------------------------------------ *
 * Experience
 * ------------------------------------------------------------------ */

/**
 * Monthly XP threshold by class level (p. 423). Campaign income only earns XP
 * above this figure. Level 0 has no listed threshold; 0th level characters
 * earning from domain or mercantile income are treated as having 25gp (p. 425).
 */
export const XP_THRESHOLD = [
  0, 25, 75, 150, 300, 600, 1200, 2400, 5000,
  10000, 20000, 45000, 75000, 150000, 425000
];

export function xpThreshold(classLevel) {
  const clamped = Math.max(0, Math.min(14, Math.floor(Number(classLevel) || 0)));
  return XP_THRESHOLD[clamped];
}

/** Days in a campaign month for income and threshold purposes (p. 425). */
export const DAYS_PER_MONTH = 30;
