# Tree Tower Defense — Project Brief & Kickoff

> **Working title:** *Grove Keeper* (placeholder — see [Naming & identifiers](#naming--identifiers)).
> **Author:** Mr. Deadblock (solo indie dev)
> **Purpose of this doc:** Seed a brand-new Claude Project with (1) the proven stack and hard-won lessons carried over from Deadblock so you don't re-fight those battles, and (2) a design + data-model foundation for the new game. Drop this in as the new project's first doc; the *Ways of working* section can also go straight into the project's custom instructions.

---

## 1. Concept

A real-time **tower defense** game with a nature-vs-development theme:

- **Towers = trees.** Each species has a distinct ability (single-target, splash, slow, support, economy, etc.). You plant and upgrade them along the paths.
- **Enemies = construction vehicles.** Bulldozers, excavators, cement mixers, steamrollers, cranes, etc., each with different speed/armor/behavior, marching toward the thing you're protecting.
- **What you defend:** the heart of the grove — an ancient tree / seed vault / the last green tile. Enemies that reach it cost you a life.
- **Theme hook:** the forest holding the line against a construction crew trying to clear and pave it. Strong, readable visual identity (green/organic vs. yellow-black/industrial) and a clear emotional throughline.

**Core loop:** survive waves → earn resources from fallen vehicles → plant & upgrade trees → survive bigger waves → beat the level (stars) → unlock new tree species and harder levels.

---

## 2. The big architectural difference from Deadblock (read this first)

Deadblock is **turn-based** — React state re-renders are cheap because nothing moves between turns. Tower defense is **real-time**: dozens of enemies and projectiles updating ~60×/second. **Do not drive the simulation through React state.** You already felt a milder version of this in Deadblock's weekly-challenge timer (the `LiveTimerPanel` extraction + throttled tick existed precisely because per-frame React re-renders cause heat/jank on mobile WebView). Scale that up to a full TD and it's fatal.

**Recommended architecture:**

- **One `<canvas>` play surface** driven by a `requestAnimationFrame` **game loop**, fully decoupled from React.
- **Simulation state lives in plain JS** (a module / class / refs), *not* React state, during a wave. React never re-renders because an enemy moved.
- **React owns only the UI chrome**: menus, the HUD (lives, resources, wave counter), the shop/build bar, upgrade panels, modals. These update at human speed, not frame speed.
- **Fixed-timestep update + render interpolation** so the sim is deterministic regardless of frame rate (also makes pause/resume and replays sane).
- **Deterministic, seeded waves.** A seed per level/run makes leaderboards verifiable and replays possible — important for a score-based game (see anti-cheat note in the data model).
- **Pause/resume + background handling** — reuse the Deadblock lessons: suspend on `visibilitychange`/Capacitor `appStateChange`, and if you add audio, suspend/resume the `AudioContext` (don't let a wave keep simulating or music keep playing when backgrounded).

**Renderer choice (decide early — see open questions):**

| Option | Pros | Cons | When |
|---|---|---|---|
| **Canvas 2D** (hand-rolled) | Zero deps, simplest mental model, fine for modest sprite counts | You write your own sprite/pooling/culling | Fastest path to a prototype; good default to start |
| **PixiJS** (WebGL 2D) | GPU-accelerated, handles many sprites smoothly on mobile, still "just a renderer" you drive from your own loop | A dependency to learn; bundle size | When sprite/projectile counts grow |
| **Phaser** (full engine) | Batteries-included (scenes, physics, tween, input) | Heavier, more opinionated, awkward to marry with a React HUD | If you'd rather adopt an engine than hand-roll |

Recommendation: **start Canvas 2D + React HUD**, keep the renderer behind a thin interface, and swap to **PixiJS** if/when you hit sprite-count limits on the Galaxy S24.

---

## 3. Carry-forward stack (proven on Deadblock)

Reuse the exact stack — it's launched, it works, and you already know its edges.

- **Frontend:** React 18 + Vite + Tailwind CSS, built as a **PWA**.
- **Backend:** **Supabase** — Auth, Postgres, Realtime, RPC, Edge Functions.
- **Hosting:** **Netlify** (continuous deploy from GitHub).
- **Native wrap:** **Capacitor 8** for Android first, iOS later.
- **Push (if needed):** `@capacitor-firebase/messaging` + Firebase BOM — unified FCM tokens on both platforms.
- **Android toolchain:** Android Studio Otter, AGP 8.6.1, **JBR as the Gradle JDK**, `targetSdkVersion 35`+.
- **Dev env:** Windows (PowerShell / Command Prompt) + Android Studio; test on the Galaxy S24 (Android 16) via USB debugging + `chrome://inspect`.
- **Play Console:** your account is post-Nov-2023 (Path B closed-testing requirements) — plan **real** closed testers early (no fake accounts — Play policy, and it risks termination).

---

## 4. Hard-won gotchas to bake in from day one

These cost you real time on Deadblock. Start the new project already respecting them:

**Capacitor / Windows / Gradle**
- Start on **Capacitor 8 / target SDK 35+** to be API-36-compliant out of the gate. If you ever upgrade majors, migrate **one major version per `npx cap migrate`** run.
- On Windows, an unset `JAVA_HOME` makes Gradle wrapper steps fail *silently* — set it; if the wrapper step still fails, manually edit `distributionUrl` in `gradle-wrapper.properties`.
- Pin the **Gradle JDK** explicitly in Android Studio settings (JBR) to avoid AGP/JDK mismatches.

**Edge-to-edge / safe areas (build it in, don't retrofit)**
- Android 15+ enforces edge-to-edge; you retrofitted ~25 files on Deadblock. This time, bake `env(safe-area-inset-*)` into the layout system from the first screen.
- Classification rule that worked: **full-bleed backgrounds are never inset; sub-components inherit parent insets; modals use overlay-padding + `maxHeight: 100%`.**

**Rendering / GPU (doubly important for a canvas game)**
- Avoid continuous `filter: brightness` (and similar) CSS animations — they're major GPU drains and were implicated in compositor-cache eviction flicker ("whole screen sometimes"). Keep the **canvas as the single animated surface**; style the HUD statically.
- If a Tailwind color renders black, inline-style override; color mappings often live in multiple places that all need updating.

**Supabase**
- **Leaderboards = one source-of-truth results table, always computed, never a drifting counter.** This was a genuinely painful Deadblock bug (profile vs. leaderboard showing different games/wins). Store raw results; compute standings via RPC / view. Don't maintain hand-incremented totals on `profiles`.
- Realtime (only if you add live/co-op/async features): a filtered subscription needs **both** `REPLICA IDENTITY FULL` on the table **and** the table in the `supabase_realtime` publication — either missing = silent event drops. Toggling the table off/on in the Publications UI refreshes config.
- PostgREST upsert requires an explicit **`?on_conflict`** parameter.
- Put **RLS on every user table**; submit scores through a **`SECURITY DEFINER` RPC** that validates server-side.

**iOS WebKit (for later, but cheap to respect now)**
- `window.confirm()` is silently blocked in standalone PWA mode — use inline confirmation UI.
- Be careful with `touch-action` and `-webkit-overflow-scrolling: touch` on `html`/`body` — both broke inner scrolling on Deadblock.

**Platform detection**
- Detect native via a `window.Capacitor` bridge check with a user-agent fallback; **don't memoize** it in a way that can cache a false negative during startup.

---

## 5. Game design foundation

### 5.1 Tree towers (starter roster)

Aim for ~6–8 at launch, each filling a clear role. Ideas:

| Tree | Role | Ability sketch |
|---|---|---|
| **Pine / Conifer** | Cheap starter, fast | Rapid low-damage needle volleys |
| **Oak** | Single-target heavy | Slow, high-damage acorn cannon; armor-piercing upgrade |
| **Willow** | Crowd control | Roots/vines **slow** vehicles in range |
| **Maple** | Splash | Spinning samara seeds deal **area** damage |
| **Birch** | Sniper | Very long range, high single-target, slow fire |
| **Fruit tree (Apple)** | Economy | Generates resources over time instead of attacking |
| **Bramble / Thornbush** | Blocker / chip | Cheap wall that damages on contact; reshapes the path |
| **Redwood** | Support/aura | Buffs damage or range of adjacent trees |

**Status effects to build around:** slow (roots/mud), DoT (sap/resin — sticky, ticking), stun (entangle), armor-break, and a water/"rust" effect (strong vs. metal armor). Each tree should get a small **upgrade tree** (2–3 tiers, ideally a branching choice at the top tier for replay variety).

### 5.2 Construction vehicle enemies (starter roster)

| Vehicle | Behavior |
|---|---|
| **Jackhammer / compactor** | Fast, low HP — swarm/rush |
| **Dump truck** | High HP workhorse; could drop debris or split on death |
| **Bulldozer** | Slow, heavily armored tank |
| **Steamroller** | Armored, slow; briefly speeds up to "flatten" |
| **Excavator** | **Attacks towers** (digs them up / disables temporarily) — forces target priority |
| **Cement mixer** | Leaves a trail that slows your towers' fire or paves terrain |
| **Crane** | The "air"/tall unit — only certain trees can hit it; or lifts/shields others |
| **Tunnel boring machine** | Burrows past early towers for a stretch |
| **Foreman pickup** | Fast; buffs nearby vehicles (kill-priority target) |
| **Wrecking-ball crane / Pile driver** | **Boss** — destroys towers in range; big HP |

**Design tension to exploit:** armor (needs armor-break/piercing) vs. speed (needs slow + area) vs. tower-attackers (needs positioning/redundancy) vs. air/burrow (needs coverage variety). That's what makes loadout and placement decisions interesting.

### 5.3 Systems

- **Economy:** earn a resource (e.g. *Sunlight* or *Sap*) per kill + optional passive trickle from economy trees; spend to plant/upgrade.
- **Lives:** N enemies may reach the grove core before you lose.
- **Waves:** escalating; periodic **boss** waves; a short build/prep window between waves.
- **Active abilities (optional):** a few player-triggered powers on cooldown — e.g. *Rainstorm* (slows + rusts metal), *Overgrowth* (temporary range/damage boost), *Birdsong* (summons woodpeckers to strip armor). Avoid literal fire as a hero power (it burns your own trees — unless you make that a deliberate risk mechanic).
- **Terrain:** buildable vs. path vs. water/cliff tiles; some trees are water-only (mangrove) or need "rich soil."
- **Scoring & stars:** per-level star rating (lives remaining, speed, no-sell runs) + an optional **endless** mode for leaderboard score-attack.

### 5.4 Meta / progression

- Unlock new tree species and levels as you earn stars.
- Cosmetic skins for trees (seasonal: blossom, autumn, snow).
- Daily / weekly **challenge** (fixed seed + modifier) — you already have the mental model from Deadblock's weekly challenge; the seeded-wave design makes this clean and fair.
- Achievements.

---

## 6. Data model sketch (Supabase)

Keep **static content** (tree stats, enemy stats, maps, wave scripts) as **versioned JSON in the repo** at first — it's faster to iterate than DB rows and needs no migration per balance tweak. Move to DB tables only if you want live-tuning without a redeploy. **Player/run data** goes in Postgres:

- **`profiles`** — `id (=auth.uid)`, `username`, `display_name`, `avatar_url`, `created_at`.
- **`player_progress`** — `user_id`, `highest_level`, `total_stars`, currency balances, settings. One row per user.
- **`unlocks`** — `user_id`, `tree_species_id`, `unlocked_at`.
- **`loadouts`** — `user_id`, `config_json` (selected trees / upgrade choices).
- **`run_results`** *(single source of truth for leaderboards)* — `id`, `user_id`, `level_id`, `mode` (campaign/endless/challenge), `score`, `stars`, `waves_survived`, `duration_ms`, `seed`, `created_at`. **Never** hand-maintain aggregate win/score counters elsewhere — compute standings from this table via RPC/view.
- **`challenges`** — `id`, `window_start/end`, `seed`, `modifier_json`; **`challenge_results`** — `challenge_id`, `user_id`, `score`, `created_at`.
- **`achievements`** / **`user_achievements`**.

**Rules:** RLS on everything user-owned; score submission through a `SECURITY DEFINER` RPC that re-simulates or at least sanity-checks the `seed`→`score` relationship server-side (seeded, deterministic waves make this feasible and are your main anti-cheat lever). Leaderboard = an RPC or materialized view over `run_results`.

> **Realtime is optional.** If the game is single-player with async leaderboards, you don't need Supabase Realtime at all — which also sidesteps the `REPLICA IDENTITY` / publication gotcha. Only add it if you build co-op or live/versus features.

---

## 7. Phased roadmap

- **Phase 0 — Setup.** Lock the concept specifics + working title. Create the GitHub repo (Vite + React + Tailwind), a new Supabase project, and the Netlify site. Decide the renderer (Canvas 2D to start).
- **Phase 1 — Core loop prototype (no DB).** One map, the canvas game loop, 2–3 trees + 2–3 vehicles, waves, economy, lives, win/lose. Prove it's *fun* and performant on the S24 before adding anything.
- **Phase 2 — Content & feel.** Full starter roster, upgrade trees, several levels, balancing, HUD/shop polish, sound. Still local.
- **Phase 3 — Accounts & persistence.** Supabase auth, `player_progress` save, unlocks, `run_results` + leaderboard RPC, daily/weekly challenge.
- **Phase 4 — PWA polish.** Installable, offline-capable shell, mobile-web performance pass.
- **Phase 5 — Android (Capacitor).** Wrap, edge-to-edge, optional push, closed testing → staged production rollout (real testers).
- **Phase 6 — iOS.** Address WebKit scroll/confirm constraints; ship.

---

## 8. Ways of working (carry forward — consider pasting into project instructions)

- **Surgical, additive-only diffs.** Minimal changes, no unintended reformatting, no full rewrites unless necessary. Propose the smaller change (e.g. class swap) before a restructure.
- **Per-file version headers.** Bump a version comment on each meaningfully changed file with a short trail — not a global counter.
- **Diagnosis before fix.** Establish root cause (Logcat, `chrome://inspect`, console, SQL diagnostics) before patching. Propose a diagnostic build when useful and wait for confirmation.
- **Balance/syntax check after every edit.**
- **Batch big audits** into 8–10-file groups; explicitly note clean files and leave them untouched.
- **File handoff conventions:** deployed files are uploaded per session (private repo; raw GitHub fetches unreliable). Deliverables come back as downloadable files. End long sessions with a handoff doc (changed files, versions, root causes, pending items).

---

## 9. Naming & identifiers (to decide)

- **Working title:** *Grove Keeper* is a placeholder — other directions: *Rootwork*, *Timberline*, *Sapling Siege*, *Grove Guard*, *Last Stand of the Grove*. Check Play Store / trademark availability before committing.
- **To register when you start Phase 0:** GitHub repo name, Supabase project, Android package id (`com.<something>.<game>`), domain, Netlify site.

---

## 10. Open decisions (worth settling before/early in Phase 1)

1. **Single-player only, or multiplayer?** (Co-op / async versus / shared leaderboards only.) Decides whether Realtime is in scope.
2. **Primary mode:** campaign-with-stars, endless score-attack, or both.
3. **Renderer:** Canvas 2D to start (recommended) vs. PixiJS vs. Phaser.
4. **Art direction:** top-down grid (simplest) vs. isometric (prettier, more work); vector vs. sprite art; who/what makes the assets.
5. **Maps:** hand-authored vs. procedural.
6. **Monetization (eventual app):** cosmetics / remove-ads / tree packs — or none.
7. **Offline-first vs. online-required.**
8. **Static content in repo JSON vs. DB tables** (recommend JSON first).
