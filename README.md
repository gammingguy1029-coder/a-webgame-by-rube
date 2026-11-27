# RUBE

**Climb the endless mysterious tower. Just one more floor.**

A complete, polished, addictive browser game — 100% client-side. No server, no account,
no database. Runs fully offline (PWA) after the core files are cached.

## Play

Serve the folder with any static server (no build step):

```bash
python3 -m http.server 8000 --bind 0.0.0.0
# or: npx serve .
```

Then open `http://localhost:8000`.

The game is also installable as a PWA on supported mobile browsers
(**Add to Home Screen**).

## The Loop

PLAY → CLIMB → RISK → REWARD → DIE → UPGRADE → PLAY AGAIN

- Every floor is a short (10–30 s) procedurally generated challenge.
- Explore, avoid traps, fight enemies, collect coins, reach the exit.
- Difficulty rises gradually; every 10th floor is a boss.
- You choose SAFE / DANGEROUS / INSANE paths after certain floors.
- Die, spend permanent coins on upgrades, and beat your last floor.

## Controls

**PC:** A/D or ←/→ move · Space jump · Left-click attack · Shift dash · Esc pause

**Mobile:** large on-screen touch buttons (auto-detected, landscape recommended).

## Features

- Procedural rooms: combat, trap, parkour, treasure, mystery, challenge, boss — always validated beatable
- 7 enemy types (Slime, Bat, Guard, Archer, Bomber, Shadow, Elite)
- 3 bosses (The Warden · The Void Beast · The Tower King) with multi-pattern, telegraphed attacks
- 9+ trap types with warning animations
- Treasure chests (Common / Rare / Epic / Legendary)
- Powerups (Shield, Rage, Speed, Magnet, Time Warp, Double Coins)
- Random event floors (Coin Rush, Darkness, Double Enemies, Treasure, Cursed)
- Score + combo system, run coins → permanent coins economy
- Permanent upgrade shop (Health, Damage, Speed, Dash, Attack Speed, Luck, Coin Bonus)
- Daily challenge (deterministic per-date seed, local-only results)
- Statistics, settings, revive via rewarded ad, banner + interstitial ad slots
- Web Audio procedural SFX + music (no copyrighted assets)
- LocalStorage save with full validation/recovery, single versioned save object

## Tech

HTML5 · CSS3 · Vanilla JS · HTML5 Canvas · LocalStorage · Web Audio API · Service Worker (PWA).
No frameworks, no build, no backend. Ad functions live in `js/ads.js` and are safe placeholders
until a real provider is wired in — the game never depends on ads.

## Project Structure

```
index.html
css/style.css
js/  (ads, audio, settings, save, particles, input, mobileControls, weapons,
      player, enemies, bosses, collision, camera, procedural, rooms, upgrades,
      dailyChallenge, ui, game, main)
pwa/manifest.json
pwa/service-worker.js
assets/icons/
```

## Owner / Admin Mode

A hidden, session-only **OWNER** mode is available from the small **OWNER** button in the
top-right of the main menu. It requires a password and provides developer overrides
(Infinite Health, a cosmetic Rube Aura, and Owner Music).

- Session-based — Owner Mode turns OFF on page refresh; nothing is saved to LocalStorage.
- Purely client-side — **not real security**; the password is in the shipped source.
- All effects clean up fully on exit and never alter normal progression.

## Development / Testing

A headless runtime harness is included:

```bash
node .arena_harness.js
```

It loads every module in order, boots the game, simulates a run, and validates that all
procedural floor layouts are beatable and that save data is recovered/clamped safely.
