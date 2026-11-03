# Britto app design (Claude Design export, 2026-11-03)

The owner's design, exported from Claude Design as `Britto Mobile App Design.zip`
(10 files, 593 KB; saved to Downloads 2026-11-03 23:05). **`Britto App v4.dc.html` is the
current version** (32 Android screens; `Britto Screens v4.dc.html` lays them all out on one
canvas). v1–v3 are earlier rounds, kept for reference.

These files are the VISUAL SPEC, not code Britto runs: `support.js` loads React and Babel from
unpkg at runtime, which Britto's strict Content-Security-Policy forbids (DESIGN-BRIEF.md,
"Integration contract"). P5 rebuilds the design in `web/` in plain HTML/CSS/JS against
`web/api.js`. To look at it: serve this folder over HTTP (e.g. `python3 -m http.server`) and open
`Britto Screens v4.dc.html` in a browser with internet access.

Design tokens (measured from v4): primary `#1F5BFF`, ink `#141B34`, muted `#6B7390`, subtle
`#9AA1B8`, green `#0E9F55` / `#E5F7EE`, red `#E23B3B` / `#FDEBEB`, orange `#FF7A1A` / `#FFF1E4`,
yellow `#FFC531` / `#FFF7D6`, purple `#7B4DFF` / `#F3EBFF`, surfaces `#F4F6FB` `#EEF1F7`
`#EAF0FF`, lines `#E3E7F2` `#C3CDEB`. Type: Outfit 500–800 (headings), Manrope 400–800 (body).

Not built from this design, on purpose (HISTORY "P5"): cashback, wallet, withdraw, payouts,
spin & rewards and refer & earn (real money; out of scope since 2026-10-27), phone login and
OTP (owner decided 2026-10-29: no Britto account), and the price bubble drawn over other apps
(needs Android accessibility/overlay permissions; Super Browse does this inside Britto).
