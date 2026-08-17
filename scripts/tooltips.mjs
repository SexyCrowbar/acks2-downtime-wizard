/**
 * Tooltips for every control in the wizard.
 *
 * Driven by a map rather than attributes scattered through the template, so
 * coverage can be enforced: a test renders the template, collects every control
 * id, and fails if any of them is missing from TOOLTIPS. Adding a field without
 * explaining it therefore breaks the build.
 *
 * No Foundry globals — the localiser is passed in — so it is testable outside
 * the application.
 */

/** Control id -> i18n key. Every `id="dw-*"` in wizard.hbs must appear here. */
export const TOOLTIPS = {
  // Character and activity
  "dw-actor": "DW.tip.character",
  "dw-record-name": "DW.tip.recordName",
  "dw-class-level": "DW.tip.classLevel",
  "dw-level-from-actor": "DW.tip.levelFromActor",
  "dw-activity": "DW.tip.activity",

  // Selling spellcasting services
  "dw-magic-type": "DW.tip.magicType",
  "dw-market": "DW.tip.marketClass",
  "dw-days": "DW.tip.daysWorked",
  "dw-castings-1": "DW.tip.castings",
  "dw-castings-2": "DW.tip.castings",
  "dw-castings-3": "DW.tip.castings",
  "dw-castings-4": "DW.tip.castings",
  "dw-castings-5": "DW.tip.castings",
  "dw-castings-6": "DW.tip.castings",

  // Perpetual spellcasting
  "dw-perpetual-level": "DW.tip.perpetualLevel",
  "dw-perpetual-count": "DW.tip.perpetualCount",

  // Specialist
  "dw-specialist": "DW.tip.specialist",
  "dw-grade": "DW.tip.grade",
  "dw-quantity": "DW.tip.quantity",
  "dw-patients": "DW.tip.patients",

  // Trade ladders
  "dw-rank": "DW.tip.rank",
  "dw-months": "DW.tip.months",
  "dw-workers-1": "DW.tip.workers",
  "dw-workers-2": "DW.tip.workers",
  "dw-workers-3": "DW.tip.workers",

  // Gambling
  "dw-ranks": "DW.tip.ranks",
  "dw-weeks": "DW.tip.weeks",

  // Arbitrage: the market
  "dw-arb-market": "DW.tip.arbMarketClass",
  "dw-cargo": "DW.tip.cargoCapacity",
  "dw-families": "DW.tip.urbanFamilies",
  "dw-party": "DW.tip.partySize",
  "dw-network": "DW.tip.mercantileNetwork",
  "dw-rulers": "DW.tip.rulersPrivilege",

  // Arbitrage: the merchandise
  "dw-merchandise": "DW.tip.merchandise",
  "dw-side": "DW.tip.side",
  "dw-demand": "DW.tip.demandModifier",
  "dw-season": "DW.tip.season",
  "dw-steady": "DW.tip.steadyRoute",
  "dw-exhaustion": "DW.tip.exhaustionSteps",

  // Arbitrage: the price
  "dw-price-roll": "DW.tip.priceRoll",
  "dw-negotiation": "DW.tip.negotiation",
  "dw-assessment": "DW.tip.assessment",
  "dw-cha": "DW.tip.chaMod",
  "dw-wil": "DW.tip.wilMod",
  "dw-bargaining": "DW.tip.bargainingRanks",
  "dw-extra-rank": "DW.tip.merchantExtraRank",
  "dw-stone": "DW.tip.stone",

  // A mercantile venture's month
  "dw-venture-arbitrage-sales": "DW.tip.ledgerRevenue",
  "dw-venture-carriage": "DW.tip.ledgerRevenue",
  "dw-venture-passengers": "DW.tip.ledgerRevenue",
  "dw-venture-other-revenue": "DW.tip.ledgerRevenue",
  "dw-venture-cost-of-goods": "DW.tip.ledgerCostOfGoods",
  "dw-venture-wages": "DW.tip.ledgerExpense",
  "dw-venture-rations": "DW.tip.ledgerExpense",
  "dw-venture-tolls": "DW.tip.ledgerExpense",
  "dw-venture-tariffs": "DW.tip.ledgerExpense",
  "dw-venture-moorage": "DW.tip.ledgerExpense",
  "dw-venture-labor": "DW.tip.ledgerExpense",
  "dw-venture-other-expenses": "DW.tip.ledgerExpense",
  "dw-capital": "DW.tip.capital",
  "dw-participant-name": "DW.tip.participantName",
  "dw-participant-role": "DW.tip.participantRole",
  "dw-participant-ownership": "DW.tip.participantOwnership",
  "dw-participant-level": "DW.tip.participantLevel",

  // Hijinks: the perpetrator
  "dw-hijink": "DW.tip.hijink",
  "dw-hijink-market": "DW.tip.hijinkMarket",
  "dw-victim": "DW.tip.victimLevel",
  "dw-hasty": "DW.tip.hasty",
  "dw-crew-name": "DW.tip.crewName",
  "dw-crew-level": "DW.tip.crewLevel",
  "dw-crew-cha": "DW.tip.crewCha",
  "dw-crew-succeeded": "DW.tip.crewSucceeded",
  "dw-crew-caught": "DW.tip.crewCaught",

  // Hijinks: the boss
  "dw-syn-market": "DW.tip.syndicateMarket",
  "dw-hideout": "DW.tip.hideoutValue",
  "dw-members-0": "DW.tip.members",
  "dw-members-1": "DW.tip.members",
  "dw-members-2": "DW.tip.members",
  "dw-members-3": "DW.tip.members",
  "dw-members-4": "DW.tip.members",
  "dw-members-5": "DW.tip.members",
  "dw-members-6": "DW.tip.members",
  "dw-members-7": "DW.tip.members",
  "dw-members-8": "DW.tip.members",
  "dw-assigned-0": "DW.tip.assigned",
  "dw-assigned-1": "DW.tip.assigned",
  "dw-assigned-2": "DW.tip.assigned",
  "dw-assigned-3": "DW.tip.assigned",
  "dw-assigned-4": "DW.tip.assigned",
  "dw-assigned-5": "DW.tip.assigned",
  "dw-assigned-6": "DW.tip.assigned",
  "dw-assigned-7": "DW.tip.assigned",
  "dw-assigned-8": "DW.tip.assigned",
  "dw-syn-hijink-earnings": "DW.tip.hijinkEarnings",
  "dw-syn-other-revenue": "DW.tip.ledgerRevenue",
  "dw-syn-attorneys": "DW.tip.syndicateExpense",
  "dw-syn-bribes": "DW.tip.syndicateExpense",
  "dw-syn-fines": "DW.tip.syndicateExpense",
  "dw-syn-healing": "DW.tip.syndicateExpense",
  "dw-syn-other-expenses": "DW.tip.syndicateExpense",

  // Judge's override
  "dw-ov-gold": "DW.tip.overrideGold",

  // Footer
  "dw-manual-total": "DW.tip.manualTotal"
};

/**
 * Attach Foundry tooltips to the text label of each control.
 *
 * Labels only — never the inputs and selects themselves. A tooltip popping up
 * over the control you are trying to type in or pick from is a nuisance, and
 * the label is the thing you read anyway.
 *
 * Labels for an activity that is not currently shown are skipped silently.
 *
 * @param {Element} root       the rendered application element
 * @param {(key: string) => string} localize
 * @returns {number} how many labels were given a tooltip
 */
export function applyTooltips(root, localize) {
  if (!root?.querySelector) return 0;

  let applied = 0;
  for (const [id, key] of Object.entries(TOOLTIPS)) {
    const label = root.querySelector(`label[for="${id}"]`);
    if (!label) continue;

    label.setAttribute("data-tooltip", localize(key));
    applied++;
  }
  return applied;
}
