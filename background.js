/**
 * background.js — Manifest V3 service worker.
 */

importScripts("../shared/types.js", "../shared/storage.js", "../shared/scoring.js");

async function sfUpdateBadge() {
  try {
    const today = await storage.getTodayStats();
    const settings = await storage.getSettings();
    const label = today.reelsWatched > 999 ? "999+" : String(today.reelsWatched);
    chrome.action.setBadgeText({ text: label });

    let color = "#2fbf8f";
    const ratio = today.reelsWatched / Math.max(1, today.dailyLimit);
    if (ratio >= 1) color = "#d64550";
    else if (ratio >= (settings.warningThreshold || 0.8)) color = "#e8a33d";

    chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    // fail soft
  }
}

chrome.runtime.onInstalled.addListener(() => {
  sfUpdateBadge();
  chrome.alarms.create("sf-midnight-check", { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(sfUpdateBadge);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sf-midnight-check") sfUpdateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[SF_KEYS.TODAY] || changes[SF_KEYS.SETTINGS])) {
    sfUpdateBadge();
  }
});

// Watch SPA tab URL transitions directly from browser tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes("instagram.com")) {
    chrome.tabs.sendMessage(tabId, {
      type: "SF_URL_CHANGED",
      url: changeInfo.url
    }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "SF_REEL_TRACKED") {
    sfUpdateBadge();
    return;
  }

  if (message.type === "SF_OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
    return;
  }

  if (message.type === "SF_OPEN_INSTAGRAM") {
    chrome.tabs.create({ url: "https://www.instagram.com/reels/" });
    return;
  }

  if (message.type === "SF_CLOSE_TAB" && _sender.tab) {
    chrome.tabs.remove(_sender.tab.id);
    return;
  }
});