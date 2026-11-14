# Token Radar (radar-2) — make.fun token-radar-01

A token launch radar: pre-token protocols ranked by implied value, with a farm
plan for each. Built for make.fun's "Build the best token launch radar" bounty
($1,325 pool, deadline 2026-12-14).

## What it does

`main.ts` (Node 22, standard library only, no network) reads the sealed
snapshot at `/input/snapshot.json`, scores every pre-token protocol with the
model in `lib/model.ts`, and writes:

- `/output/board.json` — the ranked board (178 rows: all 40 watchlist
  protocols plus 138 early pre-token protocols below the floor)
- `/output/data.js` — the dashboard's dataset
- `/output/dashboard/` — the static page (no network, no framework)
- `/output/screenshots/` — board, detail and filtered views
- `/output/dossier.json` — the judge's dossier, via `vendor/makefun-board.ts`

## The model

Implied value follows only from the snapshot's own figures. The market, not a
fixed constant, sets the price of TVL: each category is priced off its own
live-token comparables (median market-cap/TVL), shrunk toward the global
median so a thin category cannot swing the multiple.

```
multiple = (n * median(category mcap/TVL) + 8 * global median) / (n + 8)
implied  = round(tvl * multiple * growthMult * maturityMult * reachMult)
```

- growth: `1 + clamp(change_7d, -60, 120) / 100 * 0.5`
- maturity: `0.6 + min(age_days, 1095) / 1095 * 0.4` (unknown age: 365 days)
- reach: `1 + 0.02` per extra chain, at most `1.10`

Uncertainty is shown, never hidden: each row carries an implied range (the
25th/75th percentile multiples) and a confidence score (0-100) with named
flags for missing growth or age, thin comparables, spike weeks and short track
records. Confidence never enters the implied value.

Above the floor only watchlist slugs are ranked: the house list used
`parentProtocol`, which the snapshot does not carry. Below the floor the radar
applies the same exclusion rule from the visible fields (category, name).

## The dashboard

Sortable, filterable board (search, category, chain, watchlist-only,
confidence), a detail view per protocol (model breakdown, evidence and
cautions, farm plan), a live-token view of the comparables that calibrate the
multiples, and a model sandbox that re-ranks the board under the reader's own
growth and maturity weights.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Runs are deterministic: two runs write the same bytes.
