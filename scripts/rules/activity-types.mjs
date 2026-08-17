/**
 * The downtime activities a character can work at for money.
 *
 * Each activity is a data record rather than a branch of code. It declares which
 * form fields it needs, how its income is computed, how it earns campaign XP,
 * and which dice — if any — decide the outcome. Adding or correcting an
 * activity is a one-record edit.
 *
 * `xpMode` is load-bearing and not cosmetic. Campaign XP comes only from
 * construction, domains, hijinks, mercantile income, magic research and divine
 * power (p. 423). Wage work therefore pays gold and nothing else, and the
 * wizard says so rather than leaving the reader to wonder. It is the single
 * declared source of that fact — `earnsXp()` below reads it, and the calculator
 * dispatches its whole XP calculation on it, so a record cannot claim one thing
 * and compute another.
 *
 *   none             gold only
 *   threshold        income above the character's monthly XP threshold
 *   mercantileSplit  a venture's profit divided among owners and operators
 *
 * Pure — no Foundry globals. `earn` is deterministic and returns the *expected*
 * income, which is what the live results panel shows; anything decided by dice
 * is rolled separately through `resolve`, so recalculating on every keystroke
 * never re-rolls.
 */

import {
  GAMBLING_DIE,
  LABOR_MONTHLY,
  PERPETUAL_SPELL_COST,
  PRICE_ROLL,
  SPELL_COST_BY_LEVEL,
  SPELL_LEVELS,
  SPELL_SALE_FRACTION,
  SUPERVISION_MULTIPLIER,
  SYNDICATE_EXPENSE_LINES,
  SYNDICATE_REVENUE_LINES,
  VENTURE_EXPENSE_LINES,
  VENTURE_REVENUE_LINES,
  saleCapPerDay,
  specialistGrade,
  tradeLadder
} from "./tables.mjs";

import { average } from "./dice.mjs";

import {
  dailySupply,
  marketPrice,
  resolveMarketImpact,
  tollAndTariff
} from "./mercantile.mjs";

import {
  assignmentCost,
  crewResolution,
  effectiveLevel,
  hijinkSchedule,
  hijinkValue,
  syndicateLimits,
  tributeIncome,
  victimBand
} from "./hijinks.mjs";

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const whole = (v) => Math.max(0, Math.floor(num(v)));

/** Foundry sends null for a cleared number field and "" for a cleared text one. */
const isBlank = (v) => v === null || v === undefined || v === "";

/* ------------------------------------------------------------------ *
 * Shared arithmetic
 * ------------------------------------------------------------------ */

/**
 * Selling spellcasting services, level by level (p. 172).
 *
 * Two things limit a caster: how many spells of each level he can cast in a
 * day, and how many the market will absorb — at most 9 - (class + level). The
 * lower of the two is what he can actually offer, and one casting in six sells.
 */
export function spellcastingRows(inputs) {
  const marketClassId = inputs.marketClass ?? "IV";
  const castings = inputs.castings ?? {};

  return SPELL_LEVELS.map((level) => {
    const offered = whole(castings[level]);
    const cap = saleCapPerDay(marketClassId, level);
    const sellable = Math.min(offered, cap);
    const fee = SPELL_COST_BY_LEVEL[level];
    return {
      level,
      offered,
      cap,
      sellable,
      /** Castings the market simply will not take, however many he can cast. */
      blocked: Math.max(0, offered - cap),
      fee,
      grossPerDay: sellable * fee,
      expectedPerDay: sellable * fee * SPELL_SALE_FRACTION
    };
  });
}

/**
 * A trade ladder's monthly income: the character's own output plus every
 * subordinate's, each raised by half again for being supervised (pp. 107, 116).
 *
 * The book's own check on this is the grand master artisan, whose 80gp plus 2
 * masters, 4 journeymen and 8 apprentices comes to 440gp per month.
 */
export function tradeIncomePerMonth(ladderId, rank, workers = {}) {
  const ladder = tradeLadder(ladderId);
  const ownRank = Math.max(0, Math.min(ladder.maxRank, Math.floor(num(rank))));
  if (ownRank === 0) return { own: 0, supervised: 0, total: 0, rows: [] };

  const own = ladder.monthlyByRank[ownRank];
  const permitted = ladder.workers[ownRank] ?? {};

  const rows = Object.keys(permitted)
    .map(Number)
    .sort((a, b) => b - a)
    .map((workerRank) => {
      const allowed = permitted[workerRank];
      const employed = whole(workers[workerRank]);
      const counted = Math.min(employed, allowed);
      const each = ladder.monthlyByRank[workerRank] * SUPERVISION_MULTIPLIER;
      return {
        rank: workerRank,
        label: ladder.rankLabels[workerRank],
        allowed,
        employed,
        counted,
        over: Math.max(0, employed - allowed),
        each,
        total: counted * each
      };
    });

  const supervised = rows.reduce((sum, r) => sum + r.total, 0);
  return { own, supervised, total: own + supervised, rows };
}

/**
 * A day of arbitrage in one market, in one merchandise (pp. 373-377).
 *
 * Everything that the dice decide — the 4d4-10 price roll, the negotiation, the
 * assessment — is handed in as a number rather than thrown here, so the figure
 * on screen does not change while the rest of the form is being filled in.
 *
 * The class level is the character's own, taken from the form's character
 * section rather than asked for twice: a steady trade route is worth half of it
 * in market impact (p. 375).
 */
export function arbitrageDeal(inputs, classLevel = 0) {
  const marketClassId = inputs.marketClass ?? "IV";
  const side = inputs.side === "sell" ? "sell" : "buy";
  const merchandiseId = inputs.merchandiseId ?? "salt";
  const demandModifier = num(inputs.demandModifier);

  const market = resolveMarketImpact({
    totalLoad: num(inputs.cargoCapacity),
    marketClassId,
    urbanFamilies: num(inputs.urbanFamilies),
    partySize: num(inputs.partySize, 1),
    mercantileNetwork: !!inputs.mercantileNetwork,
    steadyRoute: !!inputs.steadyRoute,
    classLevel: num(classLevel),
    merchandiseId
  });

  const supply = dailySupply(merchandiseId, market.effectiveClass, market.impact, { side, demandModifier });

  const price = marketPrice({
    merchandiseId,
    side,
    demandModifier,
    marketClassId: market.effectiveClass,
    priceRoll: num(inputs.priceRoll),
    season: inputs.season ?? null,
    steadyRoute: !!inputs.steadyRoute,
    negotiation: inputs.negotiation ?? null,
    exhaustionSteps: num(inputs.exhaustionSteps)
  });

  const requested = Math.max(0, num(inputs.stone));
  const traded = Math.min(requested, supply.tradable);
  const value = Math.round(traded * price.price * 100) / 100;

  // The toll is a cost of entering the market and the tariff a cost of bringing
  // goods in to sell, so neither is charged on the deal — they are reported so
  // the month's ledger has them. Both are levied by the market actually walked
  // into, which is why they use the entered class rather than the effective one.
  const entry = tollAndTariff({
    cargoCapacity: num(inputs.cargoCapacity),
    marketClassId,
    goodsValue: side === "sell" ? value : 0,
    merchandiseId,
    rulersPrivilege: !!inputs.rulersPrivilege
  });

  return { market, supply, price, side, requested, traded, value, entry };
}

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

export const ACTIVITY_TYPES = {
  spellcasting: {
    id: "spellcasting",
    page: 172,
    xpMode: "none",
    inputs: ["castings", "marketClass", "daysWorked"],
    /** One 1d6 per offered casting per day; a 6 sells it. */
    dice: { die: "1d6", per: "casting" },
    earn(inputs) {
      const rows = spellcastingRows(inputs);
      const days = whole(inputs.daysWorked);
      const grossPerDay = rows.reduce((s, r) => s + r.grossPerDay, 0);
      const expectedPerDay = rows.reduce((s, r) => s + r.expectedPerDay, 0);
      return {
        gold: expectedPerDay * days,
        upfront: 0,
        monthly: 0,
        rows,
        figures: { grossPerDay, expectedPerDay, days }
      };
    }
  },

  perpetualSpellcasting: {
    id: "perpetualSpellcasting",
    page: 173,
    xpMode: "none",
    inputs: ["perpetualRows"],
    earn(inputs) {
      const list = Array.isArray(inputs.perpetualRows) ? inputs.perpetualRows : [];
      const rows = list.map((row) => {
        const level = Math.max(1, Math.min(6, Math.floor(num(row?.level, 1))));
        const count = whole(row?.count);
        const cost = PERPETUAL_SPELL_COST[level];
        return {
          level,
          count,
          upfrontEach: cost.upfront,
          monthlyEach: cost.monthly,
          upfront: count * cost.upfront,
          monthly: count * cost.monthly
        };
      });
      const upfront = rows.reduce((s, r) => s + r.upfront, 0);
      const monthly = rows.reduce((s, r) => s + r.monthly, 0);
      // The upfront fee is this month's income; the maintenance fee recurs, so
      // it is reported separately rather than folded into one figure.
      return { gold: upfront, upfront, monthly, rows, figures: {} };
    }
  },

  specialist: {
    id: "specialist",
    page: 170,
    xpMode: "none",
    inputs: ["specialist", "quantity", "patients"],
    earn(inputs) {
      const grade = specialistGrade(inputs.specialistId, inputs.gradeId);
      const quantity = Math.max(0, num(inputs.quantity));
      const patients = grade.unit === "dayPerPatient" ? Math.max(0, num(inputs.patients, 1)) : 1;
      const gold = grade.wage * quantity * patients;
      return {
        gold,
        upfront: 0,
        monthly: 0,
        rows: [],
        figures: { wage: grade.wage, unit: grade.unit, quantity, patients }
      };
    }
  },

  artCraft: {
    id: "artCraft",
    page: 107,
    xpMode: "none",
    ladderId: "artCraft",
    inputs: ["rank", "workers", "months"],
    earn(inputs) {
      return tradeEarn("artCraft", inputs);
    }
  },

  profession: {
    id: "profession",
    page: 116,
    xpMode: "none",
    ladderId: "profession",
    inputs: ["rank", "workers", "months"],
    earn(inputs) {
      return tradeEarn("profession", inputs);
    }
  },

  performance: {
    id: "performance",
    page: 116,
    xpMode: "none",
    ladderId: "performance",
    inputs: ["rank", "workers", "months"],
    earn(inputs) {
      return tradeEarn("performance", inputs);
    }
  },

  labor: {
    id: "labor",
    page: 113,
    xpMode: "none",
    inputs: ["months"],
    earn(inputs) {
      const months = Math.max(0, num(inputs.months));
      return {
        gold: LABOR_MONTHLY * months,
        upfront: 0,
        monthly: 0,
        rows: [],
        figures: { perMonth: LABOR_MONTHLY, months }
      };
    }
  },

  /**
   * A day's arbitrage: one market, one merchandise, bought or sold (p. 373).
   *
   * It earns no campaign XP of its own, and that is a rule rather than an
   * omission. Mercantile income is "calculated at the end of each month for the
   * venture as a whole" (p. 424), net of the goods, the wages and the tolls, so
   * a single transaction is not income and cannot be measured against a
   * threshold. The venture below is where that happens.
   */
  arbitrage: {
    id: "arbitrage",
    page: 373,
    xpMode: "none",
    inputs: [
      "merchandise", "marketClass", "cargoCapacity", "urbanFamilies", "partySize",
      "demandModifier", "priceRoll", "season", "negotiation", "stone"
    ],
    /** The Judge throws 4d4-10 once per merchandise per market per month. */
    dice: { die: PRICE_ROLL, per: "price" },
    earn(inputs, context = {}) {
      const deal = arbitrageDeal(inputs, context.classLevel);
      return {
        gold: deal.value,
        upfront: 0,
        monthly: 0,
        rows: deal.price.breakdown,
        figures: {
          side: deal.side,
          effectiveClass: deal.market.effectiveClass,
          impact: deal.market.impact,
          unitPrice: deal.price.price,
          basePrice: deal.price.base,
          priceStep: deal.price.step,
          priceSteps: deal.price.steps,
          priceFloored: deal.price.floored,
          available: deal.supply.stone,
          tradable: deal.supply.tradable,
          fractional: deal.supply.fractional,
          daysToOneStone: deal.supply.daysToOneStone,
          unavailable: deal.supply.unavailable,
          requested: deal.requested,
          traded: deal.traded,
          toll: deal.entry.toll,
          tariff: deal.entry.tariff,
          entryCost: deal.entry.total,
          notes: deal.market.notes
        }
      };
    }
  },

  /**
   * A month of mercantile venturing, totalled and divided (pp. 423-424).
   *
   * This is the module's first activity that earns campaign XP, and the only
   * one so far whose XP belongs to several people at once.
   */
  mercantileVenture: {
    id: "mercantileVenture",
    page: 424,
    xpMode: "mercantileSplit",
    inputs: ["venture", "ventureParticipants"],
    earn(inputs) {
      const ledger = inputs.venture ?? {};
      const revenue = sumLines(ledger.revenue, VENTURE_REVENUE_LINES);
      const expenses = sumLines(ledger.expenses, VENTURE_EXPENSE_LINES);
      const income = revenue.total - expenses.total;
      const capital = Math.max(0, num(ledger.capital));

      return {
        gold: Math.round(income * 100) / 100,
        upfront: 0,
        monthly: 0,
        rows: [...revenue.rows, ...expenses.rows],
        figures: {
          revenue: revenue.total,
          expenses: expenses.total,
          income: Math.round(income * 100) / 100,
          capital,
          // The book quotes both: 1,187.5gp of income is a 2.375% month.
          returnPct: capital > 0 ? Math.round((income / capital) * 10000) / 100 : null
        }
      };
    }
  },

  /**
   * A perpetrator's hijink, alone or as part of a crew (pp. 360-367).
   *
   * The member's side of the chapter. He earns XP equal to half the gp value of
   * what he personally pulled off (p. 423) — not the value less a threshold,
   * which is the boss's rule and a different sum entirely. A crew splits both
   * the gold and the XP pro rata by level among whoever got away.
   *
   * The `gold` reported is what reaches the *boss*; `xp.shares` is what each
   * perpetrator takes from it.
   */
  hijink: {
    id: "hijink",
    page: 361,
    xpMode: "hijinkShare",
    inputs: ["hijinkType", "marketClass", "crew", "victimLevel"],
    earn(inputs, context = {}) {
      const hijinkId = inputs.hijinkId ?? "carousing";
      const marketClassId = inputs.marketClass ?? "IV";
      const hasty = !!inputs.hasty;
      const victimLevel = isBlank(inputs.victimLevel) ? null : num(inputs.victimLevel);

      // Working alone is a crew of one, so there is one code path and not two.
      // Nothing has succeeded until it is said to have succeeded: an untouched
      // form reports no loot, the way every other activity here does.
      const crew = Array.isArray(inputs.crew) && inputs.crew.length
        ? inputs.crew
        : [{ name: "", classLevel: num(context.classLevel, 1), cha: 10, succeeded: false, caught: false }];

      const result = crewResolution({ crew, hijinkId, marketClassId, victimLevel, hasty });
      const solo = effectiveLevel(crew[0]?.classLevel ?? 1, marketClassId);

      return {
        gold: result.gold,
        upfront: 0,
        monthly: 0,
        rows: result.shares,
        figures: {
          hijinkId,
          hasty,
          cash: result.cash,
          succeeded: result.succeeded,
          summedLevel: result.summedLevel,
          honcho: result.honcho,
          slots: result.slots,
          sizePenalty: result.sizePenalty,
          soloEffectiveLevel: solo.level,
          levelCapped: solo.capped,
          maxEffectiveLevel: solo.cap,
          victimBand: victimBand(hijinkId, solo.level),
          schedule: hijinkSchedule(hijinkId, crew[0]?.classLevel ?? 1, { hasty }),
          caughtCount: result.members.filter((m) => m.caught).length
        }
      };
    }
  },

  /**
   * A syndicate boss's month (pp. 360-361, 423).
   *
   * Monthly hijink income is "the total gp value earned from hijinks by the
   * boss, less the cost of wages, attorneys, bribes, fines, and magical healing
   * for his members" (p. 423), measured against his own threshold. A boss who
   * wants none of the dice can simply collect tribute instead, which the table
   * is tuned to make an even trade.
   */
  syndicate: {
    id: "syndicate",
    page: 360,
    xpMode: "threshold",
    inputs: ["syndicate", "marketClass"],
    earn(inputs) {
      const marketClassId = inputs.marketClass ?? "IV";
      const book = inputs.syndicate ?? {};

      const limits = syndicateLimits(marketClassId, num(book.hideoutValue));
      const tribute = tributeIncome(book.members, marketClassId);
      const assignments = assignmentCost(book.assigned);

      const revenue = sumLines(book.revenue, SYNDICATE_REVENUE_LINES);
      const expenses = sumLines(book.expenses, SYNDICATE_EXPENSE_LINES);

      // Tribute and the wage bill are computed from the membership rather than
      // typed, so they are folded in on top of whatever was entered by hand.
      const totalRevenue = Math.round((revenue.total + tribute.total) * 100) / 100;
      const totalExpenses = Math.round((expenses.total + assignments.total) * 100) / 100;
      const income = totalRevenue - totalExpenses;

      return {
        gold: Math.round(income * 100) / 100,
        upfront: 0,
        monthly: 0,
        rows: [...tribute.rows, ...revenue.rows, ...expenses.rows],
        figures: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          income: Math.round(income * 100) / 100,
          tribute: tribute.total,
          tributeRows: tribute.rows,
          headcount: tribute.headcount,
          assignmentCost: assignments.total,
          ordered: assignments.ordered,
          maxMembers: limits.maxMembers,
          maxEffectiveLevel: limits.maxEffectiveLevel,
          cappedByMarket: limits.cappedByMarket,
          couldGrow: limits.couldGrow,
          marketCap: limits.marketCap,
          byHideout: limits.byHideout,
          hideoutValue: num(book.hideoutValue)
        }
      };
    }
  },

  gambling: {
    id: "gambling",
    page: 111,
    xpMode: "none",
    inputs: ["ranks", "weeks"],
    /** 1d6! per rank per week, exploding. */
    dice: { die: GAMBLING_DIE, per: "rankWeek" },
    earn(inputs) {
      const ranks = whole(inputs.ranks);
      const weeks = Math.max(0, num(inputs.weeks));
      const perWeek = ranks * average(GAMBLING_DIE);
      return {
        gold: perWeek * weeks,
        upfront: 0,
        monthly: 0,
        rows: [],
        figures: { ranks, weeks, perWeek, dieCount: ranks * Math.floor(weeks) }
      };
    }
  }
};

/**
 * Total one side of the venture's ledger, keeping the individual lines so the
 * results panel and the journal page can print the month the way it was
 * entered rather than as a single figure.
 */
function sumLines(source, lineIds) {
  const values = source ?? {};
  const rows = lineIds.map((id) => ({ id, amount: Math.round(num(values[id]) * 100) / 100 }));
  return { rows, total: Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100 };
}

/** Shared by the three trade ladders, which differ only in their table. */
function tradeEarn(ladderId, inputs) {
  const months = Math.max(0, num(inputs.months));
  const income = tradeIncomePerMonth(ladderId, inputs.rank, inputs.workers);
  return {
    gold: income.total * months,
    upfront: 0,
    monthly: 0,
    rows: income.rows,
    figures: { own: income.own, supervised: income.supervised, perMonth: income.total, months }
  };
}

export const ACTIVITY_TYPE_IDS = Object.keys(ACTIVITY_TYPES);

export function getActivityType(id) {
  return ACTIVITY_TYPES[id] ?? ACTIVITY_TYPES.spellcasting;
}

/** Whether an activity earns campaign XP at all, read from its declared mode. */
export function earnsXp(activity) {
  return (activity?.xpMode ?? "none") !== "none";
}

/** Activities that earn campaign XP, for the "no XP from this" note. */
export const XP_EARNING_IDS = ACTIVITY_TYPE_IDS.filter((id) => earnsXp(ACTIVITY_TYPES[id]));
