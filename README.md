# GatherGames Website

Temporary one-page marketing site for [GatherGames](https://gathergames.io) — local-multiplayer family games for iPhone and iPad, a [Neptune Angels](https://neptuneangels.com) product.

Static site (plain HTML/CSS/JS), deployed on Vercel. Push to `main` auto-deploys.

- App source: `elmer-neptune-angels/gather` (private)

## The live page

`index.html` / `styles.css` / `script.js` are the **Warm Canvas** design, built on the iOS app's own
design system so the site and the app read as one product. Everything below is inherited from
`elmer-neptune-angels/gather`:

- **Palette** — `App/Theme/AppTheme.swift` ("Modern Data-Rich Calm"): canvas `#F7F5F1`, ink
  `#26303A`, household teal `#2F6D6A`, householdSoft `#E4EEEC`, line `#E7E3DB`.
- **Leaderboard row** — `App/Views/LeaderboardPaceRow.swift`: pace bar (fill = record ÷ that row's
  value), 4px medal stripe (gold `#C9A544`, silver `#A9B2BC`, bronze `#B3805A`), viewer row in
  householdSoft, `▲2` movement chip in positive green.
- **Metric tabs** — `LeaderboardMetric` in `App/LeaderboardPresentation.swift`: Avg Time, Points,
  Fastest, Pairs. Board splits and the `+2.1s` gap caption come from the same file.
- **Stat figures** — `docs/LEADERBOARD_STATS.md`: games played, wins/losses, best room win streak,
  and the per-game metrics actually collected.

A dark theme is derived from the same tokens (the app itself is light-only). No build step, no
external fonts or CDNs, so the page renders identically offline.

**Still open before launch:**

1. **App Store link** — search `index.html` for `AT LAUNCH`. The button's `href="#notify"` becomes
   the real App Store URL and the "In testing" / "Coming soon" pills come out. Apple's marketing
   guidelines ask for their supplied badge artwork on live pages; swap the custom button for it then.
2. **Leaderboard rows are illustrative.** Names, avatars and times in the hero board are made up.
   Replace with real standings, or a static "example board" caption, before this is a live claim.
3. **`og:image`** — no share artwork exists yet; the `TODO` in `<head>` marks where it goes.
4. **Notify** — the closer links to `mailto:info@neptuneangels.com` rather than faking a signup
   form. Swap in Formspree/Buttondown when a list exists.
5. **Game count** — the page says "45+ games", from `Sources/GatherCore/Resources/game-matrix.json`
   (45 entries, all `implemented`, 39 leaderboard-eligible). Note the `gather` README still says 37;
   worth reconciling.

## Landing page concepts

`designs/` holds four full-page concepts for the next version of the landing page. Open
`designs/index.html` to compare them side by side, or any page directly:

| Concept | File | Direction |
| --- | --- | --- |
| Back Seat | `designs/back-seat.html` | Highway signage — leads with the road trip |
| Eight Seats | `designs/eight-seats.html` | Dark, premium; hero animates seats filling in tap order |
| No Signal | `designs/no-signal.html` | Apple-product-page restraint; offline is the whole pitch |
| Deck of 37 | `designs/deck-of-37.html` | Risograph print; the 37-game collection is the hero |

Three leaderboard/stats variants of Eight Seats, in the same visual language:

| Variant | File | Where the leaderboard sits |
| --- | --- | --- |
| Podium | `designs/podium.html` | Own section below the features; ring keeps the hero |
| Top Table | `designs/top-table.html` | In the hero; ring moves to how-it-works |
| Career | `designs/career.html` | Personal stats lead; global board as context |

Leaderboard rows and stat figures in those three are **sample data**, and their stat types were
invented — superseded by the set below.

### Built on the app's design system

Three more variants of Top Table, with palette, components and stat types taken from the
`elmer-neptune-angels/gather` repo:

| Variant | File | Treatment |
| --- | --- | --- |
| Warm Canvas | `designs/warm-canvas.html` | The app's palette unchanged, light |
| Night Table | `designs/night-table.html` | Same hues inverted onto a teal-black ground |
| Leader and You | `designs/matrix.html` | Hero is the app's cross-game Game/Leader/You matrix |

What was carried over from the app, and where it came from:

- **Palette** — `App/Theme/AppTheme.swift` ("Modern Data-Rich Calm"): canvas `#F7F5F1`, ink
  `#26303A`, household teal `#2F6D6A`, householdSoft `#E4EEEC`, positive `#4E8A6C`, attention
  `#A9711F`, line `#E7E3DB`.
- **Leaderboard row** — `App/Views/LeaderboardPaceRow.swift`: the pace bar (fill = record ÷ this
  row's value), the 4px medal stripe (gold `#C9A544`, silver `#A9B2BC`, bronze `#B3805A`), the
  viewer row in householdSoft with a teal border, and the `▲2` movement chip in positive green.
- **Metric tabs** — `LeaderboardMetric` in `App/LeaderboardPresentation.swift`: Avg Time, Points,
  Fastest, Pairs. Board splits (Glyph Sprint/Classic/Master, difficulty tiers) and the `+2.1s`
  gap caption come from the same file.
- **Cross-game matrix** — the Game / Leader / You columns in `App/Views/GlobalGameLeaderboardView.swift`.
- **Stat types** — `docs/LEADERBOARD_STATS.md`: games played, wins/losses/ties, score and room
  points, round duration, current and best room win streak, plus the per-game metrics actually
  collected (Glyph guesses and daily streak, Sudoku solve time and mistakes, Memory pairs-per-flip,
  Crossplay longest word, and so on).

Night Table's pace fills use `#06A093` / `#B08D28` — saturated steps of the same teal and gold,
because the app's UI tints fall outside the legible band on a dark ground.

Each page is self-contained (no build step, no external fonts or CDNs) and carries the same
content, so picking one is a design decision rather than a copy decision.

The concept pages are kept as a record of the alternatives; they are not deployed and still say
"37 games", carry stub notify forms, and use invented stat types in the Podium/Top Table/Career
three. `Warm Canvas` is the one that shipped — see the live-page notes above.
