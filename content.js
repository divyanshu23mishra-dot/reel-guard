/**
 * content.js — runs on https://www.instagram.com/*
 */

(function () {
  const SF_DWELL_MS = 600;
  const SF_WARNING_COOLDOWN_MS = 60_000;
  const SF_URL_POLL_MS = 500;
  const SF_DEBUG = true;

  function sfLog(...args) {
    if (SF_DEBUG) console.log("[ScrollFit]", ...args);
  }

  let sfActiveCandidateId = null;
  let sfDwellTimer = null;
  let sfLastWarningShownAt = 0;
  let sfBlockScreenShown = false;
  let sfLastUrl = location.href;

  function sfIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/(?:reels?|p)\/([A-Za-z0-9_-]+)/);
    return match ? `url:${match[1]}` : null;
  }

  function sfIdFromVideoEl(video) {
    if (!video) return null;
    const article = video.closest("article") || video.closest("div[role='presentation']");
    const permalink = article && article.querySelector('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]');
    if (permalink && permalink.getAttribute("href")) {
      const fromHref = sfIdFromUrl(permalink.getAttribute("href"));
      if (fromHref) return fromHref;
    }
    if (video.currentSrc) {
      return `src:${video.currentSrc.split("?")[0]}`;
    }
    if (video.src) {
      return `src:${video.src.split("?")[0]}`;
    }
    if (video.poster) {
      return `poster:${video.poster.split("?")[0]}`;
    }
    return null;
  }

  function sfCommitReel(reelId) {
    if (!reelId) return;
    sfLog("Committing reel:", reelId);

    if (typeof storage !== "undefined" && storage.trackReel) {
      storage.trackReel(reelId).then(({ today, settings, justCrossedLimit, justCrossedWarning }) => {
        sfLog("Reel tracked! Total today:", today.reelsWatched);
        chrome.runtime.sendMessage({ type: "SF_REEL_TRACKED", today });
        if (justCrossedWarning) sfShowWarningToast(today, settings);
        if (justCrossedLimit || today.blocked) sfShowBlockScreen(today);
      }).catch(err => {
        console.error("[ScrollFit] trackReel error:", err);
      });
    }
  }

  function sfConsiderCandidate(reelId) {
    if (!reelId || reelId === sfActiveCandidateId) return;

    sfLog("New reel candidate detected:", reelId);
    sfActiveCandidateId = reelId;

    if (sfDwellTimer) clearTimeout(sfDwellTimer);
    sfDwellTimer = setTimeout(() => {
      if (sfActiveCandidateId === reelId) {
        sfCommitReel(reelId);
      }
    }, SF_DWELL_MS);
  }

  function sfCheckUrl(explicitUrl) {
    const currentUrl = explicitUrl || location.href;
    if (currentUrl !== sfLastUrl || explicitUrl) {
      sfLastUrl = currentUrl;
      const id = sfIdFromUrl(currentUrl);
      if (id) sfConsiderCandidate(id);
      if (sfBlockScreenShown && /\/(?:reels?|p)\//.test(location.pathname)) {
        sfShowBlockScreen(null);
      }
    }
  }

  // Listen for navigation messages from background.js
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SF_URL_CHANGED" && msg.url) {
      sfCheckUrl(msg.url);
    }
  });

  let sfIntersectionObserver = null;
  const sfObservedVideos = new WeakSet();

  function sfHandleVideoActivity(video) {
    const id = sfIdFromVideoEl(video);
    if (id) sfConsiderCandidate(id);
  }

  function sfObserveVideo(video) {
    if (!video || sfObservedVideos.has(video)) return;
    sfObservedVideos.add(video);
    if (sfIntersectionObserver) sfIntersectionObserver.observe(video);

    video.addEventListener("loadeddata", () => sfHandleVideoActivity(video));
    video.addEventListener("playing", () => sfHandleVideoActivity(video));
  }

  function sfSetupIntersectionObserver() {
    sfIntersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = sfIdFromVideoEl(entry.target);
            if (id) sfConsiderCandidate(id);
          }
        }
      },
      { threshold: [0, 0.5, 0.8] }
    );
  }

  function sfScanForVideos(root = document) {
    const videos = root.querySelectorAll ? root.querySelectorAll("video") : [];
    videos.forEach(sfObserveVideo);
  }

  function sfSetupMutationObserver() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.tagName === "VIDEO") sfObserveVideo(node);
            sfScanForVideos(node);
          });
        } else if (m.type === "attributes" && m.target instanceof HTMLVideoElement) {
          sfHandleVideoActivity(m.target);
        }
      }
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "currentSrc", "poster"]
    });
  }

  function sfInjectStylesOnce() {
    if (document.getElementById("sf-style")) return;
    const style = document.createElement("style");
    style.id = "sf-style";
    style.textContent = `
      #sf-toast {
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-12px);
        background: #14171c; color: #eef0eb; padding: 12px 18px; border-radius: 14px;
        font: 500 14px/1.4 -apple-system, "Segoe UI", system-ui, sans-serif;
        z-index: 2147483000; display: flex; align-items: center; gap: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.28); opacity: 0; transition: opacity .25s ease, transform .25s ease;
        pointer-events: none;
      }
      #sf-toast.sf-show { opacity: 1; transform: translateX(-50%) translateY(0); }
      #sf-toast .sf-dot { width: 8px; height: 8px; border-radius: 50%; background: #e8a33d; flex: none; }
      #sf-block-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        background: linear-gradient(180deg, #14171c 0%, #1c2027 100%);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color: #eef0eb;
      }
      #sf-block-card {
        max-width: 420px; width: calc(100% - 48px); text-align: center;
        padding: 40px 32px; border-radius: 24px; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      #sf-block-card h1 { font-size: 22px; font-weight: 650; margin: 0 0 12px; }
      #sf-block-card p { font-size: 15px; line-height: 1.55; color: #b7bcc4; margin: 0 0 6px; }
      #sf-block-card strong { color: #eef0eb; }
      #sf-block-actions { margin-top: 26px; display: flex; flex-direction: column; gap: 10px; }
      .sf-btn { border: none; border-radius: 12px; padding: 13px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .sf-btn-primary { background: #ff5b3d; color: #14171c; }
      .sf-btn-secondary { background: transparent; color: #b7bcc4; border: 1px solid rgba(255,255,255,0.14); }
    `;
    document.head.appendChild(style);
  }

  function sfShowWarningToast(today, settings) {
    const now = Date.now();
    if (now - sfLastWarningShownAt < SF_WARNING_COOLDOWN_MS) return;
    sfLastWarningShownAt = now;

    sfInjectStylesOnce();
    let toast = document.getElementById("sf-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "sf-toast";
      document.body.appendChild(toast);
    }
    const remaining = Math.max(0, today.dailyLimit - today.reelsWatched);
    toast.innerHTML = `<span class="sf-dot"></span><span>${today.reelsWatched} / ${today.dailyLimit} Reels — ${remaining} remaining today</span>`;
    requestAnimationFrame(() => toast.classList.add("sf-show"));
    setTimeout(() => toast.classList.remove("sf-show"), 4200);
  }

  function sfShowBlockScreen(today) {
    sfBlockScreenShown = true;
    sfInjectStylesOnce();
    if (document.getElementById("sf-block-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "sf-block-overlay";
    const watched = today ? today.reelsWatched : "your limit of";
    const limit = today ? today.dailyLimit : "";
    overlay.innerHTML = `
      <div id="sf-block-card">
        <h1>Daily limit reached</h1>
        <p>You've watched <strong>${watched} Reels</strong> today.</p>
        <p>Your daily limit was <strong>${limit} Reels</strong>. That's enough scrolling for today.</p>
        <div id="sf-block-actions">
          <button class="sf-btn sf-btn-primary" id="sf-view-progress">View Today's Progress</button>
          <button class="sf-btn sf-btn-secondary" id="sf-close-instagram">Close Instagram</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";

    overlay.querySelector("#sf-view-progress").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SF_OPEN_DASHBOARD" });
    });
    overlay.querySelector("#sf-close-instagram").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SF_CLOSE_TAB" });
    });
  }

  async function sfInit() {
    if (typeof storage === "undefined") {
      console.warn("[ScrollFit] Storage module not loaded yet.");
      return;
    }

    const settings = await storage.getSettings();
    sfLog("Init — Tracking:", settings.trackingEnabled, "Limit:", settings.dailyLimit);
    if (!settings.trackingEnabled) return;

    const today = await storage.getTodayStats();
    if (today.blocked) sfShowBlockScreen(today);

    setInterval(() => sfCheckUrl(), SF_URL_POLL_MS);

    sfSetupIntersectionObserver();
    sfSetupMutationObserver();
    sfScanForVideos();

    const initialUrlId = sfIdFromUrl(location.href);
    if (initialUrlId) sfConsiderCandidate(initialUrlId);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    sfInit();
  } else {
    document.addEventListener("DOMContentLoaded", sfInit);
  }
})();