/**
 * demo-data.js — sample history for the "Load Demo Data" action and the
 * Hackathon Demo Mode panel. Never written silently; only via an explicit
 * user action, and always flagged with sf_is_demo_data = true so the UI
 * can label it.
 */
function sfBuildDemoHistory(dailyLimit = 50) {
  const raw = [
    { offset: 6, reels: 82 },
    { offset: 5, reels: 74 },
    { offset: 4, reels: 63 },
    { offset: 3, reels: 55 },
    { offset: 2, reels: 43 },
    { offset: 1, reels: 47 },
  ];

  const today = new Date();
  // storage's `history` convention is newest-first (index 0 = yesterday),
  // matching how getTodayStats() unshifts each finished day. `raw` is
  // listed oldest-to-newest for readability above, so reverse it here.
  return [...raw]
    .reverse()
    .map(({ offset, reels }) => {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      const dateKey = sfTodayKey(d);
      return {
        date: dateKey,
        reelsWatched: reels,
        dailyLimit,
        score: sfCalculateDailyScore(reels, dailyLimit).score,
        blocked: reels >= dailyLimit,
        seenReelIds: [],
      };
    });
}

if (typeof module !== "undefined") {
  module.exports = { sfBuildDemoHistory };
}
