/**
 * storage.js — the ONLY module allowed to touch chrome.storage / localStorage.
 * Every other file calls the functions below instead.
 *
 * Chrome extension pages (popup, dashboard, background) all get
 * chrome.storage.local. If this file is ever opened outside the extension
 * (e.g. double-clicking dashboard.html while developing), it falls back to
 * localStorage so the UI still renders with the same interface.
 */

const sfHasChromeStorage =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

function sfRawGet(key) {
  return new Promise((resolve) => {
    if (sfHasChromeStorage) {
      chrome.storage.local.get([key], (result) => resolve(result[key]));
    } else {
      try {
        const raw = localStorage.getItem(key);
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch (e) {
        resolve(undefined);
      }
    }
  });
}

function sfRawSet(key, value) {
  return new Promise((resolve) => {
    if (sfHasChromeStorage) {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } else {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage full or unavailable — fail soft */
      }
      resolve();
    }
  });
}

function sfTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sfEmptyDay(dateKey, dailyLimit) {
  return {
    date: dateKey,
    reelsWatched: 0,
    dailyLimit,
    score: 100,
    blocked: false,
    seenReelIds: [],
  };
}

const storage = {
  async getSettings() {
    const s = await sfRawGet(SF_KEYS.SETTINGS);
    return s ? { ...SF_DEFAULT_SETTINGS, ...s } : { ...SF_DEFAULT_SETTINGS };
  },

  async saveSettings(settings) {
    const current = await storage.getSettings();
    const merged = { ...current, ...settings };
    await sfRawSet(SF_KEYS.SETTINGS, merged);
    return merged;
  },

  /**
   * Returns today's stats, rolling yesterday into history and resetting
   * the counter if the local date has changed since last write. This is
   * the single choke point for the "daily reset" requirement — every
   * caller (content script, popup, dashboard, background alarm) goes
   * through getTodayStats so no code path can skip the rollover.
   */
  async getTodayStats() {
    const settings = await storage.getSettings();
    const todayKey = sfTodayKey();
    let today = await sfRawGet(SF_KEYS.TODAY);

    if (!today) {
      today = sfEmptyDay(todayKey, settings.dailyLimit);
      await sfRawSet(SF_KEYS.TODAY, today);
      return today;
    }

    if (today.date !== todayKey) {
      // Roll the stale day into history (recompute its final score first).
      const finalized = { ...today, score: sfCalculateDailyScore(today.reelsWatched, today.dailyLimit).score };
      const history = (await sfRawGet(SF_KEYS.HISTORY)) || [];
      history.unshift(finalized);
      await sfRawSet(SF_KEYS.HISTORY, history);

      today = sfEmptyDay(todayKey, settings.dailyLimit);
      await sfRawSet(SF_KEYS.TODAY, today);
    }

    return today;
  },

  async saveTodayStats(today) {
    await sfRawSet(SF_KEYS.TODAY, today);
    return today;
  },

  async getHistory() {
    return (await sfRawGet(SF_KEYS.HISTORY)) || [];
  },

  async saveHistory(history) {
    await sfRawSet(SF_KEYS.HISTORY, history);
    return history;
  },

  async clearHistory() {
    await sfRawSet(SF_KEYS.HISTORY, []);
    await sfRawSet(SF_KEYS.DEMO_FLAG, false);
  },

  async resetToday() {
    const settings = await storage.getSettings();
    const fresh = sfEmptyDay(sfTodayKey(), settings.dailyLimit);
    await sfRawSet(SF_KEYS.TODAY, fresh);
    return fresh;
  },

  async isDemoData() {
    return !!(await sfRawGet(SF_KEYS.DEMO_FLAG));
  },

  async loadDemoHistory(demoHistory) {
    await sfRawSet(SF_KEYS.HISTORY, demoHistory);
    await sfRawSet(SF_KEYS.DEMO_FLAG, true);
  },

  /**
   * Core counting entry point used by the content script.
   * Increments reelsWatched only if reelId hasn't been seen today,
   * recalculates score, flips `blocked` once the limit is reached.
   * Returns { today, settings, justCrossedLimit, justCrossedWarning }.
   */
  async trackReel(reelId) {
    const settings = await storage.getSettings();
    let today = await storage.getTodayStats();

    if (!settings.trackingEnabled) {
      return { today, settings, justCrossedLimit: false, justCrossedWarning: false };
    }

    if (today.seenReelIds.includes(reelId)) {
      return { today, settings, justCrossedLimit: false, justCrossedWarning: false };
    }

    const wasBlocked = today.blocked;
    const wasWarning = today.reelsWatched >= Math.floor(today.dailyLimit * settings.warningThreshold);

    today = {
      ...today,
      reelsWatched: today.reelsWatched + 1,
      seenReelIds: [...today.seenReelIds, reelId].slice(-500), // cap memory use
    };
    today.score = sfCalculateDailyScore(today.reelsWatched, today.dailyLimit).score;
    today.blocked = today.reelsWatched >= today.dailyLimit;

    await storage.saveTodayStats(today);

    const isWarning = today.reelsWatched >= Math.floor(today.dailyLimit * settings.warningThreshold);

    return {
      today,
      settings,
      justCrossedLimit: today.blocked && !wasBlocked,
      justCrossedWarning: isWarning && !wasWarning && !today.blocked,
    };
  },
};

if (typeof module !== "undefined") {
  module.exports = { storage, sfTodayKey };
}
