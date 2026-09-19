// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll(".sf-tab");
const tabPanels = {
  overview: document.getElementById("tab-overview"),
  history: document.getElementById("tab-history"),
  insights: document.getElementById("tab-insights"),
  settings: document.getElementById("tab-settings"),
};

function activateTab(name) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("sf-tab-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  Object.entries(tabPanels).forEach(([key, panel]) => (panel.hidden = key !== name));
  if (name === "history") renderHistory();
  if (name === "insights") renderInsights();
  if (name === "settings") renderSettings();
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

// ---------------------------------------------------------------------------
// Confirm dialog helper
// ---------------------------------------------------------------------------
function confirmDialog(title, body) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("confirm-backdrop");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-body").textContent = body;
    backdrop.hidden = false;

    const cleanup = (result) => {
      backdrop.hidden = true;
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
let sfChartRange = 7;

async function renderOverview() {
  const [settings, today, history] = await Promise.all([
    storage.getSettings(),
    storage.getTodayStats(),
    storage.getHistory(),
  ]);

  const hasAnyData = today.reelsWatched > 0 || history.length > 0;
  document.getElementById("overview-empty").hidden = hasAnyData;
  document.getElementById("overview-content").hidden = !hasAnyData;
  if (!hasAnyData) return;

  const allDays = [today, ...history];

  document.getElementById("ov-reels-today").textContent = today.reelsWatched;
  document.getElementById("ov-limit-sub").textContent = `/ ${today.dailyLimit} limit`;
  document.getElementById("ov-remaining").textContent = Math.max(0, today.dailyLimit - today.reelsWatched);

  const scoreResult = sfCalculateDailyScore(today.reelsWatched, today.dailyLimit);
  document.getElementById("ov-score").innerHTML = `${scoreResult.score}<span class="sf-stat-value-of">/ 100</span>`;
  document.getElementById("ov-score-label").textContent = scoreResult.label;

  const streak = sfCurrentStreak(allDays);
  document.getElementById("ov-streak").innerHTML = `${streak}<span class="sf-stat-value-of">day${streak === 1 ? "" : "s"}</span>`;

  const avg = sfAverage(allDays);
  document.getElementById("ov-average").textContent = avg.toFixed(0);

  if (history.length > 0) {
    const yesterday = history[0];
    document.getElementById("ov-yesterday").textContent = yesterday.reelsWatched;
    if (yesterday.reelsWatched > 0) {
      const change = ((today.reelsWatched - yesterday.reelsWatched) / yesterday.reelsWatched) * 100;
      const arrow = change <= 0 ? "↓" : "↑";
      document.getElementById("ov-change").textContent = `${arrow} ${Math.abs(change).toFixed(1)}% vs yesterday`;
    } else {
      document.getElementById("ov-change").textContent = "No comparison available";
    }
  } else {
    document.getElementById("ov-yesterday").textContent = "—";
    document.getElementById("ov-change").textContent = "No history yet";
  }

  renderChart(allDays);

  const wow = sfWeekOverWeek(allDays);
  const progressSentence = document.getElementById("progress-sentence");
  if (wow) {
    const verb = wow.pctChange <= 0 ? "fewer" : "more";
    progressSentence.textContent = `You watched ${Math.abs(wow.pctChange).toFixed(0)}% ${verb} Reels this week than last week.`;
  } else {
    progressSentence.textContent = "Keep tracking — weekly comparisons appear once you have two full weeks of data.";
  }

  const sorted = [...allDays].sort((a, b) => a.reelsWatched - b.reelsWatched);
  const best = sorted[0];
  const highest = sorted[sorted.length - 1];
  document.getElementById("progress-best").textContent = best ? `${sfFormatDateShort(best.date)} — ${best.reelsWatched} Reels` : "—";
  document.getElementById("progress-highest").textContent = highest ? `${sfFormatDateShort(highest.date)} — ${highest.reelsWatched} Reels` : "—";
}

function renderChart(allDaysNewestFirst) {
  const days = [...allDaysNewestFirst].slice(0, sfChartRange).reverse(); // oldest -> newest for left-to-right chart
  const mount = document.getElementById("chart-mount");
  mount.innerHTML = "";
  mount.style.position = "relative";

  if (days.length === 0) return;

  const width = 900;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 30, left: 16 };
  const limit = days[days.length - 1].dailyLimit;
  const maxVal = Math.max(limit, ...days.map((d) => d.reelsWatched)) * 1.15;
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const barSlot = plotW / days.length;
  const barW = Math.min(38, barSlot * 0.5);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  function yFor(val) {
    return padding.top + plotH * (1 - val / maxVal);
  }

  // Limit reference line
  const limitY = yFor(limit);
  const limitLine = document.createElementNS(svgNS, "line");
  limitLine.setAttribute("x1", padding.left);
  limitLine.setAttribute("x2", width - padding.right);
  limitLine.setAttribute("y1", limitY);
  limitLine.setAttribute("y2", limitY);
  limitLine.setAttribute("class", "sf-chart-limit-line");
  svg.appendChild(limitLine);

  const limitLabel = document.createElementNS(svgNS, "text");
  limitLabel.setAttribute("x", width - padding.right);
  limitLabel.setAttribute("y", limitY - 6);
  limitLabel.setAttribute("text-anchor", "end");
  limitLabel.setAttribute("class", "sf-chart-limit-label");
  limitLabel.textContent = `Limit ${limit}`;
  svg.appendChild(limitLabel);

  const tooltip = document.createElement("div");
  tooltip.className = "sf-chart-tooltip";
  mount.appendChild(tooltip);

  days.forEach((day, i) => {
    const cx = padding.left + barSlot * i + barSlot / 2;
    const barTop = yFor(day.reelsWatched);
    const barH = Math.max(2, padding.top + plotH - barTop);
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", cx - barW / 2);
    rect.setAttribute("y", barTop);
    rect.setAttribute("width", barW);
    rect.setAttribute("height", barH);
    rect.setAttribute("rx", 6);
    const overLimit = day.reelsWatched > day.dailyLimit;
    rect.setAttribute("class", `sf-chart-bar ${overLimit ? "sf-over-limit" : "sf-within-limit"}`);

    rect.addEventListener("mouseenter", (e) => {
      tooltip.textContent = `${sfFormatDateShort(day.date)} — ${day.reelsWatched} Reels`;
      tooltip.style.left = `${(cx / width) * 100}%`;
      tooltip.style.top = `${(barTop / height) * 100}%`;
      tooltip.style.opacity = "1";
    });
    rect.addEventListener("mouseleave", () => (tooltip.style.opacity = "0"));

    svg.appendChild(rect);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", height - 8);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "sf-chart-axis-label");
    label.textContent = sfChartRange === 7 ? sfWeekdayShort(day.date) : sfFormatDateShort(day.date);
    svg.appendChild(label);
  });

  mount.appendChild(svg);
}

function sfWeekdayShort(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

document.getElementById("chart-range-toggle").addEventListener("click", async (e) => {
  const btn = e.target.closest(".sf-range-btn");
  if (!btn) return;
  document.querySelectorAll("#chart-range-toggle .sf-range-btn").forEach((b) => b.classList.remove("sf-range-active"));
  btn.classList.add("sf-range-active");
  sfChartRange = Number(btn.dataset.range);
  const [today, history] = await Promise.all([storage.getTodayStats(), storage.getHistory()]);
  renderChart([today, ...history]);
});

document.getElementById("overview-empty-set-limit").addEventListener("click", () => activateTab("settings"));

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
let sfHistoryRange = 7;

async function renderHistory() {
  const [today, history] = await Promise.all([storage.getTodayStats(), storage.getHistory()]);
  const allDays = [today, ...history];
  const hasData = today.reelsWatched > 0 || history.length > 0;

  document.getElementById("history-empty").hidden = hasData;
  document.getElementById("history-table-wrap").hidden = !hasData;
  if (!hasData) return;

  const rows = allDays.slice(0, sfHistoryRange);
  const tbody = document.getElementById("history-table-body");
  tbody.innerHTML = rows
    .map((day) => {
      const withinLimit = day.reelsWatched <= day.dailyLimit;
      return `
        <tr>
          <td>${sfFormatDateShort(day.date)}</td>
          <td class="num">${day.reelsWatched}</td>
          <td class="num">${day.dailyLimit}</td>
          <td class="num">${day.score}</td>
          <td class="${withinLimit ? "sf-status-ok" : "sf-status-over"}">${withinLimit ? "✅ Within limit" : "⚠️ Over limit"}</td>
        </tr>`;
    })
    .join("");
}

document.getElementById("history-range-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".sf-range-btn");
  if (!btn) return;
  document.querySelectorAll("#history-range-toggle .sf-range-btn").forEach((b) => b.classList.remove("sf-range-active"));
  btn.classList.add("sf-range-active");
  sfHistoryRange = Number(btn.dataset.range);
  renderHistory();
});

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
async function renderInsights() {
  const [today, history] = await Promise.all([storage.getTodayStats(), storage.getHistory()]);
  const allDays = [today, ...history];
  const insights = sfGenerateInsights(allDays);

  document.getElementById("insights-empty").hidden = insights.length > 0;
  const grid = document.getElementById("insights-grid");
  grid.innerHTML = insights
    .map((i) => `<div class="sf-insight-card"><h3>${i.title}</h3><p>${i.body}</p></div>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function renderSettings() {
  const settings = await storage.getSettings();
  document.getElementById("settings-limit-input").value = settings.dailyLimit;
  document.getElementById("settings-threshold-input").value = Math.round(settings.warningThreshold * 100);
  document.getElementById("settings-threshold-value").textContent = `${Math.round(settings.warningThreshold * 100)}%`;
  document.getElementById("settings-tracking-toggle").checked = settings.trackingEnabled;
}

document.getElementById("settings-save-limit").addEventListener("click", async () => {
  const val = Math.max(1, Math.round(Number(document.getElementById("settings-limit-input").value) || 50));
  await storage.saveSettings({ dailyLimit: val });
  const today = await storage.getTodayStats();
  await storage.saveTodayStats({ ...today, dailyLimit: val, score: sfCalculateDailyScore(today.reelsWatched, val).score, blocked: today.reelsWatched >= val });
  renderOverview();
});

document.getElementById("settings-threshold-input").addEventListener("input", (e) => {
  document.getElementById("settings-threshold-value").textContent = `${e.target.value}%`;
});
document.getElementById("settings-threshold-input").addEventListener("change", async (e) => {
  await storage.saveSettings({ warningThreshold: Number(e.target.value) / 100 });
});

document.getElementById("settings-tracking-toggle").addEventListener("change", async (e) => {
  await storage.saveSettings({ trackingEnabled: e.target.checked });
});

document.getElementById("settings-export").addEventListener("click", async () => {
  const [settings, today, history] = await Promise.all([storage.getSettings(), storage.getTodayStats(), storage.getHistory()]);
  const payload = { exportedAt: new Date().toISOString(), settings, today, history };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scrollfit-export-${sfTodayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("settings-clear-history").addEventListener("click", async () => {
  const ok = await confirmDialog("Clear history?", "This permanently deletes all past days. Today's count is not affected.");
  if (ok) {
    await storage.clearHistory();
    renderOverview();
  }
});

document.getElementById("settings-reset-today").addEventListener("click", async () => {
  await storage.resetToday();
  renderOverview();
});

// ---- Demo Mode ----
document.querySelectorAll(".sf-demo-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const target = Number(btn.dataset.simulate);
    const settings = await storage.getSettings();
    const today = await storage.getTodayStats();
    const updated = {
      ...today,
      reelsWatched: target,
      score: sfCalculateDailyScore(target, today.dailyLimit).score,
      blocked: target >= today.dailyLimit,
    };
    await storage.saveTodayStats(updated);
    renderOverview();
  });
});

document.getElementById("settings-simulate-limit").addEventListener("click", async () => {
  const today = await storage.getTodayStats();
  const updated = {
    ...today,
    reelsWatched: today.dailyLimit,
    score: sfCalculateDailyScore(today.dailyLimit, today.dailyLimit).score,
    blocked: true,
  };
  await storage.saveTodayStats(updated);
  renderOverview();
});

document.getElementById("settings-load-demo-history").addEventListener("click", async () => {
  const settings = await storage.getSettings();
  const demo = sfBuildDemoHistory(settings.dailyLimit);
  await storage.loadDemoHistory(demo);
  renderOverview();
});

document.getElementById("settings-reset-demo").addEventListener("click", async () => {
  await storage.clearHistory();
  await storage.resetToday();
  renderOverview();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  await renderOverview();
})();
