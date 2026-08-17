/**
 * The Downtime Work wizard.
 *
 * A thin shell over the pure rules layer: it collects inputs, hands them to
 * `calculate`, and renders the result. One figure is read off the actor sheet —
 * the character's level, which fills the level box when a character is picked
 * and re-fills it when the pick changes. Typing over it unlinks the pair and
 * the typed number wins, so the sheet is a starting point rather than an
 * authority. Nothing else is taken: the ACKS system cannot express proficiency
 * ranks or castings per day in a form this could trust, so every other rule
 * input is entered by hand and nothing is guessed for you. The character
 * otherwise still only decides whose journal a record is filed under and who
 * speaks the chat card.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { levelFromActor } from "../actor.mjs";
import { calculate } from "../rules/calculator.mjs";
import { victimBand } from "../rules/hijinks.mjs";
import { ACTIVITY_TYPE_IDS, getActivityType } from "../rules/activity-types.mjs";
import {
  HIJINKS,
  HIJINK_IDS,
  MAGIC_TYPES,
  MARKET_CLASS_IDS,
  MARKET_CLASSES,
  MERCHANDISE,
  MERCHANDISE_IDS,
  SEASONS,
  SPECIALIST_IDS,
  SPECIALISTS,
  SPELL_LEVELS,
  SYNDICATE_EXPENSE_LINES,
  SYNDICATE_REVENUE_LINES,
  VENTURE_EXPENSE_LINES,
  VENTURE_REVENUE_LINES,
  VENTURE_ROLES,
  specialist,
  tradeLadder
} from "../rules/tables.mjs";
import { postDowntimeCard, postMarketRoll, rollActivity, rollMarketDie } from "../resolve.mjs";
import { saveRecordPage } from "../journal.mjs";
import { applyTooltips } from "../tooltips.mjs";

/** Repeat rows arrive from the form as objects keyed by index. */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => value[k]);
}

/**
 * Inputs that are lists of rows the user can add to and remove from.
 *
 * `mergeObject` merges arrays index-wise, so a removed row would survive the
 * merge and reappear. Every one of these therefore has to be reassigned after
 * a merge — and doing that from one list rather than by hand at each call site
 * is deliberate: the same clause written out three times is how `mrw-007` and
 * `mrw-008` happened.
 */
const REPEAT_ROW_FIELDS = ["perpetualRows", "ventureParticipants", "crew"];

/** A fresh row for each repeat list, used by the add button and the defaults. */
const NEW_ROW = {
  perpetualRows: () => ({ level: 1, count: 1 }),
  ventureParticipants: () => ({ name: "", role: "pc", ownership: 0, classLevel: 1, isSelf: false }),
  crew: () => ({ name: "", classLevel: 1, cha: 10, succeeded: false, caught: false })
};

/** camelCase to kebab-case, for turning a data key into a DOM id. */
const kebab = (value) => String(value).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Put each repeat list back after a merge, so that a row the user deleted stays
 * deleted. Only lists the caller actually supplied are touched.
 */
function keepRepeatRows(target, source) {
  for (const field of REPEAT_ROW_FIELDS) {
    const rows = source?.inputs?.[field];
    if (Array.isArray(rows)) target.inputs[field] = rows;
  }
  return target;
}

function defaultState() {
  return {
    actorId: null,
    recordName: "",
    character: {
      classLevel: 1,
      /**
       * Whether the level tracks the picked character's sheet. Cleared the
       * moment the box is typed into, so a Judge's number is never overwritten
       * by a later change of character.
       */
      levelFromActor: true
    },
    activity: "spellcasting",
    inputs: {
      // Selling spellcasting services
      magicType: "arcane",
      marketClass: "IV",
      daysWorked: 30,
      castings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      // Perpetual spellcasting
      perpetualRows: [{ level: 1, count: 1 }],
      // Working as a specialist
      specialistId: "sage",
      gradeId: "standard",
      quantity: 1,
      patients: 1,
      // Art/Craft, Profession, Performance
      rank: 1,
      workers: { 1: 0, 2: 0, 3: 0 },
      months: 1,
      // Gambling
      ranks: 1,
      weeks: 1,
      // Arbitrage trading
      merchandiseId: "salt",
      side: "buy",
      cargoCapacity: 0,
      urbanFamilies: 0,
      partySize: 1,
      mercantileNetwork: false,
      steadyRoute: false,
      rulersPrivilege: false,
      demandModifier: 0,
      priceRoll: 0,
      season: "summer",
      negotiation: "",
      exhaustionSteps: 0,
      stone: 0,
      chaMod: 0,
      wilMod: 0,
      bargainingRanks: 0,
      merchantExtraRank: false,
      /** Informational only: it reveals demand modifiers, it does not price anything. */
      assessment: "",
      // A mercantile venture's month
      venture: {
        revenue: { arbitrageSales: 0, carriage: 0, passengers: 0, otherRevenue: 0 },
        expenses: {
          costOfGoods: 0, wages: 0, rations: 0, tolls: 0,
          tariffs: 0, moorage: 0, labor: 0, otherExpenses: 0
        },
        capital: 0
      },
      ventureParticipants: [{ name: "", role: "pc", ownership: 100, classLevel: 1, isSelf: true }],
      // Hijinks: the perpetrator's side
      hijinkId: "carousing",
      hasty: false,
      victimLevel: "",
      crew: [{ name: "", classLevel: 1, cha: 10, succeeded: true, caught: false }],
      // Hijinks: the boss's side
      syndicate: {
        hideoutValue: 0,
        members: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        assigned: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        revenue: { hijinkEarnings: 0, otherRevenue: 0 },
        expenses: { attorneys: 0, bribes: 0, fines: 0, healing: 0, otherExpenses: 0 }
      }
    },
    /** Blank means "use the figure the rules produce". */
    overrides: { gold: "" },
    /** A total from physical dice, replacing the roll. Blank means we roll. */
    manualTotal: ""
  };
}

export class DowntimeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #state = defaultState();

  /** The most recent roll, kept so it can be written into the journal page. */
  #lastResolution = null;

  /** The most recent market roll, shown beside the field it filled. */
  #lastMarketRoll = null;

  /**
   * Whether the Judge's Override section is expanded. Kept on the instance
   * rather than in form state so submitting does not disturb it, and so the
   * re-render on every change does not fold the section back up.
   */
  #overridesOpen = false;

  constructor(options = {}) {
    super(options);
    if (options.actor) this.#state.actorId = options.actor.id;

    // Reopening a saved record. Merged onto the defaults rather than replacing
    // them, so a record saved before a field existed still loads cleanly.
    if (options.state) {
      this.#state = foundry.utils.mergeObject(this.#state, options.state, { inplace: false });
      keepRepeatRows(this.#state, options.state);
    } else {
      // A fresh record opened on a character starts at that character's level.
      // A reopened one does not: the level is part of the record, and a
      // character who has since levelled up must not rewrite his own history.
      this.#syncLevelFromActor(options.actor);
    }
  }

  static DEFAULT_OPTIONS = {
    id: "acks2-downtime",
    classes: ["acks2", "downtime-app"],
    sheetConfig: false,
    tag: "form",
    window: {
      title: "DW.app.title",
      icon: "fa-solid fa-coins",
      resizable: true
    },
    // Kept under Foundry's minimum supported 768px screen height so the footer
    // is on screen by default; the layout copes with any size from here.
    position: { width: 820, height: 700 },
    form: {
      handler: DowntimeApp.#onChange,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      roll: DowntimeApp.#onRoll,
      rollField: DowntimeApp.#onRollField,
      postToChat: DowntimeApp.#onPostToChat,
      saveJournal: DowntimeApp.#onSave,
      addRow: DowntimeApp.#onAddRow,
      removeRow: DowntimeApp.#onRemoveRow,
      reset: DowntimeApp.#onReset
    }
  };

  /**
   * Two parts, because ApplicationV2 throws "Template part must render a single
   * HTML element" and the footer cannot live inside the scrolling form.
   */
  static PARTS = {
    app: {
      template: `modules/${MODULE_ID}/templates/wizard.hbs`,
      scrollable: [".dw-scroll", ".dw-results"]
    },
    footer: {
      template: `modules/${MODULE_ID}/templates/wizard-footer.hbs`
    }
  };

  /* ---------------------------------------------------------------- *
   * Context
   * ---------------------------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this.#state;
    const activity = getActivityType(state.activity);
    const result = calculate(state);

    const shows = (field) => activity.inputs.includes(field);

    context.state = state;
    context.result = result;
    context.activity = activity;
    context.actor = state.actorId ? game.actors.get(state.actorId) : null;

    // The level box tracks the sheet until it is typed into. Both facts are
    // rendered: the tick, and — when the two disagree — what the sheet says, so
    // an overridden level is visibly an override rather than a stale number.
    context.actorLevel = levelFromActor(context.actor);
    context.levelLinked = !!state.character.levelFromActor;
    context.levelDiffers =
      context.actorLevel !== null &&
      !context.levelLinked &&
      Number(state.character.classLevel) !== context.actorLevel;

    context.shows = {
      castings: shows("castings"),
      marketClass: shows("marketClass"),
      daysWorked: shows("daysWorked"),
      perpetualRows: shows("perpetualRows"),
      specialist: shows("specialist"),
      quantity: shows("quantity"),
      patients: shows("patients") && result.figures.unit === "dayPerPatient",
      rank: shows("rank"),
      workers: shows("workers"),
      months: shows("months"),
      ranks: shows("ranks"),
      weeks: shows("weeks"),
      merchandise: shows("merchandise"),
      // Only a Class I market's ceiling depends on how many families live there.
      urbanFamilies: shows("urbanFamilies") && state.inputs.marketClass === "I",
      venture: shows("venture"),
      hijink: shows("hijinkType"),
      // Only the two hijinks aimed at a person need a victim's level.
      victimLevel: shows("victimLevel") && !!victimBand(state.inputs.hijinkId, 1),
      syndicate: shows("syndicate"),
      // The footer's Roll button is for activities whose *income* is rolled.
      // Arbitrage rolls its market instead, field by field, in the form itself.
      dice: !!activity.dice && activity.id !== "arbitrage"
    };

    const ladder = activity.ladderId ? tradeLadder(activity.ladderId) : null;
    const currentSpecialist = specialist(state.inputs.specialistId);

    context.choices = {
      actors: this.#actorChoices(),
      activities: ACTIVITY_TYPE_IDS.map((id) => ({
        value: id,
        label: game.i18n.localize(`DW.activity.${id}`),
        selected: id === state.activity
      })),
      magicTypes: MAGIC_TYPES.map((id) => ({
        value: id,
        label: game.i18n.localize(`DW.magicType.${id}`),
        selected: id === state.inputs.magicType
      })),
      markets: MARKET_CLASS_IDS.map((id) => ({
        value: id,
        label: this.#marketLabel(id),
        selected: id === state.inputs.marketClass
      })),
      specialists: SPECIALIST_IDS.map((id) => ({
        value: id,
        label: this.#specialistLabel(id),
        selected: id === state.inputs.specialistId
      })),
      grades: currentSpecialist.grades.map((g) => ({
        value: g.id,
        label: g.label,
        selected: g.id === state.inputs.gradeId
      })),
      spellLevels: SPELL_LEVELS.map((n) => ({
        value: n,
        label: game.i18n.format("DW.label.nthLevel", { n })
      })),
      ranks: ladder
        ? Array.from({ length: ladder.maxRank + 1 }, (_, n) => ({
            value: n,
            label: n === 0 ? "0" : `${n} — ${ladder.rankLabels[n]}`,
            selected: n === Math.floor(Number(state.inputs.rank) || 0)
          }))
        : [],
      merchandise: MERCHANDISE_IDS.map((id) => ({
        value: id,
        label: this.#merchandiseLabel(id),
        selected: id === state.inputs.merchandiseId
      })),
      sides: this.#enumChoices("side", ["buy", "sell"], state.inputs.side),
      seasons: this.#enumChoices("season", SEASONS, state.inputs.season),
      negotiations: [
        { value: "", label: game.i18n.localize("DW.negotiation.none"), selected: !state.inputs.negotiation },
        ...this.#enumChoices(
          "negotiation",
          ["agreement", "grudging", "continue", "refusal", "outraged"],
          state.inputs.negotiation
        )
      ],
      assessments: [
        { value: "", label: game.i18n.localize("DW.assessment.none"), selected: !state.inputs.assessment },
        ...this.#enumChoices(
          "assessment",
          ["successful", "partial", "expertise", "failed", "false"],
          state.inputs.assessment
        )
      ],
      roles: this.#enumChoices("role", VENTURE_ROLES, null),
      hijinks: HIJINK_IDS.map((id) => ({
        value: id,
        label: this.#hijinkLabel(id),
        selected: id === state.inputs.hijinkId
      }))
    };

    context.spellRows = activity.id === "spellcasting" ? result.rows ?? [] : [];
    context.ladder = ladder;
    context.workerRows = ladder ? this.#workerRows(ladder, result) : [];
    context.perpetualRows = (state.inputs.perpetualRows ?? []).map((row, index) => ({
      ...row,
      index,
      levels: SPELL_LEVELS.map((n) => ({
        value: n,
        label: game.i18n.format("DW.label.nthLevel", { n }),
        selected: n === Math.floor(Number(row?.level) || 1)
      }))
    }));

    context.crewRows = context.shows.hijink ? this.#crewRows(state, result) : [];
    context.syndicateRows = context.shows.syndicate ? this.#syndicateRows(state, result) : null;
    context.hijinkFacts = context.shows.hijink ? this.#hijinkFacts(result) : null;
    context.priceRows = context.shows.merchandise ? this.#priceRows(result) : [];
    context.ledger = context.shows.venture ? this.#ledgerRows(state) : null;
    context.participantRows = context.shows.venture ? this.#participantRows(state, result) : [];
    context.marketRoll = this.#marketRollText();

    context.activityHint = game.i18n.localize(`DW.activityHint.${activity.id}`);
    context.pageCite = game.i18n.format("DW.label.page", { page: activity.page });
    context.canSave = game.user.can("JOURNAL_CREATE");
    context.hasManualTotal = !!String(state.manualTotal ?? "").trim();
    context.lastResolution = this.#lastResolution;

    Object.assign(context, this.#buildLabels(result));

    return context;
  }

  /** Tooltips are attached after each render, including the re-render on change. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    applyTooltips(this.element, (key) => game.i18n.localize(key));

    // The element is replaced on every re-render, so this is reattached each time.
    const overrides = this.element?.querySelector?.(".dw-override-set");
    if (overrides) {
      overrides.addEventListener("toggle", () => {
        this.#overridesOpen = overrides.open;
      });
    }
  }

  /**
   * Localised labels derived from a result. Resolved here rather than in the
   * templates, which keeps the Handlebars free of the string-building helpers
   * Foundry does not ship. Shared by the wizard and the journal snapshot.
   */
  #buildLabels(result) {
    const resolution = this.#lastResolution;

    return {
      activityLabel: game.i18n.localize(`DW.activity.${result.activity}`),
      warnings: result.warnings.map((w) => this.#warningText(w)),
      notes: (result.notes ?? []).map((n) => this.#noteText(n)),

      // The whole point of showing this: every other downtime chapter grants
      // campaign XP, and wage work does not. The three earning modes each have
      // a different reason, and the panel gives the right one.
      xpNote: this.#xpNote(result),

      // The journal page and the chat card get the same labels as the wizard
      // but not its `shows` map, so what they render is keyed off the activity.
      isArbitrage: result.activity === "arbitrage",
      isVenture: result.activity === "mercantileVenture",
      isHijink: result.activity === "hijink",
      isSyndicate: result.activity === "syndicate",
      shareRows: this.#shareRows(result),

      // What the headline figure means, which differs by activity: a rolled
      // total, a day's trade, or a month's income.
      resultNote: game.i18n.localize(
        result.activity === "arbitrage" ? "DW.results.dealValue"
          : result.activity === "mercantileVenture" ? "DW.results.monthTotal"
            : "DW.results.expected"
      ),

      overridesOpen: this.#overridesOpen,
      anyOverrideActive: result.income.overridden,
      overrideTooltip: game.i18n.localize("DW.results.overrideTooltip"),

      resolutionLabel: resolution
        ? game.i18n.localize(resolution.entered ? "DW.results.entered" : "DW.results.rolled")
        : null
    };
  }

  /**
   * Why this activity earns what it earns, in one line.
   *
   * A syndicate member is the odd one out: he keeps half the value of what he
   * pulled off and no threshold is subtracted at all (p. 423), which is worth
   * saying plainly because every other XP-earning activity in the book works
   * the other way.
   */
  #xpNote(result) {
    if (result.xp.mode === "hijinkShare") return game.i18n.localize("DW.results.xpHalfValue");

    if (result.earnsXp) {
      return game.i18n.format("DW.results.xpAgainstThreshold", {
        threshold: this.#gp(result.xp.threshold)
      });
    }

    // A day's trade is not a month's income, which is a different reason for
    // earning nothing than a wage is.
    return game.i18n.localize(
      result.activity === "arbitrage" ? "DW.results.noXpArbitrage" : "DW.results.noXp"
    );
  }

  #warningText(warning) {
    switch (warning.key) {
      case "marketWillNotAbsorb":
        return game.i18n.format("DW.warn.marketWillNotAbsorb", {
          level: warning.level,
          offered: warning.offered,
          cap: warning.cap,
          market: this.#marketLabel(warning.marketClass)
        });
      case "marketTooSmall":
        return game.i18n.format("DW.warn.marketTooSmall", {
          market: this.#marketLabel(warning.marketClass)
        });
      case "workersOverLimit":
        return game.i18n.format("DW.warn.workersOverLimit", {
          employed: warning.employed,
          allowed: warning.allowed
        });
      case "noRank":
        return game.i18n.localize("DW.warn.noRank");
      case "rankTooHigh":
        return game.i18n.format("DW.warn.rankTooHigh", { maxRank: warning.maxRank });
      case "noDaysWorked":
        return game.i18n.localize("DW.warn.noDaysWorked");
      case "noMonthsWorked":
        return game.i18n.localize("DW.warn.noMonthsWorked");
      case "noWeeksWorked":
        return game.i18n.localize("DW.warn.noWeeksWorked");
      case "noQuantity":
        return game.i18n.localize("DW.warn.noQuantity");
      case "noPerpetualRows":
        return game.i18n.localize("DW.warn.noPerpetualRows");
      case "merchandiseUnavailable":
        return game.i18n.format("DW.warn.merchandiseUnavailable", {
          merchandise: this.#merchandiseLabel(warning.merchandiseId)
        });
      case "belowOneStone":
        return game.i18n.format("DW.warn.belowOneStone", {
          available: warning.available,
          days: warning.days
        });
      case "quantityCapped":
        return game.i18n.format("DW.warn.quantityCapped", {
          requested: warning.requested,
          available: warning.available
        });
      case "noStone":
        return game.i18n.localize("DW.warn.noStone");
      case "priceFloored":
        return game.i18n.format("DW.warn.priceFloored", { steps: warning.steps });
      case "ventureAtALoss":
        return game.i18n.format("DW.warn.ventureAtALoss", { income: this.#gp(warning.income) });
      case "noParticipants":
        return game.i18n.localize("DW.warn.noParticipants");
      case "noSelfParticipant":
        return game.i18n.localize("DW.warn.noSelfParticipant");
      case "noOwnership":
        return game.i18n.localize("DW.warn.noOwnership");
      case "hirelingHasNoShare":
        return game.i18n.format("DW.warn.hirelingHasNoShare", {
          name: warning.name || game.i18n.format("DW.label.participantN", { n: warning.index + 1 })
        });
      case "crewOverSlots":
        return game.i18n.format("DW.warn.crewOverSlots", {
          slots: warning.slots,
          penalty: warning.penalty
        });
      case "hijinkFailed":
        return game.i18n.localize("DW.warn.hijinkFailed");
      case "perpetratorsCaught":
        return game.i18n.format("DW.warn.perpetratorsCaught", { count: warning.count });
      case "overMaxMembers":
        return game.i18n.format("DW.warn.overMaxMembers", {
          headcount: warning.headcount,
          max: warning.max
        });
      case "ordersExceedMembers":
        return game.i18n.format("DW.warn.ordersExceedMembers", {
          ordered: warning.ordered,
          headcount: warning.headcount
        });
      case "syndicateAtALoss":
        return game.i18n.format("DW.warn.syndicateAtALoss", { income: this.#gp(warning.income) });
      default:
        return warning.key;
    }
  }

  /**
   * Adjustments the market rules made, which are not faults. Kept apart from
   * the warnings so a benefit is never rendered as a caution.
   */
  #noteText(note) {
    switch (note.key) {
      case "impactCapped":
        return game.i18n.format("DW.note.impactCapped", { from: note.from, to: note.to });
      case "impactShared":
        return game.i18n.format("DW.note.impactShared", { partySize: note.partySize, to: note.to });
      case "impactSteppedDown":
        return game.i18n.format("DW.note.impactSteppedDown", { market: this.#marketLabel(note.to) });
      case "villageFloor":
        return game.i18n.localize("DW.note.villageFloor");
      case "networkRescued":
        return game.i18n.localize("DW.note.networkRescued");
      case "networkClass":
        return game.i18n.format("DW.note.networkClass", { market: this.#marketLabel(note.to) });
      case "networkImpact":
        return game.i18n.format("DW.note.networkImpact", { to: note.to });
      case "steadyRoute":
        return game.i18n.format("DW.note.steadyRoute", { bonus: note.bonus });
      case "steadyRouteClass":
        return game.i18n.format("DW.note.steadyRouteClass", { market: this.#marketLabel(note.to) });
      case "hijinkHasNoCashValue":
        return game.i18n.format("DW.note.hijinkHasNoCashValue", {
          hijink: this.#hijinkLabel(note.hijinkId)
        });
      case "effectiveLevelCapped":
        return game.i18n.format("DW.note.effectiveLevelCapped", {
          cap: note.cap,
          market: this.#marketLabel(note.market)
        });
      case "syndicateCappedByMarket":
        return game.i18n.format("DW.note.syndicateCappedByMarket", {
          max: note.max,
          market: this.#marketLabel(note.market)
        });
      case "hideoutCouldGrow":
        return game.i18n.format("DW.note.hideoutCouldGrow", {
          byHideout: note.byHideout,
          marketCap: note.marketCap
        });
      default:
        return note.key;
    }
  }

  /** Locale-aware, so it cannot disagree with the dwGp Handlebars helper. */
  #gp(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return n.toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
  }

  #marketLabel(id) {
    const key = `DW.market.${id}`;
    return game.i18n.has?.(key) ? game.i18n.localize(key) : MARKET_CLASSES[id]?.label ?? id;
  }

  /** Labels live in the data; a translation may still override one. */
  #specialistLabel(id) {
    const key = `DW.specialist.${id}`;
    return game.i18n.has?.(key) ? game.i18n.localize(key) : SPECIALISTS[id]?.label ?? id;
  }

  /** `DW.<group>.<id>` for a fixed set of ids, which is most of the new selects. */
  #enumChoices(group, ids, selected) {
    return ids.map((id) => ({
      value: id,
      label: game.i18n.localize(`DW.${group}.${id}`),
      selected: id === selected
    }));
  }

  /** Labels live in the data; a translation may still override one. */
  #merchandiseLabel(id) {
    const key = `DW.merchandise.${id}`;
    return game.i18n.has?.(key) ? game.i18n.localize(key) : MERCHANDISE[id]?.label ?? id;
  }

  /**
   * The price, step by step, as the book walks it. Each row is one adjustment
   * with its own explanation, so the figure is never just asserted.
   */
  #priceRows(result) {
    return (result.rows ?? []).map((row) => ({
      ...row,
      label: game.i18n.format(`DW.step.${row.key}`, {
        market: row.market ? this.#marketLabel(row.market) : "",
        result: row.result ? game.i18n.localize(`DW.negotiation.${row.result}`) : ""
      }),
      signed: row.steps > 0 ? `+${row.steps}` : String(row.steps)
    }));
  }

  /** The venture's month, revenue above and expenses below. */
  #ledgerRows(state) {
    const venture = state.inputs.venture ?? {};
    const line = (group, id) => ({
      id,
      name: `inputs.venture.${group}.${id}`,
      // DOM ids are kebab-case throughout, so a camelCase line id is converted
      // rather than carried into the markup.
      inputId: `dw-venture-${kebab(id)}`,
      label: game.i18n.localize(`DW.ledger.${id}`),
      value: venture[group]?.[id] ?? 0
    });

    return {
      revenue: VENTURE_REVENUE_LINES.map((id) => line("revenue", id)),
      expenses: VENTURE_EXPENSE_LINES.map((id) => line("expenses", id))
    };
  }

  /** Who shares in the venture, and what each of them takes from it. */
  #participantRows(state, result) {
    const shares = result.xp?.shares ?? [];

    return (state.inputs.ventureParticipants ?? []).map((row, index) => ({
      ...row,
      index,
      share: shares[index] ?? null,
      roles: VENTURE_ROLES.map((id) => ({
        value: id,
        label: game.i18n.localize(`DW.role.${id}`),
        selected: id === (row?.role ?? "pc")
      }))
    }));
  }

  /**
   * The split, ready to print: a name for every row and, where the split has
   * roles at all, a localised one. A hijink crew has levels rather than roles.
   */
  #shareRows(result) {
    return (result.xp?.shares ?? []).map((share, index) => ({
      ...share,
      displayName: share.name || game.i18n.format("DW.label.participantN", { n: index + 1 }),
      roleLabel: share.role
        ? game.i18n.localize(`DW.role.${share.role}`)
        : game.i18n.format("DW.label.nthLevel", { n: share.classLevel ?? 0 }),

      // The two splits name their figures differently — a venture participant
      // has a `share` and what it `earned`, a crew member has `gold` and `xp` —
      // so they are normalised here and the templates only learn one shape.
      shareGold: share.share ?? share.gold ?? 0,
      shareXp: share.earned ?? share.xp ?? 0
    }));
  }

  /** Labels live in the data; a translation may still override one. */
  #hijinkLabel(id) {
    const key = `DW.hijink.${id}`;
    return game.i18n.has?.(key) ? game.i18n.localize(key) : HIJINKS[id]?.label ?? id;
  }

  /** The crew, each row carrying whatever the shared loot came to. */
  #crewRows(state, result) {
    const shares = result.rows ?? [];

    return (state.inputs.crew ?? []).map((row, index) => ({
      ...row,
      index,
      share: shares[index] ?? null,
      isHoncho: shares[index]?.isHoncho ?? false
    }));
  }

  /**
   * What the chosen hijink demands and pays, stated before anything is rolled:
   * the thief skill it turns on, how long each stage takes, and — where the
   * target is a person — the band of levels he may be drawn from.
   */
  #hijinkFacts(result) {
    const f = result.figures;
    const schedule = f.schedule ?? {};

    return {
      skill: game.i18n.localize(`DW.skill.${HIJINKS[f.hijinkId]?.skill ?? "listening"}`),
      plan: schedule.plan,
      perform: schedule.perform,
      layLow: schedule.layLow,
      planned: schedule.planned,
      victimBand: f.victimBand,
      cash: f.cash,
      page: HIJINKS[f.hijinkId]?.page ?? 361
    };
  }

  /** The boss's month: membership and orders above, the ledger below. */
  #syndicateRows(state, result) {
    const book = state.inputs.syndicate ?? {};
    const f = result.figures;

    // The tribute table stops at 8th level, and so does the useful part of the
    // membership roster.
    const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const tributeByLevel = new Map((f.tributeRows ?? []).map((r) => [r.level, r]));

    const line = (group, id) => ({
      id,
      name: `inputs.syndicate.${group}.${id}`,
      inputId: `dw-syn-${kebab(id)}`,
      label: game.i18n.localize(`DW.ledger.${id}`),
      value: book[group]?.[id] ?? 0
    });

    return {
      members: levels.map((level) => ({
        level,
        memberName: `inputs.syndicate.members.${level}`,
        memberId: `dw-members-${level}`,
        assignedName: `inputs.syndicate.assigned.${level}`,
        assignedId: `dw-assigned-${level}`,
        count: book.members?.[level] ?? 0,
        assigned: book.assigned?.[level] ?? 0,
        tribute: tributeByLevel.get(level)?.total ?? 0,
        capped: tributeByLevel.get(level)?.capped ?? false
      })),
      revenue: SYNDICATE_REVENUE_LINES.map((id) => line("revenue", id)),
      expenses: SYNDICATE_EXPENSE_LINES.map((id) => line("expenses", id))
    };
  }

  /** A one-line read-out of the last market roll, beside the field it filled. */
  #marketRollText() {
    const roll = this.#lastMarketRoll;
    if (!roll) return null;

    if (roll.kind === "priceRoll") {
      return game.i18n.format("DW.rollResult.priceRoll", { total: roll.total });
    }

    return game.i18n.format("DW.rollResult.reaction", {
      total: roll.total,
      outcome: game.i18n.localize(`DW.${roll.kind === "assessment" ? "assessment" : "negotiation"}.${roll.value}`)
    });
  }

  #workerRows(ladder, result) {
    const rows = result.rows ?? [];
    return rows.map((row) => ({
      ...row,
      id: `dw-workers-${row.rank}`,
      name: `inputs.workers.${row.rank}`,
      label: game.i18n.format("DW.label.workersOfRank", { label: row.label, allowed: row.allowed })
    }));
  }

  #actorChoices() {
    const actors = game.actors
      .filter((a) => a.type === "character" && a.isOwner)
      .map((a) => ({ value: a.id, label: a.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: game.i18n.localize("DW.label.noCharacter") }, ...actors];
  }

  /** The picked character, or null. */
  #actor() {
    return this.#state.actorId ? game.actors.get(this.#state.actorId) ?? null : null;
  }

  /**
   * Copy the picked character's level into the level box.
   *
   * Does nothing when the box has been unlinked, when no character is picked,
   * or when the sheet has no usable level — in each case whatever is already
   * typed stands.
   *
   * @param {object|null} [actor]  the actor to read, defaulting to the picked one
   */
  #syncLevelFromActor(actor = undefined) {
    if (!this.#state.character.levelFromActor) return;

    const level = levelFromActor(actor === undefined ? this.#actor() : actor);
    if (level === null) return;

    this.#state.character.classLevel = level;
  }

  /* ---------------------------------------------------------------- *
   * Form handling
   * ---------------------------------------------------------------- */

  /** The form state. Exposed for tests; go through the mutators elsewhere. */
  get _state() {
    return this.#state;
  }

  /**
   * Fold a flat form submission ({"inputs.daysWorked": 30, ...}) into the state.
   * Fields the current activity does not render simply keep their previous
   * values, so switching activity and back loses nothing.
   */
  _submitForm(flatData) {
    const submitted = foundry.utils.expandObject(flatData);

    for (const field of REPEAT_ROW_FIELDS) {
      if (submitted.inputs?.[field]) submitted.inputs[field] = toArray(submitted.inputs[field]);
    }

    // Read before the merge: what the level tracks is decided by comparing what
    // was submitted against what was on screen when the form was rendered.
    const previousActorId = this.#state.actorId;
    const previousLevel = this.#state.character.classLevel;
    const wasLinked = !!this.#state.character.levelFromActor;

    const merged = keepRepeatRows(
      foundry.utils.mergeObject(this.#state, submitted, { inplace: false }),
      submitted
    );

    // Changing specialist can leave a grade that belongs to the previous one.
    const grades = specialist(merged.inputs.specialistId).grades;
    if (!grades.some((g) => g.id === merged.inputs.gradeId)) {
      merged.inputs.gradeId = grades[0].id;
    }

    // Exactly one participant is "this character": a radio group only submits
    // the one that is checked, so the rest have to be cleared by hand.
    const chosen = Number(submitted.inputs?.selfParticipant);
    if (Number.isFinite(chosen)) {
      merged.inputs.ventureParticipants = merged.inputs.ventureParticipants.map((row, i) => ({
        ...row,
        isSelf: i === chosen
      }));
    }

    this.#state = merged;
    this.#reconcileLevel({ submitted, previousActorId, previousLevel, wasLinked });

    this.render();
  }

  /**
   * Decide what the level box should hold after a submission.
   *
   * Three cases, in order of precedence:
   *
   * 1. The box was typed into — the typed number wins and it unlinks. Checked
   *    against the value that was on screen, not against the actor, so typing
   *    the character's own level back in still counts as taking manual control.
   * 2. The link was just ticked back on — re-read the sheet at once, otherwise
   *    the box claims to be tracking a level it is not showing.
   * 3. The character changed while linked — follow the new one.
   */
  #reconcileLevel({ submitted, previousActorId, previousLevel, wasLinked }) {
    const character = submitted.character ?? {};

    if ("classLevel" in character && Number(character.classLevel) !== Number(previousLevel)) {
      this.#state.character.levelFromActor = false;
      return;
    }

    const relinked = this.#state.character.levelFromActor && !wasLinked;
    if (relinked || this.#state.actorId !== previousActorId) this.#syncLevelFromActor();
  }

  _applyState(partial) {
    this.#state = keepRepeatRows(
      foundry.utils.mergeObject(this.#state, partial, { inplace: false }),
      partial
    );
    this.render();
  }

  _setOverridesOpen(open) {
    this.#overridesOpen = !!open;
    this.render();
  }

  /** Add a row to one of the repeat lists. `field` comes from `data-rows`. */
  _addRow(field) {
    if (!REPEAT_ROW_FIELDS.includes(field)) return;
    this.#state.inputs[field] = [...(this.#state.inputs[field] ?? []), NEW_ROW[field]()];
    this.render();
  }

  _removeRow(field, index) {
    if (!REPEAT_ROW_FIELDS.includes(field)) return;
    const rows = [...(this.#state.inputs[field] ?? [])];
    rows.splice(index, 1);

    // Deleting the row marked as this character would leave nobody marked.
    if (field === "ventureParticipants" && rows.length && !rows.some((r) => r.isSelf)) {
      rows[0] = { ...rows[0], isSelf: true };
    }

    this.#state.inputs[field] = rows;
    this.render();
  }

  _reset() {
    const actorId = this.#state.actorId;
    this.#state = defaultState();
    this.#state.actorId = actorId;
    this.#lastResolution = null;
    this.#lastMarketRoll = null;
    this.render();
  }

  static async #onChange(event, form, formData) {
    this._submitForm(formData.object);
  }

  static async #onAddRow(event, target) {
    this._addRow(target?.dataset?.rows);
  }

  static async #onRemoveRow(event, target) {
    this._removeRow(target?.dataset?.rows, Number(target?.dataset?.index) || 0);
  }

  /**
   * Roll one of the market's own dice into the field it belongs to.
   *
   * The result is written back into an ordinary input, which the Judge can then
   * type over. That keeps `calculate` free of dice — it re-runs on every
   * keystroke, and a market that re-rolled as you typed would be useless.
   */
  static async #onRollField(event, target) {
    const field = target?.dataset?.field;
    try {
      const outcome = await rollMarketDie(field, this.#state);
      if (!outcome) return;

      this.#lastMarketRoll = outcome;
      this._applyState({ inputs: { [field]: outcome.value } });
      await postMarketRoll(outcome, this.#actor());
    } catch (error) {
      console.error(`${MODULE_ID} | could not roll ${field}`, error);
      ui.notifications?.error(game.i18n.localize("DW.notify.rollFailed"));
    }
  }

  static async #onReset() {
    this._reset();
  }

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  static async #onRoll() {
    let resolution;
    try {
      resolution = await rollActivity(this.#state, { entered: this.#state.manualTotal });
    } catch (error) {
      // A throw that cannot be rolled must say so. Left unhandled this rejects
      // inside the action dispatcher, where the only symptom is a button that
      // does nothing at all and a message in the console nobody has open.
      console.error(`${MODULE_ID} | could not roll the activity`, error);
      ui.notifications?.error(game.i18n.localize("DW.notify.rollFailed"));
      return;
    }

    if (!resolution) {
      ui.notifications?.info(game.i18n.localize("DW.notify.nothingToRoll"));
      return;
    }
    this.#lastResolution = resolution;
    this.render();
    await this.#post(resolution);
  }

  static async #onPostToChat() {
    await this.#post(this.#lastResolution);
  }

  async #post(resolution) {
    const result = calculate(this.#state);
    const actor = this.#state.actorId ? game.actors.get(this.#state.actorId) : null;

    const html = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/chat/downtime-result.hbs`,
      {
        ...this.#buildLabels(result),
        state: this.#state,
        result,
        resolution,
        actor,
        recordName: this.#state.recordName?.trim() || null
      }
    );

    await postDowntimeCard({ actor, result, resolution, html });
  }

  static async #onSave() {
    try {
      const result = calculate(this.#state);
      const actor = this.#state.actorId ? game.actors.get(this.#state.actorId) : null;
      const recordId = foundry.utils.randomID();
      const title =
        this.#state.recordName?.trim() ||
        game.i18n.format("DW.journal.untitled", {
          activity: game.i18n.localize(`DW.activity.${result.activity}`)
        });

      const html = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/journal-snapshot.hbs`,
        {
          ...this.#buildLabels(result),
          state: this.#state,
          result,
          resolution: this.#lastResolution,
          actor,
          recordId,
          title
        }
      );

      const saved = await saveRecordPage({
        actor,
        title,
        html,
        state: foundry.utils.deepClone(this.#state),
        recordId
      });

      if (!saved) return;

      ui.notifications?.info(
        game.i18n.format(
          saved.action === "created" ? "DW.notify.saved" : "DW.notify.overwritten",
          { journal: saved.entry.name, name: title }
        )
      );
    } catch (error) {
      console.error(`${MODULE_ID} | could not save the downtime record`, error);
      ui.notifications?.error(game.i18n.localize("DW.notify.saveFailed"));
    }
  }
}
