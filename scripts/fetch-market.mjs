#!/usr/bin/env node
/**
 * Server-side (or scheduled) fetch of public Taskmarket market data.
 * Writes public/data/market.json. Never called from the browser.
 * No keys. Read-only GET requests to https://api.taskmarket.dev
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.taskmarket.dev";
const CHAINS = [
  { id: 4217, network: "tempo", token: "OUSD" },
  { id: 8453, network: "base", token: "USDC" },
];
const STATUSES = [
  "open",
  "completed",
  "expired",
  "cancelled",
  "claimed",
  "worker_selected",
  "pending_approval",
];
const RANGES = ["7d", "30d", "90d", "all"];
const UA = "taskmarket-market-visualizer/1.0 (read-only scheduled fetch)";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "data");

function reward(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1e6 : 0;
}

async function apiGet(path) {
  const res = await fetch(API + path, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

function samePayload(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isoWeekStart(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // UTC week starting Monday
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset));
  return start.toISOString().slice(0, 10);
}

function compactTask(t) {
  const name = (t.requesterDisplayName || "").trim();
  return {
    id: t.id,
    code: t.referenceCode,
    chainId: t.chainId,
    status: t.status,
    mode: t.mode,
    reward: reward(t.reward),
    createdAt: t.createdAt,
    expiryTime: t.expiryTime,
    requester: t.requester,
    requesterName: name || null,
    submissions: t.submissionCount || 0,
    awards: t.awardCount || 0,
    title: String(t.description || "").split("\n")[0].slice(0, 140),
  };
}

async function listTasks(chainId, status) {
  const out = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    let path = `/api/tasks?chainId=${chainId}&status=${status}&sort=newest&limit=100`;
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
    const data = await apiGet(path);
    const tasks = data.tasks || [];
    for (const t of tasks) out.push(compactTask(t));
    if (!data.hasMore || !data.nextCursor || tasks.length === 0) break;
    cursor = data.nextCursor;
  }
  return out;
}

function postersByWeek(tasks) {
  const weeks = new Map();
  for (const t of tasks) {
    const week = isoWeekStart(t.createdAt);
    if (!week) continue;
    if (!weeks.has(week)) weeks.set(week, { week, posters: new Set(), tasks: 0, reward: 0 });
    const row = weeks.get(week);
    if (t.requester) row.posters.add(t.requester.toLowerCase());
    row.tasks += 1;
    row.reward += t.reward;
  }
  return [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((r) => ({ week: r.week, distinctPosters: r.posters.size, tasks: r.tasks, reward: round(r.reward) }));
}

function concentration(tasks, days) {
  const since = Date.now() - days * 24 * 3600 * 1000;
  const counts = new Map();
  let total = 0;
  for (const t of tasks) {
    const ts = Date.parse(t.createdAt);
    if (!Number.isFinite(ts) || ts < since) continue;
    total += 1;
    const key = (t.requester || "unknown").toLowerCase();
    if (!counts.has(key)) counts.set(key, { requester: t.requester, name: t.requesterName, tasks: 0, reward: 0 });
    const row = counts.get(key);
    row.tasks += 1;
    row.reward += t.reward;
    if (t.requesterName && !row.name) row.name = t.requesterName;
  }
  const ranked = [...counts.values()].sort((a, b) => b.tasks - a.tasks);
  const top = ranked.slice(0, 10).map((r) => ({
    requester: r.requester,
    name: r.name, // public display name from the API, or null — never guessed
    tasks: r.tasks,
    reward: round(r.reward),
  }));
  const top3 = ranked.slice(0, 3).reduce((s, r) => s + r.tasks, 0);
  return {
    days,
    tasks: total,
    distinctPosters: ranked.length,
    top3Share: total ? top3 / total : 0,
    top,
  };
}

function died(tasks) {
  const dead = tasks.filter((t) => (t.status === "expired" || t.status === "cancelled") && (t.awards || 0) === 0);
  return {
    count: dead.length,
    reward: round(dead.reduce((s, t) => s + t.reward, 0)),
  };
}

function byModeStatus(tasks) {
  const mode = {};
  const status = {};
  for (const t of tasks) {
    mode[t.mode || "unknown"] = (mode[t.mode || "unknown"] || 0) + 1;
    status[t.status || "unknown"] = (status[t.status || "unknown"] || 0) + 1;
  }
  return {
    mode: Object.entries(mode).map(([k, count]) => ({ mode: k, count })).sort((a, b) => b.count - a.count),
    status: Object.entries(status).map(([k, count]) => ({ status: k, count })).sort((a, b) => b.count - a.count),
  };
}

function openSwarm(tasks, limit = 80) {
  return tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => b.submissions - a.submissions || b.reward - a.reward)
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      code: t.code,
      chainId: t.chainId,
      mode: t.mode,
      reward: t.reward,
      submissions: t.submissions,
      title: t.title,
      expiryTime: t.expiryTime,
    }));
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

function scaleSeries(rows) {
  return (rows || []).map((r) => ({
    bucket: r.bucket,
    tasksCreated: r.tasksCreated || 0,
    completedTasks: r.completedTasks || 0,
    newAgents: r.newAgents || 0,
    activeAgents: r.activeAgents || 0,
    settlements: r.settlements || 0,
    ratings: r.ratings || 0,
    rewardVolume: reward(r.rewardVolume),
    paidVolume: reward(r.paidVolume),
  }));
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const endpoints = [];
  const used = (path) => {
    endpoints.push(`https://api.taskmarket.dev${path}`);
    return apiGet(path);
  };

  const headlines = {};
  for (const c of CHAINS) {
    headlines[c.network] = await used(`/api/market/stats?chainId=${c.id}`);
  }

  const breakdownsTempo = await used(`/api/stats/breakdowns?chainId=4217`);
  const breakdownsBase = await used(`/api/stats/breakdowns?chainId=8453`);
  const breakdownsIdentical = samePayload(breakdownsTempo, breakdownsBase);

  const timeSeries = {};
  let seriesIdentical = true;
  for (const range of RANGES) {
    for (const bucket of range === "all" ? ["day", "week"] : ["day"]) {
      const a = await used(`/api/stats/platform-time-series?chainId=4217&range=${range}&bucket=${bucket}`);
      const b = await used(`/api/stats/platform-time-series?chainId=8453&range=${range}&bucket=${bucket}`);
      if (!samePayload(a, b)) seriesIdentical = false;
      timeSeries[`${range}_${bucket}`] = { tempo: scaleSeries(a), base: scaleSeries(b), identical: samePayload(a, b) };
    }
  }

  const heatmaps = {};
  let heatIdentical = true;
  for (const range of ["7d", "30d", "90d", "all"]) {
    for (const dimension of ["mode", "hourOfWeek"]) {
      const a = await used(`/api/stats/activity-heatmap?chainId=4217&range=${range}&dimension=${dimension}`);
      const b = await used(`/api/stats/activity-heatmap?chainId=8453&range=${range}&dimension=${dimension}`);
      const ident = samePayload(a, b);
      if (!ident) heatIdentical = false;
      heatmaps[`${range}_${dimension}`] = { tempo: a, base: b, identical: ident };
    }
  }

  const feedTempo = await used(`/api/stats/activity-feed?chainId=4217&limit=50`);
  const feedBase = await used(`/api/stats/activity-feed?chainId=8453&limit=50`);

  const tasksByChain = {};
  for (const c of CHAINS) {
    const all = [];
    for (const status of STATUSES) {
      const batch = await listTasks(c.id, status);
      endpoints.push(`https://api.taskmarket.dev/api/tasks?chainId=${c.id}&status=${status}&sort=newest&limit=100`);
      all.push(...batch);
    }
    // de-dupe by id
    const seen = new Set();
    const unique = [];
    for (const t of all) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }
    tasksByChain[c.network] = unique;
  }

  const chainViews = {};
  for (const c of CHAINS) {
    const tasks = tasksByChain[c.network];
    chainViews[c.network] = {
      chainId: c.id,
      network: c.network,
      token: c.token,
      headline: headlines[c.network],
      taskCount: tasks.length,
      postersByWeek: postersByWeek(tasks),
      concentration7d: concentration(tasks, 7),
      concentration30d: concentration(tasks, 30),
      died: died(tasks),
      fromTasks: byModeStatus(tasks),
      swarm: openSwarm(tasks),
    };
  }

  const payload = {
    fetchedAt,
    source: API,
    note: {
      breakdownsIdenticalAcrossChains: breakdownsIdentical,
      timeSeriesIdenticalAcrossChains: seriesIdentical,
      heatmapsIdenticalAcrossChains: heatIdentical,
      explanation:
        "On this fetch, /api/stats/breakdowns, /api/stats/platform-time-series and /api/stats/activity-heatmap returned the same payload for chainId 4217 and 8453. Those charts are shown as platform-wide. /api/market/stats differs by chain on paidWorkers and activeWallets. Distinct posters per week, the swarm, concentration and expired-unpaid counts are computed from each chain's /api/tasks list. Activity-feed items are grouped by the chainId on each item. No names are guessed for wallet addresses: a display name is shown only when the public API provides requesterDisplayName.",
    },
    headlines,
    breakdowns: breakdownsTempo,
    timeSeries,
    heatmaps,
    feed: {
      items: [...(feedTempo.items || []), ...(feedBase.items || [])]
        .filter((item, i, arr) => arr.findIndex((x) => x.timestamp === item.timestamp && x.taskId === item.taskId && x.type === item.type) === i)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 60)
        .map((i) => ({
          type: i.type,
          timestamp: i.timestamp,
          taskId: i.taskId,
          taskTitle: i.taskTitle,
          chainId: i.chainId,
          actorType: i.actorType,
          actorAgentId: i.actorAgentId,
          // actor address is public; we do not attach a guessed name
          actor: i.actor,
          amount: i.amount == null ? null : reward(i.amount),
        })),
    },
    chains: chainViews,
    endpoints: [...new Set(endpoints)],
  };

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "market.json");
  writeFileSync(outPath, JSON.stringify(payload));
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  console.log(JSON.stringify({ ok: true, fetchedAt, bytes, tasks: { tempo: chainViews.tempo.taskCount, base: chainViews.base.taskCount } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
