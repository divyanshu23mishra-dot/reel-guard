# ScrollFit

**A fitness tracker for your attention.**

ScrollFit is a Chrome extension that tracks how many Instagram Reels you
watch each day, lets you set a personal daily limit, and shows your
scrolling habits on a fitness-style dashboard — streaks, scores, trends,
and history, the same vocabulary a step counter uses for your body.

## Why it exists

Short-form feeds are built to have no natural stopping point. ScrollFit
gives yours one: a number you choose, a counter that keeps you honest,
and a calm screen that shows up when you've hit it — framed as health and
discipline, not punishment or surveillance.

## Features

- **Automatic Reel counting** on instagram.com, resistant to Instagram's
  changing DOM (see [Reel detection](#reel-detection) below).
- **Daily limit** you set and can change any time, with a "near limit"
  warning at a configurable threshold (default 80%).
- **Full-screen block state** on Instagram once you hit your limit, with a
  link back to your dashboard.
- **Dashboard**: Overview (today's stats, a 7/30-day bar chart with your
  limit as a reference line, weekly progress), History (a filterable
  table of every tracked day), Insights (auto-generated from your actual
  data — never fabricated), and Settings.
- **Streaks and a 0–100 daily score**, both deterministic and computed
  from stored data — see `shared/scoring.js` for the exact formula.
- **Local-first**: everything lives in `chrome.storage.local` on your
  machine. No backend, no account, no network calls.
- **Hackathon Demo Mode**: buttons to simulate Reel counts and load a
  sample week of history, so you can show the full experience without
  scrolling 50 real Reels in front of judges.

## Tech stack

Plain HTML/CSS/JavaScript, Chrome Extension **Manifest V3**, and the
Chrome Storage API — deliberately **no build step**. That's a choice, not
a limitation: this environment couldn't reach the npm registry to install
React/Vite/Tailwind/Recharts, so the whole MVP is hand-built to load
straight into Chrome with zero `npm install`. Charts are inline SVG,
generated in `dashboard/dashboard.js`.

## Project structure

```
scrollfit/
  manifest.json            Chrome Extension Manifest V3
  icons/                   Extension icons (16/32/48/128)
  shared/
    tokens.css              Design tokens (color, type, spacing) used everywhere
    types.js                 Storage keys + default settings (JSDoc type reference)
    storage.js                Single storage abstraction (chrome.storage.local)
    scoring.js                 calculateDailyScore, streaks, insights — pure functions
    demo-data.js                Sample history for Demo Mode
  background/
    background.js            Service worker: badge, daily-reset alarm, message relay
  content/
    content.js                Runs on instagram.com: Reel detection + block/warning UI
  popup/
    popup.html / .css / .js  Toolbar popup: onboarding + live counter
  dashboard/
    dashboard.html / .css / .js   Overview / History / Insights / Settings
  landing/
    landing.html / .css      Marketing page for the project
```

## How to install dependencies

There are none to install. Everything is plain JS/CSS/HTML.

## How to run the dashboard (without loading the extension)

You can preview the dashboard and landing page directly in a browser tab
without loading the extension at all — `shared/storage.js` falls back to
`localStorage` when `chrome.storage` isn't available:

```
open dashboard/dashboard.html
open landing/landing.html
```

The popup (`popup/popup.html`) relies on `chrome.runtime`, so it only
fully works loaded as an extension — opening it standalone will show the
main view but the "Open Instagram" / "View Dashboard" buttons need the
extension context.

## How to build/load the Chrome extension

There's no bundling step — you load the folder as-is.

### Loading the Chrome Extension

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `scrollfit/` folder (the one containing `manifest.json`).
5. ScrollFit's icon appears in your toolbar. Click it to start onboarding.
6. Pin the icon (puzzle-piece menu → pin) so it's always visible for the demo.

To pick up code changes, click the refresh icon on ScrollFit's card in
`chrome://extensions`, then reload any open Instagram tab.

## How to test it on Instagram

1. Set a low daily limit during onboarding (e.g. 5) for a fast test.
2. Click **Open Instagram** (or navigate to instagram.com/reels yourself).
3. Scroll through a few Reels. The popup badge and ring update as Reels
   are detected (each Reel counts once per day — re-scrolling to a Reel
   you've already watched today does not double-count it).
4. Once you reach your limit, ScrollFit replaces the page with its block
   screen. **View Today's Progress** opens the dashboard; **Close
   Instagram** closes the tab.
5. Open the dashboard to see the day reflected in Overview/History.

## How Demo Mode works

Dashboard → **Settings → Hackathon Demo Mode** (visually separated, dark
panel, clearly labeled — never mixed into real stats silently):

- **Simulate +10 / 25 / 40 / 49 Reels** — sets today's count directly, no
  need to actually scroll Instagram.
- **Simulate Limit Reached** — sets today's count to exactly your limit.
- **Load Demo Data (7-day history)** — fills History/Insights/the chart
  with a sample week, flagged internally as demo data.
- **Reset Demo Data** — clears both today's count and history back to
  zero, restoring the real empty state.

Suggested 2–3 minute demo flow:

1. Open the popup, show onboarding, set the limit to 5.
2. Open Instagram, scroll a handful of Reels, show the counter and ring
   move in the popup.
3. Keep scrolling to the limit — show the block screen appear on
   Instagram itself.
4. From the block screen, click **View Today's Progress** into the
   dashboard: today's card, streak, score.
5. In Settings, click **Load Demo Data** to instantly populate a week of
   history, then walk the chart, History table, and Insights tab.

## Reel detection

Detection combines three signals so no single one is load-bearing against
Instagram's DOM changes (implemented in `content/content.js`):

1. **URL watching** — `/reels?/<id>/` is parsed out of the path on every
   `pushState`/`replaceState`/`popstate`, plus a polling fallback.
2. **IntersectionObserver** — the `<video>` that's ≥70% visible is treated
   as the active Reel; its identifier falls back through a permalink,
   then the video's source URL, then its poster image.
3. **MutationObserver** — re-scans for new `<video>` elements as
   Instagram's feed re-renders, without depending on any specific class
   name.

A Reel only counts after it's been the active candidate for 500ms (dwell
time), and only once per day per identifier — both protect against
counting the same Reel twice on a re-render or a quick flick-past.

## Current limitations

- Instagram's frontend markup and behavior change without notice. Reel
  detection is best-effort and modular by design (`content/content.js`
  is the only file that would need updating if selectors/URLs shift) —
  it is not guaranteed to be perfectly accurate on every Instagram build.
- The block screen replaces the visual experience of the page; for the
  MVP it does not (and does not attempt to) forcibly close the browser.
- No cross-browser support yet — built and tested for Chrome
  (Manifest V3).
- YouTube Shorts and Facebook Reels are not tracked yet (see Roadmap).
- There's no login/sync — data is local to one Chrome profile. Exporting
  from Settings is the way to keep a copy or move it.

## Future roadmap (not built in this MVP)

- **Android app** tracking short-form consumption across Instagram
  Reels, YouTube Shorts, and Facebook Reels, under the same positioning:
  *"One fitness tracker for your digital attention."*
- Cross-platform screen-time tracking, app blocking, smart cooldowns,
  focus sessions, weekly reports, notifications, personalized goals,
  habit challenges, achievements, family mode, wearable integration.

None of the above is stubbed with fake UI in this build — the current
deliverable is the Chrome Extension + web dashboard described above, and
nothing claims functionality it doesn't have.
