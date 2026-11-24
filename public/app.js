const state = { data: null, chain: "all", range: "30d" };

const $ = (id) => document.getElementById(id);

const fmt = new Intl.NumberFormat("en-US");
const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function num(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const x = Number(n);
  if (digits === 0 && Math.abs(x) >= 100) return fmt.format(Math.round(x));
  if (digits === 0) return fmt.format(x);
  if (digits === 1) return fmt1.format(x);
  return fmt2.format(x);
}

function money(n, token) {
  const v = num(n, 2);
  return token ? `${v} ${token}` : v;
}

function et(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")} ${get("day")}, ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")} ET`;
}

function etShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d) + " ET";
}

function shortAddr(a) {
  if (!a) return "unknown";
  const s = String(a);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function chainName(id) {
  if (Number(id) === 4217) return "Tempo";
  if (Number(id) === 8453) return "Base";
  return `chain ${id}`;
}

function tokenFor(chain) {
  if (chain === "tempo") return "OUSD";
  if (chain === "base") return "USDC";
  return "tokens";
}

function selectedChains(data) {
  if (state.chain === "tempo") return [data.chains.tempo];
  if (state.chain === "base") return [data.chains.base];
  return [data.chains.tempo, data.chains.base];
}

function seriesForRange(data) {
  const key = state.range === "all" ? "all_week" : `${state.range}_day`;
  const pack = data.timeSeries[key] || data.timeSeries["30d_day"];
  return pack?.tempo || [];
}

function heatFor(data, dimension) {
  const pack = data.heatmaps[`${state.range}_${dimension}`] || data.heatmaps[`30d_${dimension}`];
  return pack?.tempo;
}

/* ---- SVG helpers ---- */
function svgEl(name, attrs, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  if (text != null) el.textContent = text;
  return el;
}

function lineChart(rows, series, { height = 240, yFormat = (v) => num(v) } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  if (!rows.length) {
    wrap.innerHTML = "<p class='empty'>No points in this range.</p>";
    return wrap;
  }
  const legend = document.createElement("div");
  legend.className = "legend";
  for (const s of series) {
    const span = document.createElement("span");
    span.innerHTML = `<i style="background:${s.color}"></i>${s.label}`;
    legend.append(span);
  }
  wrap.append(legend);

  const W = 1000, H = height, L = 52, R = 16, T = 8, B = 36;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...series.flatMap((s) => rows.map((r) => Number(r[s.key]) || 0)));
  const x = (i) => L + (rows.length === 1 ? plotW / 2 : (i * plotW) / (rows.length - 1));
  const y = (v) => T + plotH - (v / max) * plotH;

  const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  // y ticks
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    const yy = y(v);
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: yy, y2: yy, stroke: "#453E37", "stroke-width": 1 }));
    svg.append(svgEl("text", { x: L - 8, y: yy + 4, fill: "#B0A79D", "font-family": "Departure Mono, monospace", "font-size": 11, "text-anchor": "end" }, yFormat(v)));
  }
  // x labels: first, mid, last, plus a few
  const labelAt = new Set([0, rows.length - 1, Math.floor((rows.length - 1) / 2)]);
  if (rows.length > 10) {
    labelAt.add(Math.floor((rows.length - 1) / 4));
    labelAt.add(Math.floor((3 * (rows.length - 1)) / 4));
  }
  rows.forEach((r, i) => {
    if (!labelAt.has(i)) return;
    svg.append(svgEl("text", { x: x(i), y: H - 10, fill: "#B0A79D", "font-family": "Departure Mono, monospace", "font-size": 11, "text-anchor": "middle" }, r.bucket));
  });
  for (const s of series) {
    const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(Number(r[s.key]) || 0).toFixed(1)}`).join(" ");
    svg.append(svgEl("polyline", { fill: "none", stroke: s.color, "stroke-width": s.width || 2, points: pts, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }
  wrap.append(svg);
  return wrap;
}

function barChart(rows, { key, labelKey, color = "#D9A097", height = 220, yFormat = (v) => num(v) } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  if (!rows.length) {
    wrap.innerHTML = "<p class='empty'>No bars to show.</p>";
    return wrap;
  }
  const W = 1000, H = height, L = 52, R = 16, T = 8, B = 48;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...rows.map((r) => Number(r[key]) || 0));
  const gap = 4;
  const bw = Math.max(2, plotW / rows.length - gap);
  const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    const yy = T + plotH - (v / max) * plotH;
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: yy, y2: yy, stroke: "#453E37", "stroke-width": 1 }));
    svg.append(svgEl("text", { x: L - 8, y: yy + 4, fill: "#B0A79D", "font-family": "Departure Mono, monospace", "font-size": 11, "text-anchor": "end" }, yFormat(v)));
  }
  rows.forEach((r, i) => {
    const v = Number(r[key]) || 0;
    const h = (v / max) * plotH;
    const x = L + i * (plotW / rows.length) + gap / 2;
    const y = T + plotH - h;
    svg.append(svgEl("rect", { x, y, width: bw, height: Math.max(h, 0), fill: color }));
    if (rows.length <= 16 || i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)) {
      svg.append(svgEl("text", { x: x + bw / 2, y: H - 10, fill: "#B0A79D", "font-family": "Departure Mono, monospace", "font-size": 10, "text-anchor": "middle" }, r[labelKey]));
    }
  });
  wrap.append(svg);
  return wrap;
}

function horizBars(rows, { label, value, color = "#D9A097" }) {
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  const W = 600, rowH = 28, L = 130, R = 56, T = 8, H = T + rows.length * rowH + 8;
  const plotW = W - L - R;
  const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  rows.forEach((r, i) => {
    const y = T + i * rowH;
    const v = Number(r[value]) || 0;
    svg.append(svgEl("text", { x: L - 8, y: y + 14, fill: "#B0A79D", "font-family": "Departure Mono, monospace", "font-size": 12, "text-anchor": "end" }, r[label]));
    svg.append(svgEl("rect", { x: L, y: y + 4, width: Math.max(1, (v / max) * plotW), height: 16, fill: color }));
    svg.append(svgEl("text", { x: L + (v / max) * plotW + 6, y: y + 16, fill: "#EFE9E2", "font-family": "Departure Mono, monospace", "font-size": 11 }, num(v)));
  });
  wrap.append(svg);
  return wrap;
}

/* ---- sections ---- */
function renderHeadlines(data) {
  const box = $("headlines");
  box.innerHTML = "";
  const t = data.headlines.tempo;
  const b = data.headlines.base;
  const stats = [
    { k: "Open tasks", v: num(t.openTasks), s: "platform headline (same on both chain queries; compare with the swarm, which counts listed open tasks)" },
    { k: "Active workers, 7 days", v: num(t.activeWorkers7d), s: "same figure on both chain queries" },
    { k: "Active agents, 7 days", v: num(t.activeAgents7d), s: "same figure on both chain queries" },
    { k: "Registered workers", v: num(t.registeredWorkers), s: "same figure on both chain queries" },
    { k: "Paid workers", v: `${num(t.paidWorkers)} / ${num(b.paidWorkers)}`, s: "Tempo / Base — this field differs by chain" },
    { k: "Active wallets", v: `${num(t.activeWallets)} / ${num(b.activeWallets)}`, s: "Tempo / Base — this field differs by chain" },
  ];
  for (const s of stats) {
    const el = document.createElement("article");
    el.className = "stat";
    el.innerHTML = `<p class="k">${s.k}</p><p class="v">${s.v}</p><p class="s">${s.s}</p>`;
    box.append(el);
  }

  $("as-of").textContent = `Data as of ${et(data.fetchedAt)}. Refreshes hourly from the public API.`;

  const chains = selectedChains(data);
  const posters7 = chains.reduce((s, c) => s + c.concentration7d.distinctPosters, 0);
  const tasks7 = chains.reduce((s, c) => s + c.concentration7d.tasks, 0);
  const diedN = chains.reduce((s, c) => s + c.died.count, 0);
  const diedR = chains.reduce((s, c) => s + c.died.reward, 0);
  const scope = state.chain === "all" ? "Across both chains in the lists we fetched" : `On ${state.chain === "tempo" ? "Tempo" : "Base"} in the lists we fetched`;
  const top = state.chain === "all"
    ? null
    : data.chains[state.chain].concentration7d;
  let extra = "";
  if (state.chain !== "all" && top && top.tasks) {
    extra = ` In the last 7 days, the top three posters made ${num(top.top3Share * 100, 1)}% of ${num(top.tasks)} tasks.`;
  } else if (state.chain === "all") {
    const tt = data.chains.tempo.concentration7d;
    extra = ` On Tempo, the top three posters made ${num(tt.top3Share * 100, 1)}% of ${num(tt.tasks)} tasks in the last 7 days.`;
  }
  $("lede").textContent = `${scope}, ${num(posters7)} distinct posters created ${num(tasks7)} tasks in the last 7 days. ${num(diedN)} tasks expired or were cancelled with zero awards (${num(diedR, 2)} in listed rewards).${extra}`;
}

function renderSwarm(data) {
  const grid = $("swarm-grid");
  const cap = $("swarm-caption");
  grid.innerHTML = "";
  const tiles = selectedChains(data).flatMap((c) => c.swarm.map((t) => ({ ...t, token: c.token, network: c.network })));
  tiles.sort((a, b) => b.submissions - a.submissions);
  const max = Math.max(1, ...tiles.map((t) => t.submissions));
  const detail = $("swarm-detail");
  detail.innerHTML = "<p>Select a tile to read the task. Heat is submission count, not reward.</p>";

  function show(t) {
    const left = t.expiryTime ? `Closes ${et(t.expiryTime)}.` : "";
    detail.innerHTML = `<h3>${escapeHtml(t.title || t.code || t.id)}</h3>
      <p><span class="mono">${escapeHtml(t.code || "")}</span> · ${escapeHtml(t.network)} · ${escapeHtml(t.mode)} · ${money(t.reward, t.token)} · ${num(t.submissions)} submissions. ${left}</p>`;
  }

  for (const t of tiles) {
    const heat = t.submissions / max;
    // magenta used as heat on the swarm — the one accent in this view; never a full-bleed background
    const bg = heatLerp(heat);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.style.background = bg;
    btn.title = `${t.code}: ${t.submissions} submissions, ${money(t.reward, t.token)}`;
    btn.setAttribute("aria-label", `${t.code}, ${t.submissions} submissions`);
    btn.addEventListener("click", () => show(t));
    grid.append(btn);
  }
  cap.textContent = `${num(tiles.length)} open tasks in this view. Hottest tile: ${tiles[0] ? tiles[0].code + " · " + tiles[0].submissions + " submissions" : "none"}.`;
}

function heatLerp(t) {
  // panel brown → maroon → magenta (accent only at the hot end)
  const stops = [
    [0, 34, 30, 26],       // #221E1A
    [0.45, 58, 20, 32],    // maroon-ish
    [1, 231, 64, 121],     // #E74079
  ];
  let a = stops[0], b = stops[1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
  }
  const span = b[0] - a[0] || 1;
  const u = (t - a[0]) / span;
  const r = Math.round(a[1] + (b[1] - a[1]) * u);
  const g = Math.round(a[2] + (b[2] - a[2]) * u);
  const bl = Math.round(a[3] + (b[3] - a[3]) * u);
  return `rgb(${r},${g},${bl})`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderFlow(data) {
  const root = $("flow-chart");
  root.innerHTML = "";
  const rows = seriesForRange(data);
  root.append(lineChart(rows, [
    { key: "rewardVolume", label: "Reward posted (API, platform-wide)", color: "#D9A097", width: 2 },
    { key: "paidVolume", label: "Reward paid (API, platform-wide)", color: "#EFE9E2", width: 2 },
  ], { yFormat: (v) => num(v, 1) }));

  const chains = selectedChains(data);
  const diedNote = document.createElement("p");
  diedNote.className = "caption";
  diedNote.style.marginTop = "16px";
  diedNote.textContent = chains.map((c) => {
    return `${c.network === "tempo" ? "Tempo" : "Base"}: ${num(c.died.count)} expired or cancelled with zero awards, ${money(c.died.reward, c.token)} listed reward.`;
  }).join(" ");
  root.append(diedNote);
}

function renderPosters(data) {
  const root = $("posters-chart");
  root.innerHTML = "";
  const chains = selectedChains(data);
  if (state.chain === "all") {
    // merge weeks
    const map = new Map();
    for (const c of chains) {
      for (const w of c.postersByWeek) {
        if (!map.has(w.week)) map.set(w.week, { week: w.week, distinctPosters: 0, tasks: 0 });
        const row = map.get(w.week);
        // cannot sum distinct posters across chains without raw sets; show tasks summed, posters as "sum of per-chain counts" labeled honestly
        row.tasks += w.tasks;
        row[`posters_${c.network}`] = w.distinctPosters;
        row.distinctPosters += w.distinctPosters; // sum of per-chain counts, not a global unique
      }
    }
    const rows = [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
    const note = document.createElement("p");
    note.className = "caption";
    note.textContent = "In the Both-chains view, “distinct posters” is the sum of each chain’s unique requesters that week — not a de-duplicated cross-chain unique, because a poster could appear on both.";
    root.append(note);
    root.append(barChart(rows, { key: "distinctPosters", labelKey: "week", color: "#D9A097" }));
  } else {
    const c = chains[0];
    root.append(barChart(c.postersByWeek, { key: "distinctPosters", labelKey: "week", color: "#D9A097" }));
  }

  const conc = $("concentration");
  conc.innerHTML = "";
  for (const c of chains) {
    const card = document.createElement("div");
    card.className = "chart-wrap";
    const t7 = c.concentration7d;
    const t30 = c.concentration30d;
    card.innerHTML = `<p class="legend">${c.network === "tempo" ? "Tempo" : "Base"} · last 7 / 30 days</p>
      <p class="caption">${num(t7.distinctPosters)} posters made ${num(t7.tasks)} tasks in 7 days (top three: ${num(t7.top3Share * 100, 1)}%). ${num(t30.distinctPosters)} posters made ${num(t30.tasks)} tasks in 30 days (top three: ${num(t30.top3Share * 100, 1)}%).</p>`;
    const table = document.createElement("table");
    table.className = "poster-table";
    table.innerHTML = `<thead><tr><th>Poster</th><th class="num">Tasks, 7d</th><th class="num">Listed reward</th></tr></thead>`;
    const tb = document.createElement("tbody");
    for (const p of t7.top) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="who"><span class="name">${escapeHtml(p.name || shortAddr(p.requester))}</span><span class="addr">${escapeHtml(shortAddr(p.requester))}</span></td>
        <td class="num">${num(p.tasks)}</td>
        <td class="num">${money(p.reward, c.token)}</td>`;
      tb.append(tr);
    }
    if (!t7.top.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="empty">No tasks in this window on the fetched list.</td>`;
      tb.append(tr);
    }
    table.append(tb);
    card.append(table);
    conc.append(card);
  }
}

function renderSeries(data) {
  const root = $("series-chart");
  root.innerHTML = "";
  const rows = seriesForRange(data);
  root.append(lineChart(rows, [
    { key: "tasksCreated", label: "Tasks created", color: "#D9A097" },
    { key: "completedTasks", label: "Completed tasks (API field)", color: "#EFE9E2" },
  ]));
  root.append(lineChart(rows, [
    { key: "newAgents", label: "New agents", color: "#D9A097" },
    { key: "activeAgents", label: "Active agents", color: "#EFE9E2" },
    { key: "settlements", label: "Settlements", color: "#B0A79D" },
  ]));
}

function renderMix(data) {
  const root = $("mix-charts");
  root.innerHTML = "";
  const official = document.createElement("div");
  official.innerHTML = "<p class='legend'>Official /api/stats/breakdowns (platform-wide)</p>";
  official.append(horizBars(data.breakdowns.mode, { label: "mode", value: "count", color: "#D9A097" }));
  official.append(horizBars(data.breakdowns.status, { label: "status", value: "count", color: "#453E37" }));
  root.append(official);

  const lists = document.createElement("div");
  lists.innerHTML = "<p class='legend'>From the /api/tasks lists we fetched (may be shorter than full history)</p>";
  const modes = new Map();
  const statuses = new Map();
  for (const c of selectedChains(data)) {
    for (const r of c.fromTasks.mode) modes.set(r.mode, (modes.get(r.mode) || 0) + r.count);
    for (const r of c.fromTasks.status) statuses.set(r.status, (statuses.get(r.status) || 0) + r.count);
  }
  lists.append(horizBars([...modes].map(([mode, count]) => ({ mode, count })), { label: "mode", value: "count", color: "#D9A097" }));
  lists.append(horizBars([...statuses].map(([status, count]) => ({ status, count })), { label: "status", value: "count", color: "#453E37" }));
  root.append(lists);
}

function renderHeat(data) {
  const root = $("heat-charts");
  root.innerHTML = "";
  root.className = "heatgrid";
  const mode = heatFor(data, "mode");
  const hour = heatFor(data, "hourOfWeek");

  const modeBlock = document.createElement("div");
  modeBlock.className = "heat-block";
  modeBlock.innerHTML = "<h3>Mode over time</h3>";
  if (mode && mode.cells) {
    // pivot to lines by mode
    const cols = mode.colKeys || [];
    const rows = (mode.rowKeys || []).map((rk) => {
      const obj = { bucket: rk };
      // actually we want time on x, mode as series
      return obj;
    });
    const byCol = new Map();
    for (const col of cols) byCol.set(String(col), { bucket: String(col) });
    for (const cell of mode.cells) {
      const col = byCol.get(String(cell.col));
      if (col) col[cell.row] = cell.count || 0;
    }
    const seriesColors = {
      bounty: "#D9A097",
      claim: "#EFE9E2",
      pitch: "#B0A79D",
      benchmark: "#453E37",
      auction: "#E74079",
    };
    const keys = mode.rowKeys || [];
    modeBlock.append(lineChart([...byCol.values()], keys.map((k) => ({
      key: k,
      label: k,
      color: seriesColors[k] || "#B0A79D",
    }))));
  } else {
    modeBlock.innerHTML += "<p class='empty'>No mode heatmap in this range.</p>";
  }
  root.append(modeBlock);

  const hourBlock = document.createElement("div");
  hourBlock.className = "heat-block chart-wrap";
  hourBlock.innerHTML = "<h3>Hour of week</h3>";
  if (hour && hour.cells) {
    const max = Math.max(1, hour.maxCount || 0, ...hour.cells.map((c) => c.count || 0));
    const table = document.createElement("table");
    table.className = "hour-heat";
    const head = document.createElement("tr");
    head.append(document.createElement("th"));
    for (let h = 0; h < 24; h++) {
      const th = document.createElement("th");
      th.textContent = String(h);
      head.append(th);
    }
    const thead = document.createElement("thead");
    thead.append(head);
    table.append(thead);
    const body = document.createElement("tbody");
    const lookup = new Map(hour.cells.map((c) => [`${c.row}-${c.col}`, c.count || 0]));
    const rowKeys = hour.rowKeys || ["0", "1", "2", "3", "4", "5", "6"];
    const colKeys = hour.colKeys || Array.from({ length: 24 }, (_, i) => String(i));
    for (const rk of rowKeys) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = `r${rk}`;
      tr.append(th);
      for (const ck of colKeys) {
        const td = document.createElement("td");
        const v = lookup.get(`${rk}-${ck}`) || 0;
        const cell = document.createElement("span");
        cell.className = "cell";
        cell.style.background = heatLerp(v / max);
        cell.title = `row ${rk}, hour ${ck}: ${v}`;
        td.append(cell);
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    hourBlock.append(table);
    const cap = document.createElement("p");
    cap.className = "caption";
    cap.style.marginTop = "8px";
    cap.textContent = `Rows are weekday indexes 0–6 and columns are hours 0–23, as returned by the API. Timezone is not stated. Max cell count in this range: ${num(max)}.`;
    hourBlock.append(cap);
  } else {
    hourBlock.innerHTML += "<p class='empty'>No hour-of-week heatmap in this range.</p>";
  }
  root.append(hourBlock);
}

function renderFeed(data) {
  const list = $("feed-list");
  list.innerHTML = "";
  let items = data.feed.items || [];
  if (state.chain === "tempo") items = items.filter((i) => Number(i.chainId) === 4217);
  if (state.chain === "base") items = items.filter((i) => Number(i.chainId) === 8453);
  if (!items.length) {
    list.innerHTML = "<li class='empty'>No feed items in this view.</li>";
    return;
  }
  for (const i of items) {
    const li = document.createElement("li");
    const typ = String(i.type || "").replace(/_/g, " ");
    const amt = i.amount != null ? ` · ${num(i.amount, 2)}` : "";
    li.innerHTML = `<time datetime="${escapeHtml(i.timestamp)}">${escapeHtml(etShort(i.timestamp))}</time>
      <div><div class="typ">${escapeHtml(typ)} · ${escapeHtml(chainName(i.chainId))}${amt}</div>
      <div class="ttl">${escapeHtml(i.taskTitle || i.taskId || "")}</div>
      <div class="addr mono">${escapeHtml(i.actorType || "")}${i.actor ? " · " + shortAddr(i.actor) : ""}</div></div>`;
    list.append(li);
  }
}

function renderMethods(data) {
  const root = $("methods-body");
  const ends = (data.endpoints || []).map((u) => `<li class="endpoints">${escapeHtml(u)}</li>`).join("");
  root.innerHTML = `
    <p>${escapeHtml(data.note.explanation)}</p>
    <h3>What is computed here</h3>
    <ul>
      <li>Distinct posters per week: unique requester addresses on tasks created in that UTC week (Monday 00:00 UTC) from paginated <span class="mono">/api/tasks</span> lists (open, completed, expired, cancelled, claimed, worker_selected, pending_approval; up to 20 pages of 100 per status per chain).</li>
      <li>Reward units: API amounts are 6-decimal integers; the snapshot divides by 1,000,000. Tempo rewards are labeled OUSD, Base rewards USDC. Platform-wide series volumes are not labeled as a single token, because the payload was identical for both chain IDs.</li>
      <li>Expired unpaid: status expired or cancelled and awardCount 0, from those lists — not from a dedicated API field.</li>
      <li>Poster names: taken only from <span class="mono">requesterDisplayName</span>. Addresses are otherwise shortened, never given an invented name.</li>
    </ul>
    <h3>Limits</h3>
    <ul>
      <li>The task lists are whatever the public API returned within the page cap, so older weeks can be incomplete. Official breakdown totals may be larger than our lists.</li>
      <li>On this snapshot, breakdowns, time series, and heatmaps were identical for chainId 4217 and 8453 (${data.note.breakdownsIdenticalAcrossChains && data.note.timeSeriesIdenticalAcrossChains && data.note.heatmapsIdenticalAcrossChains ? "yes" : "check the snapshot"}). Headlines differ on paidWorkers and activeWallets.</li>
      <li>This site does not hold a wallet, ask for a key, or send analytics.</li>
    </ul>
    <h3>Snapshot</h3>
    <p>Fetched at ${escapeHtml(et(data.fetchedAt))} (<span class="mono">${escapeHtml(data.fetchedAt)}</span>) from <span class="mono">${escapeHtml(data.source)}</span>.</p>
    <p>Endpoints read:</p>
    <ul>${ends}</ul>
  `;
}

function render() {
  const data = state.data;
  if (!data) return;
  renderHeadlines(data);
  renderSwarm(data);
  renderFlow(data);
  renderPosters(data);
  renderSeries(data);
  renderMix(data);
  renderHeat(data);
  renderFeed(data);
  renderMethods(data);
}

function bindToolbar() {
  document.querySelectorAll("[data-chain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.chain = btn.getAttribute("data-chain");
      document.querySelectorAll("[data-chain]").forEach((b) => b.classList.toggle("on", b === btn));
      const url = new URL(location.href);
      url.hash = location.hash || "#now";
      history.replaceState({ chain: state.chain, range: state.range }, "", url);
      render();
    });
  });
  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.range = btn.getAttribute("data-range");
      document.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", b === btn));
      render();
    });
  });
  const mark = () => {
    const id = (location.hash || "#now").slice(1);
    document.querySelectorAll(".toc a").forEach((a) => {
      a.setAttribute("aria-current", a.getAttribute("href") === `#${id}` ? "true" : "false");
    });
  };
  window.addEventListener("hashchange", mark);
  mark();
}

async function main() {
  bindToolbar();
  try {
    const res = await fetch("data/market.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`market.json ${res.status}`);
    state.data = await res.json();
    render();
  } catch (err) {
    $("as-of").textContent = "";
    $("lede").className = "err";
    $("lede").textContent = "Could not load data/market.json. Run node scripts/fetch-market.mjs, then serve the public/ folder.";
    console.error(err);
  }
}

main();
