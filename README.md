# Lift Log

A single-file workout app for one person: a beginner lifter on machines at Planet Fitness, running a fixed Upper/Lower 4-day program. Live at **https://andrewhill81.github.io**. The entire app is `index.html` — no build, no dependencies.

## For future Claude sessions working on this

Read this before touching `index.html`. The user is Andy (andy@shadetreehomes.com).

### Non-negotiable reliability rules (the product's sacred law)

1. Logged data must NEVER be silently lost.
2. Never claim a save succeeded when it didn't. On failure: plain words, sets stay on screen ("NOT SAVED — storage refused...").
3. Recording (tapping reps, stepping weight, timer) never depends on persistence succeeding.
4. A failed/corrupt load must never overwrite stored data (`loadCorrupt` flag blocks all writes).
5. Edits to this app must preserve accumulated history in users' browser localStorage. Storage keys: `liftlog.v1` (state), `liftlog.photos.v1` (machine photos). NEVER rename keys or change the schema without a migration.
6. Failure states are quiet and specific, not alarming.

### Program & progression (fixed, user never configures)

- Mon/Thu: Lower + Core (leg press, leg curl, leg extension, hip abduction; ab crunch, straight-arm crunch, torso twist 4 directional sets L1/L2/R1/R2). Tue/Fri: Upper, push/pull alternating (chest press, pulldown, shoulder press, row, triceps press, biceps curl). Wed/Sat/Sun: rest cards, no logging.
- Main lifts 3×8–12 rest 90s; core 3×15–20 (twist ×4) rest 60s. All weights step by 5 lb.
- Progression: all sets at top of range at ONE weight → +5 lb next session, applied on save. Mixed weights in a day → no auto-increase. Any set below range bottom (the "<8"/"<15" chip) → "Too heavy. Drop 5 lb and rebuild."
- Weights belong to the exercise, not the weekday. History is one continuous line; nothing resets weekly.
- Unsaved taps auto-finalize under their actual date on next open.

### Voice & style

Direct, short, honest. No exclamation points, no praise-speak. Dark industrial look: near-black bg, bone text, magenta primary, yellow = earned/achievement. Mono for all numbers. A stalled shoulder press is NORMAL, never flagged. The user had shoulder surgery years ago, fully healed — never mention it, never treat it as a limitation.

### Machine photos

`photos` map (exercise id → dataURL) in `liftlog.photos.v1`, added via in-app camera on the placeholder card. If Andy supplies photos in chat, they may be baked into the file as a `BAKED_PHOTOS` object — keep total page weight reasonable (compress to ≤900px JPEG ~0.72).

### Testing

`test/smoke.mjs` is a Playwright suite (37 checks) covering logging, persistence, progression verdicts, stale-day auto-finalize, honest save-failure behavior, corrupt-load protection, and export/import. Run before every push:

```
npm install playwright   # chromium at /opt/pw-browsers/chromium in Claude sessions
node test/smoke.mjs
```

All checks must pass before pushing. Deployment is just `git push` — GitHub Pages serves the repo root (`.nojekyll` present).

