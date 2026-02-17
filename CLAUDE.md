# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev       # Start dev server with HMR at localhost:3000
npm run build     # TypeScript check + Vite bundle (tsc && vite build)
npm run preview   # Preview production build
```

No test framework is configured yet.

## Architecture

Roguelike auto-battler web game. Players build bases on a hex grid, train units, and survive enemy waves. Built with TypeScript, Pixi.js (rendering), and zzfx (procedural audio).

### Core Systems

- **Type system** (`src/core/types.ts`): Central interface definitions for the entire game — resources, hex coords, buildings, units, equipment, battles, phases, tech, relics
- **Game state** (`src/core/gameState.ts`): Centralized state object with mutation functions (`placeBuilding`, `tickResources`, `setPhase`, `damageBase`). Mutations emit events.
- **Event bus** (`src/core/events.ts`): Typed pub/sub system (`gameEvents.on('phase:changed', ...)`) that decouples state changes from UI updates
- **Seeded RNG** (`src/core/utils.ts`): `createRng(seed)` for reproducible runs; `pick()`, `shuffle()`, `weightedPick()` helpers

### Hex Grid (`src/hex/`)

Flat-top hexagons using **cube coordinates** (q, r, s where q+r+s=0). Coords serialized as `"q,r,s"` string keys for maps. Pixel conversion only happens in the renderer.

### Data Layer (`src/data/`)

All game balance lives in static definition files: buildings, units, equipment, starter kits, tech upgrades, relics, wave generation. New content goes here, not hardcoded elsewhere.

### Battle Simulation (`src/simulation/battle.ts`)

Deterministic turn-based combat with frontline/ranged slots and reinforcement queues. `battleTick()` resolves one round; `runBattle()` simulates to completion.

### Rendering & UI

- **Renderer** (`src/render/renderer.ts`): Pixi.js with layered containers (grid, building, UI), pan/zoom camera
- **HUD** (`src/ui/hud.ts`): HTML overlay synced via event listeners and `update(state)` calls
- **Audio** (`src/audio/sfx.ts`): Procedural sound effects via zzfx

## Conventions

- **Path alias**: `@/` maps to `src/`
- **ID prefixes**: `u_` (units), `b_` (buildings), `e_` (enemies)
- **Type suffixes**: `Type`, `Def`, `State`
- **Data flow**: State mutations → event emissions → UI updates
- **Hex operations**: Always use `coords.ts` utilities; never manually compute hex math
- **Randomization**: Use seeded RNG (`createRng`) for all random operations to maintain reproducibility
