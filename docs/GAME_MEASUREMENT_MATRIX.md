# Live games × what we measure — a study

**As of 2026-09-17.** Source of truth is `elmer-neptune-angels/gather` @ `81c1905`
(`Sources/GatherCore/Resources/game-matrix.json`, `App/LeaderboardPresentation.swift`,
`App/Views/GlobalGameLeaderboardView.swift`, `portal/src/lib/leaderboard-ranking.ts`,
`portal/supabase/migrations/034_ranking_union.sql`).

This is a read-only audit: nothing here changes behaviour. The point is to see what
each live game is actually ranked on today, and which measurement a player meets
first, before deciding what should move to time / points / success.

---

## 1. Scope: what "live" means

`game-matrix.json` holds **38 games**. `availability` splits them:

| | Count | Notes |
| --- | --- | --- |
| `launch` (live) | **30** | Listed in every UI surface |
| `held` | 8 | Engines intact, no UI surface (PRODUCT_MODEL §5.2) |

Of the 30 live games, **28 are `leaderboardEligible`**. Two are deliberately
unranked and measure participation only:

- **Would You Rather** — no winner by design.
- **Doodle Telephone** — cooperative; activity counters (chains, drawings) sync to
  `/api/activity`, nothing ranks.

The 8 held games (20 Questions, Story Circle, Trivia Battle, Werewolf/Mafia, Odd Word
Out, Lettercurrent, Cluebraid, Rungshift) still record metrics but appear on no
dashboard, so they are out of scope below.

> Housekeeping: this repo's `README.md` still says "45+ games" / "45 entries, 39
> leaderboard-eligible" and the concept pages say "37". The real numbers are 38 / 30
> live / 28 eligible. Worth reconciling separately.

---

## 2. The dashboards a measurement can appear on

Five distinct surfaces, each with its own default. "First measurement that shows up"
depends on which one you open.

| # | Surface | Code | Opens on | Games |
| --- | --- | --- | --- | --- |
| 1 | **Leaderboard hub** | `GlobalGameLeaderboardView` | **Daily** mode | 11 daily / 28 global |
| 2 | Global board (per game) | `GlobalGameLeaderboardDetail` | **Avg Time** | 28 |
| 3 | Fastest board | `/api/game/fastest` | — (a tab on #2) | 9 |
| 4 | Daily sheet | `DailyLeaderboardView` | **Today** | 11 |
| 5 | Room board | `RoomLeaderboardDetailView` | **Points** | all, in-room |

Two things follow from #1 and #2 that matter for this study:

- **From Home, the hub opens on Daily** (`GlobalGameLeaderboardView.init`: the plain
  entry point seeds `hubMode = .daily`; only a deep link from inside a game seeds
  `.global`). So the first measurement most players meet is *the day's own
  game-specific number*, and 17 of the 28 ranked games are not on that screen at all.
- **Every global board defaults to Avg Time.** `@State private var metric = .averageTime`
  in the hub, `initialRanking: LeaderboardMetric.averageTime.rawValue` in the detail
  init, and `?? "average_time"` in the portal route. There is no per-game default
  metric anywhere in the codebase — the default is global and uniform.

The global board also defaults to **20+ games played** (`qualifiedOnly = true` →
`minimum_games=20`), so a new game's default board reads empty for a long time.

---

## 3. The matrix

**Ranking tabs** are `GlobalGameLeaderboardDetail.availableMetrics`. Avg Time and
Points are offered for all 28; the other three are gated per game. **Default** is the
leftmost tab, always Avg Time. **Default board** is `LeaderboardPresentation.defaultQuery`.

`○` = tab not offered. `●` = offered.

| Game | Default board | Avg Time | Points | Fastest | Pairs | Acc | Tri | Daily / Weekly / Streak | What the *default* tab actually ranks |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| Road trip bingo | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| License plate search | standard | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Car color count | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Trivia | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Scavenger hunt | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Draw & guess | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| **Flip & Find** (memory) | most-played diff. | ● | ● | ○ | ● | ○ | ○ | ✓ / ✓ / ✓ | shared room wall clock |
| High-low card guessing | standard | ● | ● | ○ | ○ | ● | ○ | — | shared room wall clock |
| **Spot the difference** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own completion clock (completed only) |
| Melody Mystery | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Categories | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Two Truths and a Lie | standard | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Emoji decode | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Charades relay | most-played diff. | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Majority rules | standard | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| Mystery Face | standard | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| **Letter Rack** (countdown) | standard | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | match wall clock, **won matches only** |
| Prediction bets | standard | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| **Crossword** | Solo 5×5 | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock + penalties |
| **Glyph** | Sprint · 4 | ● | ● | ○ | ○ | ○ | ○ | ✓ / ✓ / ✓ | shared room wall clock |
| Headline (clue-crown) | Forehead | ● | ● | ○ | ○ | ○ | ○ | — | shared room wall clock |
| **Triangle Gather** | Random die | ● | ● | ○ | ○ | ○ | ● | — | shared room wall clock |
| **Sudoku** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, completed only |
| **Twin Balance** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, won *or* completed |
| **Waythread** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, won *or* completed |
| **Rectosaic** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, won *or* completed |
| **Crownlock** | most-played diff. | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, won *or* completed |
| **Geode** | Medium tier | ● | ● | ● | ○ | ○ | ○ | ✓ / ✓ / ✓ | own engine clock, solved runs |
| *Would You Rather* | — | ○ | ○ | ○ | ○ | ○ | ○ | — | not ranked |
| *Doodle telephone* | — | ○ | ○ | ○ | ○ | ○ | ○ | — | not ranked (activity counters only) |

"most-played diff." = defaults to `medium` but resolves to the player's most-played
difficulty when a player ID is attached (`prefersMostPlayedDifficulty`); the board
shows "Defaults to your most-played difficulty".

### Daily boards (surface #4) — where the measurement *is* per-game

The 11 Daily games are the only place the app already varies the measurement by
game. `LeaderboardPresentation.dailyValue` decides:

| Daily game | Today's number | Weekly rollup |
| --- | --- | --- |
| Geode | solve clock (centiseconds) | combined clock |
| Glyph | **guesses used** | total guesses over solved days |
| Letter Rack | **points** | total points |
| Crossword | solve clock (centiseconds) | combined clock |
| Flip & Find | **pairs / flips + rate** | weekly pairs-per-flip rate |
| Spot the difference | solve clock | combined clock |
| Sudoku | solve clock (whole seconds) | combined clock |
| Twin Balance, Waythread, Rectosaic, Crownlock | solve clock (centiseconds) | combined clock |

All 11 also get a server-computed **Streaks** board (current + longest run of
successful days, `gather_daily_streaks`), and My Stats charts a device-local 12-week
history of the same number.

---

## 4. Everything each game records that no dashboard ranks

Every game already writes a metrics payload through the common result envelope
(`AppModel.recordRankedResultIfNeeded`). Most of it is never used for a ranking —
this is the raw material available if a game's measurement should change.

| Game | Recorded per round | Natural measurement it suggests |
| --- | --- | --- |
| Road trip bingo | `squares`, `board_complete`, `shared` | success (boards completed) |
| License plate search | `plates`, `trip_pct` | points / success |
| Car color count | `cars`, `target` | points |
| Trivia | `correct`, `attempts`, `questions` | **accuracy** |
| Scavenger hunt | `items_found`, `list_size` | **accuracy** / success |
| Draw & guess | `artist_success`, `artist_rounds`, `guessed` | **accuracy** (artist rate) |
| Flip & Find | `pairs`, `cards_flipped` | already has Pairs tab — not the default |
| High-low | `correct`, `attempts` | already has Accuracy tab — not the default |
| Melody Mystery | `actor_success`, `actor_rounds`, `guessed` | **accuracy** |
| Categories | `valid_answers`, `answers_submitted` | **accuracy** / points |
| Two Truths and a Lie | `lies_caught`, `votes_cast`, `fooled_guessers`, `storyteller_rounds` | **accuracy**, both roles |
| Emoji decode | `correct`, `attempts`, `reader_rounds` | **accuracy** |
| Charades relay | `actor_success`, `actor_rounds`, `guessed` | **accuracy** |
| Majority rules | `majority_matches`, `rounds_voted` | **accuracy** (read-the-room rate) |
| Mystery Face | `guessed_it`, `missed_guess`, `cracked` | **success rate** |
| Letter Rack | `score` | points (already the Daily number) |
| Prediction bets | `bets_correct`, `bets_placed`, `bets_authored` | **accuracy** |
| Crossword | `hints`, `penalty_seconds`, `grid_size` | time (correct today) |
| Glyph | `guesses`, `solved` | **average guesses** — see §5 |
| Headline | `cards`, `passes`, `turn_seconds`, `team_win` | **rate** (cards per minute) |
| Triangle Gather | `triangles` | already has Triangles tab — not the default |
| Sudoku | `completed`, `mistakes`, `moves` | time (correct today) |
| Twin Balance | `moves`, `mistakes`, `hints`, `undo_count`, `completed` | time (correct today) |
| Waythread | `moves`, `hints`, `backtracks`, `mistakes`, `undo_count` | time |
| Rectosaic | `moves`, `mistakes`, `hints`, `undo_count` | time |
| Crownlock | `mistakes`, `hints`, `completed` | time |
| Geode | `grows`, `completed` | time (correct today) |

---

## 5. Findings

**1. "Avg Time" means two completely different things, and for 19 of 28 games it
isn't a skill measure at all.**

`ranked_duration_ms` (migration 034) special-cases nine games onto a per-player
engine or completion clock. For **every other game it falls through to
`results.duration_ms`** — which `AppModel` sets from the *host's* wall clock between
round start and round end, then broadcasts to every participant:

```
completedDurations[gameID] = Int(Date().timeIntervalSince(started) * 1_000)
```

So in a six-player Trivia round, all six players store the same duration. The
default board for those 19 games ranks players by *how short the rounds they
happened to be in were* — a property of the room, not the player, and one where
"better" means "played less". It is also the first thing a player sees on any
global board.

The nine games where the default is sound: Crossword, Sudoku, Spot the Difference,
Geode, Twin Balance, Waythread, Rectosaic, Crownlock (own engine clock), and Letter
Rack (match clock, won matches only).

**2. The good per-game measurements exist — they're just never the default.**

Accuracy is computed and stored for at least ten party games; exactly one (High-Low)
can display it, and only behind a tab. Pairs-per-flip is memory's real measure and
sits fourth in the tab order. Triangles is Triangle Gather's only meaningful career
number and sits sixth. In all three cases Avg Time — the shared room clock — opens
first.

**3. The Daily boards already do the right thing.**

`dailyValue` picks per-game: clock for the puzzles, guesses for Glyph, points for
Letter Rack, pairs-rate for Flip & Find. There is no equivalent function for the
global boards. The cleanest fix is symmetry: a `defaultMetric(for:)` beside
`defaultQuery(for:)`.

**4. Points is a lifetime volume total, not a rate.**

`points` is `sum(score)` across every result on that board, tie-broken by wins then
games played. It rewards playing more, not playing better — reasonable as a
secondary tab, weak as a headline for any game.

**5. Glyph's average-guesses ranking exists server-side but is unreachable.**

`compareRollupRows` has a `gameID === "glyph"` branch ranking on
`total_guesses / games_played`. It is only reached under `ranking=time`, and glyph is
not in the route's `TIME_RANKING_GAMES`, so the route 400s it. The app never requests
it either. Glyph's non-daily global board therefore shows the shared room clock while
the measurement everyone actually cares about — average guesses — is one allowlist
entry away.

**6. Room boards and global boards disagree.**

The in-room board sorts on points → wins → name (`Leaderboard.sortedStandings`). The
global board for the same game sorts on average duration. The same round can rank a
player first in the room and last globally.

**7. Two structural limits worth knowing before redesigning.**

- The hub's segmented picker is capped at four segments by design
  (`hubMetrics`); accuracy and triangles are already detail-only for this reason.
  Adding "success rate" as a general metric means either replacing a segment or
  moving the hub to the same per-game dispatch the Daily boards use.
- Every ranking is pinned in **four** places — the Swift metric enum, the Swift
  `availableMetrics` gate, the portal's `METRIC_RANKING_GAMES` / comparators, and the
  SQL rollup — with `portal/test/game-matrix-parity.test.mjs` failing on drift. Any
  change to a game's measurement touches all four.

---

## 6. Suggested groupings, if the measurements get re-cut

Not a proposal — just the shape the data falls into.

| Proposed default | Games | Basis already collected |
| --- | --- | --- |
| **Time** | Crossword, Sudoku, Spot the Difference, Geode, Twin Balance, Waythread, Rectosaic, Crownlock | per-player engine clock (correct today) |
| **Points** | Letter Rack, Car color count, License plate search, Road trip bingo | `score`, `cars`, `plates`, `squares` |
| **Accuracy** | Trivia, Emoji decode, Charades relay, Melody Mystery, Draw & guess, Majority rules, Two Truths, Prediction bets, Categories, Scavenger hunt, High-Low | `correct` / `attempts` already stored for all |
| **Success rate** | Mystery Face, Road trip bingo (board completions) | `guessed_it`, `board_complete` |
| **Game-specific** | Glyph (avg guesses), Flip & Find (pairs/flip), Triangle Gather (triangles), Headline (cards per minute) | already stored; three have tabs, none is default |

That leaves no live game whose headline measurement is the shared room wall clock.
