const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // matches r=52 in popup.html

const views = {
  onboarding: document.getElementById("sf-onboarding"),
  onbConfirm: document.getElementById("sf-onb-confirm"),
  main: document.getElementById("sf-main"),
  changeLimit: document.getElementById("sf-change-limit"),
};

function showView(name) {
  Object.values(views).forEach((v) => (v.hidden = true));
  views[name].hidden = false;
}

function wireLimitGrid(gridEl, customInputEl, onPick) {
  let selectedLimit = null;
  gridEl.querySelectorAll(".sf-limit-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      gridEl.querySelectorAll(".sf-limit-choice").forEach((b) => b.classList.remove("sf-selected"));
      btn.classList.add("sf-selected");
      if (btn.dataset.limit === "custom") {
        customInputEl.hidden = false;
        customInputEl.focus();
        selectedLimit = null;
      } else {
        customInputEl.hidden = true;
        selectedLimit = Number(btn.dataset.limit);
      }
      onPick(selectedLimit, btn.dataset.limit === "custom");
    });
  });
  customInputEl.addEventListener("input", () => {
    const val = Number(customInputEl.value);
    onPick(val > 0 ? val : null, true);
  });
  return () => selectedLimit;
}

async function renderMain() {
  const [settings, today, history] = await Promise.all([
    storage.getSettings(),
    storage.getTodayStats(),
    storage.getHistory(),
  ]);

  const ratio = Math.min(1, today.reelsWatched / Math.max(1, today.dailyLimit));
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  const ringEl = document.getElementById("sf-ring-progress");
  ringEl.style.strokeDashoffset = String(offset);

  let ringColor = "var(--mint)";
  let pillText = "Within limit";
  let pillClass = "";
  if (today.reelsWatched >= today.dailyLimit) {
    ringColor = "var(--over)";
    pillText = "Limit reached";
    pillClass = "sf-over";
  } else if (today.reelsWatched >= Math.floor(today.dailyLimit * settings.warningThreshold)) {
    ringColor = "var(--amber)";
    pillText = "Near limit";
    pillClass = "sf-warn";
  }
  ringEl.style.stroke = ringColor;

  const pill = document.getElementById("sf-status-pill");
  pill.textContent = pillText;
  pill.className = "sf-status-pill " + pillClass;

  document.getElementById("sf-count-value").textContent = today.reelsWatched;
  document.getElementById("sf-limit-value").textContent = `/ ${today.dailyLimit}`;
  const remaining = Math.max(0, today.dailyLimit - today.reelsWatched);
  document.getElementById("sf-remaining-value").textContent =
    today.reelsWatched >= today.dailyLimit ? "Limit reached" : `${remaining} remaining`;

  const streak = sfCurrentStreak([today, ...history]);
  document.getElementById("sf-streak-value").textContent = `🔥 ${streak} day streak`;
  document.getElementById("sf-score-value").textContent = `⭐ Daily Score ${today.score}`;

  showView("main");
}

async function boot() {
  const settings = await storage.getSettings();

  if (!settings.onboarded) {
    showView("onboarding");
    let pending = 50;
    wireLimitGrid(document.getElementById("sf-limit-grid"), document.getElementById("sf-custom-limit"), (val) => {
      if (val) pending = val;
    });
    document.getElementById("sf-set-limit-btn").addEventListener("click", async () => {
      const val = Math.max(1, Math.round(pending || 50));
      await storage.saveSettings({ dailyLimit: val, onboarded: true });
      document.getElementById("sf-confirm-limit-value").textContent = val;
      showView("onbConfirm");
    });
    return;
  }

  await renderMain();

  document.getElementById("sf-view-dashboard-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SF_OPEN_DASHBOARD" });
  });
  document.getElementById("sf-view-dashboard-from-confirm").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SF_OPEN_DASHBOARD" });
  });
  document.getElementById("sf-open-instagram-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SF_OPEN_INSTAGRAM" });
  });

  document.getElementById("sf-change-limit-btn").addEventListener("click", async () => {
    const current = await storage.getSettings();
    const grid = document.getElementById("sf-change-limit-grid");
    grid.querySelectorAll(".sf-limit-choice").forEach((b) => b.classList.remove("sf-selected"));
    const match = [...grid.querySelectorAll(".sf-limit-choice")].find(
      (b) => Number(b.dataset.limit) === current.dailyLimit
    );
    const customInput = document.getElementById("sf-change-custom-input");
    customInput.hidden = true;
    if (match) match.classList.add("sf-selected");
    let pending = current.dailyLimit;
    wireLimitGrid(grid, customInput, (val) => {
      if (val) pending = val;
    });
    document.getElementById("sf-save-limit-btn").onclick = async () => {
      const val = Math.max(1, Math.round(pending || current.dailyLimit));
      await storage.saveSettings({ dailyLimit: val });
      const today = await storage.getTodayStats();
      await storage.saveTodayStats({ ...today, dailyLimit: val });
      await renderMain();
    };
    document.getElementById("sf-cancel-limit-btn").onclick = () => renderMain();
    showView("changeLimit");
  });
}

boot();
