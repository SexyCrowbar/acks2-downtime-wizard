/**
 * The arithmetic of mercantile ventures (pp. 370-377).
 *
 * Pure — no Foundry globals, no `Roll` — so every figure below can be asserted
 * against the rulebook's own worked examples under plain `node --test`. Dice
 * are never thrown here: the price roll, the assessment and the negotiation are
 * rolled elsewhere and handed back in as numbers, which is what lets the wizard
 * re-render on every keystroke without re-rolling the market.
 *
 * The market is a chain of adjustments rather than a formula, so most functions
 * return a `breakdown` or `notes` array alongside their figure. The Judge needs
 * to see the book's own steps, not just the answer.
 */

import {
  BARGAINING_PER_RANK,
  CARGO_HANDLING,
  CLASS_I_FAMILIES_PER_IMPACT,
  CP_PER_GP,
  MAX_MARKET_IMPACT,
  MERCHANT_DEFAULTS,
  MOORAGE,
  SEASONAL_IDS,
  SUPERVISION_DEDICATED_MULTIPLIER,
  SUPERVISION_LIMITS,
  TARIFF_COMMON,
  TARIFF_EXEMPT_IDS,
  TARIFF_PRECIOUS,
  WAREHOUSE_HANDLING,
  WAREHOUSE_RENT_CP_PER_STONE_MONTH,
  WORK_HOURS_PER_DAY,
  ASSESSMENT_TABLE,
  NEGOTIATION_TABLE,
  marketClass,
  marketClassByIndex,
  merchandise
} from "./tables.mjs";

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Two decimal places, which is the smallest coin the rules ever quote. */
const gp = (v) => Math.round(num(v) * 100) / 100;

/* ------------------------------------------------------------------ *
 * Rounding
 * ------------------------------------------------------------------ */

/**
 * Round to the nearest whole number, sending an exact half to the even side —
 * the rule the market impact formula names outright (p. 371).
 *
 * `Math.round` sends a half upwards, so 0.5 would become 1 and 2.5 would become
 * 3 where the book wants 0 and 2. It is a small difference that lands squarely
 * on the boundary between "no market impact" and "impact 1", which is exactly
 * where the rules branch, so it gets its own function rather than a comment.
 */
export function roundHalfToEven(value) {
  const n = num(value);
  const floor = Math.floor(n);
  const fraction = n - floor;

  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/* ------------------------------------------------------------------ *
 * Market impact (p. 371)
 * ------------------------------------------------------------------ */

/** The largest impact a market of this class will bear (p. 371). */
export function maximumImpact(marketClassId, urbanFamilies = 0) {
  const market = marketClass(marketClassId);
  if (market.index > 0) return MAX_MARKET_IMPACT;
  // Only a Class I market scales past 10, and then with its own population.
  return Math.max(MAX_MARKET_IMPACT, Math.floor(num(urbanFamilies) / CLASS_I_FAMILIES_PER_IMPACT));
}

/** Stone of a merchandise available per day at a given class and impact. */
function baseStone(merchandiseId, marketClassId) {
  return merchandise(merchandiseId).byClass[marketClass(marketClassId).index];
}

/**
 * How large a fleet or caravan looks to a market, and which market it is
 * effectively trading in (p. 371, and Steady Trade Routes on p. 375).
 *
 * The order matters and is the book's own:
 *
 *   1. impact is the load divided by the market's baseline cargo, rounded;
 *   2. capped at 10, or at urban families / 2,000 in a Class I market;
 *   3. a party entering separately is capped at 10 divided by its size;
 *   4. an impact of 0 is rescued by a Mercantile Network if there is one, and
 *      otherwise by treating the market as one class smaller, repeatedly;
 *   5. a Mercantile Network otherwise takes whichever of "one class higher" or
 *      "one more point of impact" yields more merchandise;
 *   6. a steady trade route in this merchandise adds half the class level, and
 *      advances a class if that would exceed the maximum.
 *
 * Tolls are deliberately *not* computed from the result: both the step down and
 * the network benefit are explicitly excluded from them, so `tollAndTariff`
 * takes the market the character actually walked into.
 *
 * @returns {{effectiveClass: string, impact: number, raw: number, notes: object[]}}
 */
export function resolveMarketImpact({
  totalLoad = 0,
  marketClassId = "IV",
  urbanFamilies = 0,
  partySize = 1,
  mercantileNetwork = false,
  steadyRoute = false,
  classLevel = 0,
  merchandiseId = null
} = {}) {
  const notes = [];
  const load = Math.max(0, num(totalLoad));
  let market = marketClass(marketClassId);

  const raw = load / market.baselineCargo;
  let impact = roundHalfToEven(raw);

  const cap = maximumImpact(market.id, urbanFamilies);
  if (impact > cap) {
    notes.push({ key: "impactCapped", from: impact, to: cap });
    impact = cap;
  }

  // A party that enters separately shares one market between them.
  const members = Math.max(1, Math.floor(num(partySize, 1)));
  if (members > 1) {
    const share = MAX_MARKET_IMPACT / members;
    if (impact > share) {
      notes.push({ key: "impactShared", from: impact, to: share, partySize: members });
      impact = share;
    }
  }

  let networkUsed = false;

  // "If he has the Mercantile Network class power and uses it to increase his
  // market impact, he can transact at market impact 1." (p. 371)
  if (impact === 0 && mercantileNetwork) {
    impact = 1;
    networkUsed = true;
    notes.push({ key: "networkRescued" });
  }

  // Otherwise a market too big for him is traded as a smaller one, as often as
  // it takes. A Class VI market is always tradable at impact 1.
  while (impact === 0) {
    const smaller = marketClassByIndex(market.index + 1);
    if (!smaller) {
      impact = 1;
      notes.push({ key: "villageFloor" });
      break;
    }
    market = smaller;
    impact = roundHalfToEven(load / market.baselineCargo);
    notes.push({ key: "impactSteppedDown", to: market.id });
  }

  // A reputation is worth either a bigger market or a bigger caravan, whichever
  // actually shifts more merchandise. Neither raises his tolls.
  if (mercantileNetwork && !networkUsed) {
    const larger = marketClassByIndex(market.index - 1);
    const asLargerMarket = larger && merchandiseId
      ? baseStone(merchandiseId, larger.id) * impact
      : -Infinity;
    const asMoreImpact = merchandiseId
      ? baseStone(merchandiseId, market.id) * (impact + 1)
      : Infinity;

    if (larger && asLargerMarket > asMoreImpact) {
      market = larger;
      notes.push({ key: "networkClass", to: market.id });
    } else {
      impact += 1;
      notes.push({ key: "networkImpact", to: impact });
    }
  }

  // Steady Trade Routes (p. 375). The book says one-half his class level, and
  // means it literally: an odd level contributes a half point.
  if (steadyRoute) {
    const bonus = Math.max(0, num(classLevel)) / 2;
    if (bonus > 0) {
      impact += bonus;
      notes.push({ key: "steadyRoute", bonus });

      const limit = maximumImpact(market.id, urbanFamilies);
      if (impact > limit) {
        const larger = marketClassByIndex(market.index - 1);
        if (larger) {
          market = larger;
          notes.push({ key: "steadyRouteClass", to: market.id });
        } else {
          notes.push({ key: "impactCapped", from: impact, to: limit });
          impact = limit;
        }
      }
    }
  }

  return { effectiveClass: market.id, impact, raw, notes };
}

/* ------------------------------------------------------------------ *
 * Daily supply and demand (pp. 374-375)
 * ------------------------------------------------------------------ */

/**
 * How much of a merchandise can change hands in a day: the base figure for the
 * market class multiplied by market impact (p. 375).
 *
 * Under a stone cannot be traded at all; the fraction accumulates day by day
 * until it reaches one, so the caller is told how many days that takes rather
 * than being shown a quantity it cannot buy.
 *
 * Gems carry the merchandise table's only footnote: in the smallest markets
 * they trade only where demand is extreme, and in the right direction.
 */
export function dailySupply(merchandiseId, marketClassId, impact, { side = "buy", demandModifier = 0 } = {}) {
  const goods = merchandise(merchandiseId);
  const market = marketClass(marketClassId);
  const base = goods.byClass[market.index];
  const stone = base * Math.max(0, num(impact));

  const note = goods.footnote;
  if (note && market.index >= note.fromClassIndex) {
    const dm = num(demandModifier);
    const allowed = side === "sell"
      ? dm >= note.sellNeedsDemandAtLeast
      : dm <= note.buyNeedsDemandAtMost;
    if (!allowed) {
      return { stone: 0, base, tradable: 0, fractional: false, daysToOneStone: null, unavailable: true };
    }
  }

  const fractional = stone > 0 && stone < 1;
  return {
    stone,
    base,
    tradable: fractional ? 0 : stone,
    fractional,
    daysToOneStone: fractional ? Math.ceil(1 / stone) : null,
    unavailable: stone === 0
  };
}

/* ------------------------------------------------------------------ *
 * Market price (pp. 375-376)
 * ------------------------------------------------------------------ */

/** A step in the arbitrager's favour is downward when buying, upward when selling. */
const favour = (side) => (side === "sell" ? 1 : -1);

/**
 * The prevailing price for one stone of a merchandise in this market, in the
 * order the book applies its adjustments (p. 375).
 *
 * The price roll is 4d4-10 and is passed in rather than thrown, so that the
 * results panel is stable while the rest of the form is being typed.
 *
 * The book never floors the price, and enough negative steps take it below
 * zero — grain at fourteen steps down is worth -0.02gp. The price is held at
 * one step and the caller is told, rather than quietly selling at a loss.
 *
 * @returns {{price: number, steps: number, floored: boolean, breakdown: object[]}}
 */
export function marketPrice({
  merchandiseId = "salt",
  side = "buy",
  demandModifier = 0,
  marketClassId = "IV",
  priceRoll = 0,
  season = null,
  steadyRoute = false,
  negotiation = null,
  exhaustionSteps = 0
} = {}) {
  const goods = merchandise(merchandiseId);
  const market = marketClass(marketClassId);
  const breakdown = [];

  const add = (key, steps, extra = {}) => {
    if (!steps) return;
    breakdown.push({ key, steps, ...extra });
  };

  add("priceRoll", Math.round(num(priceRoll)));
  add("demandModifier", Math.round(num(demandModifier)));

  // Big markets pay more, small ones less (p. 375).
  if (market.index <= 1) add("largeMarket", 1, { market: market.id });
  if (market.index >= 4) add("smallMarket", -1, { market: market.id });

  // Sowing raises the price of what is being sown; harvest lowers it.
  if (SEASONAL_IDS.includes(goods.id)) {
    if (season === "spring") add("sowing", 1);
    if (season === "autumn") add("harvest", -1);
  }

  if (steadyRoute) add("steadyRoute", favour(side));
  if (negotiation === "agreement" || negotiation === "grudging") {
    add("negotiation", favour(side), { result: negotiation });
  }

  // Working the same market dry moves the price against whoever is working it.
  const exhaustion = Math.max(0, Math.floor(num(exhaustionSteps)));
  if (exhaustion) add("exhaustion", -favour(side) * exhaustion);

  const steps = breakdown.reduce((sum, entry) => sum + entry.steps, 0);
  const raw = goods.pricePerStone + goods.priceStep * steps;
  const floored = raw < goods.priceStep;

  return {
    price: gp(floored ? goods.priceStep : raw),
    base: goods.pricePerStone,
    step: goods.priceStep,
    steps,
    floored,
    breakdown
  };
}

/* ------------------------------------------------------------------ *
 * Tolls, tariffs and fees (pp. 372, 377)
 * ------------------------------------------------------------------ */

/**
 * What it costs to bring a caravan or fleet into a market (p. 372).
 *
 * The toll is charged on cargo *capacity*, not on the cargo actually carried —
 * the venture on p. 424 pays 60gp on a 30,000 stone ship holding 175 stone of
 * goods. The tariff is charged on the base cost of merchandise brought in to
 * sell: a fifth for precious goods, a twentieth for common ones, and nothing
 * at all on grain and vegetables. A Class VI market levies neither, and neither
 * does a market inside a domain the character rules.
 */
export function tollAndTariff({
  cargoCapacity = 0,
  marketClassId = "IV",
  goodsValue = 0,
  merchandiseId = null,
  rulersPrivilege = false
} = {}) {
  const market = marketClass(marketClassId);

  if (rulersPrivilege || !market.taxed) {
    return { toll: 0, tariff: 0, total: 0, exempt: true, rate: 0 };
  }

  const toll = gp((Math.max(0, num(cargoCapacity)) * market.tollCpPerStone) / CP_PER_GP);

  let rate = 0;
  if (merchandiseId) {
    const goods = merchandise(merchandiseId);
    if (TARIFF_EXEMPT_IDS.includes(goods.id)) rate = 0;
    else rate = goods.kind === "precious" ? TARIFF_PRECIOUS : TARIFF_COMMON;
  }

  const tariff = gp(Math.max(0, num(goodsValue)) * rate);
  return { toll, tariff, total: gp(toll + tariff), exempt: false, rate };
}

/**
 * Loading or unloading, in hours and in labour costs (p. 377).
 *
 * Vehicles are loaded in parallel — forty wagons take as long as one — while
 * the fee is charged per vehicle. A warehouse is rated by the stone instead.
 * Lying at anchor or waiting in pasture doubles both.
 *
 * Whole days plus the remaining hours are both reported: the book truncates its
 * own figure ("25 hours, or 3 days") and the reader needs the hours to see why.
 */
export function cargoHandling(transportId, { count = 1, stone = 0, atAnchor = false } = {}) {
  const doubling = atAnchor ? 2 : 1;
  const vehicles = Math.max(0, Math.floor(num(count, 1)));

  let hours;
  let costGp;
  let crew;

  if (transportId === "warehouse") {
    const load = Math.max(0, num(stone));
    hours = (load / WAREHOUSE_HANDLING.stonePerHour) * doubling;
    costGp = gp((load / 100) * WAREHOUSE_HANDLING.gpPerHundredStone * doubling);
    crew = null;
  } else {
    const row = CARGO_HANDLING[transportId];
    if (!row) return null;
    hours = (row.stone / row.workRate / row.crew) * doubling;
    costGp = gp(((row.costCp * vehicles) / CP_PER_GP) * doubling);
    crew = row.crew * vehicles;
  }

  const days = Math.floor(hours / WORK_HOURS_PER_DAY);
  return {
    hours,
    days,
    remainderHours: Math.round((hours - days * WORK_HOURS_PER_DAY) * 100) / 100,
    costGp,
    crew,
    supervisorsNeeded: supervisorsFor(transportId, vehicles)
  };
}

/**
 * How many people must watch the loading (p. 377). One character covers a ship
 * or a warehouse, ten boats, ten wagons or forty animals as an ancillary
 * activity — twelve times that if it is all he does that day. What nobody
 * watches loses 2d10% of its value.
 */
export function supervisorsFor(transportId, count = 1, { dedicated = false } = {}) {
  const category = transportId === "warehouse"
    ? "warehouse"
    : CARGO_HANDLING[transportId]?.supervision;
  if (!category) return 0;

  const perSupervisor = SUPERVISION_LIMITS[category] * (dedicated ? SUPERVISION_DEDICATED_MULTIPLIER : 1);
  return Math.ceil(Math.max(0, num(count, 1)) / perSupervisor);
}

/**
 * Moorage or stabling (p. 372), or the cheaper rate for lying at anchor or
 * waiting in pasture — which doubles every loading time in exchange.
 *
 * A berthed ship is charged by its shipping points rather than by the hull; a
 * ship at anchor pays a flat fee, since it is using none of the harbour.
 */
export function moorageFor(vehicleId, { count = 1, shp = 0, days = 1, loose = false } = {}) {
  const row = MOORAGE[vehicleId];
  if (!row) return 0;

  const vehicles = Math.max(0, num(count, 1));
  const span = Math.max(0, num(days, 1));

  if (loose) return gp(row.looseGp * vehicles * span);

  const units = row.perShp ? Math.max(0, num(shp)) / row.perShp : vehicles;
  return gp(row.mooredGp * units * span);
}

/** Warehousing goods between markets: 1cp per stone per month (p. 377). */
export function warehouseRent(stone, months = 1) {
  return gp((Math.max(0, num(stone)) * WAREHOUSE_RENT_CP_PER_STONE_MONTH * Math.max(0, num(months, 1))) / CP_PER_GP);
}

/* ------------------------------------------------------------------ *
 * The two reaction tables (pp. 373, 376)
 * ------------------------------------------------------------------ */

const bandFor = (table, total) => table.find((band) => total >= band.min)?.result ?? table.at(-1).result;

/** Assessment of Supply & Demand (p. 373): what a day of listening around town buys. */
export function assessmentOutcome(total) {
  return bandFor(ASSESSMENT_TABLE, Math.round(num(total)));
}

/**
 * Reaction to Negotiation (p. 376).
 *
 * A natural 2 is always an outraged refusal and a natural 12 always an
 * agreement, "regardless of any adjustments" — so the two ends of the table
 * survive any modifier, in either direction. That clause lives here and nowhere
 * else, so a caller cannot forget it.
 */
export function negotiationOutcome(total, { natural = null } = {}) {
  if (natural === 2) return NEGOTIATION_TABLE.at(-1).result;
  if (natural === 12) return NEGOTIATION_TABLE[0].result;
  return bandFor(NEGOTIATION_TABLE, Math.round(num(total)));
}

/**
 * What the arbitrager adds to his negotiation roll (p. 376): his own charisma
 * against the merchant's, and two points per rank of Bargaining on either side.
 * Once negotiations become a matter of will, the same sum is taken over WIL.
 */
export function negotiationModifier({
  cha = 0,
  wil = 0,
  bargaining = 0,
  merchant = null,
  kind = "common",
  merchantExtraRank = false,
  phase = "reaction"
} = {}) {
  const them = merchant ?? MERCHANT_DEFAULTS[kind] ?? MERCHANT_DEFAULTS.common;
  const theirRanks = num(them.bargaining) + (merchantExtraRank ? 1 : 0);

  const mine = phase === "will" ? num(wil) : num(cha);
  const theirs = phase === "will" ? num(them.wil) : num(them.cha);

  return mine - theirs + BARGAINING_PER_RANK * (num(bargaining) - theirRanks);
}
