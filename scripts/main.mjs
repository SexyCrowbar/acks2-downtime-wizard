/**
 * Module entry point: settings, Handlebars helpers, the Actor Directory button,
 * the /downtime chat command, and the delegated listener that reopens a saved
 * record from its journal page.
 */

import { MODULE_ID, SETTINGS, SYSTEM_ID } from "./constants.mjs";
import { DowntimeApp } from "./apps/downtime-app.mjs";
import { injectDirectoryButton } from "./directory-button.mjs";
import { findSavedRecord } from "./journal.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerHelpers();

  // Exposed so macros and other modules can open the wizard.
  game.modules.get(MODULE_ID).api = { DowntimeApp, open: openWizard };
});

Hooks.once("ready", () => {
  // A saved page must reopen whatever system the world is running, so this is
  // wired up before the system check below.
  registerReopenHandler();

  if (game.system.id !== SYSTEM_ID) return;
  registerChatCommand();
});

/* ------------------------------------------------------------------ *
 * Settings and helpers
 * ------------------------------------------------------------------ */

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.journalLabel, {
    name: "DW.setting.journalLabel.name",
    hint: "DW.setting.journalLabel.hint",
    scope: "world",
    config: true,
    type: String,
    default: "Downtime"
  });

  game.settings.register(MODULE_ID, SETTINGS.buttonVisibility, {
    name: "DW.setting.buttonVisibility.name",
    hint: "DW.setting.buttonVisibility.hint",
    scope: "world",
    config: true,
    type: String,
    default: "everyone",
    choices: {
      everyone: "DW.setting.buttonVisibility.everyone",
      gm: "DW.setting.buttonVisibility.gm"
    },
    requiresReload: true
  });
}

function registerHelpers() {
  /** Thousands separators, up to two decimals, dropping a trailing .0 or .00. */
  const decimal = (value) => {
    const n = Number(value) || 0;
    const rounded = Math.round(n * 100) / 100;
    return rounded.toLocaleString(game.i18n.lang, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  /** Gold. */
  Handlebars.registerHelper("dwGp", decimal);

  /**
   * A quantity that may legitimately be a fraction — stone of merchandise, or a
   * market impact of 2.5. Same formatting as gold, and a separate name because
   * `dwNum` rounds: it would report the 0.2 stone of silk a Class IV market
   * trades in a day as none at all, contradicting the warning printed beside it.
   */
  Handlebars.registerHelper("dwQty", decimal);

  /** A count that is always whole: XP, dice, subordinates. */
  Handlebars.registerHelper("dwNum", (value) =>
    Math.round(Number(value) || 0).toLocaleString(game.i18n.lang)
  );

  Handlebars.registerHelper("dwSigned", (value) => {
    const n = Math.round(Number(value) || 0);
    return n >= 0 ? `+${n}` : String(n);
  });
}

/* ------------------------------------------------------------------ *
 * Opening the wizard
 * ------------------------------------------------------------------ */

export function openWizard(options = {}) {
  return new DowntimeApp(options).render(true);
}

Hooks.on("renderActorDirectory", (app, element) => {
  if (game.system.id !== SYSTEM_ID) return;

  const visibility = game.settings.get(MODULE_ID, SETTINGS.buttonVisibility);
  if (visibility === "gm" && !game.user.isGM) return;

  // The element is an HTMLElement in v13+, but older render hooks hand over a
  // jQuery object; normalise before querying.
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  injectDirectoryButton(root, {
    label: game.i18n.localize("DW.button.label"),
    onClick: () => openWizard()
  });
});

function registerChatCommand() {
  // The ACKS system exposes its own command registry; probe for it rather than
  // assume, so a system API change cannot break init.
  const commands = game.acks?.commands;
  if (!commands?.registerCommand) return;

  try {
    commands.registerCommand({
      // The registry takes `path`/`func`/`desc` and reads `path.length` without
      // guarding it, so any other shape throws on registration rather than
      // being ignored — and the throw is invisible behind this try/catch.
      path: ["/downtime"],
      // A falsy return means "not handled", and the system answers that by
      // whispering the command's own description into chat. Say it was handled.
      func: () => {
        openWizard();
        return true;
      },
      desc: game.i18n.localize("DW.command.downtime")
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | could not register the /downtime chat command`, error);
  }
}

/**
 * One delegated listener on the document, so a Reopen button works in the
 * sidebar, in a popped-out page, or in enriched content anywhere else. Journal
 * HTML cannot carry its own handlers.
 */
function registerReopenHandler() {
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-dw-reopen]");
    if (!button) return;

    event.preventDefault();
    const page = findSavedRecord(button.dataset.dwReopen);
    if (!page) {
      ui.notifications?.warn(game.i18n.localize("DW.notify.recordNotFound"));
      return;
    }

    const state = page.getFlag(MODULE_ID, "state");
    if (!state) {
      ui.notifications?.warn(game.i18n.localize("DW.notify.recordTooOld"));
      return;
    }

    new DowntimeApp({ state: foundry.utils.deepClone(state) }).render(true);
  });
}
