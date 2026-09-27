# SportsPredicta

Analytics platform and permutation generator for SportPesa Kenya's **Mega Jackpot Pro (17 games)** and **Midweek Jackpot (13 games)**.

Express + Vite + React 19 + TypeScript · Tailwind CSS v4 · D3 · Firebase (Auth + Firestore) · Gemini (`gemini-2.5-flash`) · Vitest

## Quick start

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY and, optionally, Firebase config
npm run dev               # Express + Vite middleware on http://localhost:3000
```

Production:

```bash
npm run build             # client → dist/public, server → dist/server.cjs
npm start                 # serves dist/public and /api on port 3000
```

Other scripts: `npm test` (Vitest), `npm run typecheck`.

### Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | server | Live search scraper, screenshot OCR, AI text parsing. Without it those endpoints return `503` with a clear message; everything else works. |
| `VITE_FIREBASE_*` | client (build time) | Google sign-in and Firestore slip sync. Without it the app runs in LocalStorage-only mode and the Firebase SDK is never downloaded. |
| `PORT` | server | Defaults to `3000`. |

Firestore security rules are in `firestore.rules`. Slips live at `users/{uid}/slips/{slipId}` and are readable and writable only by their owner.

## Jackpot rules

| | Mega Jackpot Pro | Midweek Jackpot |
| --- | --- | --- |
| Legs | 17 | 13 |
| Stake per line | KES 99 | KES 99 |
| Picks per leg | up to 3 | up to 2 (triple 1-X-2 forbidden) |
| Double-chance cap | 7 | 7 |
| Line cap | 128 | 128 |
| Tiers | 17, plus bonus tiers 16/15/14/13 (exclude up to 4 legs) | single tier |
| SMS prefix (to 79079) | `MJP#` | `JP#` |

Lines = ∏|Sᵢ| (the product of picks per leg). Cost = lines × stake. All rules live in `src/domain/jackpot.ts` (`RULES`). **Check the stake, caps and SMS prefixes against SportPesa's current terms before you rely on them.** Prize pools default to editable placeholders, so set them from the live coupon in the Tiers panel.

## Features

- **Coupon grid** (`.sports-grid`): 1-X-2 pick buttons with odds, countdowns to kickoff, form strings with D3 sparklines, a predictability signal, and sub-jackpot exclusion checkboxes on MJP. The 5th column header holds a **Filter by Slump** toggle that shows only matches where a team has lost 3+ in a row.
- **Strategies**: Favorites, Balanced mix (favourites, draws in the 2.90–3.20 zone, form-backed underdogs), and Bold value (contrarian picks where the form model beats the price; heavy favourites are never opposed). Doubles go to the least predictable legs.
- **Compare view**: conservative vs bold matrix. Disagreements are flagged as hedging opportunities and can be applied as doubles.
- **Consensus view**: four models (Market, Form, Balanced, Value) vote. Each leg shows the consensus pick, an agreement tier (Unanimous/Strong/Split) and a confidence score.
- **Insights**: predictability and draw-probability trend by leg, a momentum differential chart, bookmaker margin, and a league breakdown.
- **Match detail**: market vs form-model probabilities, head-to-head margin bars, a tactical radar, and odds drift.
- **Budget optimiser**: an exact dynamic-programming knapsack that picks which legs to double or triple for the highest win probability within a KES budget and the rule caps.
- **Hedging portfolio**: Banker, Draw hedge and High payout tickets. Combined coverage is computed exactly by inclusion–exclusion.
- **Live matchday simulator**: a 90-minute clock with Poisson goals from each fixture's odds and live tracking of which tiers your ticket still survives.
- **Backtesting**: hit rate, tier hits and ROI per strategy.
- **Odds drift tracker**: timeline from publication to now. Each import of a real coupon (live, OCR or text) records the prices it sees, and re-importing later adds a new point whenever a price has moved. Recorded history is kept in LocalStorage until a week after kickoff.
- **Coupon health**: a 0–100 score covering rule compliance, completeness, double placement, slump exposure and upset concentration.
- **Output**: SMS 79079 codes (multi-line slips expand to one SMS per line, since SMS takes one pick per leg), Telegram markdown, JSON (`sportspredicta.coupon/v1`), CSV, and a printable ticket (Print, PNG or SVG).
- **Persistence**: the session auto-saves to LocalStorage and is restored on reload. A saved coupon that has already kicked off is replaced with the upcoming round. Signed-in users' slips sync to Firestore.

## Data sources and honesty notes

- **Sample coupon.** On first load each jackpot shows a sample coupon anchored to the current calendar (MJP on Sat/Sun, Midweek on Tue/Wed, always in the future). It is labelled as a sample. Use **Import** to load the real coupon by live search, screenshot OCR or pasted text.
- **Live search** (`POST /api/fixtures/live`) asks Gemini with Google Search grounding for the upcoming coupon on ke.sportpesa.com. Past kickoffs are filtered on both the server and the client, and grounding sources are shown. A search can still return wrong data, so check the preview before loading.
- **Form, H2H and odds drift.** When a source does not supply form or head-to-head data, they are modelled deterministically from market strength and flagged in the UI. In the odds-drift chart, points are observed wherever the coupon was imported. Only the stretch before the first import is modelled, and it is bridged onto the first observed price.
- **Backtesting** uses a clearly labelled *simulated* archive until you import verified results. Import a JSON array of `{ kind, id, date, fixtures: [{home, away, odds}], results: {fixtureId: "1"|"X"|"2"}, payouts: {tier: KES} }`.

Probabilities are estimates. Nothing here guarantees a winning ticket. Bet responsibly · 18+.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{ ok, gemini, time }` |
| POST | `/api/fixtures/live` | `{ kind: "MJP17" \| "MID13" }` | `{ fixtures, sources }` |
| POST | `/api/fixtures/ocr` | `{ image: base64 \| dataURL, mimeType }` (PNG/JPEG/WebP, ≤ 8 MB) | `{ fixtures }` |
| POST | `/api/fixtures/parse` | `{ text }` | `{ fixtures, engine: "local" \| "gemini" }` |

## Project layout

```
server.ts               Express entry (Vite middleware in dev, static dist in prod)
server/app.ts           API routes
server/gemini.ts        Gemini live search, vision OCR, text parsing
src/domain/             Pure, fully tested logic: rules, odds, form/slumps, strategies,
                        optimiser, hedging, health, simulator, backtest, drift, parser, exports
src/components/         Top bar, coupon grid, slip panel, views, modals, D3 charts
src/hooks/              Session state and restore, modals, auth and slips, clock
src/lib/                Firebase (lazy), LocalStorage, API client
```

## Tests

`npm test` runs 107 Vitest tests. CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every pull request and every push to `main`. They cover permutation math and rule validation, coupon health, slump detection and the Filter by Slump column, modal state and dialogs, strategies and consensus, the optimiser (checked against brute force), hedging coverage, SMS/Telegram/JSON/CSV formats, the text parser, date grounding, the simulator, backtesting, odds drift, session restore, App integration and the API routes.
