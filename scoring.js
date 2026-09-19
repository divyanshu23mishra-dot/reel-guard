/**
 * scoring.js — pure functions, no storage access. Every number shown on the
 * dashboard traces back to one of these.
 */

/**
 * calculateDailyScore(reelsWatched, dailyLimit) -> ScoreResult
 *
 * Formula (documented per spec §18):
 *   ratio = reelsWatched / dailyLimit
 *   - ratio <= 0.5   -> 90-100, scaled linearly down from 100 at ratio=0 to 90 at ratio=0.5
 *   - 0.5 < ratio <= 0.8 -> 70-90, linear
 *   - 0.8 < ratio <= 1.0 -> 40-70, linear (the "getting close" zone)
 *   - ratio > 1.0    -> drops below 40, losing ~15 points per 20% over the
 *                       limit, floored at 0.
 * This rewards comfortable margin without cliff-edge penalties, and makes
 * exceeding the limit visibly costlier than approaching it — matching the
 * "do not punish arbitrarily" requirement while keeping it explainable.
 */
function sfCalculateDailyScore(reelsWatched, dailyLimit) {
  const safeLimit = Math.max(1, dailyLimit || 1);
  const ratio = reelsWatched / safeLimit;
  let score;

  if (ratio <= 0.5) {
    score = 100 - ratio * 20; // 100 -> 90
  } else if (ratio <= 0.8) {
    score = 90 - (ratio - 0.5) * (20 / 0.3); // 90 -> 70
  } else if (ratio <= 1.0) {
    score = 70 - (ratio - 0.8) * (30 / 0.2); // 70 -> 40
  } else {
    const overBy = ratio - 1.0;
    score = 40 - overBy * 75; // loses 15 pts per 0.2 over
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label;
  if (ratio > 1.0) label = "Over your limit";
  else if (ratio > 0.8) label = "Getting close";
  else if (ratio > 0.5) label = "On track";
  else label = "Excellent control";

  return { score, label };
}

/** A day "counts" toward the streak if reelsWatched <= dailyLimit. */
function sfDayIsControlled(day) {
  return day.reelsWatched <= day.dailyLimit;
}

/**
 * Current streak = consecutive controlled days ending with the most recent
 * day in the list (today first if included, else most recent history entry).
 * Accepts [today, ...history] newest-first.
 */
function sfCurrentStreak(daysNewestFirst) {
  let streak = 0;
  for (const day of daysNewestFirst) {
    if (sfDayIsControlled(day)) streak++;
    else break;
  }
  return streak;
}

function sfLongestStreak(daysNewestFirst) {
  let longest = 0;
  let running = 0;
  // Walk oldest-to-newest so a broken streak resets cleanly.
  const oldestFirst = [...daysNewestFirst].reverse();
  for (const day of oldestFirst) {
    if (sfDayIsControlled(day)) {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  return longest;
}

function sfAverage(days) {
  if (!days.length) return 0;
  return days.reduce((sum, d) => sum + d.reelsWatched, 0) / days.length;
}

/** Compares this week's average vs the prior week. days = newest-first, includes today. */
function sfWeekOverWeek(daysNewestFirst) {
  const thisWeek = daysNewestFirst.slice(0, 7);
  const lastWeek = daysNewestFirst.slice(7, 14);
  if (!thisWeek.length || !lastWeek.length) return null;

  const avgThis = sfAverage(thisWeek);
  const avgLast = sfAverage(lastWeek);
  if (avgLast === 0) return null;

  const pctChange = ((avgThis - avgLast) / avgLast) * 100;
  return { avgThis, avgLast, pctChange };
}

/**
 * Generates insight strings strictly from stored data — never fabricated.
 * Returns an array of { title, body } ready to render as InsightCards.
 */
function sfGenerateInsights(daysNewestFirst) {
  const insights = [];
  if (daysNewestFirst.length < 2) {
    return insights; // not enough data yet — dashboard shows an empty state instead
  }

  const wow = sfWeekOverWeek(daysNewestFirst);
  if (wow) {
    const direction = wow.pctChange <= 0 ? "improving" : "trending up";
    insights.push({
      title: wow.pctChange <= 0 ? "Your scrolling is improving." : "Your scrolling is trending up.",
      body:
        wow.pctChange <= 0
          ? `You watched ${Math.abs(wow.pctChange).toFixed(0)}% fewer Reels on average this week than last week.`
          : `You watched ${wow.pctChange.toFixed(0)}% more Reels on average this week than last week.`,
    });
  }

  const sorted = [...daysNewestFirst].sort((a, b) => b.reelsWatched - a.reelsWatched);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  if (highest) {
    insights.push({
      title: "Highest day",
      body: `${sfFormatDateShort(highest.date)} — ${highest.reelsWatched} Reels.`,
    });
  }
  if (lowest) {
    insights.push({
      title: "Best day",
      body: `${sfFormatDateShort(lowest.date)} — ${lowest.reelsWatched} Reels, your lowest count.`,
    });
  }

  const under = daysNewestFirst.filter(sfDayIsControlled).length;
  const over = daysNewestFirst.length - under;
  insights.push({
    title: "Days within limit",
    body: `${under} of ${daysNewestFirst.length} tracked days stayed within your daily limit (${over} over).`,
  });

  const longest = sfLongestStreak(daysNewestFirst);
  if (longest > 0) {
    insights.push({
      title: "Longest streak",
      body: `${longest} day${longest === 1 ? "" : "s"} in a row within your limit.`,
    });
  }

  return insights;
}

function sfFormatDateShort(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

if (typeof module !== "undefined") {
  module.exports = {
    sfCalculateDailyScore,
    sfDayIsControlled,
    sfCurrentStreak,
    sfLongestStreak,
    sfAverage,
    sfWeekOverWeek,
    sfGenerateInsights,
    sfFormatDateShort,
  };
}
