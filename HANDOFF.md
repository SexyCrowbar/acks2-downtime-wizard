# Handoff — ACKS II Downtime Wizard

Written 2026-08-10 at the end of Phase 1; updated 2026-08-17 at the end of Phases
2 and 4.
This document is meant to stand alone: everything needed to continue is here,
including the rules research, so none of it has to be dug out of the rulebook twice.

Read `README.md` first for what the module does from a user's side. This file is
about how it is built and what is left.

---

## 1. Where things stand

**Phases 1, 2 and 4 are complete.** Twelve activities ship. Only carriage and
passive investment do not.

| | |
|---|---|
| Version | `0.3.0` — pre-release; Phase 3 is all that is left |
| Files | 28; ~9,100 lines of `.mjs`, `.hbs`, `.json` and `.css` |
| Node tests | 136 pass (`npm test`) — 49 calculator, 34 mercantile, 35 hijinks, 18 render |
| Browser checks | 72 pass — the directory-button fixture |
| Published | **No.** Local only; no GitHub repo exists for this module yet |
| Verified in Foundry | **No.** See §7 |

Wage work, which earns gold and no XP:

`spellcasting` · `perpetualSpellcasting` · `specialist` · `artCraft` · `profession`
· `performance` · `labor` · `gambling`

Mercantile, added in Phase 2:

`arbitrage` — one market, one merchandise, one day. Earns no XP, deliberately.
`mercantileVenture` — the month's ledger and the p. 424 profit split. **Earns XP.**

Criminal, added in Phase 4:

`hijink` — one job, alone or with a crew. **Earns XP**, and is the only activity in
the module whose XP no threshold is subtracted from.
`syndicate` — the boss's month: tribute, orders, and what the courts cost. **Earns XP.**

---

## 2. Decisions already made

These were chosen deliberately with the module's owner. Don't re-litigate them
without asking.

| Decision | Why |
|---|---|
| **An activity calculator, not a month planner.** Pick an activity, fill it in, get a figure, save it. | Matches the two sibling wizards, so the whole pattern is reusable. A day-by-day planner was considered and rejected as a much larger build that would need these calculators anyway. |
| **All four activity groups are in scope**, not just the three originally named. | The owner picked everything. Phasing is how the size is managed, not scope-cutting. |
| **The module rolls the market tables**, with an override box on every rolled figure. | Faster at the table. The override is what keeps the Judge in charge. |
| **Only the character's level is read off the actor sheet** (changed 2026-08-17; it was "nothing is"). | The reasoning behind the original rule stands for everything else: the ACKS system cannot express proficiency ranks, castings per day or thief skill targets in a form worth trusting, and those are still typed by hand. `system.details.level` is a plain number the system genuinely models, so the owner asked for it to fill the level box. It is a starting point, not an authority — typing over the box unlinks it, the typed number then survives a change of character, and a tickbox re-links it. Reading anything further off the sheet needs the owner's say-so. |
| Labels for the ~22 specialists and their grades live in `tables.mjs` **data**, not `lang/en.json`. | Same call the construction wizard made for its 150-row price list — a translator should not have to carry them all before the module is usable. `#specialistLabel` checks `DW.specialist.<id>` first, so any one can still be overridden. The 29 merchandise types follow the same pattern via `#merchandiseLabel`. |
| **Arbitrage and the venture are two activities**, not one. | p. 424: mercantile income is "calculated at the end of each month for the venture as a whole", net of goods and costs. A single day's purchase is not income and cannot be measured against a threshold, so `arbitrage` reports `xpMode: "none"` and the results panel says why. Merging them would make one form serve two meanings and put a 750gp *purchase* under a heading that says Income. |
| The venture's ledger lines are **fixed and named**; only the participants repeat. | The book prints the list of costs (p. 423), so naming them keeps the ledger legible and avoids a second repeat-row array — the one piece of state that has bitten this codebase before. |
| The merchandise table's **container column is not reproduced**. | It decides nothing, and the module's attribution promise is to copy the numbers it cannot calculate without and paraphrase the rest. It also happens to be the one cell `pypdf` cannot read cleanly. |
| **The hijink and the syndicate are two activities**, for the same reason as arbitrage and the venture. | p. 423 gives a member and a boss genuinely different rules — half the value with no threshold, against income less threshold. One activity cannot report both without lying to one of them. |
| **Hijink throws are not computed.** The Judge enters what was needed, what was rolled, who made it and who was caught. | Same call as proficiency ranks: the ACKS system cannot express a character's thief skill values in a form worth trusting, and a wrong target number is worse than no target number. The module supplies the thief skill's *name*, the timing, the caught thresholds and every consequence. |
| The **Retribution by Crime** punishments are named and cited, not transcribed. | Only the fines reach the boss's ledger, which is what a calculator is for; the stocks, the brand and the executions decide a character's fate and are the Judge's business. Same call the magic research wizard made for its 180 mishap entries. |
| Tribute and wages have **no hand-entered ledger lines**. | Both are computed from the membership and assignment tables. A second field for either would silently double the figure the moment somebody filled in both — the shape of `cw-001`, where a warning said a value was not counted and it was. |

---

## 3. Architecture and the invariants to preserve

Cloned from `acks2-construction-wizard`, which is the better-organised of the two
siblings. Keep these or the tests break, sometimes silently:

- **`scripts/rules/` is pure.** No `game`, `ui`, `foundry`, `Roll`, `Handlebars`.
  That is what lets `test/calculator.test.mjs` run under plain node with no stubs at
  all. If a new rule needs randomness, inject it — see `dice.mjs`.
- **`calculate(state)` is deterministic.** It reports what an activity is *expected*
  to earn. The form re-renders on every keystroke, so anything that rolls dice inside
  it would re-roll as you type. Rolling lives in `rollIncome` / `rollCompetition`
  (pure, injected rng) and `resolve.mjs` (real Foundry `Roll` objects).
- **No dice pool goes into a single `DiceTerm`.** Foundry throws above 999 dice per term
  and does not truncate, and both pools here are products of free-typed inputs. Build
  every formula through `pooledFormula()` in `resolve.mjs`, and keep the modifier on
  every term — dropping it from the tail terms gives a wrong total rather than an error.
  Wrap roll actions in try/catch: an unhandled rejection in an ApplicationV2 action shows
  the user an inert button and nothing else. See `dw-005`.
- **`PARTS` is exactly two templates, one root element each.** ApplicationV2 throws
  *"Template part must render a single HTML element"*. That is why the footer is a
  separate file. Both panes need `scrollable` or they jump to the top on every change.
- **Blank is not zero.** `FormDataExtended` sends `null` for a cleared number input
  and `""` for a cleared text input, and `Number(null) === 0`. `isBlank` exists in
  `calculator.mjs` and `resolve.mjs`; use it before coercing. Blank overrides mean
  "use the derived figure".
- **Arrays are reassigned after `mergeObject`.** Merge is index-wise, so a removed
  repeat row would otherwise survive. There are now three such lists, and they go
  through **one** helper: add the field to `REPEAT_ROW_FIELDS` in `downtime-app.mjs`,
  give it an entry in `NEW_ROW`, and `keepRepeatRows` covers the constructor,
  `_submitForm` and `_applyState` at once. Add a test like *"removing a venture
  participant does not leave the old one behind"* — one per list, because that is
  exactly the invariant the shared helper exists to keep true of both.
- **`xpMode` is the single declared source of how an activity earns XP.** There is no
  `earnsXp` property any more; `earnsXp()` reads `xpMode`, and `calculate` dispatches
  its whole XP calculation on one `switch`. There are four modes now — `none`,
  `threshold`, `mercantileSplit` and `hijinkShare` — and a fifth would be another
  case and nothing else. A test asserts no record carries an `earnsXp` field, so the
  declared mode and the computed answer cannot drift apart.
- **`calculate` returns `notes` as well as `warnings`.** A market traded as a smaller
  one, or a reputation worth an extra point of impact, is something the reader must
  see but is not a fault; rendering it in the warning colour would read as a problem.
- **`earn(inputs, { classLevel })`** — the second argument is how the character's own
  level reaches the rules layer, so arbitrage's steady-route bonus does not need the
  level asked for twice on one form. Existing records ignore it.
- **DOM ids are lower-case kebab, without exception.** A test scans the rendered
  markup case-insensitively and fails on a camelCase id — before Phase 2 the tooltip
  coverage scan matched lower-case only, so a camelCase id would have shipped with no
  tooltip and no failure.
- **Compose i18n keys in JS, never in Handlebars.** Foundry ships no `concat` helper.
  `DW.activity.<id>`, `DW.warn.<key>` and friends are all resolved in
  `_prepareContext` / `#buildLabels` / `#warningText`.
- **Tooltips go on labels, never on controls**, and every rendered `id="dw-*"` must
  appear in `tooltips.mjs`. Three tests enforce this in both directions, so a field
  cannot ship undocumented and a stale entry cannot linger.
- **`lang/en.json` is flat dotted keys** (`"DW.label.foo"`), matching the construction
  wizard rather than the magic research wizard's nested shape. The coverage tests
  assume flat.
- **No folder for journals.** `Folder` inherits `create: "ASSISTANT"`, a role gate no
  world setting opens, so a player could never file their own log. The character's name
  goes in the journal's own name. Ownership is only set when a GM saves.

### Naming, if you add anything

`dw-` for DOM and CSS, `DW.` for i18n, without exception. Module id
`acks2-downtime-wizard`, window id `acks2-downtime`, classes
`["acks2", "downtime-app"]` — keep `"acks2"`, it is what makes controls inherit the
system's styling. Helpers `dwGp` / `dwNum` / `dwSigned`. Reopen attribute
`data-dw-reopen`.

---

## 4. Rules research already done

The source is the **ACKS II Revised Rulebook** PDF. **PDF page = printed page + 2**
(printed 388 is PDF 390). `pypdf` page-by-page extraction preserves the two-column
reading order for this document; `pdftotext -layout` interleaves the columns on
table-heavy pages. All page numbers below and in the code are **printed** numbers.

**The canonical list of downtime activities is printed p. 333, "Activities During the
Campaign"** — around 30 ancillary and 35 dedicated activities, each with its own page
cite. That page is the spine for deciding what else could ever belong here.

### The rule that shapes everything

**Campaign XP comes only from construction, domains, hijinks, mercantile income,
magic research and divine power (p. 423).** Wage work pays gold and nothing else.
Passive investment explicitly grants none either (p. 424). Every activity record
carries `earnsXp`, the results panel states it either way, and a test asserts no
Phase 1 activity claims any. Keep that test honest as XP-earning activities land.

### Findings that are easy to get wrong

- **Selling spells is capped by the market, not only by the caster.** The caster rolls
  1d6 per casting he can make in a day and sells on a 6, *and* no market absorbs more
  than `9 − (market class + spell level)` castings of a level per day (p. 172). The
  familiar "one in six" is the average of that roll, not a separate rule. Market
  classes are I = 1 through VI = 6. Elaria's worked example only reaches its full
  310gp/day because her spread happens to fit a Class IV market.
- **The availability table (p. 172) is what a *buyer* rolls.** It sizes the
  competition; it does not reduce the seller's income. It is reported as context only.
  Dashes in the book mean no caster of that level is there at all — modelled as `null`,
  and expressions like `1d4-3` need clamping at 0.
- **Trade ladders share one shape.** Art/Craft (p. 107), Profession and Performance
  (p. 116): own monthly figure, plus subordinates each earning their own rank's figure
  raised by 50%, capped by what the rank may supervise. Art/Craft has 4 ranks, the
  other two have 3. The book's own check figure is the grand master artisan's 440gp.
- **Specialist wages are what an *employer* pays**, which is what a character hiring
  himself out earns (pp. 170–172). A master-rank proficiency is what qualifies him —
  Alchemy at 3 ranks says so (p. 105), as does a master artisan (p. 107).
- **Labor does not improve with ranks.** The book says so outright (p. 113). It is the
  only ladder that does not.

### Findings from Phase 2 (pp. 370–377, 423–425)

- **Market impact rounds a half to *even*** (p. 371) — `Math.round` is half-up, and
  the difference lands exactly on the "no market impact" branch. `roundHalfToEven` in
  `mercantile.mjs` exists for that one sentence.
- **The toll is charged on cargo capacity, not cargo carried.** The p. 424 venture
  pays 60gp on a 30,000st ship holding 175st of goods. The tariff, separately, is 20%
  of precious and 5% of common goods *brought in to sell*, and nothing on grain.
- **Neither the market step-down nor the Mercantile Network changes tolls.** Both are
  "for mercantile purposes"; `tollAndTariff` therefore takes the market the character
  walked into, never `effectiveClass`.
- **"Whichever is more beneficial" is merchandise-dependent.** A network's choice
  between one class higher and one more point of impact depends on the table's own
  ratios — grain quadruples between Class IV and III but salt only doubles, so salt
  ties and grain does not. `resolveMarketImpact` compares actual stone; a tie takes
  the extra impact, which is also what happens in Class I where there is no higher class.
- **A step "in the arbitrager's favour" changes sign with the side.** Down when
  buying, up when selling. Steady routes, negotiations and exhaustion all use it, and
  exhaustion uses it inverted.
- **The book prints no price floor and needs one.** Grain fourteen steps down is worth
  −0.02gp. The calculator holds at one price step and raises `priceFloored`, which
  says outright that the rules print no floor and the Judge should set one.
- **Hired mercenaries and specialists get no share of profit**, so ownership typed
  against a hireling is *not* counted — and the warning that says so is matched by the
  behaviour, per `cw-001`.
- **Two of the book's own sums do not reconcile**, and the tests assert the printed
  answers with the discrepancy written down beside them: the cargo-only venture's
  rations sum to 30gp but are totalled as 31gp (and the 780gp income depends on 31),
  and an operator's share prints as 197.91gp while the totals it feeds are correctly
  rounded from 197.9166. Same shape as the construction chapter's truncated durations.
- **The cargo handling table regenerates from `stone / workRate / crew`** at eight
  hours to the day, and the fee is one copper per hour of work — except the donkey and
  the mule, whose fees the book rounds down. Both facts are tests.

### Findings from Phase 4 (pp. 360-368, 423)

- **A member's XP is not income minus threshold.** He keeps 50% of the gp value of
  what he pulled off, full stop (p. 423). It is the only earning rule in the book
  that ignores the threshold, and the results panel says so outright because every
  neighbouring rule works the other way.
- **The book's own sanity check reproduces**: 3d12 × 5gp at 1st level averages
  97.5gp, half of which is 48.75 — the "average of 50 XP per month" p. 423 quotes.
- **"Monthly Hijink Income table" does not exist.** p. 423 cites it in the Managing
  Criminal Guilds section; no table of that name is printed anywhere in the book.
  It means the **Monthly Member Tribute** table on p. 361, whose designer's note
  describes precisely what that sentence describes. Implemented against the real one.
- **The Henchmen Monthly Wage table does not double.** It runs 12, 25, 50, 100, 200,
  400, 800, 1,600, then **3,000** and **7,250** — not 3,200 and 6,400. The hijink fee
  is defined in terms of it, so an assumption here is an assumption about every
  boss's wage bill. A test pins the awkward rows.
- **Two different sets of people matter in a crew.** The reward scales with the summed
  levels of those who *succeeded*; the split is among those who *got away*. They
  coincide whenever anyone is caught (because a catch takes down every failure with
  it) and differ when nobody is.
- **The effective-level ceiling is per perpetrator, not per crew.** Two 7th level
  thieves in a Class IV town are worth 14 levels of loot between them; one 14th level
  thief alone is worth 7.
- **A 0th level victim is worth half a level** of bounty or ransom, and a 0th level
  *perpetrator* counts as 1st for reward. Two different clauses, opposite directions.
- **Hasty hijinks forgive rather than punish**: the botch is re-thrown and only a
  second failure is an arrest. Hasty carousing has no gp figure at all — it buys a
  rumour with a one-in-four chance of being true.

---

## 5. What is left, in order

Each phase should land with `npm test` green. Add one record to
`scripts/rules/activity-types.mjs` and its tables to `scripts/rules/tables.mjs`.

### ~~Phase 2 — Arbitrage trading~~ · done in 0.2.0

Shipped as two activities (see §2) with the tables in `tables.mjs` and the arithmetic
in the new `scripts/rules/mercantile.mjs`.

### Phase 3 — Carriage and passive investment (pp. 378–383)

Passenger and cargo carriage (pp. 378–383) earns XP; **passive investment (p. 383)
does not** (p. 424). Carriage needs the random-merchandise table (p. 380) and the
destination/route/departure rules (p. 379).

Most of the groundwork is already in place: `MARKET_CLASSES` carries
`baselineConsignments` and `passengerDice` for every class, `MOORAGE` and
`CARGO_HANDLING` are loaded, and carriage income rolls up into the venture ledger's
`carriage` and `passengers` lines rather than needing a ledger of its own. The p. 424
cargo-only variant (780gp, 3.8%) is already a passing test against that ledger. What
is missing is the fare arithmetic — the book computes it as `rate / 480 × miles ×
quantity`, at 1gp per passenger and 1.25cp per stone.

Passive investment is small and its whole point is that it grants no XP, so it is an
`xpMode: "none"` record.

### ~~Phase 4 — Hijinks~~ · done in 0.3.0

Shipped as two activities (see §2), with the tables in `tables.mjs` and the
arithmetic in `scripts/rules/hijinks.mjs`.

**What was deliberately left out**, with the owner's agreement: the Crime and
Punishment 2d6 and its eight modifiers (bribery tiers, attorney ranks, evidence,
interpleader, prior crimes, severity), and the corporal punishments beside the fines.
The fines themselves *are* implemented, because the boss pays them. Also out: the
military and political variants of each hijink (arson against a stronghold, spying on
a senator), which belong to the campaign and siege chapters rather than to income;
Change in Management (p. 369); and the criminal-guild/underboss layer (p. 370), which
is a management structure rather than an earning rule.

### Worked examples

This project's correctness bar is the rulebook's own printed examples, never invented
cases. Those below are **already asserted** by the suite:

| Example | Expected | Page |
|---|---|---|
| Caleför's toll at Alakyrum | 25,600st × 0.2cp = 51.2gp | 372 |
| Caleför's salt price chain | 0.15 → 0.13 → 0.15 → 0.09 → 0.07 → 0.05gp/st | 375–376 |
| Caleför's salt quantity | impact 1 → 2 → 5, 5,000st a day, 250gp | 371, 375 |
| The oasis | impact 171 capped to 10 | 371 |
| Viktir's small fleet | Class II at impact 0 → trades as Class III at impact 1 | 371 |
| Caleför/Foggy/Norden venture | revenue 30,120gp, expenses 28,932.5gp, income 1,187.5gp | 424 |
| …its XP split | Caleför 554.17gp, Foggy and Norden 316.67gp each | 424 |
| Cargo-only variant | income 780gp, 3.8% monthly return | 424 |
| Caleför's 4 stone of ivory | cost of goods 400gp → 200gp mercantile income | 425 |
| Cargo handling table | every row regenerates from stone ÷ rate ÷ crew | 377 |
| 1st level member carousing | 97.5gp to the boss, ~50 XP to him | 423 |
| Viktir's crew stealing | 4,500gp, split 2,700 to Viktir and 1,800 to Gordon | 363 |
| …and its arrests | Reingo caught, so Bingo is caught too; neither shares | 363 |
| Viktir's tribute month | 1,650gp from 100 members, and no XP at 9th level | 361 |
| Viktir's hideout | 10,000gp → 50 members, 20,000gp → 100, 75,000gp → still 100 | 360 |
| Viktir kidnapping in a village | capped to 3rd level, so victims of 1st to 5th | 360 |
| Reingo's theft | fined 150gp pleading guilty, 300gp on the second offence | 367 |
| Henchman wages | 12/25/50/100/200/400/800/1,600/**3,000**/**7,250** | 168 |

---

## 6. The directory button — read before touching it

The ACKS system offers exactly **two** claimable header buttons (Mortal Wounds,
Tampering). There are now **three** wizards, so **this module always lands on the
unpaired `width: 45%` fallback** when both siblings are installed. That is the normal
path here, not an edge case.

Two mechanisms keep the three from fighting, and both matter:

1. **Wrapping is the handshake.** A claimed system button gets moved inside a
   `div.<prefix>-button-row`, so it stops being a `BUTTON` sibling and the next
   module's walk steps past it. This is what makes load order irrelevant.
2. **Class skipping covers the fallback**, where a module's own button ends up a bare
   sibling. `scripts/directory-button.mjs` skips `.dw-`, `.cw-` and
   `.mrw-directory-button` **explicitly by class** as well as
   `[data-acks2-module-button]`. The magic research wizard predates the data attribute
   and does not stamp it, so dropping its class from that list would let this module
   steal its button.

`test/fixtures/directory-button.html` runs every load order of whichever wizards are
served — 72 checks — and asserts each got exactly one button, no row swallowed
another's, both system buttons survived in different parents, and exactly one module
took the fallback. **Serve the `modules` directory, not this module's directory**, or
the sibling imports 404 and the fixture silently skips them.

---

## 7. How to verify

```bash
npm test
```

94 checks across three files: `calculator.test.mjs` (the activities and the XP),
`mercantile.test.mjs` (the market rules), `hijinks.test.mjs` (crews, tribute and the
courts), `app-render.test.mjs` (the templates, the tooltip coverage and the i18n
coverage). Every figure in §5's table must reproduce
exactly; a failure means the calculator disagrees with the book.

Reading the rulebook again? `pypdf` needs `PYTHONIOENCODING=utf-8` on this machine or
it dies on the ligatures, and the `Read` tool cannot open the PDF at all without
poppler installed.

Browser fixture — Node has no DOM:

```bash
python -c "import http.server,socketserver; h=http.server.SimpleHTTPRequestHandler; h.extensions_map['.mjs']='text/javascript'; socketserver.TCPServer(('127.0.0.1',8783),h).serve_forever()"
```

then open
`http://127.0.0.1:8783/acks2-downtime-wizard/test/fixtures/directory-button.html`.
`window.__result` is `{total, failed, skipped}` for automation. Remember to stop the
server afterwards.

**Live in Foundry — still outstanding.** Foundry Desktop serves `localhost:30000` but
sits behind an admin-password gate with no world active, so it cannot be driven
headlessly. Someone with the world open should confirm:

- the Downtime button appears in the Actor Directory on its own row below the other
  two modules' buttons, at the same width, not overlapping;
- each activity renders only its own inputs, and switching activity and back loses
  nothing;
- rolled figures show their override boxes, and an entered total is reported as
  *entered, not rolled*;
- **Save to Journal** → **Reopen** round-trips the whole form;
- a player (not just the GM) can save, and sees their own journal.

Phases 2 and 4 add to that list, all of them things node cannot check:

- the die buttons beside **Price roll**, **Negotiation** and **Assessment** fill their
  own field, post a card, and do **not** re-roll as you keep typing;
- switching to another activity and back preserves the venture's participant rows;
- the *This one* radio moves between participant rows and only ever marks one;
- the arbitrage form is four fieldsets tall and the syndicate's membership table is
  nine rows of paired number boxes — check both in a short window, where the
  `@container` rules and the `min-width: 0` field wrappers are what stop them
  overflowing (see `cw-003`, `cw-004`);
- a crew row's two checkboxes (made it / caught) submit and re-render correctly, and
  adding a perpetrator does not disturb the rows already filled in.

---

## 8. Publishing, when the time comes

Not published yet. The two siblings live in GitHub repos under the same account and
release manually — no CI. Their shape, for when this one follows:

- a 27-file zip rooted at a correctly-named module directory, plus a standalone
  `module.json`, both attached to a tag named for the version;
- `module.json`'s `download` URL is pinned to the tag, so it must be bumped in the same
  commit as `version`;
- the deployed copy under `Data/modules/` is **not** a git checkout. Work from a fresh
  clone, copy tracked files across, and bump the version in *both* copies so Foundry
  does not offer an update it already has.

---

## 9. Related notes elsewhere

- `.wolf/anatomy.md` — file map for this module and both siblings
- `.wolf/cerebrum.md` — conventions and corrections, including the counts-as
  proficiency rule and the "homebrew ships behind a setting, default off" rule
- `.wolf/buglog.json` — `mrw-007` and `mrw-008` are both instances of one rulebook
  clause implemented across several call sites and drifting apart. Phase 2's XP
  arithmetic was written against that lesson: `campaignXp` is the only place a
  threshold is subtracted, `mercantileSplit` calls it once per share, and `buildXp`
  is the only place either is reached from. Hijinks in Phase 4 has the same shape and
  should route through `buildXp` too, as two more `xpMode` values.
