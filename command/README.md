# Gather Command Center

The owner's console for the Gather iOS app: every number the app and the portal
already collect, on one screen, with the live controls beside them. Next.js +
Supabase, deploys to Vercel as its own project. It reads the **same Supabase
project the manager portal writes** (`elmer-neptune-angels/gather`, `portal/`)
and uses the same admin-password session, so nothing has to be re-collected.

| Page | What it shows | Source tables |
| --- | --- | --- |
| **Overview** | Rounds today (hero), 7-day rounds, DAU/WAU/MAU, rooms, new installs, paying subscribers, errors, rounds per hour and per day, most-played games, system status strip, **live event feed** (auto-refreshes every 30 s) | `gather_events`, `gather_installs`, `gather_entitlement_mirror`, `gather_cron_runs`, `gather_host_heartbeats` |
| **Play** | Rounds by **minute / hour / day** (window presets from 1 h to 90 d), room vs solo, rooms opened, completion and abandonment, average players and round length, weekday × hour heatmap, difficulty mix, per-game table | `gather_events` |
| **Players** | DAU/WAU/MAU with a rolling 30-day chart, active players and app opens per bucket, installs registered, accounts, average foreground session, **retention by install week (D1/D7/D30)**, players by region and app version | `gather_events`, `gather_installs`, `gather_accounts` |
| **Leaderboards** | Per-game Points / Most played / Avg time / Fastest boards, today's Daily board, results uploaded per game | `gather_game_leaderboard_rollup`, `gather_ranked_daily_leaderboard()`, `gather_game_results` |
| **Revenue** | Paying subscribers by product and state (active, grace, billing retry, lapsed, revoked), estimated MRR (list prices editable in-page), new vs lapsed per day, paywall funnel and sources, App Store notification mix, subscriptions lapsing within 7 days, **App Store Connect downloads and proceeds** when the API key is set | `gather_entitlement_mirror`, `gather_appstore_notifications`, `gather_events`, `gather_appstore_sales_daily`, `gather_command_settings` |
| **Marketing** | Spend (logged by hand or CSV), new installs, **blended CAC**, cost per subscriber, CTR, per-channel CAC where the network reports installs | `gather_marketing_spend`, `gather_installs`, `gather_entitlement_mirror` |
| **System** | Live probes (portal `/api/config`, relay `/healthz`, Supabase), cron receipts and lateness, relay heartbeat history, ingest freshness and upload lag, error-class events by type and reason, crash reporting status | live HTTP, `gather_cron_runs`, `gather_host_heartbeats`, `gather_events` |
| **Controls** | What phones are being served right now (with drift detection against the database), the per-game on/off switches, params and notes, filter, bulk on/off | `gather_game_config` via `PATCH /api/games` |

Every chart has a hover readout; every window filter (`?range=…&by=…`) scopes
the whole page so the numbers agree.

## Deploy

1. **Database.** In the Supabase SQL editor (the Legacy Pulse project the portal
   uses) run the migrations in `supabase/migrations/`, in order. Both are
   numbered to drop into `gather/portal/supabase/migrations/` unchanged, and
   neither holds player data.
   - `043_command_center.sql` adds marketing spend, cached App Store sales and
     settings. Every page works without it; the Marketing page, the price
     editor and the sales cache just say so until it is applied.
   - `044_login_throttle.sql` adds the durable counters behind the sign-in rate
     limit. Until it is applied the limiter still runs, but only in process,
     which a caller opening parallel connections can ride through (see
     **Sign-in** below).
2. **Vercel.** New Project → import this repo → **Root Directory** `command` →
   environment variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — the portal's values.
   - `ADMIN_PASSWORD` — sign-in password (the portal's, or a different one).
   - `PORTAL_BASE_URL` — optional, default `https://gather-smoky.vercel.app`.
   - `RELAY_HOST_URL` — optional, default `https://gather-host.fly.dev`.
   - `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`, `ASC_VENDOR_NUMBER` —
     optional; an **App Store Connect API** key with the Sales and Reports
     role (App Store Connect → Users and Access → Integrations → App Store
     Connect API) and the vendor number from Payments and Financial Reports.
     This is a different key from the portal's App Store *Server* API key,
     which cannot read reports. With these set, "Refresh from Apple" on the
     Revenue page pulls the missing daily SALES reports into the cache.
3. Sign in at the deployment URL.

## Local dev

```bash
cd command
npm install
ADMIN_PASSWORD=dev SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run dev
npm test          # node:test suites for the pure libraries
npm run typecheck
npm run build
```

## Sign-in

One shared password, as in the portal this was copied from, with two changes
made because this dashboard sits on a publicly reachable URL and shows revenue
and player names.

- **Constant-time comparison.** The password and the session cookie are both
  compared through SHA-256 digests and `timingSafeEqual`, so neither the value
  nor its length leaks through response timing (`src/lib/auth.ts`).
- **Rate limiting.** Five failures from one address inside fifteen minutes
  starts a lockout, doubling with each further failure from one minute up to an
  hour, and cleared by a correct password. The policy is pure and tested in
  `src/lib/login-policy.ts`, enforced atomically in SQL by migration 044, and
  reached through `src/lib/login-throttle.ts`.

The counters live in the database on purpose: Vercel runs this as many
short-lived serverless instances, so an in-process counter resets under
parallel load. The in-process map is a fallback for a missing table or an
unreachable database, and it **fails open** rather than locking the owner out
of the dashboard during a Supabase outage.

None of this replaces putting the deployment behind your host's own
authentication. It raises the cost of guessing; it is not a substitute for not
being reachable.

## How the numbers are defined

- **A round** is one `game_started`, and nothing else. It is host-side only,
  so one round is one event however many phones joined. Solo and Daily rounds
  emit it too: `launchSoloGame()` calls `startGame()` and only THEN emits
  `quick_play_started` or `daily_quick_play_started`, so those markers
  accompany a round rather than being one, and counting them as rounds counted
  every Daily and Quick Play twice. They are reported as a breakdown
  ("launched from the Daily") instead. A marker with no `game_started` is a
  launch that failed to deal, which is correctly not a round.
- **Solo** means one player was dealt in, read from `game_started`'s own
  `players` payload rather than by counting a second event. A one-player round
  opened inside a room counts as solo.
- **Active players** are distinct `player_id`s with any event in the trailing
  1 / 7 / 30 days (device id when a batch predates player identity).
- **Days** are Pacific calendar days, matching the app's Daily boards.
- **Paying** means an entitlement-mirror row that is not revoked and is
  active, in grace, or in billing retry. **MRR** is list price per month
  (annual ÷ 12) over paying rows; Family is unpriced until a price is set.
- **Blended CAC** is spend ÷ install registrations in the window; per-channel
  CAC uses the installs the network claims, if entered.
- **Error-class events** are the app's own failure, refusal and block events
  (`purchase_failed`, `online_room_ticket_refused`, `match_refused`, …).
  There is no crash reporter yet; the System page explains the one-event
  MetricKit hook that would light up the crash tile.

## Moving it into the portal

The code is laid out like `gather/portal` on purpose: `src/lib/auth.ts`,
`supabase.ts`, `matrix.ts` and `api/games/route.ts` are verbatim copies, and
the new libraries import only each other. To fold the command center into the
portal as `/command/*`, copy `src/lib/*` (skipping the three copies),
`src/components`, the page directories, and the migration; then add the
sidebar links to `PortalHeader`.
