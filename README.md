# GatherGames Website

Temporary one-page marketing site for [GatherGames](https://gathergames.io) — local-multiplayer family games for iPhone and iPad, a [Neptune Angels](https://neptuneangels.com) product.

Static site (plain HTML/CSS/JS), deployed on Vercel. Push to `main` auto-deploys.

- App source: `elmer-neptune-angels/gather` (private)
- Style mirrors `elmer-neptune-angels/neptune-angels-website`

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

Before going live with whichever wins:

1. **App Store link** — search each file for `AT LAUNCH`. The button's `href="#notify"` becomes the
   real App Store URL, and the "Coming soon" marker next to it comes out.
2. **Apple badge** — the buttons are custom-styled. Apple's marketing guidelines ask for their
   supplied badge artwork on live pages; swap it in at that point.
3. **Notify form** — the email capture is a stub that only updates its own button. Point it at a
   real list (Formspree, Buttondown, ConvertKit) before shipping.
4. **Game titles** — `Deck of 37` and `Back Seat` show the five known titles and render the rest as
   placeholders. Search for `TODO` to drop in the full list.
5. **Stats** — Podium/Top Table/Career use invented stat types; the three app-system variants use
   real ones from `docs/LEADERBOARD_STATS.md`. Prefer the latter.
6. **Game count** — every page says "37 games", matching this repo and the `gather` README. But
   `Sources/GatherCore/Resources/game-matrix.json` lists **45** games, all flagged `implemented`,
   39 of them leaderboard-eligible. Confirm the real number before launch; it appears in the hero,
   the feature cards and the meta description.
7. **Typography** — the pages use system font stacks so they load instantly and render identically
   offline. If you want more character, `Back Seat` and `Deck of 37` are the two that would gain
   most from a licensed display face.
