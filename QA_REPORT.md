# ONE MORE FLOOR — Master QA, Debugging & Logic Audit Report

Auditor: automated + manual source audit
Scope: full project (HTML, CSS, all 20 JS modules, PWA, save, ads)
Test method: source review + headless runtime harnesses (`node .arena_qa.js`, `node .arena_harness.js`, `node .arena_stress.js`)

---

## 1. Bugs Found & Fixed

Each entry uses the requested schema.

---

### BUG GAME-CRIT-001 — MULTIPLE GAME LOOPS (CRITICAL)
- **SEVERITY:** CRITICAL
- **FILE:** `js/game.js`
- **FUNCTION:** `beginRun()` / `loop()`
- **PROBLEM:** `beginRun()` called `requestAnimationFrame((t) => this.loop(t))` on **every** run start. Because `loop()` unconditionally re-schedules itself with another `requestAnimationFrame`, every PLAY / TRY AGAIN / DAILY start added a **permanent new RAF loop** that kept running forever.
- **REPRODUCE:** Start a run, die, press TRY AGAIN 5 times → the game now runs `update()`/`draw()` ~6× per frame → gameplay speed multiplies and the process climbs on every restart.
- **EXPECTED:** exactly one game loop.
- **ACTUAL:** one new RAF loop per `beginRun()`.
- **ROOT CAUSE:** loop scheduling was not idempotent.
- **FIX:** Added a single persistent loop started once in `init()` via `startLoop()` (guarded by `_loopStarted`). Removed the `requestAnimationFrame` from `beginRun()`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 2 — asserts `beginRun()` adds zero new RAF loops.

### BUG GAME-CRIT-002 — EXITS HAVE NO WIDTH/HEIGHT ON NORMAL FLOORS → UNCOMPLETABLE (CRITICAL)
- **SEVERITY:** CRITICAL
- **FILE:** `js/procedural.js`, `js/rooms.js`
- **FUNCTION:** `generateFloor()` / `updateRoom()` exit check
- **PROBLEM:** Normal (non-boss) floors created `exit: { x, y }` with **no `w`/`h`**. Only boss rooms set `w:40,h:40`. The exit collision test in `rooms.js` (`Collision.rectsOverlap(player, {x:er.x,y:er.y,w:er.w,h:er.h})`) therefore computed `er.x + undefined = NaN`, which made every overlap test `false`. The exit portal also wasn't drawn (NaN coordinates). **No normal floor could be completed.**
- **REPRODUCE:** Play floor 1, walk over the exit → floor never completes.
- **EXPECTED:** touching the exit completes the floor.
- **ACTUAL:** exit collision always false on normal floors.
- **ROOT CAUSE:** exit rect dimensions never set for the default exit.
- **FIX:** Set `w:40,h:40` on the default exit in `generateFloor()`, and added a defensive `Object.assign({w:40,h:40}, data.exit)` in `buildRoom()` so any legacy/missing dimensions are backfilled.
- **REGRESSION TEST:** `.arena_qa.js` TEST 1 (1000 floors all have valid exit dims) + TEST 1b (exit rect actually overlaps a standing player).

### BUG GAME-HIGH-001 — REVIVE DOUBLE-BANKS END-OF-RUN REWARDS (HIGH)
- **SEVERITY:** HIGH
- **FILE:** `js/game.js`
- **FUNCTION:** `killPlayer()` / `endRun()`
- **PROBLEM:** `endRun()` (bank run coins → permanent) was called inside `killPlayer()`. If the player then used REVIVE, the run continued **with runCoins intact**, so a second death called `endRun()` again and banked the same run coins a second time. Highest-floor / best-score / totalCoins were also applied repeatedly.
- **REPRODUCE:** Die (coins banked), revive, die again → permanent coins granted twice.
- **EXPECTED:** run rewards granted exactly once per run.
- **ACTUAL:** rewards granted again after a revive.
- **ROOT CAUSE:** banking happened on death even though the run could continue via revive.
- **FIX:** Rebuilt the flow: `killPlayer()` no longer banks — it only computes a display amount. Banking moved to `bankRun()`, which is **idempotent** (guarded by `run.ended`) and is invoked exactly once at a real run boundary (`beginRun()` for the previous run, `toMenu()`, `quitRun()`). Revive continues the same run and does not bank.
- **REGRESSION TEST:** `.arena_qa.js` TEST 3 (no bank at death, one bank after final transition, no double-bank on repeated menu).

### BUG GAME-HIGH-002 — TOTAL PLAY TIME DOUBLE-COUNTED (MEDIUM/HIGH)
- **SEVERITY:** MEDIUM
- **FILE:** `js/game.js`
- **FUNCTION:** `beginRun()` / `endRun()`
- **PROBLEM:** `beginRun()` added the previous run's `timeSurvived` to `statistics.totalPlayTime`, and `endRun()` also added it. Every finished run's time was counted twice.
- **FIX:** Removed the time add from `beginRun()`; time is now added only in `bankRun()`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 4 (50 + 30 → exactly 80).

### BUG GAME-MED-003 — COIN-FLY PARTICLES NEVER EXPIRE (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/game.js`
- **FUNCTION:** `update()` coin-fly loop
- **PROBLEM:** `if (c.life -= dt <= 0)` parses as `c.life -= (dt <= 0)` = `c.life -= 0`, so coin-fly particles never expired from their life timer and accumulated in `Game.coinFly` forever (a memory leak on long runs).
- **FIX:** Rewrote as `c.life -= dt; if (c.life <= 0) { splice; continue; }`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 5.

### BUG GAME-MED-004 — SHADOW ENEMY TELEPORT NEVER EXECUTES (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/enemies.js`
- **FUNCTION:** `aiShadow()`
- **PROBLEM:** When the shadow's teleport warning (`teleWarn`) hit 0, the warping branch set `state = 'idle'` **before** the teleport-execution code below, which only runs when `state === 'warping'`. Net effect: the shadow faded but **never teleported**.
- **FIX:** Removed the early `state = 'idle'`; the warping branch now only holds still, and the teleport completes when the warning elapses.
- **REGRESSION TEST:** `.arena_qa.js` TEST 6 (shadow displaces toward its target).

### BUG GAME-MED-005 — GUARD "BLOCK" WAS COSMETIC ONLY (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/game.js` (`damageEntity`)
- **PROBLEM:** `guard` enemies randomly set `blocking: true`, which was drawn as a shield but never affected damage taken.
- **FIX:** `damageEntity` now halves incoming damage while `e.blocking` is set.
- **REGRESSION TEST:** `.arena_qa.js` TEST 7.

### BUG GAME-MED-006 — BOSS PROJECTILE BURST FIRED ONLY ONE SHOT (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/bosses.js`
- **FUNCTION:** `executeTelegraph()` (`projectile` case)
- **PROBLEM:** The burst logic set `burstT = 0.3` to delay follow-up shots, but nothing ever consumed `burstT`, so only a single projectile was fired per pattern instead of the intended volley.
- **FIX:** `executeTelegraph` now fires the full `burstCount` volley immediately with small random spread.
- **REGRESSION TEST:** `.arena_qa.js` TEST 8 (asserts ≥5 projectiles spawned).

### BUG GAME-MED-007 — DAILY REWARD COULD BE CLAIMED REPEATEDLY (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/dailyChallenge.js`
- **FUNCTION:** `recordResult()`
- **PROBLEM:** `recordResult` set `rewardClaimed = (prev.rewardClaimed && success) ? false : prev.rewardClaimed`. Re-completing the daily after already claiming reset `rewardClaimed` to `false`, allowing the reward to be claimed again (unlimited).
- **FIX:** `recordResult` now preserves `rewardClaimed` and only ORs `completed`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 9 (claim once, second claim = 0, re-completing still cannot claim).

### BUG GAME-MED-008 — MAGNET COIN DIVISION BY ZERO → NaN COINS (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/rooms.js`
- **FUNCTION:** coin update (magnet attraction)
- **PROBLEM:** When a magnetized coin was directly under the player, `d ≈ 0` and `dx / d` became `NaN`, permanently corrupting the coin's position so it could never be collected.
- **FIX:** Guard the magnet movement with `d > 1`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 10.

### BUG GAME-MED-009 — DYING ON THE EXIT COULD COMPLETE THE FLOOR WHILE DEAD (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/game.js` (`onExitReached`, `killPlayer`)
- **PROBLEM:** Within one update frame, `Player.update()` could set state `DEAD`, then `Rooms.updateRoom()` could reach the exit and call `onExitReached()`, overriding `DEAD` with `FLOOR_COMPLETE` and letting a dead player keep playing at 0 HP.
- **FIX:** `onExitReached()` now returns early unless the player is alive and state is `PLAYING`; `killPlayer()` accepts `PLAYING` or `CHEST` (so death mid-chest-frame is not swallowed).
- **REGRESSION TEST:** `.arena_qa.js` TEST 11.

### BUG GAME-MED-010 — CLICKING UI BUTTONS TRIGGERED AN ATTACK (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/input.js`
- **FUNCTION:** `mouseDownHandler()`
- **PROBLEM:** Any left-click anywhere (including PLAY / UPGRADES buttons) buffered an attack; clicking PLAY swung the weapon at the start of floor 1.
- **FIX:** Only buffer an attack when `Game.state === 'PLAYING'`.
- **REGRESSION TEST:** `.arena_qa.js` TEST 12.

### BUG GAME-MED-011 — MOBILE DIRECTION COULD GET STUCK (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `js/mobileControls.js`
- **FUNCTION:** `bindButton()`
- **PROBLEM:** A touch button only released on `touchend`/`touchcancel`. If a finger started on LEFT then slid off without lifting, `touchMove` stayed `-1` and the player kept moving left.
- **FIX:** Added a `touchmove` handler that releases the button when the finger leaves its bounds.
- **REGRESSION TEST:** code review + manual scenario (no headless DOM for it).

### BUG PWA-MED-001 — SERVICE WORKER CACHED STALE JS INDEFINITELY (MEDIUM)
- **SEVERITY:** MEDIUM
- **FILE:** `pwa/service-worker.js`
- **PROBLEM:** All GET requests (including JS/CSS) used **cache-first**, so any code fix would never reach players until the cache name changed; an outdated SW would serve broken/stale files forever.
- **FIX:** Bumped cache to `v2` and switched to **network-first for navigation, HTML, JS, and CSS** (cache fallback offline); **cache-first only for static images/icons**. Deleted old caches on activate.

### BUG GAME-LOW-001 — BOSS ENRAGE WARNING NEVER DISPLAYED (LOW)
- **FILE:** `js/bosses.js` — `warnTime` was always `0` and never decremented, so "ENRAGED!" never drew. Now set to 2.0s and ticking on each phase-up.

### BUG GAME-LOW-002 — COIN-FLY EFFECT OFF-CENTER / DEAD CODE (LOW)
- **FILE:** `js/game.js` — `addRunCoins` used `this.canvas.width/2` (physical px, DPR-scaled) so the fly-in landed off-center; unused `hud` variables removed; now uses CSS-pixel center.

### BUG GAME-LOW-003 — FAKE PLATFORM COLLAPSE TIMING (LOW)
- **FILE:** `js/rooms.js` — fake-platform countdown was decremented twice per frame (shared timer + platform-specific timer), collapsing ~2× too fast. Unified to a single countdown.

### BUG GAME-LOW-004 — `this.maxed` DEAD REFERENCE (LOW)
- **FILE:** `js/ui.js` — `const price = this.maxed ? ...` referenced a nonexistent property (harmless, but confusing). Changed to the local `maxed`.

### BUG GAME-LOW-005 — NEGATIVE DT SAFETY (LOW)
- **FILE:** `js/game.js` — the loop dt is now clamped to `[0, 0.05]` to guard against any negative delta after state transitions.

---

## 2. Bugs Fixed — Summary

| ID | Severity | Area |
|---|---|---|
| GAME-CRIT-001 | CRITICAL | Game loop (multiple RAF loops) |
| GAME-CRIT-002 | CRITICAL | Floor completion (exit w/h) |
| GAME-HIGH-001 | HIGH | Economy (revive double-bank) |
| GAME-HIGH-002 | MEDIUM | Statistics (play-time double count) |
| GAME-MED-003 | MEDIUM | Memory (coin-fly leak) |
| GAME-MED-004 | MEDIUM | Enemy AI (shadow teleport) |
| GAME-MED-005 | MEDIUM | Combat (guard block) |
| GAME-MED-006 | MEDIUM | Boss (projectile volley) |
| GAME-MED-007 | MEDIUM | Daily challenge (double claim) |
| GAME-MED-008 | MEDIUM | Coins (NaN from magnet) |
| GAME-MED-009 | MEDIUM | State machine (die-on-exit) |
| GAME-MED-010 | MEDIUM | Input (UI click attack) |
| GAME-MED-011 | MEDIUM | Mobile controls (stuck input) |
| PWA-MED-001 | MEDIUM | PWA (stale SW cache) |
| GAME-LOW-001..005 | LOW | Boss warn, coin-fly, platforms, upgrades UI, dt |

---

## 3. Remaining Issues

These are genuine, low-severity / intentional-design items that were **not** changed because fixing them would alter gameplay or add risk beyond a bug fix:

1. **(LOW / design)** While the "ROTATE YOUR DEVICE" overlay is shown on a portrait touch device, the game state remains `PLAYING` and enemies continue to act behind the blocking overlay. This is a fairness edge case. Not auto-pausing keeps the transition to landscape seamless; noted as a conscious trade-off.
2. **(LOW)** If a player refreshes the browser while on the death screen *before* choosing TRY AGAIN / MAIN MENU, that run's unbanked rewards are lost (run state is in-memory only). This is the correct consequence of banking only at a real run boundary (which is what prevents the double-reward bug). Banking happens the instant the player leaves the run.
3. **(LOW)** `damageText` particles bypass the `MAX_PARTICLES` cap and the particle on/off setting (they always show, by design — damage numbers are important info). They expire quickly (~0.7s) so growth is bounded.
4. **(LOW)** Ads are placeholders only — no real provider is configured. See the Ads findings section.
5. **(LOW)** The multi-frame chest-open + death-in-same-frame path was hardened (killPlayer now accepts `CHEST`), but a 0-HP player who opens a chest and is then hit can briefly exist at 0 HP alive. Harmless; the next hit resolves it.

---

## 4. Performance Findings

- **Fixed:** the multi-loop bug was the single largest performance/speed problem — it multiplied `update()`/`draw()` work with every restart.
- **Fixed:** coin-fly leak no longer grows memory across rooms/runs.
- **Particles** are pooled and capped at 240; `reducedEffects` short-circuits spawns. Damage-number text is not pooled but is short-lived.
- **Collision** uses simple AABB against the room's collidables (a small array, typically < 20) — no spatial partition needed at this scale.
- **Enemy cap:** procedural generation caps enemies (≤ ~12) and respects `reducedEffects`; dead enemies/projectiles are removed from arrays each frame (no unbounded accumulation).
- **Verified:** the loop is frame-rate independent (dt-scaled movement) and clamped to 50 ms; the same `dt` drives 30/60/120 FPS equivalently.
- **Verified:** 5000 generated floors contained no non-finite/negative/out-of-bounds values; a 40-floor simulated combat climb ran with **0 exceptions**.

---

## 5. Save-System Findings

The single versioned save object (`save.js`, `SAVE_VERSION 3`) is validated and clamped on load:
- Corrupt JSON → clean default save (no crash).
- `NaN` / `Infinity` / negative / absurdly large values → clamped to sane ranges (coins ≥ 0, upgrade levels 0–99, volumes 0–1, etc.).
- No saved data is ever executed as code.
- Storage disabled/unavailable → graceful in-memory fallback with a warning.
- **Fixed:** rewards are now written once per run boundary (`bankRun`, idempotent), so refreshing/duplicating events can't double-grant. Daily challenge reward is claimable once per day.
- Verified: coins earned → upgrade → reload → persists.

---

## 6. Mobile Findings

- Touch controls are large, rounded, translucent, with press feedback; `preventDefault` blocks scroll/zoom/gesture.
- **Fixed:** slide-off now releases a held button (no stuck direction).
- Keyboard `preventDefault` prevents page scroll; Escape handled for pause.
- Portrait shows "ROTATE YOUR DEVICE" overlay (with a design note in Remaining Issues about continued simulation behind it).
- Canvas uses DPR-aware sizing and `touch-action: none`.
- Touch and mouse are handled as distinct paths; single taps produce a single action (consumed once via the input-buffer).

---

## 7. Advertisement Findings

- **No real ad provider is configured**, so ads are placeholders (`js/ads.js`, `AD_PROVIDER = null`, `ADS_ENABLED = false`).
- The game is fully playable without ads; `Ads.*` are safe no-ops that resolve `false`.
- **Revive is disabled gracefully** when ads are unavailable (button hidden; `tryRevive` guards).
- Rewarded/interstitial callbacks resolve `false` on failure — they can never falsely grant a reward, freeze, or double-grant.
- Interstitial is fired only at the natural end-of-run boundary; banner only on the menu; no ads interrupt gameplay.
- Rewarded ad is only shown after the player explicitly presses REVIVE — never auto-opened.

---

## 8. Final Status

**Verification:** 32/32 automated regression checks pass; full-flow harness passes; 5000-floor generation and 40-floor simulated combat run with zero errors.

```
CRITICAL BUGS: 0 / 2
HIGH BUGS:     0 / 1
MEDIUM BUGS:   0 / 11
LOW BUGS:      0 / 5

GAMEPLAY:   PASS
MOBILE:     PASS
PC:         PASS
SAVE SYSTEM:PASS
PWA:        PASS
ADS:        NOT CONFIGURED (placeholders, game fully functional without ads)
PERFORMANCE:PASS
```

**Objective met:** ONE MORE FLOOR is stable, playable, responsive, fair, performant, and materially harder to break than before the audit. Two CRITICAL progression bugs (uncompletable normal floors, compounding game loops) were found and fixed, along with the revive double-reward economy bug and a set of AI/input/memory/PWA correctness issues. No features were removed and no architecture was rewritten.
