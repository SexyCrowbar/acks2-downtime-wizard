# ACKS II Downtime Wizard

A Foundry VTT module for the **Adventurer Conqueror King System II** downtime work
rules — what a character earns between adventures.

Adds a **Downtime** button to the Actor Directory, alongside the Magic Research and
Construction wizards' own buttons. The wizard computes what a month of work is
worth and can file the finished record in a per-character journal.

Requires the **ACKS** game system (v14+) and Foundry VTT v13–v14.

## What it calculates

| Activity | Pages |
|---|---|
| Selling spellcasting services | 172–173 |
| Perpetual spellcasting as a service | 173 |
| Working as a specialist | 170–172 |
| Art/Craft goods | 107 |
| Profession fees | 116 |
| Performance fees | 116 |
| Labor | 113 |
| Gambling | 111 |
| Arbitrage trading | 370–377 |
| A mercantile venture's month | 423–425 |
| Hijinks, alone or with a crew | 360–368 |
| A syndicate boss's month | 360–361, 423 |

Passenger and cargo carriage and passive investment are planned; see **Roadmap**
below.

## The rule most worth knowing

**Wage work earns no campaign XP.** Campaign XP comes only from construction,
domains, hijinks, mercantile income, magic research and divine power (p. 423), so
the eight wage activities pay gold and nothing else. Every activity says which it
is in the results panel, because it is an easy thing to get wrong at the table.

Mercantile income is the exception, and it is a narrow one: it is **the venture's
whole month, net of the goods and the costs**, not a good day's trading (p. 424).
That is why arbitrage and the venture are two separate activities here. A day of
buying salt tells you what the salt cost; only the month tells you whether anyone
earned anything, and the module says so rather than letting a 750gp purchase look
like 750gp of income.

A syndicate member is the one earner in the whole book who is **not** measured
against a threshold at all: he keeps half the gp value of the hijinks he
personally pulled off (p. 423). A 1st level thief who carouses 100gp out of a
town keeps 50 XP, where 100gp of *income* would have left him 75gp short of his
threshold and earned him nothing. His boss, on the other hand, is measured the
ordinary way — so the two sides of a criminal guild are two activities here for
the same reason arbitrage and the venture are.

## Notes on the rules

- **Selling spells is capped by the market, not just by the caster.** A caster rolls
  1d6 per casting he can make in a day and sells it on a 6, but no market takes more
  than `9 − (market class + spell level)` castings of a level per day (p. 172). In a
  village that figure is zero for anything above 2nd level, and the wizard says so
  rather than quietly pricing sales that cannot happen.
- **The 1-in-6 average and the roll are both offered.** The results panel shows the
  expected income, which is what the rulebook's own worked example uses — Elaria's
  310gp/day theoretical becomes 51gp 66cp expected, 1,550gp over a month. **Roll**
  rolls the actual dice instead.
- **Subordinates are capped by rank.** A journeyman may supervise three apprentices;
  employing ten does not pay for ten. Anything over the limit is excluded from the
  total and flagged.
- **Specialist wages are what an employer pays**, which is exactly what a character
  hiring himself out earns. A master-rank proficiency is what qualifies him to do it
  — Alchemy at three ranks says so outright (p. 105), as does a master artisan (p. 107).
- **A market price is a chain of steps, not a formula**, so the wizard prints the
  chain: the 4d4−10 roll, the demand modifier, the market's size, the season, a
  steady trade route, the haggling. Caleför's salt goes 0.15 → 0.13 → 0.15 → 0.09
  → 0.07 → 0.05gp a stone exactly as the book walks it (pp. 375–376).
- **The toll is charged on cargo capacity, not on cargo carried.** A 30,000-stone
  ship pays the same 60gp whether it is full or carrying 175 stone of spices
  (pp. 372, 424).
- **Market impact rounds a half to even** — the book says so outright (p. 371), and
  that is the difference between "no market impact" and impact 1, which is exactly
  where the rules branch.
- **A venture's profit is split before anyone's threshold is applied**: half to the
  owners pro rata, half among the crew with henchmen and followers at a half share.
  Hired mercenaries and specialists get nothing. Each share is then measured against
  that person's *own* threshold, which is what stops one good month levelling up
  everybody (p. 424).
- **Merchandise bought but not yet sold is not a cost.** The book calls this out as
  its own anti-cheese rule, and the ledger says it on screen.
- **A crew's reward is the summed levels of everyone who *succeeded*, but the loot
  is split among everyone who *got away*** — two different sets, and a crew mate
  who failed his throw while nobody was caught still takes a share (p. 362).
- **If anyone is caught, everyone who missed their throw is caught too.** A hijink
  can succeed and still cost you half the crew, as the book's own example does.
- **A settlement caps the level of loot and of targets, never the throw.** A 9th
  level thief in a village still throws as a 9th level thief; he just cannot find
  anything worth more than 3rd level to steal (p. 360). The cap applies per head,
  so two 7th level thieves in a Class IV town are worth 14 levels between them.
- **A member given no orders pays tribute instead**, and the tribute table is tuned
  to make that an even trade with ordering him about — so a boss who does not want
  to roll anything can simply collect (p. 361).

## Using it

1. Click **Downtime** in the Actor Directory, or type `/downtime` in chat.
2. Pick the character. This only decides whose journal the record is filed under and
   who speaks the chat card — **nothing is read off the sheet**, so every rule input
   is entered by hand and nothing is guessed for you.
3. Pick the activity and fill it in. The results panel recalculates as you go.
4. **Roll** rolls whatever dice the activity uses and posts a chat card. Rolling
   physical dice instead? Type the total into the box beside the button and it is
   used as-is — no dice animation fires, and the card says the result was *entered,
   not rolled*.
5. **Save to Journal** appends the record as a page in that character's downtime
   journal, carrying a **Reopen** button that loads the whole form back.

Arbitrage works differently in one respect: the market's own dice sit beside the
fields they fill. The die button next to **Price roll**, **Negotiation** and
**Assessment** rolls 4d4−10 or 2d6 with your modifiers, posts it to chat, and
writes the result into the field — where you can type straight over it. The
figures never re-roll while you keep typing.

### Judge's override

The **Judge's override** box replaces the derived income outright. The rules' own
figure stays visible, struck through beside the new one, and both are written into
the journal page — so a hand-set number is never mistaken for one the rules produced.

## Settings

- **Downtime journal name** — the label that follows the character's name, so a
  journal is called "Elaria - Downtime".
- **Who sees the Downtime button** — everyone, or GM only.

## Roadmap

Ordered by size. Each lands with the test suite green.

1. ~~**Arbitrage trading** (pp. 370–377) and the mercantile venture's month
   (pp. 423–425).~~ Shipped in 0.2.0.
2. ~~**Hijinks** (pp. 360–368), including the boss-versus-member XP split
   (p. 423).~~ Shipped in 0.3.0.
3. **Passenger and cargo carriage** (pp. 378–383). Earns campaign XP, and rolls up
   into the venture ledger 0.2.0 added.
4. **Passive investment** (p. 383) — small, and notable for granting no XP (p. 424).

Beyond the roadmap, two of the book's six campaign XP sources still have no home in
any of the three ACKS2 wizards: **domain income** (pp. 338–359), which is large
enough to be a module of its own, and **divine power** (pp. 421–422), which is
small and downtime-shaped and would fit here.

## Development

The rules arithmetic lives in `scripts/rules/` as pure functions with no Foundry
globals, so it can be tested outside the application:

```bash
npm test
```

The suite asserts the worked examples printed in the rulebook — Elaria's 1,550gp
month of spellcasting, the decadent noble's ten perpetual illuminations at 1,600gp
plus 50gp, the grand master artisan's 440gp workshop, the master armorer's 160gp,
Caleför's salt at 0.05gp a stone, his venture's 30,120gp month splitting to
554.17gp and 316.67gp, his crew's 4,500gp burglary splitting 2,700 to 1,800, and
his syndicate's 1,650gp of tribute. If one fails, the calculator disagrees with
the book.

Two of the book's own sums do not reconcile, and the tests say so rather than
quietly correcting them: the cargo-only venture lists rations summing to 30gp and
totals them as 31gp, and an operator's share prints as 197.91gp where the totals it
feeds are rounded from 197.9166. The printed answers are what is asserted.

One cross-reference does not resolve either. The XP chapter cites a "Monthly Hijink
Income table in the Managing Criminal Guilds section" (p. 423); no table of that
name is printed anywhere. What it describes is the **Monthly Member Tribute** table
on p. 361, which carries a designer's note saying exactly what that sentence says
it does, and that is what the module implements. A second suite renders the real
Handlebars templates for every activity against a stubbed Foundry, which catches
template/context mismatches and missing translation keys.

Dice expressions from the book (`4d4x100`, `1d4-3`, `1d6!`) live in `tables.mjs` as
strings and are evaluated by `rules/dice.mjs` against an **injected** random source,
so tests are deterministic and the rules layer never touches Foundry's `Roll`.

### The directory button

Three ACKS wizards now want a place in the Actor Directory header and the system
offers only **two** buttons worth pairing with, so one module must fall back to a row
of its own. That is DOM work and node has no DOM, so it has a browser fixture. Serve
the **modules** directory — not this module's directory, or the sibling imports 404:

```bash
python -c "import http.server,socketserver; h=http.server.SimpleHTTPRequestHandler; h.extensions_map['.mjs']='text/javascript'; socketserver.TCPServer(('127.0.0.1',8783),h).serve_forever()"
```

Then open `http://127.0.0.1:8783/acks2-downtime-wizard/test/fixtures/directory-button.html`.
It runs every load order of whichever wizards are installed and asserts each got
exactly one button, no row swallowed another's, both system buttons survived in
different rows, and exactly one module took the fallback.

## Compatibility

Foundry VTT v13–v14, ACKS system v14+.

## Attribution

*Adventurer Conqueror King System II* is published by **Autarch LLC**. This is an
unofficial, non-commercial fan tool, not affiliated with or endorsed by Autarch.

It reproduces the numeric tables it needs in order to calculate — spell fees and
availability, specialist wages, the proficiency income ladders, market
characteristics, merchandise prices and cargo handling — because a calculator
cannot work without them. Rulebook *prose* is not reproduced: where the rules are
descriptive the module paraphrases and cites the page instead, and columns that
decide nothing (the container each merchandise ships in, say) are simply left out.

**You need the rulebook to use this.** Every figure the wizard reports cites the page
it came from, and the warnings assume you can look the rule up.
