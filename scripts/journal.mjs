/**
 * Saves a finished calculation into the character's downtime journal: one
 * JournalEntry per character named "<character> - <label>", one page per record.
 *
 * Deliberately no folder. Foundry's Folder document inherits the base
 * `create: "ASSISTANT"` permission, which is a role gate rather than a togglable
 * user permission, so a Player can never create one whatever the world's
 * permission settings say. JournalEntry overrides that to
 * `create: "JOURNAL_CREATE"`, which players can be granted — so putting the
 * character's name into the journal's own name is what lets a player file their
 * own downtime at all.
 */

import { MODULE_ID, SETTINGS } from "./constants.mjs";

/** "Elaria - Downtime". The separator lives in DW.journal.title. */
function journalNameFor(actor) {
  const name = actor ? actor.name : game.i18n.localize("DW.journal.unattributed");
  const label = game.settings.get(MODULE_ID, SETTINGS.journalLabel) || "Downtime";
  return game.i18n.format("DW.journal.title", { name, label });
}

/**
 * Ownership so the actor's players can read their own downtime log.
 *
 * Only supplied when a GM is saving. `DocumentOwnershipField` is documented as
 * having "server-side sanitization rules [that] prevent changing ownership", so
 * a player cannot grant it — and does not need to, being the creator and
 * therefore the owner. Returning undefined leaves the field off the payload.
 */
function ownershipFor(actor) {
  if (!game.user.isGM) return undefined;

  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  if (!actor) return ownership;
  for (const [userId, level] of Object.entries(actor.ownership ?? {})) {
    if (userId === "default") continue;
    if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
  }
  return ownership;
}

/** Find or create the JournalEntry for one character. */
async function getOrCreateEntry(actor) {
  const name = journalNameFor(actor);
  const actorId = actor?.id ?? null;

  const existing =
    game.journal.find((j) => j.getFlag(MODULE_ID, "actorId") === actorId) ??
    game.journal.find((j) => j.name === name);

  if (existing) return existing;

  const ownership = ownershipFor(actor);

  return JournalEntry.create({
    name,
    // Omitted entirely rather than sent as undefined when a player is saving.
    ...(ownership ? { ownership } : {}),
    flags: { [MODULE_ID]: { actorId } }
  });
}

/**
 * Ask what to do about a page that already exists under this name.
 * @returns {Promise<"overwrite"|"cancel">} closing the dialog counts as cancel
 */
async function confirmOverwrite(title, journalName) {
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("DW.dialog.duplicate.title"), icon: "fa-solid fa-book" },
    content: `<p>${foundry.utils.escapeHTML(
      game.i18n.format("DW.dialog.duplicate.content", { name: title, journal: journalName })
    )}</p>`,
    buttons: [
      {
        action: "overwrite",
        label: game.i18n.localize("DW.dialog.duplicate.overwrite"),
        icon: "fa-solid fa-pen-to-square"
      },
      {
        action: "cancel",
        label: game.i18n.localize("DW.dialog.duplicate.cancel"),
        icon: "fa-solid fa-xmark",
        default: true
      }
    ],
    // Dismissing the dialog must not throw, and must not overwrite anything.
    rejectClose: false
  });

  return choice === "overwrite" ? "overwrite" : "cancel";
}

/**
 * Locate a saved record by the id embedded in its Reopen button.
 * @returns {JournalEntryPage|null}
 */
export function findSavedRecord(recordId) {
  if (!recordId) return null;
  for (const entry of game.journal) {
    const page = entry.pages.find((p) => p.getFlag(MODULE_ID, "recordId") === recordId);
    if (page) return page;
  }
  return null;
}

/**
 * Save a downtime record as a page in the character's journal.
 *
 * The full form state is stored alongside the rendered HTML, so the page's
 * Reopen button can load it back into the wizard exactly as it was. If a page of
 * the same name is already there, the user is asked whether to overwrite it.
 *
 * @returns {Promise<{entry: JournalEntry, action: "created"|"overwritten"}|null>}
 *          null if the user cancelled
 */
export async function saveRecordPage({ actor, title, html, state, recordId }) {
  const entry = await getOrCreateEntry(actor);
  const existing = entry.pages.find((p) => p.name === title);

  if (existing) {
    if ((await confirmOverwrite(title, entry.name)) === "cancel") return null;

    await existing.update({
      "text.content": html,
      [`flags.${MODULE_ID}.savedAt`]: Date.now(),
      [`flags.${MODULE_ID}.recordId`]: recordId,
      [`flags.${MODULE_ID}.state`]: state
    });
    return { entry, action: "overwritten" };
  }

  await entry.createEmbeddedDocuments("JournalEntryPage", [
    {
      name: title,
      type: "text",
      title: { show: true, level: 2 },
      text: { content: html, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
      flags: { [MODULE_ID]: { savedAt: Date.now(), recordId, state } }
    }
  ]);

  return { entry, action: "created" };
}
