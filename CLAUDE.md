# Britto — instructions for Claude (local and cloud sessions)

Britto (called Daam until 2026-10-27) is a BuyHatke-class price-history site, Telegram bot, Chrome
extension and (from S4) Android app. The owner is building it as a job-portfolio piece and wants
friends and classmates to use it on phones **without** the extension.

**Start every session with `PLAN.md` "Start here", then `HISTORY.md`.** Do only the session the
prompt names, then update `HISTORY.md`, tick `PLAN.md`, and report verified and NOT verified
separately. The owner is not technical: explain in plain English, decisions as simple options,
and end with the prompt to paste next. Use they/them for the owner.

## Working rules (the owner's standing instruction, every session)

**Never state as fact anything you have not checked in this session.**

1. Read before you write: open the file, run `--help`, fetch the doc. If it can't be checked, say
   so and mark it **unverified**.
2. Assert on data, not on shape: measure the bytes / rows / pixels / money.
3. A green test proves nothing until it is proved able to fail: break it on purpose, watch the
   exact checks redden, restore.
4. Measure before you diagnose. Tests green + owner says broken → query production data first.
5. Write the contract first on anything big (`core/types.ts`, `CONTRACT.md`).
6. Report verified and NOT verified separately, always.
7. Every number gets a source (which run, which build). **"Verified live" means checked in the
   production database** (S2 claimed a live read that only a fixture had; corrected in S3).
8. Prefer the boring proof: a real browser, a real request, a real row, a real file.

## Hard rules for this project

- **Host on the AMITY Cloudflare account only** (amitynoidalibrary@gmail.com,
  account `225f2c3132920804e70224f830c9aadc`). Never change the account's workers.dev subdomain
  (shared with a paying client).
- **Never disguise the fetcher or work around a store's bot wall** (`BrittoBot` User-Agent,
  honest). Stores that refuse the server are read from the shopper's own browser/app. Do not
  reverse-engineer other companies' apps (BuyHatke etc.).
- Never paste or print tokens. Secrets live in Cloudflare (`wrangler secret`) or GitHub Actions
  secrets, set by the owner.
- Don't write test/fake data into production. `scripts/push-live.mjs` is the only live script
  that writes, and it deletes what it made.
- Deploy order: schema (`npm run db:remote`) THEN code (`npm run deploy`).
  `.github/workflows/deploy.yml` does both, in that order, on every push to `main` once the owner
  has added the `CLOUDFLARE_API_TOKEN` repository secret.

## Gates

`npm test` · `npm run typecheck` (both configs; `node --test` strips types without checking) ·
`npm run check:readers` (every reader config against every saved page) · `npm run mutate
[name]` (deliberate breakages must redden exactly their checks) ·
`npm run prove` (real Worker + throwaway D1 + one real amazon.in request) ·
`node scripts/alerts.mjs [--browser]` · `scripts/browser.mjs <url>` · `scripts/extension.mjs` ·
`npm run test:app` (Android: Robolectric, APK checks, reader through the real Java bridge) ·
`node scripts/travel.mjs` (travel links opened on the real sites) · `scripts/push-live.mjs <url>`.

## Cloud sessions (claude.ai/code)

- The browser scripts take Playwright from `PW_DIR` (on the owner's Mac:
  `../quire/web/test/node_modules/playwright-core`). The cloud container (checked 2026-10-26)
  has Playwright preinstalled with Chrome for Testing 153 (`require('playwright')` works,
  nothing to download); `scripts/extension.mjs` falls back to it when Brave is absent, and
  Chrome for Testing accepts `--load-extension`.
- **Amazon refuses the cloud container's network** (measured 2026-10-26: HTTP 503 "automated
  access" page, after two successful reads earlier the same hour). `prove` then marks the
  checks that need a real Amazon price as `SKIP … NOT verified` instead of passing them.
  Never work around it; the real-price checks are verified by the live check after deploy.
- The environment's network allowlist must include `www.amazon.in`, `m.media-amazon.com`,
  `api.telegram.org`, `*.workers.dev`, and `dl.google.com` (Android SDK) on top of the defaults.
  If a request is refused by the sandbox, say which host, don't work around it.
- Android in the cloud (2026-10-27): no emulator (no `/dev/kvm`). SDK: `dl.google.com`
  platform 36 + build-tools 36.0.0 unpacked into `~/android-sdk` (SHA-1s from Google's
  repository index), `android/local.properties` → `sdk.dir`. Gradle, AGP and AndroidX come
  from `services.gradle.org`, `dl.google.com` and Maven Central (all reachable).
- Travel sites from the cloud container (measured 2026-10-27, honest UA): Cleartrip and Uber
  answer; MakeMyTrip, Goibibo, Yatra, IndiGo and Air India give no answer (502 / timeouts),
  EaseMyTrip sends this US network to its .US site, ixigo 403, Skyscanner a captcha,
  Booking.com 403 "robot". `scripts/travel.mjs`
  marks those SKIP; the owner checks them from India (HISTORY "Waiting for the owner").
- Cloud sessions push branches; merging to `main` deploys. The session's permission guard
  refused a push to `main` (2026-10-27): the owner merges (HISTORY "Waiting for the owner").
