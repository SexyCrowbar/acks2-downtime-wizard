/**
 * Reading what the wizard is willing to take off an ACKS character sheet.
 *
 * Exactly one figure: the character's level, which the system stores at
 * `system.details.level` beside a free-text `system.details.class` (see the
 * system's own `templates/actors/v2/header-character.hbs`). Everything else the
 * wizard asks for — proficiency ranks, castings per day, a thief's skill
 * targets — the system cannot express in a form worth trusting, and guessing
 * those is what the manual-entry rule exists to prevent.
 *
 * Pure: it takes the actor object rather than reaching for `game.actors`, so it
 * runs under plain node like everything in `scripts/rules/`.
 */

const isBlank = (v) => v === null || v === undefined || v === "";

/**
 * The character's level, or null when the sheet does not give a usable one.
 *
 * Null rather than 0, and deliberately: `Number(null) === 0`, so a blank sheet
 * coerced the lazy way becomes a 0th level character whose XP threshold is
 * wrong with no sign that anything was assumed. That is `mrw-001` exactly.
 * A null tells the caller to leave whatever is already typed alone.
 *
 * @param {object|null} actor  an ACKS Actor, or anything shaped like one
 * @returns {number|null}
 */
export function levelFromActor(actor) {
  const raw = actor?.system?.details?.level;
  if (isBlank(raw)) return null;

  const level = Number(raw);
  if (!Number.isFinite(level) || level < 0) return null;

  return Math.floor(level);
}
