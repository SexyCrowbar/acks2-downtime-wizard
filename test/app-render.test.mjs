/**
 * Smoke tests that exercise the wizard against the real Handlebars templates
 * with just enough of Foundry stubbed to run outside the application.
 *
 * These catch the mistakes unit tests cannot: a template asking for a context
 * field the app never sets, a form submission that mangles the state, an i18n
 * key built at runtime that does not exist.
 *
 *   node --test
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Handlebars is borrowed from the installed Foundry; there are no npm deps. */
const HANDLEBARS_PATHS = [
  "C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/handlebars",
  "handlebars"
];

function loadHandlebars() {
  for (const p of HANDLEBARS_PATHS) {
    try {
      return require(p);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const Handlebars = loadHandlebars();

/* ------------------------------------------------------------------ *
 * Foundry stubs
 * ------------------------------------------------------------------ */

function setProperty(target, key, value) {
  const parts = key.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts.at(-1)] = value;
}

function deepMerge(original, other) {
  const out = Array.isArray(original) ? [...original] : { ...original };
  for (const [k, v] of Object.entries(other ?? {})) {
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      out[k] && typeof out[k] === "object" && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const localizedKeys = new Set();

function installStubs() {
  class ApplicationV2 {
    constructor(options = {}) {
      this.options = options;
    }
    async _prepareContext() {
      return {};
    }
    render() {
      this.rendered = true;
    }
  }

  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: (Base) => class extends Base {}
      },
      handlebars: { renderTemplate: async () => "" }
    },
    utils: {
      expandObject(obj) {
        const out = {};
        for (const [k, v] of Object.entries(obj)) setProperty(out, k, v);
        return out;
      },
      mergeObject(original, other) {
        return deepMerge(original, other);
      },
      deepClone: (o) => JSON.parse(JSON.stringify(o)),
      randomID: () => "id0000"
    }
  };

  globalThis.game = {
    system: { id: "acks" },
    i18n: {
      lang: "en",
      localize(key) {
        localizedKeys.add(key);
        return key;
      },
      format(key, data) {
        localizedKeys.add(key);
        return `${key} ${JSON.stringify(data)}`;
      },
      has: () => false
    },
    settings: { get: () => false },
    actors: [
      { id: "actor1", name: "Elaria", type: "character", isOwner: true,
        system: { details: { class: "Mage", level: 11 } } },
      { id: "actor2", name: "Brardi", type: "character", isOwner: true,
        system: { details: { class: "Thief", level: 4 } } },
      // A sheet with nothing filled in, which must not be read as 0th level.
      { id: "actor3", name: "Nameless", type: "character", isOwner: true,
        system: { details: { class: "", level: null } } }
    ],
    user: { can: () => true, isGM: true },
    journal: []
  };
  globalThis.game.actors.get = (id) => globalThis.game.actors.find((a) => a.id === id);

  globalThis.Handlebars = Handlebars ?? { registerHelper: () => {} };
}

// Must run before the app is imported: it destructures foundry.applications.api
// at module scope.
installStubs();

const { DowntimeApp } = await import("../scripts/apps/downtime-app.mjs");
const { ACTIVITY_TYPE_IDS } = await import("../scripts/rules/activity-types.mjs");

/* ------------------------------------------------------------------ *
 * Template plumbing
 * ------------------------------------------------------------------ */

/**
 * Count top-level elements, mirroring ApplicationV2's check that a template part
 * renders exactly one root element.
 */
function countRootElements(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const VOID = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
  ]);

  let depth = 0;
  let roots = 0;
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

  let match;
  while ((match = tag.exec(withoutComments))) {
    const [, closing, name, selfClose] = match;
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) roots++;
    if (!selfClose && !VOID.has(name.toLowerCase())) depth++;
  }
  return roots;
}

function makeHandlebars() {
  const H = Handlebars.create();
  H.registerHelper("localize", (key) => {
    if (typeof key !== "string") return "";
    localizedKeys.add(key);
    return key;
  });
  H.registerHelper("checked", (v) => (v ? "checked" : ""));
  H.registerHelper("disabled", (v) => (v ? "disabled" : ""));
  H.registerHelper("dwGp", (v) => String(Math.round((Number(v) || 0) * 100) / 100));
  H.registerHelper("dwQty", (v) => String(Math.round((Number(v) || 0) * 100) / 100));
  // Deliberately rounding, exactly as the real helper does — that is what the
  // fractional-quantity test below is checking has not been used by mistake.
  H.registerHelper("dwNum", (v) => String(Math.round(Number(v) || 0)));
  H.registerHelper("dwSigned", (v) => {
    const n = Math.round(Number(v) || 0);
    return n >= 0 ? `+${n}` : String(n);
  });
  H.registerHelper("selectOptions", function (choices, options) {
    const list = Array.isArray(choices) ? choices : [];
    const { valueAttr = "value", labelAttr = "label", selected } = options.hash ?? {};
    return new H.SafeString(
      list
        .map((c) => {
          const value = c?.[valueAttr] ?? "";
          const isSel = String(value) === String(selected) ? " selected" : "";
          return `<option value="${value}"${isSel}>${c?.[labelAttr] ?? ""}</option>`;
        })
        .join("")
    );
  });
  return H;
}

const hbs = Handlebars ? makeHandlebars() : null;
const compilePart = (file) =>
  hbs ? hbs.compile(fs.readFileSync(path.join(ROOT, file), "utf8")) : null;

const wizardTemplate = compilePart("templates/wizard.hbs");
const footerTemplate = compilePart("templates/wizard-footer.hbs");
const snapshotTemplate = compilePart("templates/journal-snapshot.hbs");
const cardTemplate = compilePart("templates/chat/downtime-result.hbs");

/** Both parts together, which is what the user actually sees. */
const renderAll = (context) => wizardTemplate(context) + footerTemplate(context);

/** Every activity, plus states that reach controls hidden behind a choice. */
const SCENARIOS = [
  ...ACTIVITY_TYPE_IDS.map((id) => [id, { activity: id }]),
  ["spellcasting in a village", {
    activity: "spellcasting",
    inputs: { castings: { 1: 3, 2: 2, 3: 2, 4: 1 }, marketClass: "VI", daysWorked: 30 }
  }],
  ["a healer billing per patient", {
    activity: "specialist",
    inputs: { specialistId: "healer", gradeId: "chirurgeonDay", quantity: 10, patients: 3 }
  }],
  ["a grand master's workshop", {
    activity: "artCraft",
    inputs: { rank: 4, workers: { 1: 8, 2: 4, 3: 2 }, months: 3 }
  }],
  ["too many subordinates", {
    activity: "profession",
    inputs: { rank: 2, workers: { 1: 10 }, months: 1 }
  }],
  ["several perpetual effects", {
    activity: "perpetualSpellcasting",
    inputs: { perpetualRows: [{ level: 3, count: 10 }, { level: 6, count: 1 }] }
  }],
  ["an overridden figure", {
    activity: "labor", inputs: { months: 4 }, overrides: { gold: 500 }
  }],
  ["a named record for a character", {
    activity: "gambling", actorId: "actor1", recordName: "Autumn in Aura",
    inputs: { ranks: 3, weeks: 4 }
  }],
  ["buying salt in a metropolis", {
    activity: "arbitrage",
    character: { classLevel: 6 },
    inputs: {
      marketClass: "I", urbanFamilies: 20000, cargoCapacity: 25600,
      merchandiseId: "salt", side: "buy", demandModifier: -3, priceRoll: -1,
      mercantileNetwork: true, steadyRoute: true, negotiation: "grudging", stone: 5000
    }
  }],
  ["selling spices into a village", {
    activity: "arbitrage",
    inputs: {
      marketClass: "VI", cargoCapacity: 25600, merchandiseId: "spices",
      side: "sell", demandModifier: 3, priceRoll: 4, stone: 1
    }
  }],
  ["a price the steps take to nothing", {
    activity: "arbitrage",
    inputs: {
      marketClass: "VI", cargoCapacity: 600, merchandiseId: "grainVegetables",
      side: "buy", demandModifier: -6, priceRoll: -6, season: "autumn", stone: 5
    }
  }],
  ["gems nobody in a village will trade", {
    activity: "arbitrage",
    inputs: { marketClass: "V", cargoCapacity: 400, merchandiseId: "gems", side: "sell", stone: 1 }
  }],
  ["the Caleför venture", {
    activity: "mercantileVenture",
    character: { classLevel: 6 },
    inputs: {
      venture: {
        revenue: { arbitrageSales: 29700, carriage: 360, passengers: 60, otherRevenue: 0 },
        expenses: {
          costOfGoods: 23750, wages: 233, rations: 47.5, tolls: 60,
          tariffs: 4750, moorage: 92, labor: 0, otherExpenses: 0
        },
        capital: 50000
      },
      ventureParticipants: [
        { name: "Caleför", role: "pc", ownership: 30000, classLevel: 6, isSelf: true },
        { name: "Foggy", role: "pc", ownership: 10000, classLevel: 1 },
        { name: "Norden", role: "henchman", ownership: 10000, classLevel: 1 }
      ]
    }
  }],
  ["a venture in the red", {
    activity: "mercantileVenture",
    inputs: {
      venture: { revenue: { carriage: 100 }, expenses: { wages: 500 }, capital: 1000 },
      ventureParticipants: [
        { name: "Sellsword", role: "hireling", ownership: 50, classLevel: 1 }
      ]
    }
  }],
  ["Viktir's crew on a stealing job", {
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
  }],
  ["a kidnapping, which needs a victim", {
    activity: "hijink",
    inputs: {
      hijinkId: "kidnapping", marketClass: "VI", victimLevel: 3,
      crew: [{ name: "Viktir", classLevel: 9, cha: 13, succeeded: true, caught: false }]
    }
  }],
  ["an arson nobody is paid for", {
    activity: "hijink",
    inputs: {
      hijinkId: "arson", marketClass: "III",
      crew: [{ name: "", classLevel: 4, cha: 10, succeeded: true, caught: false }]
    }
  }],
  ["a rushed bit of carousing that went badly", {
    activity: "hijink",
    inputs: {
      hijinkId: "carousing", marketClass: "IV", hasty: true,
      crew: [{ name: "Reingo", classLevel: 1, cha: 10, succeeded: false, caught: true }]
    }
  }],
  ["Viktir's syndicate collecting tribute", {
    activity: "syndicate",
    character: { classLevel: 9 },
    inputs: {
      marketClass: "IV",
      syndicate: {
        hideoutValue: 20000,
        members: { 0: 50, 1: 30, 2: 15, 3: 5 },
        assigned: {},
        revenue: { hijinkEarnings: 0, otherRevenue: 0 },
        expenses: { attorneys: 0, bribes: 0, fines: 0, healing: 0, otherExpenses: 0 }
      }
    }
  }],
  ["a syndicate that had a bad month in court", {
    activity: "syndicate",
    inputs: {
      marketClass: "III",
      syndicate: {
        hideoutValue: 5000,
        members: { 0: 20, 1: 10 },
        assigned: { 1: 10 },
        revenue: { hijinkEarnings: 400, otherRevenue: 0 },
        expenses: { attorneys: 100, bribes: 350, fines: 900, healing: 0, otherExpenses: 0 }
      }
    }
  }]
];

async function renderScenario(state) {
  const app = new DowntimeApp();
  app._applyState(state);
  return app._prepareContext({});
}

/* ------------------------------------------------------------------ */

test("handlebars is available for the render tests", () => {
  assert.ok(Handlebars, "could not load handlebars from Foundry's node_modules");
});

test("every ApplicationV2 part renders exactly one root element", async () => {
  const parts = Object.keys(DowntimeApp.PARTS);
  assert.deepEqual(parts.sort(), ["app", "footer"], "PARTS changed; update this test");

  const context = await renderScenario({ activity: "spellcasting" });
  for (const [name, template] of [["app", wizardTemplate], ["footer", footerTemplate]]) {
    const roots = countRootElements(template(context));
    assert.equal(roots, 1, `the ${name} part rendered ${roots} root elements`);
  }
});

test("every activity renders cleanly in all four templates", async () => {
  for (const [label, state] of SCENARIOS) {
    const context = await renderScenario(state);
    const views = {
      wizard: renderAll(context),
      snapshot: snapshotTemplate({ ...context, recordId: "id0000", title: "t" }),
      card: cardTemplate(context)
    };

    for (const [view, html] of Object.entries(views)) {
      assert.ok(html.length > 40, `${label}: ${view} rendered almost nothing`);
      for (const smell of ["undefined", "NaN", "[object Object]"]) {
        assert.ok(!html.includes(smell), `${label}: ${view} contains "${smell}"`);
      }
    }
    assert.ok(views.wizard.includes("dw-results"), `${label}: results panel missing`);
  }
});

test("switching activity and back loses nothing", async () => {
  const app = new DowntimeApp();
  app._submitForm({ "inputs.daysWorked": 12, "inputs.castings.3": 4 });
  app._submitForm({ activity: "labor", "inputs.months": 7 });
  app._submitForm({ activity: "spellcasting" });

  assert.equal(app._state.inputs.daysWorked, 12, "spellcasting inputs survived the round trip");
  assert.equal(app._state.inputs.castings[3], 4);
  assert.equal(app._state.inputs.months, 7, "and so did the labor input");
});

test("a grade left over from another specialist is corrected on submit", async () => {
  const app = new DowntimeApp();
  app._submitForm({ "inputs.specialistId": "healer", "inputs.gradeId": "chirurgeonDay" });
  // Sage has no "chirurgeonDay" grade; the stale value must not survive.
  app._submitForm({ "inputs.specialistId": "sage" });
  assert.equal(app._state.inputs.gradeId, "standard");
});

test("removing a perpetual row does not leave the old one behind", async () => {
  const app = new DowntimeApp();
  app._applyState({ inputs: { perpetualRows: [{ level: 1, count: 1 }, { level: 6, count: 9 }] } });
  app._removeRow("perpetualRows", 0);
  assert.equal(app._state.inputs.perpetualRows.length, 1);
  assert.equal(app._state.inputs.perpetualRows[0].level, 6, "mergeObject merges arrays index-wise");
});

test("removing a venture participant does not leave the old one behind", async () => {
  // The same index-wise merge, in the second repeat list. Both go through one
  // helper precisely so this cannot be true of one list and false of the other.
  const app = new DowntimeApp();
  app._applyState({
    inputs: {
      ventureParticipants: [
        { name: "Caleför", role: "pc", ownership: 60, classLevel: 6, isSelf: true },
        { name: "Foggy", role: "pc", ownership: 40, classLevel: 1 }
      ]
    }
  });

  app._removeRow("ventureParticipants", 0);
  assert.equal(app._state.inputs.ventureParticipants.length, 1);
  assert.equal(app._state.inputs.ventureParticipants[0].name, "Foggy");
  assert.equal(app._state.inputs.ventureParticipants[0].isSelf, true, "somebody must still be this character");
});

test("only one participant is ever this character", async () => {
  const app = new DowntimeApp();
  app._applyState({
    activity: "mercantileVenture",
    inputs: {
      ventureParticipants: [
        { name: "A", role: "pc", ownership: 50, classLevel: 1, isSelf: true },
        { name: "B", role: "pc", ownership: 50, classLevel: 1 }
      ]
    }
  });

  // A radio group only submits the one that is checked, so the others have to
  // be cleared by hand or two rows would claim to be the same character.
  app._submitForm({ "inputs.selfParticipant": 1 });
  assert.deepEqual(app._state.inputs.ventureParticipants.map((r) => r.isSelf), [false, true]);
});

test("adding a row only works for a list that exists", async () => {
  const app = new DowntimeApp();
  const before = app._state.inputs.ventureParticipants.length;

  app._addRow("ventureParticipants");
  assert.equal(app._state.inputs.ventureParticipants.length, before + 1);

  app._addRow("somethingElse");
  assert.equal(app._state.inputs.somethingElse, undefined, "an unknown list is not invented");
});

test("reset keeps the character but clears the work", async () => {
  const app = new DowntimeApp();
  app._applyState({ actorId: "actor1", activity: "gambling", inputs: { weeks: 40 } });
  app._reset();
  assert.equal(app._state.actorId, "actor1");
  assert.equal(app._state.activity, "spellcasting");
  assert.equal(app._state.inputs.weeks, 1);
});

test("the results panel always says something about XP, and says which kind", async () => {
  for (const [label, state] of SCENARIOS) {
    const context = await renderScenario(state);
    assert.ok(context.xpNote, `${label}: no XP note`);

    // Three different reasons, and the panel must give the right one: wage work
    // earns none, a day's trade is not a month's income, and a venture is
    // measured against a threshold.
    const expected = {
      arbitrage: "DW.results.noXpArbitrage",
      mercantileVenture: "DW.results.xpAgainstThreshold",
      syndicate: "DW.results.xpAgainstThreshold",
      // The one earner in the book that no threshold is subtracted from.
      hijink: "DW.results.xpHalfValue"
    }[context.result.activity] ?? "DW.results.noXp";

    assert.ok(context.xpNote.startsWith(expected), `${label}: expected ${expected}, got ${context.xpNote}`);
  }
});

test("a fraction of a stone is reported as a fraction, not rounded away", async () => {
  // `dwNum` rounds to a whole number, so it must never be pointed at a quantity
  // that is legitimately fractional: silk in a Class IV market is 0.2 stone a
  // day and gems in a village are 0.01, and reporting either as "0" would say
  // the opposite of what the rules mean.
  const context = await renderScenario({
    activity: "arbitrage",
    inputs: { marketClass: "IV", cargoCapacity: 1000, merchandiseId: "silk", side: "buy", stone: 1 }
  });

  assert.equal(context.result.figures.available, 0.2);

  for (const [view, html] of Object.entries({
    wizard: renderAll(context),
    snapshot: snapshotTemplate({ ...context, recordId: "id0000", title: "t" }),
    card: cardTemplate(context)
  })) {
    assert.ok(html.includes("0.2"), `${view} rounded 0.2 stone away`);
  }
});

/* ---- coverage ---- */

test("every rendered control id is lower-case kebab", async () => {
  // The scan below matches ids case-insensitively so that a camelCase id fails
  // here rather than slipping silently past the tooltip coverage check.
  const offenders = new Set();
  for (const [, state] of SCENARIOS) {
    const html = renderAll(await renderScenario(state));
    for (const m of html.matchAll(/id="(dw-[A-Za-z0-9-]+)"/g)) {
      if (m[1] !== m[1].toLowerCase()) offenders.add(m[1]);
    }
  }
  assert.deepEqual([...offenders].sort(), [], "dw- ids are kebab-case throughout");
});

test("every control that renders has a tooltip", async () => {
  const { TOOLTIPS } = await import("../scripts/tooltips.mjs");

  const rendered = new Set();
  for (const [, state] of SCENARIOS) {
    const html = renderAll(await renderScenario(state));
    for (const m of html.matchAll(/id="(dw-[A-Za-z0-9-]+)"/g)) rendered.add(m[1]);
  }

  assert.ok(rendered.size > 15, `the id scan found only ${rendered.size} controls`);

  const missing = [...rendered].filter((id) => !TOOLTIPS[id]).sort();
  assert.deepEqual(missing, [], `controls with no tooltip: ${missing.join(", ")}`);

  const orphaned = Object.keys(TOOLTIPS).filter((id) => !rendered.has(id)).sort();
  assert.deepEqual(orphaned, [], `tooltips for controls that are gone: ${orphaned.join(", ")}`);
});

test("every tooltipped control has a label pointing at it", async () => {
  const { TOOLTIPS } = await import("../scripts/tooltips.mjs");

  let html = "";
  for (const [, state] of SCENARIOS) html += renderAll(await renderScenario(state));

  for (const id of Object.keys(TOOLTIPS)) {
    if (!html.includes(`id="${id}"`)) continue;
    assert.ok(html.includes(`for="${id}"`), `${id} has no label[for] to hang a tooltip on`);
  }
});

test("no tooltip is ever written onto an input or select", () => {
  for (const file of [
    "templates/wizard.hbs", "templates/wizard-footer.hbs",
    "templates/journal-snapshot.hbs", "templates/chat/downtime-result.hbs"
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const offenders = [...source.matchAll(/<(input|select|textarea)\b[^>]*data-tooltip/g)];
    assert.equal(offenders.length, 0, `${file} puts a tooltip on a control`);
  }
});

test("every i18n key the module asks for exists in en.json", async () => {
  const lang = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/en.json"), "utf8"));

  // Render everything so runtime-composed keys are recorded.
  for (const [, state] of SCENARIOS) {
    const context = await renderScenario(state);
    renderAll(context);
    snapshotTemplate({ ...context, recordId: "id0000", title: "t" });
    cardTemplate(context);
  }

  const { TOOLTIPS } = await import("../scripts/tooltips.mjs");
  for (const key of Object.values(TOOLTIPS)) localizedKeys.add(key);

  const missing = [...localizedKeys].filter((k) => k.startsWith("DW.") && !(k in lang)).sort();
  assert.deepEqual(missing, [], `missing from en.json: ${missing.join(", ")}`);
});

test("every literal localize in the templates resolves", () => {
  const lang = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/en.json"), "utf8"));
  const missing = new Set();

  for (const file of [
    "templates/wizard.hbs", "templates/wizard-footer.hbs",
    "templates/journal-snapshot.hbs", "templates/chat/downtime-result.hbs"
  ]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of source.matchAll(/localize\s+"([^"]+)"/g)) {
      if (!(m[1] in lang)) missing.add(`${file}: ${m[1]}`);
    }
  }

  assert.deepEqual([...missing].sort(), []);
});

/* ------------------------------------------------------------------ *
 * The level taken from the character sheet
 * ------------------------------------------------------------------ */

test("opening on a character starts at that character's level", async () => {
  const app = new DowntimeApp({ actor: { id: "actor1", name: "Elaria",
    system: { details: { level: 11 } } } });

  assert.equal(app._state.character.classLevel, 11);
});

test("picking a different character re-fills the level", async () => {
  const app = new DowntimeApp();
  assert.equal(app._state.character.classLevel, 1, "the default, with nobody picked");

  app._submitForm({ actorId: "actor1" });
  assert.equal(app._state.character.classLevel, 11);

  app._submitForm({ actorId: "actor2" });
  assert.equal(app._state.character.classLevel, 4, "follows the new character");
});

test("typing over the level unlinks it and the typed number wins", async () => {
  const app = new DowntimeApp();
  app._submitForm({ actorId: "actor1" });
  assert.equal(app._state.character.levelFromActor, true);

  app._submitForm({ actorId: "actor1", "character.classLevel": 7 });
  assert.equal(app._state.character.levelFromActor, false, "taking manual control unlinks");
  assert.equal(app._state.character.classLevel, 7);

  // And a later change of character must not overwrite it.
  app._submitForm({ actorId: "actor2", "character.classLevel": 7 });
  assert.equal(app._state.character.classLevel, 7, "the Judge's number stands");
});

test("ticking the box again re-reads the sheet at once", async () => {
  const app = new DowntimeApp();
  app._submitForm({ actorId: "actor1", "character.classLevel": 7 });
  assert.equal(app._state.character.levelFromActor, false);

  app._submitForm({ actorId: "actor1", "character.classLevel": 7,
    "character.levelFromActor": true });
  assert.equal(app._state.character.classLevel, 11, "back to what the sheet says");
});

test("a sheet with no level leaves whatever is already typed", async () => {
  const app = new DowntimeApp();
  app._submitForm({ actorId: "actor3" });

  assert.equal(app._state.character.classLevel, 1, "not read as a 0th level character");
});

test("reopening a saved record keeps the level it was saved with", async () => {
  const app = new DowntimeApp({
    actor: { id: "actor1", name: "Elaria", system: { details: { level: 11 } } },
    state: { actorId: "actor1", character: { classLevel: 3 } }
  });

  assert.equal(app._state.character.classLevel, 3);
});

test("rolling a market die into a field does not disturb the level", async () => {
  // _applyState is the market-roll path; it must not look like a hand edit.
  const app = new DowntimeApp();
  app._submitForm({ actorId: "actor1" });

  app._applyState({ inputs: { priceRoll: -2 } });
  assert.equal(app._state.character.classLevel, 11);
  assert.equal(app._state.character.levelFromActor, true, "still tracking the sheet");
});

test("an overridden level is reported against what the sheet says", async () => {
  const app = new DowntimeApp();
  app._submitForm({ actorId: "actor1", "character.classLevel": 7 });

  const context = await app._prepareContext({});
  assert.equal(context.actorLevel, 11);
  assert.equal(context.levelLinked, false);
  assert.equal(context.levelDiffers, true, "the sheet's figure is shown beside the override");
});
