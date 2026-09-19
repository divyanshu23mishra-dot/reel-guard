/**
 * ScrollFit shared type definitions.
 *
 * The MVP ships as plain JS (no build step) so it can be loaded unpacked
 * into Chrome in seconds for the demo. Shapes are documented here with
 * JSDoc typedefs; every module that touches storage imports this file
 * as a comment-only reference.
 *
 * @typedef {Object} UserSettings
 * @property {number} dailyLimit        - Reels allowed per day.
 * @property {number} warningThreshold  - 0..1, fraction of limit that triggers the "near limit" warning. Default 0.8.
 * @property {boolean} trackingEnabled  - Master on/off switch for counting.
 * @property {boolean} onboarded        - Whether the first-run flow has completed.
 *
 * @typedef {Object} DailyStats
 * @property {string} date          - "YYYY-MM-DD", local timezone.
 * @property {number} reelsWatched
 * @property {number} dailyLimit    - Limit that was active on this date (kept for history accuracy).
 * @property {number} score         - 0..100, see scoring.js.
 * @property {boolean} blocked      - Whether the limit was reached this date.
 * @property {string[]} seenReelIds - Reel identifiers already counted today (session de-dupe).
 *
 * @typedef {DailyStats} HistoryEntry
 *
 * @typedef {Object} TrackingState
 * @property {DailyStats} today
 * @property {HistoryEntry[]} history   - All days prior to today, newest first.
 * @property {UserSettings} settings
 *
 * @typedef {Object} ReelSession
 * @property {string} reelId
 * @property {number} firstSeenAt
 *
 * @typedef {Object} ScoreResult
 * @property {number} score           - 0..100
 * @property {string} label           - "Excellent control" | "On track" | "Getting close" | "Over your limit"
 */

// Storage keys, centralized so nothing hardcodes a string in two places.
const SF_KEYS = {
  SETTINGS: "sf_settings",
  TODAY: "sf_today",
  HISTORY: "sf_history",
  DEMO_FLAG: "sf_is_demo_data",
};

const SF_DEFAULT_SETTINGS = {
  dailyLimit: 50,
  warningThreshold: 0.8,
  trackingEnabled: true,
  onboarded: false,
};

// Exposed for both extension contexts (importScripts / content script `var`
// scope) and dashboard/popup <script> includes — no module bundler in play.
if (typeof module !== "undefined") {
  module.exports = { SF_KEYS, SF_DEFAULT_SETTINGS };
}
