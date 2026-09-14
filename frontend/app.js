// =============================================================
// Helpers
// =============================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

function inr(n) {
  if (n === null || n === undefined) return "—";
  return "₹" + Number(n).toLocaleString("en-IN");
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

// Honest attribution: distinguishes live Groq-generated narrative from the
// templated fallback used when no key is configured or a call fails — never
// implies every number on screen was "AI-generated" when most are calculated.
function aiTag(usedAi) {
  return usedAi
    ? `<div class="ai-tag ai-tag-live">🤖 Powered by GrowthPilot AI</div>`
    : `<div class="ai-tag ai-tag-fallback">📋 GrowthPilot AI (offline reasoning — Groq unavailable)</div>`;
}

// =============================================================
// "Explain This" — Step 26: a reusable ⓘ button for any number, anywhere.
// Context is kept in a JS registry (not a DOM attribute) so we never have to
// HTML-escape arbitrary text, and one delegated click listener handles every
// button on the page, including ones rendered after this file first runs.
// =============================================================
let _explainCounter = 0;
const _explainRegistry = {};

function explainBtn(label, value, context) {
  const id = `exp${_explainCounter++}`;
  _explainRegistry[id] = { label, value: String(value), context: context || "" };
  const btn = `<button class="explain-btn" type="button" data-explain-id="${id}" title="Explain this number">ⓘ</button>`;
  const panel = `<div class="explain-inline hidden" data-explain-panel="${id}"></div>`;
  return { btn, panel, html: btn + panel };
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".explain-btn");
  if (!btn) return;
  const id = btn.dataset.explainId;
  const panel = document.querySelector(`[data-explain-panel="${id}"]`);
  if (!panel) return;
  if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
  const entry = _explainRegistry[id];
  if (!entry) { panel.classList.remove("hidden"); panel.innerHTML = `<span class="muted">No context available.</span>`; return; }
  panel.classList.remove("hidden");
  panel.innerHTML = `<span class="muted">Thinking…</span>`;
  try {
    const r = await api("/api/explain", { method: "POST", body: JSON.stringify(entry) });
    panel.innerHTML = `${r.explanation}${aiTag(r.used_ai)}`;
  } catch {
    panel.innerHTML = `<span class="muted">Could not load an explanation right now.</span>`;
  }
});

const AGENT_LIST = [
  { key: "analyst", name: "Business Analyst", icon: "📊" },
  { key: "customer", name: "Customer Intel", icon: "👥" },
  { key: "forecast", name: "Forecast", icon: "📈" },
  { key: "strategy", name: "Strategy", icon: "🎯" },
  { key: "marketing", name: "Marketing", icon: "📢" },
  { key: "roi", name: "ROI", icon: "💰" },
  { key: "action", name: "Action", icon: "⚡" },
];

const LOOP_STEPS = ["DETECT", "UNDERSTAND", "PREDICT", "DECIDE", "CREATE", "ASK MERCHANT", "EXECUTE", "MEASURE", "LEARN"];

// =============================================================
// AI network visualization (SVG, shared by hero + agents page)
// =============================================================
function buildNetworkSVG({ width = 620, height = 520, coreLabel = "GROWTHPILOT\nAI", nodes, particles = true, nodeR = 46, coreR = 58 }) {
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) / 2 - (nodeR + 24);

  const placed = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  let links = "";
  let particlesHtml = "";
  placed.forEach((n, i) => {
    links += `<line class="net-link" x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}"></line>`;
    if (particles) {
      const dur = (3.2 + (i % 4) * 0.6).toFixed(1);
      const delay = (i * 0.35).toFixed(1);
      particlesHtml += `
        <circle class="net-particle" r="2.6">
          <animateMotion dur="${dur}s" repeatCount="indefinite" begin="${delay}s"
            path="M${cx},${cy} L${n.x},${n.y}"></animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="${dur}s" repeatCount="indefinite" begin="${delay}s"></animate>
        </circle>`;
    }
  });

  let nodesHtml = "";
  const nodeIconSize = Math.round(nodeR * 0.34);
  const nodeLabelSize = Math.round(nodeR * 0.21);
  const nodeLineGap = Math.round(nodeR * 0.26);
  placed.forEach((n) => {
    const lines = n.name.split(" ");
    nodesHtml += `
      <g class="net-node" transform="translate(${n.x},${n.y})">
        <circle class="net-node-bg" r="${nodeR}"></circle>
        <text class="net-core-text" text-anchor="middle" y="${-nodeR * 0.14}" font-size="${nodeIconSize}">${n.icon || ""}</text>
        ${lines.map((w, i) => `<text class="net-node-text" text-anchor="middle" y="${nodeR * 0.32 + i * nodeLineGap}" font-size="${nodeLabelSize}">${w}</text>`).join("")}
      </g>`;
  });

  const coreLines = coreLabel.split("\n");
  const coreFontSize = Math.round(coreR * 0.24);
  const coreLineGap = Math.round(coreR * 0.28);

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1E6FEA"></stop>
          <stop offset="100%" stop-color="#00394F"></stop>
        </radialGradient>
      </defs>
      ${links}
      ${particlesHtml}
      ${nodesHtml}
      <g transform="translate(${cx},${cy})">
        <circle class="net-core-ring" r="${coreR + 10}">
          <animate attributeName="r" values="${coreR + 6};${coreR + 16};${coreR + 6}" dur="3.4s" repeatCount="indefinite"></animate>
          <animate attributeName="opacity" values="0.6;0.15;0.6" dur="3.4s" repeatCount="indefinite"></animate>
        </circle>
        <circle class="net-core-circle" r="${coreR}"></circle>
        ${coreLines.map((l, i) => `<text class="net-core-text" text-anchor="middle" y="${(i - (coreLines.length - 1) / 2) * coreLineGap + coreFontSize * 0.35}" font-size="${coreFontSize}">${l}</text>`).join("")}
      </g>
    </svg>`;
}

function renderHeroNetwork() {
  $("#hero-network").innerHTML = buildHeroCompositionSVG();
}

// Center core with agents/stats balanced 4-left / 4-right / 2-bottom / 1-top
// around it — a symmetric layout instead of a lopsided one (previously 3 left /
// 4 right / 0 top / 4 bottom, which read as bottom-heavy).
function buildHeroCompositionSVG() {
  const W = 880, H = 660;
  const coreX = 440, coreY = 330, coreR = 68;

  // 7 agents + 4 stats = 11 nodes total, split 4 / 4 / 2 / 1.
  const leftAgents = [
    { name: "Business\nAnalyst", icon: "📊", x: 130, y: 130, r: 46 },
    { name: "Customer\nIntelligence", icon: "👥", x: 108, y: 270, r: 46 },
  ];
  const leftStats = [
    { label: "Revenue", icon: "₹", x: 130, y: 410 },
    { label: "Customers", icon: "👤", x: 150, y: 540 },
  ];
  const rightAgents = [
    { name: "Strategy", icon: "🎯", x: 750, y: 120, r: 44 },
    { name: "Marketing", icon: "📢", x: 772, y: 260, r: 44 },
    { name: "ROI", icon: "💰", x: 772, y: 400, r: 44 },
    { name: "Action", icon: "⚡", x: 750, y: 540, r: 44 },
  ];
  const bottomStats = [
    { label: "Growth", icon: "📈", x: 340, y: 610 },
    { label: "Insights", icon: "🔮", x: 540, y: 610 },
  ];
  const topAgent = [
    { name: "Forecast", icon: "📉", x: 440, y: 70, r: 46 },
  ];

  let linksSvg = "", particlesSvg = "", nodesSvg = "", statsSvg = "";
  let particleI = 0;

  const addAgentNode = (n) => {
    particleI++;
    linksSvg += `<line class="net-link" x1="${coreX}" y1="${coreY}" x2="${n.x}" y2="${n.y}"></line>`;
    const dur = (3 + particleI * 0.4).toFixed(1);
    const delay = (particleI * 0.35).toFixed(1);
    particlesSvg += `
      <circle class="net-particle" r="2.8">
        <animateMotion dur="${dur}s" repeatCount="indefinite" begin="${delay}s" path="M${coreX},${coreY} L${n.x},${n.y}"></animateMotion>
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="${dur}s" repeatCount="indefinite" begin="${delay}s"></animate>
      </circle>`;
    const lines = n.name.split("\n");
    const iconSize = Math.round(n.r * 0.34), labelSize = Math.round(n.r * 0.2), lineGap = Math.round(n.r * 0.26);
    nodesSvg += `
      <g transform="translate(${n.x},${n.y})">
        <circle class="net-node-bg" r="${n.r}"></circle>
        <text class="net-core-text" text-anchor="middle" y="${-n.r * 0.14}" font-size="${iconSize}">${n.icon}</text>
        ${lines.map((w, li) => `<text class="net-node-text" text-anchor="middle" y="${n.r * 0.32 + li * lineGap}" font-size="${labelSize}">${w}</text>`).join("")}
      </g>`;
  };

  // Stat pills feed UP into the core (particles travel stat → core), representing
  // live business data feeding the AI, distinct from agents which the AI feeds out to.
  const addStatNode = (s, i) => {
    linksSvg += `<line class="net-link net-link-stat" x1="${s.x}" y1="${s.y}" x2="${coreX}" y2="${coreY}"></line>`;
    const dur = (2.6 + i * 0.35).toFixed(1);
    particlesSvg += `
      <circle class="net-particle net-particle-stat" r="2.4">
        <animateMotion dur="${dur}s" repeatCount="indefinite" begin="${(i * 0.3).toFixed(1)}s" path="M${s.x},${s.y} L${coreX},${coreY}"></animateMotion>
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="${dur}s" repeatCount="indefinite" begin="${(i * 0.3).toFixed(1)}s"></animate>
      </circle>`;
    statsSvg += `
      <g transform="translate(${s.x},${s.y})">
        <rect class="net-stat-bg" x="-58" y="-26" width="116" height="52" rx="14"></rect>
        <text class="net-stat-icon" text-anchor="middle" y="-4" font-size="15">${s.icon}</text>
        <text class="net-stat-label" text-anchor="middle" y="15" font-size="11">${s.label}</text>
      </g>`;
  };

  topAgent.forEach(addAgentNode);
  leftAgents.forEach(addAgentNode);
  leftStats.forEach((s, i) => addStatNode(s, i));
  rightAgents.forEach(addAgentNode);
  bottomStats.forEach((s, i) => addStatNode(s, i + leftStats.length));

  const coreFontSize = Math.round(coreR * 0.22), coreLineGap = Math.round(coreR * 0.3);

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1E6FEA"></stop>
          <stop offset="100%" stop-color="#00394F"></stop>
        </radialGradient>
      </defs>
      ${linksSvg}
      ${particlesSvg}
      ${nodesSvg}
      ${statsSvg}
      <g transform="translate(${coreX},${coreY})">
        <circle class="net-core-ring" r="${coreR + 10}">
          <animate attributeName="r" values="${coreR + 6};${coreR + 16};${coreR + 6}" dur="3.4s" repeatCount="indefinite"></animate>
          <animate attributeName="opacity" values="0.6;0.15;0.6" dur="3.4s" repeatCount="indefinite"></animate>
        </circle>
        <circle class="net-core-circle" r="${coreR}"></circle>
        <text class="net-core-text" text-anchor="middle" y="${-coreLineGap * 0.5 + coreFontSize * 0.35}" font-size="${coreFontSize}">GROWTHPILOT</text>
        <text class="net-core-text" text-anchor="middle" y="${coreLineGap * 0.5 + coreFontSize * 0.35}" font-size="${coreFontSize}">AI</text>
      </g>
    </svg>`;
}

function renderAgentNetwork(agents) {
  const nodes = agents.map(a => ({ name: a.name.replace(" Agent", ""), icon: iconForAgent(a.key) }));
  $("#agent-network").innerHTML = buildNetworkSVG({ width: 900, height: 440, coreLabel: "ORCHESTRATOR", nodes });
}

function iconForAgent(key) {
  return { analyst: "📊", customer: "👥", forecast: "📈", strategy: "🎯", marketing: "📢", roi: "💰", action: "⚡" }[key] || "✦";
}

// =============================================================
// Loop track (autonomous growth loop)
// =============================================================
function renderLoop(container) {
  container.innerHTML = LOOP_STEPS.map((s, i) =>
    `<span class="loop-step" data-i="${i}">${s}</span>${i < LOOP_STEPS.length - 1 ? '<span class="loop-arrow">→</span>' : ""}`
  ).join("");
  let i = 0;
  setInterval(() => {
    $$(".loop-step", container).forEach(el => el.classList.remove("active"));
    const el = container.querySelector(`.loop-step[data-i="${i}"]`);
    if (el) el.classList.add("active");
    i = (i + 1) % LOOP_STEPS.length;
  }, 1100);
}

// =============================================================
// Feature grid (landing preview)
// =============================================================
const FEATURES_PREVIEW = [
  { icon: "🩺", title: "AI Business Doctor", desc: "Diagnoses the one problem worth fixing first — not just charts." },
  { icon: "🎯", title: "Growth Opportunity Radar", desc: "Surfaces hidden revenue opportunities before you go looking." },
  { icon: "🔮", title: "What-If Simulator", desc: "Test discount, budget, and targeting before you spend a rupee." },
  { icon: "📢", title: "AI Campaign Studio", desc: "Generates targeted campaigns in English, Hindi, or Hinglish." },
  { icon: "👥", title: "Customer DNA", desc: "Six intelligent segments, each with a recommended strategy." },
  { icon: "🚨", title: "Anomaly Detector", desc: "Watches your revenue continuously and explains the 'why'." },
];

function renderFeatureGrid() {
  $("#feature-grid").innerHTML = FEATURES_PREVIEW.map(f => `
    <div class="feature-tile">
      <span class="ft-icon">${f.icon}</span>
      <h4>${f.title}</h4>
      <p>${f.desc}</p>
    </div>`).join("");
}

// =============================================================
// Navigation
// =============================================================
const VIEW_TITLES = {
  overview: ["Overview", "Your business at a glance"],
  customers: ["Customer DNA", "Six intelligent segments, one strategy each"],
  radar: ["Growth Opportunity Radar", "Hidden opportunities, ranked by impact"],
  campaigns: ["AI Campaign Studio", "Generate targeted campaigns in seconds"],
  simulator: ["What-If Simulator", "Test strategies before you spend"],
  agents: ["AI Agent Network", "8 specialized agents, one orchestrator"],
  "growth-tools": ["Growth Tools", "Heatmap, Soundbox intelligence, financing signals, and missions"],
  insights: ["Insights", "Ask GrowthPilot anything about your business"],
  actions: ["Action Center", "Approve, modify, or reject AI recommendations"],
};

function showView(view) {
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
  const [title, sub] = VIEW_TITLES[view];
  $("#view-title").textContent = title;
  $("#view-sub").textContent = sub;
  loadView(view);
}

const _loaded = new Set();
function loadView(view) {
  // Load once, then let in-view refresh buttons handle updates
  if (_loaded.has(view)) return;
  _loaded.add(view);
  if (view === "overview") loadOverview();
  if (view === "customers") loadCustomers();
  if (view === "radar") loadRadar();
  if (view === "agents") loadAgents();
  if (view === "growth-tools") loadGrowthTools();
  if (view === "insights") loadInsights();
  if (view === "actions") loadActions();
  if (view === "campaigns") loadCampaignsView();
  if (view === "simulator") loadSimulatorSegments();
}

// =============================================================
// OVERVIEW
// =============================================================
let revenueChart, forecastChart, segmentChart;

async function loadOverview() {
  const dash = await api("/api/dashboard");
  $("#merchant-name").textContent = dash.merchant.name;
  $("#merchant-cat").textContent = dash.merchant.category;

  const k = dash.kpis;
  const kpis = [
    { key: "revenue", label: "Revenue", value: inr(k.revenue), delta: `+${k.revenue_growth_pct}%`, up: true },
    { key: "transactions", label: "Transactions", value: k.transactions.toLocaleString("en-IN") },
    { key: "active_customers", label: "Active Customers", value: k.active_customers.toLocaleString("en-IN") },
    { key: "avg_order_value", label: "Avg Order Value", value: inr(k.avg_order_value) },
    { key: "expected_monthly_revenue", label: "Expected Monthly Revenue", value: inr(k.expected_monthly_revenue) },
    { key: "growth_score", label: "Growth Score", value: `${k.growth_score}/100` },
  ];
  $("#kpi-grid").innerHTML = kpis.map(c => `
    <div class="kpi-card">
      <div class="kpi-card-top">
        <div class="kpi-label">${c.label}</div>
        <button class="kpi-explain-btn" data-metric="${c.key}" title="Explain this number">?</button>
      </div>
      <div class="kpi-value">${c.value}</div>
      ${c.delta ? `<div class="kpi-delta ${c.up ? "up" : "down"}">${c.delta} vs last month</div>` : ""}
    </div>`).join("");
  $$(".kpi-explain-btn").forEach(btn => btn.addEventListener("click", () => explainMetric(btn.dataset.metric)));

  // Score ring + factors
  const circumference = 2 * Math.PI * 70;
  const offset = circumference * (1 - k.growth_score / 100);
  $("#score-ring-fg").style.strokeDasharray = circumference;
  requestAnimationFrame(() => { $("#score-ring-fg").style.strokeDashoffset = offset; });
  $("#score-value").textContent = k.growth_score;
  $("#score-factors").innerHTML = dash.score_factors.map(f => {
    const eb = explainBtn(f.label, `${f.value}/${f.max}`,
      `${f.label} contributes ${f.value} out of a possible ${f.max} points to the overall Growth Score of ${k.growth_score}/100.`);
    return `
      <div class="score-factor-item">
        <div class="score-factor-row">
          <span class="sf-label">${f.label}</span>
          <span class="sf-bar"><span class="sf-fill" style="width:${(f.value / f.max) * 100}%"></span></span>
          <span class="sf-val">${f.value}/${f.max}</span>
          ${eb.btn}
        </div>
        ${eb.panel}
      </div>`;
  }).join("");

  // Revenue history chart
  const labels = dash.revenue_history.map(d => d.date.slice(5));
  const values = dash.revenue_history.map(d => d.revenue);
  if (revenueChart) { try { revenueChart.destroy(); } catch (e) { /* was never created if Chart failed */ } }
  revenueChart = safeChart("#chart-revenue-history", {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values, borderColor: "#00E5FF", backgroundColor: "rgba(0,229,255,0.08)",
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
      }],
    },
    options: chartOpts(),
  });

  // These must run regardless of whether the chart above succeeded — a CDN
  // failure for Chart.js should never take the rest of the dashboard down with it.
  loadAnomaly();
  loadBrief();
}

function chartOpts(extra = {}) {
  return {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#5E7086", font: { size: 10 } } },
      y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#5E7086", font: { size: 10 } } },
    },
    ...extra,
  };
}

// Chart.js loads from a CDN — if it's blocked (firewall, ad-blocker, offline demo)
// or throws for any reason, the page must not silently break. This wraps every
// chart creation so a failure degrades to a readable list instead of an empty
// box and, critically, never lets one chart's failure stop the rest of the
// view's independent data (anomaly, brief, etc.) from loading.
function safeChart(canvasSel, config) {
  const canvas = $(canvasSel);
  if (!canvas) return null;
  canvas.style.display = "";
  const existingFallback = canvas.nextElementSibling;
  if (existingFallback && existingFallback.classList.contains("chart-fallback")) existingFallback.remove();
  if (typeof Chart === "undefined") {
    renderChartFallback(canvas, config);
    return null;
  }
  try {
    return new Chart(canvas, config);
  } catch (e) {
    renderChartFallback(canvas, config);
    return null;
  }
}

function renderChartFallback(canvas, config) {
  canvas.style.display = "none";
  const fb = document.createElement("div");
  fb.className = "chart-fallback";
  canvas.parentNode.insertBefore(fb, canvas.nextSibling);

  const labels = (config.data && config.data.labels) || [];
  const dataset = config.data && config.data.datasets && config.data.datasets[0];
  if (!dataset || !labels.length) {
    fb.innerHTML = `<p class="muted">Chart temporarily unavailable.</p>`;
    return;
  }
  const values = dataset.data || [];
  const max = Math.max(...values.map(v => Math.abs(Number(v) || 0)), 1);
  fb.innerHTML = `
    <p class="muted chart-fallback-note">📊 Chart library didn't load — showing the same values directly.</p>
    <div class="chart-fallback-bars">
      ${labels.map((l, i) => {
        const v = Number(values[i]) || 0;
        return `
        <div class="cfb-row">
          <span class="cfb-label">${l}</span>
          <span class="cfb-bar"><span style="width:${Math.max(2, (Math.abs(v) / max) * 100)}%"></span></span>
          <span class="cfb-val">${v.toLocaleString("en-IN")}</span>
        </div>`;
      }).join("")}
    </div>`;
}

$("#btn-why-score")?.addEventListener("click", async () => {
  $("#btn-why-score").textContent = "Thinking…";
  const r = await api("/api/growth-score/explain");
  $("#score-explain").innerHTML = `${r.explanation}${aiTag(r.used_ai)}`;
  $("#btn-why-score").textContent = "Why this score?";
});

$("#btn-diagnose")?.addEventListener("click", async () => {
  const btn = $("#btn-diagnose");
  btn.textContent = "Analyzing…"; btn.disabled = true;
  try {
    const r = await api("/api/business-doctor");
    $("#doctor-result").classList.remove("empty");
    $("#doctor-result").innerHTML = `
      <div class="dr-diagnosis">${r.diagnosis}</div>
      <div class="dr-block"><div class="dr-label">Why it's happening</div>${r.why}</div>
      <div class="dr-block"><div class="dr-label">Business impact</div>${r.impact}</div>
      <div class="dr-block"><div class="dr-label">Recommended action</div>${r.recommended_action}</div>
      <div class="dr-metrics">
        <div class="dr-metric"><b>${inr(r.estimated_revenue_impact)}</b><span>Est. revenue impact</span></div>
        <div class="dr-metric"><b>+${r.expected_conversion_pct}%</b><span>Expected conversion</span></div>
        <div class="dr-metric"><b>${r.confidence}%</b><span>Confidence</span></div>
      </div>
      ${aiTag(r.used_ai)}
      <button class="btn btn-primary btn-small" id="btn-create-campaign-from-doctor">Create Campaign</button>`;
    $("#btn-create-campaign-from-doctor").addEventListener("click", () => {
      showView("campaigns"); $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === "campaigns"));
    });
  } finally {
    btn.textContent = "Diagnose My Business"; btn.disabled = false;
  }
});

async function loadAnomaly() {
  const r = await api("/api/anomaly");
  const el = $("#anomaly-result");
  if (r.detected) {
    el.className = "anomaly-result detected";
    el.innerHTML = `
      <div class="anomaly-headline">${r.headline || `Revenue dropped ${r.drop_pct}% yesterday`}</div>
      <div class="muted">Likely cause: ${r.likely_cause}</div>
      <div class="muted" style="margin-top:6px;">Recommended: ${r.recommended_action}</div>`;
  } else {
    el.className = "anomaly-result clear";
    el.textContent = "No anomalies detected. Revenue is tracking within its normal range.";
  }
}

async function loadBrief() {
  const r = await api("/api/daily-brief");
  const extraStats = [];
  if (r.customer_change_pct !== null && r.customer_change_pct !== undefined) extraStats.push(`<span>Customers <b style="color:#3ED598">+${r.customer_change_pct}%</b></span>`);
  if (r.repeat_rate_change_pct !== null && r.repeat_rate_change_pct !== undefined) extraStats.push(`<span>Repeat rate <b style="color:#FF6B6B">${r.repeat_rate_change_pct}%</b></span>`);
  $("#brief-result").innerHTML = `
    <div class="brief-greet">${r.greeting}</div>
    <div class="brief-stats">
      <span>Revenue <b style="color:#3ED598">${r.revenue_change_pct >= 0 ? "+" : ""}${r.revenue_change_pct}%</b></span>
      ${extraStats.join("")}
    </div>
    <p>${r.narrative}</p>
    ${aiTag(r.used_ai)}`;
}

async function explainMetric(metricKey) {
  const panel = $("#kpi-explain-panel");
  panel.classList.remove("hidden");
  $("#kpi-explain-title").textContent = "Explaining this number…";
  $("#kpi-explain-text").textContent = "Thinking…";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const r = await api(`/api/explain-metric/${metricKey}`);
  const label = metricKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  $("#kpi-explain-title").textContent = `Explain My Numbers — ${label}`;
  $("#kpi-explain-text").innerHTML = `${r.explanation}${aiTag(r.used_ai)}`;
}

// =============================================================
// CUSTOMERS
// =============================================================
async function loadCustomers() {
  const { segments } = await api("/api/customers/segments");
  if (segmentChart) { try { segmentChart.destroy(); } catch (e) { /* was never created if Chart failed */ } }
  segmentChart = safeChart("#chart-segments", {
    type: "doughnut",
    data: {
      labels: segments.map(s => s.name),
      datasets: [{ data: segments.map(s => s.pct), backgroundColor: segments.map(s => s.color), borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { position: "bottom", labels: { color: "#9FB2C7", font: { size: 11 }, boxWidth: 10 } } },
      onClick: (evt, els) => { if (els.length) showSegmentDetail(segments[els[0].index]); },
    },
  });
  // Note: the segment-list chips below are the primary interaction surface for
  // selecting a segment, so segment detail still works even if the chart above fell back.

  $("#segment-list").innerHTML = segments.map(s => `
    <div class="segment-chip" data-key="${s.key}">
      <span class="seg-pct">${s.pct}%</span>
      <span class="seg-dot" style="background:${s.color}"></span>
      <span class="seg-name">${s.name}</span>
      <div class="seg-count">${s.count.toLocaleString("en-IN")} customers</div>
    </div>`).join("");
  $$(".segment-chip").forEach(chip => chip.addEventListener("click", () => {
    showSegmentDetail(segments.find(s => s.key === chip.dataset.key));
  }));
  showSegmentDetail(segments[0]);

  const cs = await api("/api/customers/cross-sell");
  if (cs.available === false) {
    $("#cross-sell-card").innerHTML = `<p class="muted">${cs.message}</p>`;
  } else {
    $("#cross-sell-card").innerHTML = `
      <div class="cross-sell-pill">${cs.pair.join(" + ")}</div>
      <span class="cross-sell-arrow">→</span>
      <div class="cross-sell-pill">${cs.recommended}</div>
      <div class="muted">Customers who buy this combination purchase ${cs.recommended} ${Math.round(cs.attach_rate * 100)}% of the time.
      Projected monthly impact: <b style="color:#00E5FF">${inr(cs.monthly_impact)}</b></div>`;
  }

  const { customers } = await api("/api/personalized-offers");
  $("#personalized-offers").innerHTML = customers.map(c => `
    <div class="offer-row">
      <div class="offer-left">
        <div class="offer-name">${c.name} <span class="offer-seg">${c.segment}</span></div>
        <div class="offer-reason">${c.reasoning}</div>
      </div>
      <div class="offer-right">
        <div class="offer-tag">${c.offer_type}</div>
        <div class="offer-ltv">LTV ${inr(c.current_ltv)} → <b>${inr(c.predicted_90d_ltv)}</b></div>
      </div>
    </div>`).join("");
}

function showSegmentDetail(s) {
  const countEb = explainBtn("Customer Count", s.count.toLocaleString("en-IN"),
    `${s.name} makes up ${s.pct}% of the customer base (${s.count} customers), classified by purchase frequency and recency.`);
  const aovEb = explainBtn("Average Order Value", inr(s.avg_order_value),
    `${s.name} customers average ${inr(s.avg_order_value)} per order — ${s.strategy}`);
  const freqEb = explainBtn("Purchase Frequency", s.purchase_frequency,
    `${s.name}: ${s.purchase_frequency}. This frequency is one of the signals used to classify this segment.`);
  const ltvEb = explainBtn("Estimated LTV", inr(s.ltv),
    `Estimated lifetime value for ${s.name} is ${inr(s.ltv)}, based on total historical spend for customers in this segment.`);
  $("#segment-detail").innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span class="seg-dot" style="background:${s.color};width:12px;height:12px;border-radius:50%;display:inline-block;"></span>
      <strong style="font-family:var(--font-display);font-size:1.05rem;">${s.name}</strong>
    </div>
    <div class="seg-detail-row"><span>Customer count ${countEb.btn}</span><span>${s.count.toLocaleString("en-IN")}</span></div>
    ${countEb.panel}
    <div class="seg-detail-row"><span>Average order value ${aovEb.btn}</span><span>${inr(s.avg_order_value)}</span></div>
    ${aovEb.panel}
    <div class="seg-detail-row"><span>Purchase frequency ${freqEb.btn}</span><span>${s.purchase_frequency}</span></div>
    ${freqEb.panel}
    <div class="seg-detail-row"><span>Estimated LTV ${ltvEb.btn}</span><span>${inr(s.ltv)}</span></div>
    ${ltvEb.panel}
    <div class="seg-strategy"><strong>Recommended strategy:</strong> ${s.strategy}</div>`;
}

// =============================================================
// GROWTH RADAR
// =============================================================
async function loadRadar() {
  const { opportunities } = await api("/api/opportunities");
  renderOpportunities(opportunities);
  const { memory } = await api("/api/growth-memory");
  $("#memory-list").innerHTML = memory.map(m => `<li>${m}</li>`).join("");
}

function renderOpportunities(list) {
  $("#opportunity-grid").innerHTML = list.map(o => {
    const impactEb = explainBtn("Potential Revenue", inr(o.impact),
      `${o.title}: ${o.why} Recommended action: ${o.action}`);
    const confEb = explainBtn("Confidence", `${o.confidence}%`,
      `Confidence reflects how strongly the underlying data supports this opportunity. ${o.why}`);
    return `
    <div class="opp-card">
      <span class="opp-priority ${o.priority}">${o.priority}</span>
      <h4>${o.title}</h4>
      <div class="opp-why">${o.why}</div>
      <div class="opp-meta">
        <div><span>Potential Revenue ${impactEb.btn}</span><b>${inr(o.impact)}</b>${impactEb.panel}</div>
        <div><span>Confidence ${confEb.btn}</span><b>${o.confidence}%</b>${confEb.panel}</div>
      </div>
      <div class="opp-action">${o.action}</div>
      <button class="btn btn-primary btn-small" data-opp="${o.id}">Activate Opportunity</button>
    </div>`;
  }).join("");
  $$("[data-opp]").forEach(btn => btn.addEventListener("click", async () => {
    btn.textContent = "Activating…"; btn.disabled = true;
    await api(`/api/opportunities/${btn.dataset.opp}/activate`, { method: "POST" });
    btn.textContent = "✓ Sent to Action Center";
    _loaded.delete("actions");
    toast("Opportunity activated — check the Action Center to approve it.");
  }));
}

$("#btn-goal-plan")?.addEventListener("click", async () => {
  const goal = $("#goal-input").value.trim();
  if (!goal) return;
  const btn = $("#btn-goal-plan");
  btn.textContent = "Planning…"; btn.disabled = true;
  try {
    const r = await api("/api/goal-plan", { method: "POST", body: JSON.stringify({ goal }) });
    const stepsText = r.steps.join(" ");
    const impactEb = explainBtn("Revenue Impact", inr(r.estimated_revenue_impact),
      `Goal: "${goal}". Plan: ${stepsText}`);
    const roiEb = explainBtn("Expected ROI", `${r.expected_roi}×`,
      `Goal: "${goal}" over ${r.timeline_days} days with a budget of ${inr(r.required_budget)}. Plan: ${stepsText}`);
    $("#goal-result").innerHTML = `
      <ol class="goal-steps">${r.steps.map(s => `<li>${s}</li>`).join("")}</ol>
      <div class="goal-metrics">
        <div class="goal-metric"><b>${inr(r.estimated_revenue_impact)}</b><span>Revenue impact ${impactEb.btn}</span>${impactEb.panel}</div>
        <div class="goal-metric"><b>${r.timeline_days}d</b><span>Timeline</span></div>
        <div class="goal-metric"><b>${inr(r.required_budget)}</b><span>Required budget</span></div>
        <div class="goal-metric"><b>${r.expected_roi}×</b><span>Expected ROI ${roiEb.btn}</span>${roiEb.panel}</div>
      </div>
      ${aiTag(r.used_ai)}`;
  } finally {
    btn.textContent = "Generate My Growth Plan"; btn.disabled = false;
  }
});

// =============================================================
// CAMPAIGNS
// =============================================================
async function loadCampaignsView() {
  const { segments } = await api("/api/customers/segments");
  const sel = $("#campaign-target");
  sel.innerHTML = segments.map(s =>
    `<option value="${s.key}">${s.name} (${s.count.toLocaleString("en-IN")} customers)</option>`
  ).join("");
  const atRisk = segments.find(s => s.key === "at_risk");
  if (atRisk) sel.value = "at_risk";
}

$("#btn-generate-campaign")?.addEventListener("click", async () => {
  const targetSelect = $("#campaign-target");
  const body = {
    goal: $("#campaign-goal").value,
    segment: targetSelect.value,
    target: targetSelect.options[targetSelect.selectedIndex]?.text || targetSelect.value,
    offer: $("#campaign-offer").value,
    timing: $("#campaign-timing").value,
    language: $("#campaign-language").value,
  };
  const btn = $("#btn-generate-campaign");
  btn.textContent = "Generating…"; btn.disabled = true;
  try {
    const r = await api("/api/campaign", { method: "POST", body: JSON.stringify(body) });
    const reachEb = explainBtn("Expected Reach", r.expected_reach.toLocaleString("en-IN"),
      `Reach is computed from the actual size of the "${body.target}" segment in your active dataset, not estimated by the AI.`);
    const convEb = explainBtn("Expected Conversion", `${r.expected_conversion_pct}%`,
      `Conversion rate is modeled from the discount/cashback strength and how price-sensitive the "${body.target}" segment typically is.`);
    const roiEb = explainBtn("Expected ROI", `${r.expected_roi}×`,
      `ROI = projected incremental revenue ÷ campaign cost, computed from the "${body.target}" segment's real average order value and size.`);
    $("#campaign-result").innerHTML = `
      <div class="campaign-name">${r.campaign_name}</div>
      <div class="muted">${r.objective} · Targeting ${body.target}</div>
      <div class="campaign-message">${r.message}</div>
      <div class="campaign-metrics">
        <div class="campaign-metric"><b>${r.expected_reach.toLocaleString("en-IN")}</b><span>Expected reach ${reachEb.btn}</span>${reachEb.panel}</div>
        <div class="campaign-metric"><b>${r.expected_conversion_pct}%</b><span>Expected conversion ${convEb.btn}</span>${convEb.panel}</div>
        <div class="campaign-metric"><b>${r.expected_roi}×</b><span>Expected ROI ${roiEb.btn}</span>${roiEb.panel}</div>
      </div>
      ${aiTag(r.used_ai)}
      <button class="btn btn-outline btn-small" style="margin-top:14px;" id="btn-launch-campaign">🚀 Launch Campaign (Simulated)</button>`;
    $("#btn-launch-campaign").addEventListener("click", () => toast("Campaign launch simulated — this is a hackathon demo, no real messages were sent."));
  } finally {
    btn.textContent = "Generate Campaign"; btn.disabled = false;
  }
});

$("#whynot-discount")?.addEventListener("input", () => {
  $("#whynot-discount-val").textContent = `${$("#whynot-discount").value}%`;
});

$("#btn-why-not")?.addEventListener("click", async () => {
  const btn = $("#btn-why-not");
  btn.textContent = "Checking…"; btn.disabled = true;
  try {
    const body = {
      segment: $("#campaign-target").value,
      discount_pct: Number($("#whynot-discount").value),
      goal: $("#campaign-goal").value,
    };
    const r = await api("/api/why-not", { method: "POST", body: JSON.stringify(body) });
    $("#why-not-result").innerHTML = `
      <div class="why-not-verdict ${r.recommend ? "ok" : "caution"}">
        ${r.recommend ? "✅" : "⚠️"} ${r.verdict_text}
      </div>
      <p class="muted">${r.reasoning}</p>
      ${r.concerns && r.concerns.length > 1 ? `<ul class="why-not-concerns">${r.concerns.map(c => `<li>${c}</li>`).join("")}</ul>` : ""}
      ${aiTag(r.used_ai)}`;
  } finally {
    btn.textContent = "Why shouldn't I run this campaign?"; btn.disabled = false;
  }
});

// =============================================================
// SIMULATOR
// =============================================================
async function loadSimulatorSegments() {
  const { segments } = await api("/api/customers/segments");
  const sel = $("#sim-segment");
  const current = sel.value;
  sel.innerHTML = segments.map(s =>
    `<option value="${s.key}">${s.name} (${s.count.toLocaleString("en-IN")})</option>`
  ).join("");
  if (segments.some(s => s.key === current)) sel.value = current;
  runSimulation();
}

function wireSimulator() {
  const discount = $("#sim-discount"), budget = $("#sim-budget"), segment = $("#sim-segment"), duration = $("#sim-duration");
  const run = debounce(runSimulation, 350);
  discount.addEventListener("input", () => { $("#sim-discount-val").textContent = `${discount.value}%`; run(); });
  budget.addEventListener("input", () => { $("#sim-budget-val").textContent = inr(budget.value); run(); });
  segment.addEventListener("change", run);
  duration.addEventListener("change", run);
  runSimulation();

  $("#btn-run-experiment").addEventListener("click", async () => {
    const btn = $("#btn-run-experiment");
    btn.textContent = "Running…"; btn.disabled = true;
    try {
      const r = await api("/api/experiment", { method: "POST", body: JSON.stringify({}) });
      const winnerData = r.results.find(res => res.name === r.winner);
      const winEb = explainBtn("AI Pick", r.winner,
        `${r.winner} was chosen because it has the highest ROI (${winnerData ? winnerData.roi : "?"}×) among the tested strategies: ${r.results.map(x => `${x.name} (${x.roi}×)`).join(", ")}.`);
      $("#experiment-result").innerHTML = `
        <table class="exp-table">
          <thead><tr><th>Strategy</th><th>Revenue</th><th>Cost</th><th>ROI</th><th></th></tr></thead>
          <tbody>
            ${r.results.map(res => `
              <tr class="${res.name === r.winner ? "winner" : ""}">
                <td>${res.name}</td>
                <td>${inr(res.incremental_revenue)}</td>
                <td>${inr(res.cost)}</td>
                <td>${res.roi}×</td>
                <td>${res.name === r.winner ? `<span class="exp-winner-badge">🏆 AI PICK</span>${winEb.btn}` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
        ${winEb.panel}`;
    } finally {
      btn.textContent = "Run Experiment"; btn.disabled = false;
    }
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function runSimulation() {
  const body = {
    discount_pct: Number($("#sim-discount").value),
    budget: Number($("#sim-budget").value),
    segment: $("#sim-segment").value,
    duration_days: Number($("#sim-duration").value),
  };
  const r = await api("/api/simulate", { method: "POST", body: JSON.stringify(body) });
  const strategyBlock = (s, label, cls) => {
    const revEb = explainBtn("Incremental Revenue", inr(s.incremental_revenue),
      `${label}: ${s.reach.toLocaleString("en-IN")} customers reached in the "${s.segment}" segment, with ${s.conversions} expected conversions at their real average order value.`);
    const roiEb = explainBtn("Expected ROI", `${s.roi}×`,
      `${label}: ROI = ${inr(s.incremental_revenue)} incremental revenue ÷ ${inr(s.cost)} estimated cost for the "${s.segment}" segment.`);
    return `
    <div class="sim-strategy ${cls}">
      <h4>${label}</h4>
      <div class="sim-row"><span>Segment</span><span>${s.segment}</span></div>
      <div class="sim-row"><span>Reach</span><span>${s.reach.toLocaleString("en-IN")}</span></div>
      <div class="sim-row"><span>Expected conversions</span><span>${s.conversions}</span></div>
      <div class="sim-row"><span>Incremental revenue ${revEb.btn}</span><span>${inr(s.incremental_revenue)}</span></div>
      ${revEb.panel}
      <div class="sim-row"><span>Estimated cost</span><span>${inr(s.cost)}</span></div>
      <div class="sim-row"><span>Expected ROI ${roiEb.btn}</span><span>${s.roi}×</span></div>
      ${roiEb.panel}
      <div class="sim-row"><span>Confidence</span><span>${s.confidence}%</span></div>
    </div>`;
  };
  $("#sim-result").innerHTML = `
    <div class="sim-compare">
      ${strategyBlock(r.current_strategy, "CURRENT STRATEGY", "")}
      ${strategyBlock(r.recommended_strategy, "AI-RECOMMENDED STRATEGY", "recommended")}
    </div>`;
}

// =============================================================
// AI AGENTS
// =============================================================
const AGENT_STATUS_LABEL = { DONE: "✓ Completed", RUNNING: "● Running", READY: "○ Ready", IDLE: "○ Waiting" };

async function loadAgents() {
  const { agents } = await api("/api/agents");
  renderAgentNetwork(agents);
  $("#agent-status-list").innerHTML = agents.map((a, i) => `
    <div class="agent-status-row" data-i="${i}" style="opacity:0;">
      <div class="as-left">
        <span class="as-status-dot ${a.status}"></span>
        <div>
          <div class="as-name">${iconForAgent(a.key)} ${a.name}</div>
          <div class="as-task">${AGENT_STATUS_LABEL[a.status] || a.status} — "${a.task}"</div>
        </div>
      </div>
      ${a.confidence ? `<span class="as-conf">${a.confidence}%</span>` : ""}
    </div>`).join("");
  // Reveal sequentially so the multi-agent pipeline feels alive, not a static list dump
  $$(".agent-status-row").forEach((row, i) => {
    setTimeout(() => { row.style.transition = "opacity .35s ease"; row.style.opacity = "1"; }, i * 180);
  });
  renderLoop($("#loop-track-app"));
}

// =============================================================
// INSIGHTS
// =============================================================
const ASK_SUGGESTIONS = [
  "Why did my sales drop yesterday?",
  "Which customers should I target?",
  "What can I do to increase revenue?",
  "Which campaign should I run?",
  "Predict my revenue for next month.",
];

async function loadInsights() {
  $("#ask-suggestions").innerHTML = ASK_SUGGESTIONS.map(q => `<span class="ask-chip">${q}</span>`).join("");
  $$(".ask-chip").forEach(chip => chip.addEventListener("click", () => { $("#ask-input").value = chip.textContent; askGrowthPilot(); }));
  $("#btn-ask").addEventListener("click", askGrowthPilot);
  $("#ask-input").addEventListener("keydown", e => { if (e.key === "Enter") askGrowthPilot(); });

  $$(".forecast-tabs .tab").forEach(t => t.addEventListener("click", () => {
    $$(".forecast-tabs .tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    loadForecast(Number(t.dataset.days));
  }));
  loadForecast(7);

  const { alerts } = await api("/api/risk");
  $("#risk-list").innerHTML = alerts.length
    ? alerts.map(a => `<div class="risk-item"><div class="risk-type">🚨 ${a.type} — ${a.severity}</div>${a.detail}</div>`).join("")
    : `<div class="risk-empty">No active risk alerts. Business health looks normal.</div>`;

  const timing = await api("/api/smart-timing");
  $("#smart-timing").innerHTML = `
    <div class="timing-best">Best time to run your next campaign: <b>${timing.best_window}</b></div>
    <p class="muted">${timing.explanation}</p>
    <div class="timing-bars">
      <div class="timing-col">
        <h5>Peak Hours</h5>
        ${timing.peak_hours.map(h => `
          <div class="timing-row"><span>${h.label}</span><span class="timing-bar"><span style="width:${h.index}%"></span></span></div>`).join("")}
      </div>
      <div class="timing-col">
        <h5>Slow Hours</h5>
        ${timing.slow_hours.map(h => `
          <div class="timing-row"><span>${h.label}</span><span class="timing-bar low"><span style="width:${h.index}%"></span></span></div>`).join("")}
      </div>
    </div>
    <div class="timing-segments">
      ${timing.segment_timing.map(s => `<div class="timing-seg-chip"><b>${s.segment}:</b> ${s.best_window}</div>`).join("")}
    </div>`;
}

async function askGrowthPilot() {
  const q = $("#ask-input").value.trim();
  if (!q) return;
  $("#ask-result").innerHTML = `<p class="muted">Thinking…</p>`;
  const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ question: q }) });
  $("#ask-result").innerHTML = `
    <div class="ask-insight">${r.insight}</div>
    <div class="ask-field"><b>Reason</b>${r.reason}</div>
    <div class="ask-field"><b>Recommendation</b>${r.recommendation}</div>
    <div class="ask-footer">
      <span class="ask-impact">${r.expected_impact}</span>
      <span class="ask-conf">${r.confidence}% confidence</span>
      <button class="btn btn-outline btn-small" id="ask-action-btn">${r.action}</button>
    </div>
    ${aiTag(r.used_ai)}`;
  $("#ask-action-btn")?.addEventListener("click", () => toast(`"${r.action}" — head to Campaigns or Action Center to proceed.`));
}

async function loadForecast(days) {
  const r = await api(`/api/forecast?days=${days}`);
  const totalEb = explainBtn("Predicted Total", inr(r.total_predicted),
    `${days}-day predicted total based on recent daily revenue trends. ${r.explanation}`);
  const confEb = explainBtn("Confidence", `${r.confidence}%`,
    `Confidence in this ${days}-day forecast, based on how much recent daily revenue has varied.`);
  $("#forecast-summary").innerHTML = `
    <div class="forecast-stat"><span>Predicted total ${totalEb.btn}</span><b>${inr(r.total_predicted)}</b>${totalEb.panel}</div>
    <div class="forecast-stat"><span>Confidence ${confEb.btn}</span><b>${r.confidence}%</b>${confEb.panel}</div>`;
  $("#forecast-explain").innerHTML = `${r.explanation}${aiTag(r.used_ai)}`;
  if (forecastChart) { try { forecastChart.destroy(); } catch (e) { /* was never created if Chart failed */ } }
  forecastChart = safeChart("#chart-forecast", {
    type: "line",
    data: {
      labels: r.series.map(d => d.date.slice(5)),
      datasets: [
        { label: "Predicted", data: r.series.map(d => d.predicted), borderColor: "#1E6FEA", backgroundColor: "rgba(30,111,234,0.08)", fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 },
        { label: "High", data: r.series.map(d => d.high), borderColor: "rgba(0,229,255,0.35)", borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
        { label: "Low", data: r.series.map(d => d.low), borderColor: "rgba(0,229,255,0.35)", borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: chartOpts({ plugins: { legend: { display: true, labels: { color: "#9FB2C7", font: { size: 10 } } } } }),
  });
}

// =============================================================
// ACTION CENTER
// =============================================================
async function loadActions() {
  const { actions } = await api("/api/actions");
  renderActions(actions);
}

function renderActions(actions) {
  $("#action-list").innerHTML = actions.map(a => {
    const revEb = explainBtn("Expected Revenue", inr(a.expected_revenue),
      `${a.title}: ${a.recommendation} Target: ${a.target}.`);
    const roiEb = explainBtn("Expected ROI", `${a.expected_roi}×`,
      `${a.title}: projected ROI of ${a.expected_roi}× at ${a.confidence}% confidence, based on ${a.recommendation.toLowerCase()}.`);
    return `
    <div class="action-row" data-id="${a.id}">
      <div class="action-info">
        <h4>${a.title}</h4>
        <p>AI Recommendation: ${a.recommendation} · Target: ${a.target}</p>
        <div class="action-metrics">
          <div><b>${inr(a.expected_revenue)}</b>Expected revenue ${revEb.btn}${revEb.panel}</div>
          <div><b>${a.expected_roi}×</b>Expected ROI ${roiEb.btn}${roiEb.panel}</div>
          <div><b>${a.confidence}%</b>Confidence</div>
        </div>
      </div>
      <div>
        ${a.status === "PENDING" ? `
          <div class="action-buttons">
            <button class="btn btn-primary btn-small" data-decide="approve">Approve & Execute</button>
            <button class="btn btn-outline btn-small" data-decide="reject">Reject</button>
          </div>` : `<span class="action-status-tag ${a.status.startsWith("EXECUTED") ? "EXECUTED" : a.status}">${a.status}</span>`}
      </div>
    </div>`;
  }).join("");

  $$("[data-decide]").forEach(btn => btn.addEventListener("click", async (e) => {
    const row = e.target.closest(".action-row");
    const id = row.dataset.id;
    const decision = btn.dataset.decide;
    btn.disabled = true;
    const r = await api(`/api/actions/${id}/${decision}`, { method: "POST" });
    toast(decision === "approve" ? "Action executed (simulated) — results will appear in your next brief." : "Action rejected.");
    const { actions: updated } = await api("/api/actions");
    renderActions(updated);
  }));
}

// =============================================================
// GROWTH TOOLS: Heatmap, Soundbox, Financial Opportunities, Missions
// =============================================================
async function loadGrowthTools() {
  const { zones } = await api("/api/heatmap");
  $("#heatmap-grid").innerHTML = zones.map(z => `
    <div class="heat-zone heat-${z.status}">
      <div class="heat-zone-name">${z.zone}</div>
      <div class="heat-metrics">
        <div><span>Density</span><b>${z.customer_density}</b></div>
        <div><span>Volume</span><b>${z.transaction_volume}</b></div>
        <div><span>Potential</span><b>${z.potential}</b></div>
      </div>
      <div class="heat-note">${z.note}</div>
    </div>`).join("");

  const sb = await api("/api/soundbox");
  $("#soundbox-panel").innerHTML = `
    <div class="soundbox-device">
      <div class="soundbox-speaker">🔊</div>
      <div class="soundbox-line">"${sb.latest_announcement}"</div>
    </div>
    <div class="soundbox-stats">
      <div><span>Today's Total</span><b>${inr(sb.today_total)}</b></div>
      <div><span>Transactions</span><b>${sb.today_transaction_count}</b></div>
      <div><span>vs Normal Day</span><b>+${sb.vs_normal_day_pct}%</b></div>
      <div><span>Best Period</span><b>${sb.best_period_today}</b></div>
    </div>
    <div class="soundbox-ai-line">🤖 "${sb.ai_voice_line}"</div>
    ${aiTag(sb.used_ai)}
    <button class="btn btn-outline btn-small" id="btn-soundbox-campaign">${sb.suggested_action}</button>`;
  $("#btn-soundbox-campaign")?.addEventListener("click", () => {
    showView("campaigns"); $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === "campaigns"));
  });

  const { opportunities } = await api("/api/financial-opportunities");
  $("#financial-opps").innerHTML = opportunities.map(o => `
    <div class="fin-opp">
      <h4>${o.title}</h4>
      <div class="fin-basis">${o.basis}</div>
      <div class="fin-range">${o.indicative_range}</div>
      <div class="fin-note">${o.note}</div>
    </div>`).join("");

  loadMissions();
}

async function loadMissions() {
  const { missions, completed, total } = await api("/api/missions");
  $("#missions-progress").textContent = `${completed}/${total} completed`;
  $("#missions-list").innerHTML = missions.map(m => `
    <div class="mission-row ${m.done ? "done" : ""}">
      <div class="mission-check" data-id="${m.id}">${m.done ? "✓" : ""}</div>
      <div class="mission-body">
        <div class="mission-title">${m.title}</div>
        <div class="mission-desc">${m.description}</div>
        <div class="mission-bar"><span style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></span></div>
      </div>
      <div class="mission-progress">${m.progress}/${m.target}</div>
    </div>`).join("");
  $$(".mission-check").forEach(el => el.addEventListener("click", async () => {
    await api(`/api/missions/${el.dataset.id}/toggle`, { method: "POST" });
    loadMissions();
  }));
}

// =============================================================
// Voice modal
// =============================================================
const VOICE_SAMPLES = [
  { lang: "English", text: "How is my business doing today?" },
  { lang: "Hindi", text: "मेरी बिक्री क्यों कम हुई?" },
  { lang: "Hinglish", text: "Aaj mujhe kya karna chahiye?" },
  { lang: "Hindi", text: "मेरे कौन से customers को target करना चाहिए?" },
];

function wireVoiceModal() {
  $("#btn-voice").addEventListener("click", () => {
    $("#voice-samples").innerHTML = VOICE_SAMPLES.map(s => `<button class="voice-sample" data-q="${s.text}">🎙️ [${s.lang}] ${s.text}</button>`).join("");
    $("#voice-answer").innerHTML = "";
    $("#voice-modal").classList.remove("hidden");
    $$(".voice-sample").forEach(b => b.addEventListener("click", async () => {
      $("#voice-answer").innerHTML = `<p class="muted">Listening… transcribing… analyzing…</p>`;
      const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ question: b.dataset.q }) });
      $("#voice-answer").innerHTML = `<strong style="color:var(--cyan)">${r.insight}</strong><br><br>${r.recommendation}`;
    }));
  });
  $("#voice-close").addEventListener("click", () => $("#voice-modal").classList.add("hidden"));
  $("#voice-modal").addEventListener("click", (e) => { if (e.target.id === "voice-modal") $("#voice-modal").classList.add("hidden"); });
}

// =============================================================
// Language toggle (cosmetic — informs Campaign Studio default)
// =============================================================
function wireLangToggle() {
  $$(".lang-btn").forEach(b => b.addEventListener("click", () => {
    $$(".lang-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    const sel = $("#campaign-language");
    if (sel) sel.value = b.dataset.lang;
  }));
}

// =============================================================
// AI status pill
// =============================================================
async function checkAiStatus() {
  try {
    const r = await api("/api/status");
    const pill = $("#ai-status-pill");
    if (r.ai_configured) {
      pill.className = "ai-status live";
      $("#ai-status-text").textContent = "● AI Engine Online";
    } else {
      pill.className = "ai-status fallback";
      $("#ai-status-text").textContent = "● AI Fallback Mode";
    }
  } catch {
    $("#ai-status-text").textContent = "Backend unreachable";
  }
}

// =============================================================
// Data Source panel (sidebar) — Step 20/21: makes the active data source obvious
// =============================================================
function timeAgo(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function loadDataSourcePanel() {
  try {
    const r = await api("/api/dataset/status");
    const dot = $("#dsp-dot"), name = $("#dsp-name"), meta = $("#dsp-meta");
    if (r.source && r.source.type === "real") {
      dot.className = "dsp-dot real";
      name.textContent = "Merchant Dataset";
      meta.textContent = `${r.source.filename} · ${r.source.row_count.toLocaleString("en-IN")} records · Last analyzed: ${timeAgo(r.source.analyzed_at)}`;
    } else if (r.source && r.source.type === "demo") {
      dot.className = "dsp-dot demo";
      name.textContent = "Demo Dataset";
      meta.textContent = `Simulated merchant data · Last loaded: ${timeAgo(r.source.analyzed_at)}`;
    } else {
      dot.className = "dsp-dot";
      name.textContent = "No data connected";
      meta.textContent = "—";
    }
  } catch { /* sidebar panel is non-critical; fail silently */ }
}

// =============================================================
// Boot / Onboarding (Upload merchant data → mapping → analyze, or Demo Mode)
// =============================================================
const ANALYSIS_STEPS = ["Understanding transactions", "Segmenting customers", "Detecting trends", "Forecasting revenue", "Finding growth opportunities"];
let pendingUpload = null; // { upload_id, columns, suggested_mapping, preview }

function showOnboarding() {
  $("#landing").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#onboarding").classList.remove("hidden");
  showObStep("choose");
  window.GrowthPilotBG?.setIntensity(0.75);
}

function showObStep(step) {
  $$(".ob-step").forEach(s => s.classList.add("hidden"));
  $(`#ob-step-${step}`).classList.remove("hidden");
}

function enterApp() {
  $("#landing").classList.add("hidden");
  $("#onboarding").classList.add("hidden");
  $("#app").classList.remove("hidden");
  // Force a fresh load of every view's data since the active dataset may have changed
  _loaded.clear();
  showView("overview");
  loadDataSourcePanel();
  window.GrowthPilotBG?.setIntensity(0.35);
}

function wireOnboarding() {
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");

  $("#btn-browse-file").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleFileSelected(fileInput.files[0]); });

  ["dragover", "dragenter"].forEach(evt => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(evt => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  $("#btn-try-demo").addEventListener("click", async () => {
    hideObError("#ob-upload-error");
    await api("/api/dataset/demo", { method: "POST" });
    runAnalyzingAnimation(() => enterApp());
  });

  $("#btn-mapping-back").addEventListener("click", () => showObStep("choose"));
  $("#btn-confirm-mapping").addEventListener("click", confirmMapping);
}

function hideObError(sel) { const el = $(sel); el.classList.add("hidden"); el.textContent = ""; }
function showObError(sel, msg) { const el = $(sel); el.textContent = msg; el.classList.remove("hidden"); }

async function handleFileSelected(file) {
  hideObError("#ob-upload-error");
  const dz = $("#dropzone");
  dz.querySelector(".dropzone-title").textContent = `Uploading ${file.name}…`;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch(`${API_BASE}/api/dataset/upload`, { method: "POST", body: formData });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || "Upload failed.");
    pendingUpload = r;
    renderMappingStep(r, file.name);
    showObStep("mapping");
  } catch (e) {
    showObError("#ob-upload-error", e.message || "Something went wrong reading this file.");
  } finally {
    dz.querySelector(".dropzone-title").textContent = "Upload Merchant Data";
  }
}

const FIELD_LABELS = { date: "Transaction Date", amount: "Revenue / Amount", customer_id: "Customer ID", product: "Product", location: "Location" };

function renderMappingStep(r, filename) {
  $("#ob-file-summary").textContent = `${filename} — ${r.row_count.toLocaleString("en-IN")} rows, ${r.columns.length} columns detected`;
  const allFields = [...r.required_fields, ...r.optional_fields];
  $("#mapping-table").innerHTML = allFields.map(field => {
    const isRequired = r.required_fields.includes(field);
    const suggested = r.suggested_mapping[field] || "";
    const options = [`<option value="">— not mapped —</option>`]
      .concat(r.columns.map(c => `<option value="${c}" ${c === suggested ? "selected" : ""}>${c}</option>`));
    return `
      <div class="mapping-row">
        <div class="mapping-field-label ${isRequired ? "required" : ""}">${FIELD_LABELS[field]}</div>
        <div class="mapping-arrow">←</div>
        <select data-field="${field}">${options.join("")}</select>
      </div>`;
  }).join("");

  const cols = r.columns;
  $("#preview-table").innerHTML = `
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${r.preview.map(row => `<tr>${cols.map(c => `<td>${row[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

let pendingMapping = null;

function readMappingFromTable() {
  const mapping = {};
  $$("#mapping-table select").forEach(sel => { if (sel.value) mapping[sel.dataset.field] = sel.value; });
  return mapping;
}

async function confirmMapping() {
  hideObError("#ob-mapping-error");
  const mapping = readMappingFromTable();
  const missing = ["date", "amount", "customer_id"].filter(f => !mapping[f]);
  if (missing.length) {
    showObError("#ob-mapping-error", `Please map the required fields: ${missing.map(f => FIELD_LABELS[f]).join(", ")}.`);
    return;
  }
  const btn = $("#btn-confirm-mapping");
  btn.disabled = true; btn.textContent = "Checking…";
  try {
    const r = await api("/api/dataset/quality", {
      method: "POST", body: JSON.stringify({ upload_id: pendingUpload.upload_id, mapping }),
    });
    pendingMapping = mapping;
    renderQualityStep(r);
    showObStep("quality");
  } catch (e) {
    showObError("#ob-mapping-error", e.message || "Could not check this dataset's quality.");
  } finally {
    btn.disabled = false; btn.textContent = "Check Data Quality →";
  }
}

function renderQualityStep(r) {
  const badge = $("#quality-score-badge");
  badge.textContent = `${r.quality_score}/100`;
  badge.className = "quality-score-badge " + (r.quality_score >= 85 ? "good" : r.quality_score >= 60 ? "warn" : "bad");

  $("#quality-checks").innerHTML = `
    <div class="quality-check-row"><span class="qc-icon">✓</span>${r.rows_detected.toLocaleString("en-IN")} rows detected</div>
    ${r.checks.map(c => `<div class="quality-check-row"><span class="qc-icon">✓</span>${c.label}<span class="qc-detail">${c.detail}</span></div>`).join("")}`;

  $("#quality-warnings").innerHTML = r.warnings.length
    ? r.warnings.map(w => `<div class="quality-warning-row">⚠ ${w}</div>`).join("")
    : `<div class="quality-check-row"><span class="qc-icon">✓</span>No data quality issues found.</div>`;
}

$("#btn-quality-back")?.addEventListener("click", () => showObStep("mapping"));

$("#btn-continue-analysis")?.addEventListener("click", async () => {
  hideObError("#ob-quality-error");
  const btn = $("#btn-continue-analysis");
  btn.disabled = true; btn.textContent = "Starting analysis…";
  try {
    const merchantName = $("#ob-merchant-name").value.trim();
    const res = await fetch(`${API_BASE}/api/dataset/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: pendingUpload.upload_id, mapping: pendingMapping, merchant_name: merchantName }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || "Could not analyze this dataset.");
    runAnalyzingAnimation(() => enterApp());
  } catch (e) {
    showObError("#ob-quality-error", e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Continue Analysis →";
  }
});

function runAnalyzingAnimation(onDone) {
  showObStep("analyzing");
  $("#ob-analyzing-network").innerHTML = buildNetworkSVG({
    width: 820, height: 560, coreLabel: "ORCHESTRATOR", nodeR: 68, coreR: 88,
    nodes: [
      { name: "Business Analyst", icon: "📊" }, { name: "Customer Intelligence", icon: "👥" },
      { name: "Forecast", icon: "📈" }, { name: "Strategy", icon: "🎯" }, { name: "Marketing", icon: "📢" },
    ],
  });
  $$(".ob-check-item").forEach(el => el.classList.remove("active", "done"));
  let i = 0;
  const tick = () => {
    if (i > 0) $(`.ob-check-item[data-step="${i - 1}"]`).classList.replace("active", "done");
    if (i < ANALYSIS_STEPS.length) {
      $(`.ob-check-item[data-step="${i}"]`).classList.add("active");
      i++;
      setTimeout(tick, 550);
    } else {
      setTimeout(onDone, 400);
    }
  };
  tick();
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeroNetwork();
  renderFeatureGrid();
  renderLoop($("#loop-track"));
  checkAiStatus();
  wireSimulator();
  wireVoiceModal();
  wireLangToggle();
  wireOnboarding();

  $("#btn-enter-top").addEventListener("click", showOnboarding);
  $("#btn-enter-hero").addEventListener("click", showOnboarding);
  $("#btn-explore-agents").addEventListener("click", () => $("#agents-preview").scrollIntoView({ behavior: "smooth" }));
  $("#btn-switch-data")?.addEventListener("click", showOnboarding);
  $("#btn-new-analysis")?.addEventListener("click", showOnboarding);

  $$(".nav-item").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
});
