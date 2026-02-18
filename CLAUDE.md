# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev       # Vite dev server at localhost:3000 (auto-opens browser)
npm run build     # tsc && vite build (type-check then bundle)
npm run preview   # Preview production build
```

No test framework is configured. Vite base path is `/BaseAutoBattlerGame/` (GitHub Pages).

## Architecture

Roguelike auto-battler web game built with TypeScript, Pixi.js v8, and zzfx. Players pick a starter kit, build a base on a hex grid, train units, craft equipment, research tech, and survive escalating enemy waves with card-selection rewards between rounds.

### File Structure

```
src/
├── main.ts                  # Entry point: starter selection, game loop, event wiring
├── core/
│   ├── types.ts             # All interfaces and type definitions
│   ├── gameState.ts         # Centralized state + all mutation functions (~1000 lines)
│   ├── events.ts            # Typed EventBus, singleton gameEvents
│   └── utils.ts             # uid(), clamp(), seeded RNG (mulberry32), pick/shuffle/weightedPick
├── data/
│   ├── buildings.ts         # BUILDING_DEFS (8 types: lumber_mill, quarry, iron_mine, barracks, archery_range, blacksmith, kennel, guardhouse)
│   ├── units.ts             # UNIT_DEFS (5 base), UNLOCKABLE_UNIT_DEFS (4 card rewards), ENEMY_DEFS (16 enemies + 3 bosses)
│   ├── equipment.ts         # EQUIPMENT_DEFS (17 items: weapons, armor, shields across 5 tiers)
│   ├── tech.ts              # TECH_UPGRADES (11 upgrades: combat/economy/utility)
│   ├── relics.ts            # RELICS (5 passive bonuses)
│   ├── waves.ts             # generateWave(), calculateBP() — era-based scaling, elite/boss waves
│   └── starters.ts          # STARTER_KITS (4 kits: militia, frontier, beastmaster, defender)
├── hex/
│   ├── coords.ts            # Cube coordinate math, hex↔pixel conversion
│   └── grid.ts              # Procedural grid generation, deposit cluster placement
├── simulation/
│   ├── battle.ts            # Deterministic tick-based combat engine
│   └── battleLog.ts         # BattleLog recording, ArenaSnapshot, BattleEvent types
├── render/
│   ├── renderer.ts          # GameRenderer: Pixi.js hex grid, pan/zoom camera
│   ├── arena.ts             # ArenaRenderer: battle/preview unit display with animations
│   └── battlePlayback.ts    # BattlePlayback: replays BattleLog at 1x/2x/4x or skip
├── ui/
│   ├── hud.ts               # HUD: all HTML overlay panels (roster, tech shop, cards, tooltips, debug)
│   └── battleControls.ts    # BattleControls: playback speed buttons + tick counter
├── audio/
│   └── sfx.ts               # Procedural SFX via zzfx (10 sounds)
└── types/
    └── zzfx.d.ts            # Type declaration for zzfx module
```

### Core Systems

- **Types** (`src/core/types.ts`): Single source of truth for all interfaces — `GameState`, `Unit`, `Building`, `BattleState`, `WaveDef`, `TechUpgrade`, `Card`, `Relic`, resources, hex coords, equipment
- **Game state** (`src/core/gameState.ts`): All state mutations live here. Key functions: `createGameState`, `placeBuilding`, `trainUnit`, `prepareBattle`, `finalizeBattle`, `advanceToBuild`, `purchaseTech`, `selectCard`, `craftEquipment`, `equipItem`. Mutations emit events via `gameEvents`.
- **Event bus** (`src/core/events.ts`): Typed pub/sub (`gameEvents.on('phase:changed', ...)`). Events: `phase:changed`, `resources:changed`, `building:placed`, `unit:trained`, `battle:tick`, `battle:started`, `battle:ended`, `roster:changed`, `tech:purchased`, `card:selected`, `relic:gained`, `base:damaged`, `game:over`, etc.
- **Seeded RNG** (`src/core/utils.ts`): `createRng(seed)` using mulberry32. Used for grid generation. Card/tech generation currently uses `Math.random()`.

### Game Flow

1. **Starter selection** → `createGameState(seed, starterKit)`
2. **Build phase**: Place buildings, train units, manage roster, craft equipment, buy tech
3. **Battle**: `prepareBattle()` → instant sim via `recordBattle()` → `BattlePlayback` animates the log
4. **Battle results modal** → **Card selection modal** (pick 1 of 3 rewards)
5. **`advanceToBuild()`** → back to step 2 with next wave

### Hex Grid (`src/hex/`)

Flat-top hexagons using **cube coordinates** (q, r, s where q+r+s=0). Keys serialized as `"q,r,s"` strings. Pixel conversion via `hexToPixel`/`pixelToHex` in coords.ts. Grid generated procedurally with deposit clusters (wood/stone/iron) placed away from center.

### Battle Simulation (`src/simulation/battle.ts`)

Tick-based deterministic combat (`TICK_DELTA = 0.1s`). Units have cooldown timers; when ready they attack. Layout: frontline slots (melee) + ranged row behind. Reinforcement queue fills empty frontline slots. When frontline is wiped, ranged units get exposed (move to frontline). 500-tick timeout = enemy wins.

Key functions: `createBattleState()`, `battleTick()` (one tick), `runBattle()` (to completion). `recordBattle()` captures a `BattleLog` with per-tick events for playback.

### Rendering

- **GameRenderer** (`src/render/renderer.ts`): Pixi.js v8 with layered containers. `HEX_SIZE=32`. Pan via pointer drag, zoom via scroll/pinch (0.3–3x). Building placement mode with validation highlights. Smooth camera transitions (`panToArena()`/`panToBase()`).
- **ArenaRenderer** (`src/render/arena.ts`): Manages unit sprites in battle arena. Three modes: `preview` (enemies only), `preview_full` (both sides + targeting arrows), `battle` (animated). Attack animations (melee lunge, ranged projectile), death particles, reinforcement slides, damage numbers.
- **BattlePlayback** (`src/render/battlePlayback.ts`): Replays `BattleLog` tick-by-tick. Speeds: 1x/2x/4x/skip. Inter-tick delay = `400ms / speed`. SFX disabled above 2x.

### UI (`src/ui/hud.ts`)

Pure HTML/CSS overlay — no framework. `main.ts` calls `hud.update(state)` from the Pixi ticker each frame. Manages: resource bar, build bar, roster panel (active/reinforcements/bench), unit detail with equipment slots, tech shop modal, card selection modal, battle results modal, hover tooltips, selection panel, blacksmith crafting, debug panel. Mobile responsive (768px/480px breakpoints, touch detection, safe-area insets).

### Entry Point (`src/main.ts`)

Orchestrates everything: starter selection → state creation → renderer/HUD init → event wiring → game loop. The Pixi ticker runs `updateHighlights`, `updateHoverTooltip`, `updateSelectionPanel`, `hud.update` each frame. Ready button triggers the full battle→results→cards→advance async flow. Exposes `window.__gameState` and `window.__renderer` for dev console.

## Key Game Mechanics

- **Resources**: wood, stone, iron. Buildings produce per build phase via `tickResources()`.
- **Production rate**: `floor((baseRate + extraAdjacentDeposits) × level × gatherRateMultiplier)`
- **First resource building free**: First lumber_mill, quarry, and iron_mine placed are free.
- **Building upgrade cost**: `baseCost × 2^(level-1) × buildingCostMultiplier`
- **Battle width**: Player gets `4 + battleWidthBonus` frontline slots; enemies get fixed 4 (`enemyBattleWidth`).
- **Lives system**: Units have multiple lives. HP→0 decrements lives, HP resets. Lives→0 = permanent death. Dead units' equipment returns to inventory.
- **Bench capacity**: `2 + 2 × militaryBuildingCount`
- **Tech costs**: `baseCost × 2^currentTier` (doubles each tier)
- **Blacksmith upgrade**: `5×iron × 2^tierIdx` + `3×stone × 2^tierIdx`
- **Card rarity**: Wave-scaled weights. Rare unlocks wave 3, epic wave 7, legendary wave 12. Loss streak and tech boost rarity.
- **Wave scaling**: Early (≤9), Mid (≤19), Late (≤29), Endgame (30+). Elite every 5th non-boss wave. Bosses at 10/20/30, cycling 40+. Modifiers at 30+.
- **BP earned**: Win = `wave × 2`, Loss = `max(1, floor(wave / 2))`
- **Unit sell refund**: 50% resource cost × (lives / maxLives) ratio

## Conventions

- **Path alias**: `@/` → `src/`
- **ID generation**: `uid(prefix)` → e.g. `uid('u')` for units, `uid('b')` for buildings, `uid('e')` for enemies, `uid('card')` for cards
- **Type suffixes**: `Type` (string union), `Def` (static data), `State` (runtime)
- **Data flow**: State mutation in `gameState.ts` → `gameEvents.emit()` → listeners react. HUD updated via ticker, not subscriptions.
- **Hex operations**: Always use `coords.ts` utilities; never manually compute hex math
- **Dynamic stat access**: `(unit.stats as unknown as Record<string, number>)[statName]` — required for strict TypeScript
- **All game balance**: Lives in `src/data/` files. New content goes there, not hardcoded elsewhere.
- **HTML/CSS**: All UI markup in `index.html`, styles inline. HUD manipulates DOM directly.
