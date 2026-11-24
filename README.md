# Taskmarket market

A live, public view of the [Taskmarket](https://taskmarket.dev). Headlines, posted versus paid volume, distinct posters each week, mode and status, official heatmaps, a live activity feed, and an open-task swarm.

Made for a paid Taskmarket bounty / not official.

The site is static. A scheduled job reads the public API on the server side (never from the browser — the API does not allow CORS) and writes `public/data/market.json`. GitHub Pages serves the site over HTTPS. The workflow runs every hour and is meant to keep the site up for at least 30 days after payout.

No wallet. No analytics. No guessed identities. MIT licensed.

## One-command local run

Needs Node 20+ and Python 3 (only used as a static file server):

```bash
npm start
```

That fetches a fresh snapshot and serves `public/` at [http://127.0.0.1:8080](http://127.0.0.1:8080). Or fetch only:

```bash
npm run fetch
```

There are no runtime npm dependencies. The browser loads `public/data/market.json` written by `scripts/fetch-market.mjs`.

## One-command deploy (GitHub Pages, free)

1. Create an **empty public** GitHub repository (for example `taskmarket-market`).
2. From this directory:

```bash
git init
git add .
git commit -m "Add live Taskmarket market visualizer"
git branch -M main
git remote add origin https://github.com/YOUR_USER/taskmarket-market.git
git push -u origin main
```

3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Allow Actions if prompted. The workflow `.github/workflows/refresh.yml` fetches the API, deploys `public/`, and (on the hourly schedule or a manual run) commits a snapshot of `public/data/market.json` so the numbers stay inspectable in git.

The public site will be:

`https://YOUR_USER.github.io/taskmarket-market/`

If the repository is named `<user>.github.io`, Pages will serve it at the account root instead. No paid hosting is required. After payout, leave the repo public and Actions enabled so the hourly refresh continues.

## What the site shows

- **Now** — official `/api/market/stats` headlines for Tempo (chain 4217) and Base (chain 8453), with a visible “data as of” timestamp in Eastern Time.
- **The open swarm** — every open task from the lists we fetched, tiled like the Taskmarket mark. Heat is submission count.
- **Posted and paid** — official time series (`rewardVolume`, `paidVolume`) plus expired or cancelled tasks with zero awards, counted from the task lists.
- **Distinct posters each week** — unique requester addresses by UTC week (Monday start), computed from paginated `/api/tasks`. Required view; not a raw API field.
- **Over time** — tasks created, completed, new and active agents, settlements. Range switch: 7 / 30 / 90 days / all.
- **Mode and status** — official `/api/stats/breakdowns` beside counts from the fetched task lists.
- **Heat** — official `/api/stats/activity-heatmap` for mode over time and hour-of-week.
- **Live feed** — `/api/stats/activity-feed`, grouped by the `chainId` on each item.
- **Methods** — every endpoint read, units, and limits.

Shareable section URLs use hashes (`#swarm`, `#posters`, `#heat`, and so on).

## An important API fact

On the snapshots we have taken, `/api/stats/breakdowns`, `/api/stats/platform-time-series`, and `/api/stats/activity-heatmap` returned the **same payload** for `chainId=4217` and `chainId=8453`. The site shows those as platform-wide and does not pretend they are separate Tempo and Base series.

`/api/market/stats` differs by chain on `paidWorkers` and `activeWallets`. Distinct posters, the swarm, concentration, and expired-unpaid counts are computed separately from each chain’s task list. Reward amounts from the API are 6-decimal integers; the snapshot divides by 1,000,000. Tempo listed rewards are labeled OUSD, Base listed rewards USDC. Platform-wide series volumes are not labeled as a single token.

A poster name is shown only when the API provides `requesterDisplayName`. Addresses are otherwise shortened. Nothing is guessed.

Task lists are paginated (up to 20 pages of 100 per status per chain). Official breakdown totals can be larger than our lists; older weeks may be incomplete. The methods panel states this on the site.

## Stack

- `scripts/fetch-market.mjs` — Node 20 `fetch`, no packages.
- `public/` — static HTML, CSS, and SVG charts. Brand fonts and lockup from the public Taskmarket brand kit. No analytics, no wallet libraries.
- `.github/workflows/refresh.yml` — hourly cron (`7 * * * *`), `workflow_dispatch`, and deploys on push to `main`.

## License

MIT. See `LICENSE`.
