# Implementation Plan — Resource & Economy Rework

Reference: [resource-rework.md](./resource-rework.md)

## Dependency Map

```
Refined Resource Types ──────────────────────┐
  (ore, planks, cut stone, iron bars)        │
  │                                          │
  ├── Processing Buildings ──────────────────┤
  │     (smelter, sawmill)                   │
  │     │                                    │
  │     └── Update All Costs ────────────────┤
  │           (buildings, equipment, upgrades)│
  │                                          │
Grid Rework ─────────────────────────────────┤
  (terrain functional, deposits unbuildable, │
   claimed tiles, tile purchase)             │
  │                                          │
  └── Starting Area Generation ──────────────┤
        (radius 1 claimed, wood guarantee,   │
         mountains, radius-5 map)            │
                                             │
Free Units from Buildings ───────────────────┤
  (remove training cost, 1/wave production,  │
   building level → unit tier, switch unit)  │
                                             │
         ┌───────────────────────────────────┘
         │ (all above are foundation)
         ▼
Tech Tree ──────────────────────────────┐
  (replace shop with fixed tree,        │
   BP income 3/1, resource + tactical   │
   branches)                            │
  │                                     │
  ├── Deployment Slot System ───────────┤
  │     (base 4, +1 escalating)         │
  │                                     │
  ├── Reinforcement Limit ──────────────┤
  │     (base 1, +1 escalating)         │
  │                                     │
  └── Building Upgrade Gating ──────────┤
        (Masonry, Adv/Master Constr.)   │
                                        │
Unit Upgrade System ────────────────────┤
  (thematic abilities per unit type,    │
   3 tiers, resource-costed,            │
   building level gated)                │
  │                                     │
  └── Battle Sim Changes ──────────────┤
        (taunt, cleave, pack hunting,   │
         zone of control, etc.)         │
                                        │
Card Rework ────────────────────────────┘
  (raw vs refined by rarity,
   relic effect updates)
```

---

## Phase 1: Grid & Resource Foundation

The foundation everything else builds on. Nothing works without this.

### 1a. Refined Resource Types

**Files:** `src/core/types.ts`, `src/core/gameState.ts`

- Add raw/refined resource types to the type system:
  - Raw: `logs`, `raw_stone`, `ore` (produced by resource buildings)
  - Refined: `planks`, `cut_stone`, `iron_bars` (produced by processing)
- Decide on type representation: extend `Resources` to include all 6, or separate `RawResources` / `RefinedResources`
- Update `GameState.resources` to track all resource types
- Update `tickResources()` to produce raw resources from buildings
- Update HUD resource bar to display new resource types

### 1b. Grid Rework

**Files:** `src/hex/grid.ts`, `src/hex/coords.ts`, `src/core/types.ts`, `src/core/gameState.ts`

- **Terrain becomes functional:**
  - `HexTile.terrain` now affects buildability
  - Grass: any building. Forest: wood buildings only. Rock: stone buildings only. Mountain: unbuildable.
  - Update `placeBuilding()` to check terrain restrictions
- **Deposits become unbuildable:**
  - `placeBuilding()` rejects tiles with deposits
  - Resource buildings must be placed **adjacent** to deposits (already works this way)
- **Claimed tile system:**
  - Add `claimed: boolean` to `HexTile` (or a `Set<string>` of claimed hex keys on GameState)
  - `placeBuilding()` rejects unclaimed tiles
  - Only center tiles (radius 1) claimed at start

### 1c. Grid Generation

**Files:** `src/hex/grid.ts`

- Generate full map at **radius 5** (91 tiles) instead of radius 3
- Claim only **radius 1** (7 tiles) at start
- **Mountain tiles:** 8-12 scattered across map, never in radius 1
- **Wood deposit guarantee:** Always 1 wood deposit within radius 1-2
- **Iron deposits far:** Place iron clusters at radius 3-5 (requires expansion)
- **Terrain distribution:** More grass near center, more forest/rock/mountain toward edges

### 1d. Tile Purchase

**Files:** `src/core/gameState.ts`, `src/render/renderer.ts`

- New function `claimTile(state, coord)`:
  - Must be adjacent to an already-claimed tile
  - Cost: 2 wood (rings 2-3), 3 wood (rings 4-5)
  - No per-wave limit — buy as many as affordable
- Renderer updates:
  - Unclaimed tiles: visible but greyed/dimmed
  - Claimed tiles: full color
  - Purchasable tiles (adjacent to claimed): highlighted on hover
  - Mountain tiles: distinct visual (unbuildable)
  - Terrain type visually distinct (forest, rock, grass)

### Phase 1 Exit Criteria

- Player starts with 7 claimed tiles on a radius-5 map
- Terrain restrictions enforced. Mountains block. Deposits block.
- Player can purchase tiles with wood, expanding toward deposits
- Resource buildings produce raw resources (logs, raw stone, ore)
- HUD shows all resource types
- Game is playable with old systems still in place for tech/units/cards

---

## Phase 2: Production Rework

How resources are processed and units are produced.

### 2a. Processing Buildings

**Files:** `src/data/buildings.ts`, `src/core/gameState.ts`, `src/core/types.ts`

- **Smelter** — new building type:
  - Cost: stone + wood to build
  - Each wave: consumes ore + wood fuel → produces iron bars
  - Base throughput: 3 ore + 1 wood → 2 iron bars
  - Adjacency bonus: +1 iron bar output when next to iron mine
  - Upgradable (lv1/2/3 with increasing throughput, see design doc)
  - Placed on grass tiles (no terrain restriction beyond standard)
- **Sawmill** — new building type:
  - Cost: wood + stone to build
  - Each wave: converts logs → planks
  - Optional building — wood works raw for basic use
  - Placed on grass or forest tiles
- Update `tickResources()`:
  - Resource buildings produce raw resources
  - Processing buildings consume raw + produce refined
  - Smelter consumes wood fuel from stockpile
  - Processing happens after raw production

### 2b. Quarry Upgrade → Cut Stone

**Files:** `src/core/gameState.ts`, `src/data/buildings.ts`

- Quarry level 2+ produces cut stone instead of (or in addition to) raw stone
- Quarry level 3 produces dressed stone
- Gated by tech (Masonry, Advanced Construction) — implemented in Phase 3
- For now, just wire the production logic; gate it behind building level

### 2c. Free Units from Buildings

**Files:** `src/core/gameState.ts`, `src/data/buildings.ts`, `src/data/units.ts`

- Remove `trainingCost` from unit definitions (or ignore it)
- Remove `trainUnit()` function / repurpose it
- Add `produceUnits(state)` — called on `advanceToBuild()`:
  - Each military building produces 1 unit per wave
  - Building level determines available unit tier (lv1 → base, lv2 → tier 2, lv3 → tier 3)
  - Auto-selects highest available tier on upgrade
  - Player can switch which unit type a building produces
- Add `Building.producingUnit: string` (unit def ID) to Building type
- Add to roster/bench automatically
- Update HUD: show building production info, allow switching unit type

### 2d. Update All Costs

**Files:** `src/data/buildings.ts`, `src/data/equipment.ts`

- Building costs now use appropriate resource types (raw vs refined)
- Equipment crafting costs use iron bars (not raw ore)
- Building upgrade costs use refined resources for higher tiers

### Phase 2 Exit Criteria

- Smelter and sawmill buildable and functioning
- Processing chain works: mine → ore → smelter → iron bars (consuming wood)
- Military buildings produce 1 free unit per wave
- Player can switch which unit a building produces
- All costs updated to use raw/refined appropriately
- Game is fully playable with new economy (old tech shop still in place as temporary)

---

## Phase 3: Tech Tree & Army Limits

Replaces the random tech shop. Gates progression.

### 3a. Tech Tree Data Structure

**Files:** `src/data/tech.ts`, `src/core/types.ts`

- Replace `TechUpgrade[]` with a tree structure:
  ```
  TechNode {
    id, name, description, branch, bpCost,
    prereqs: string[],  // node IDs that must be purchased first
    effect: TechEffect,
  }
  ```
- Define all nodes from design doc:
  - Wood branch: Sawmill Blueprint, Lumber Economy, Master Carpentry
  - Stone branch: Masonry, Advanced Construction, Master Construction
  - Iron branch: Metallurgy, Efficient Smelting, Advanced Forging, Master Forging
  - Tactical: Deployment +1 (×4), Reinforcement +1 (×3), Extended Deployment
  - Utility: Fortune's Favor, Extra Scout
- Remove `techShop` from GameState
- Add `techTree: Map<string, boolean>` (purchased or not) to GameState

### 3b. BP Income Change

**Files:** `src/data/waves.ts`, `src/core/gameState.ts`

- `calculateBP()`: flat 3 per win, 1 per loss
- Boss kill bonus: +5 BP (waves 10, 20, 30, and every 10th after)
- Update `finalizeBattle()` to use new formula

### 3c. Deployment Slot System

**Files:** `src/core/types.ts`, `src/core/gameState.ts`, `src/simulation/battle.ts`

- Add `deploymentSlots: number` to GameState (base: 4)
- `createHexBattleState()`: only place first N units from deployment, rest → reinforcement queue
- Deployment +1 tech nodes increment `deploymentSlots`
- Update deployment UI to show slot limit

### 3d. Reinforcement Limit

**Files:** `src/core/types.ts`, `src/core/gameState.ts`

- Change `reinforcementQueueSize` default to 1
- Reinforcement +1 tech nodes increment it
- Excess units beyond deploy + reinforce slots go to bench (can't fight)

### 3e. Tech Tree UI

**Files:** `src/ui/hud.ts`, `index.html`

- Replace tech shop modal with tech tree view
- Show all nodes, branches, prereqs
- Purchased nodes highlighted, available nodes clickable, locked nodes dimmed
- Show BP cost and current BP balance
- Branch labels: Wood, Stone, Iron, Tactical, Utility

### 3f. Building Upgrade Gating

**Files:** `src/core/gameState.ts`

- `upgradeBuilding()` checks tech prereqs:
  - Level 2 requires Advanced Construction (stone branch)
  - Level 3 requires Master Construction (stone branch)
- Quarry level 2 requires Masonry tech
- Smelter requires Metallurgy tech to build
- Sawmill requires Sawmill Blueprint tech to build

### Phase 3 Exit Criteria

- Fixed tech tree replaces random shop
- BP income is flat 3/1 with boss bonuses
- Deployment limited to 4 (+1 per tech) slots
- Reinforcements limited to 1 (+1 per tech)
- Building upgrades gated by stone branch tech
- Processing buildings gated by their respective tech nodes
- Tech tree UI functional and readable

---

## Phase 4: Unit Upgrades

The deep combat system. Each upgrade is an isolated battle mechanic — implement incrementally.

### 4a. Unit Upgrade System

**Files:** `src/data/unitUpgrades.ts` (new), `src/core/types.ts`, `src/core/gameState.ts`

- New data file for unit upgrade definitions:
  ```
  UnitUpgradeDef {
    id, unitDefId, tier, name, description,
    cost: Partial<Resources>,
    requiredBuildingLevel: number,
    effect: UnitUpgradeEffect,
  }
  ```
- Add `purchasedUnitUpgrades: Set<string>` to GameState
- `purchaseUnitUpgrade(state, upgradeId)`: check building level, resource cost, apply
- Retroactive: applies to all existing + future units of that type

### 4b. Battle Sim — Simple Upgrades First

**Files:** `src/simulation/battle.ts`

Implement in order of complexity (simplest first):

1. **Stat modifiers** — Quickdraw (-cooldown), Thick Hide (+HP), Brace (+HP when stationary)
2. **Adjacency buffs** — Shield Wall, Pack Hunting, Phalanx, Rallying Cry, Alpha Wolf
3. **Conditional damage** — Brace for Charge (bonus vs movers), Executioner (bonus vs low HP)
4. **DoT** — Fire Arrows (damage over time)
5. **Stacking buffs** — Bloodlust (+attack per kill)
6. **Targeting changes** — Taunt (enemies prioritize guard)
7. **AoE** — Cleave (adjacent damage), Volley (area attack)
8. **Movement changes** — Frenzy (speed boost), Hamstring (slow), Trample (push through)
9. **Complex mechanics** — Fortress (immovable + damage reduction), Hold the Line (zone of control), Undying Rage (death prevention), Roar (aura debuff)

### 4c. Unit Upgrade UI

**Files:** `src/ui/hud.ts`, `index.html`

- Unit detail panel shows available upgrades per unit type
- Show tier, cost, requirements, effect description
- Purchase button (greyed if can't afford or building level too low)
- Visual indicator on units that have upgrades active

### Phase 4 Exit Criteria

- All 27 unit upgrades defined in data
- Purchase system works with resource costs and building level gates
- Battle sim handles all upgrade effects
- UI shows upgrade options per unit type
- Upgrades meaningfully change battle positioning and tactics

---

## Phase 5: Card, Relic & Balance Polish

Ongoing alongside Phase 4.

### 5a. Card Reward Rework

**Files:** `src/core/gameState.ts`

- Resource cards: common/rare grant raw, epic/legendary grant refined
- Unit cards: rarity matches unit tier (common = peasant/wolf, legendary = berserker/bear)
- Equipment cards: unchanged (tier gating already handles rarity)
- BP cards: unchanged
- Consider new card type: processing boost ("smelter runs double this round")

### 5b. Relic Effect Update

**Files:** `src/data/relics.ts`, `src/core/gameState.ts`

- Update relic effects to fit new systems:
  - Processing bonuses (smelter efficiency, sawmill output)
  - Deployment bonuses (+1 deployment slot as relic)
  - Unit upgrade discounts
  - Tile claim cost reduction
  - Refined resource grants per wave

### 5c. Equipment Cost Update

**Files:** `src/data/equipment.ts`

- Crude tier: raw resources
- Bronze tier: mix of raw + refined
- Iron/steel tier: refined resources (iron bars, cut stone)
- Mithril tier: high-tier refined resources

### 5d. Balance Pass

- Playtest resource production rates vs costs
- BP income feel over 30 waves
- Deployment slots base 4 — right starting feel?
- 1 unit/building/wave — appropriate growth rate?
- Processing throughput vs demand
- Tile claim cost vs expansion pace
- Tech tree node costs vs BP availability
- Unit upgrade costs vs resource availability
- Wave difficulty curve alignment with new progression

---

## Implementation Order Summary

| Phase | Scope | Depends On | Estimated Scale |
|-------|-------|-----------|----------------|
| **1a** | Resource types | — | Small (types + state) |
| **1b** | Grid rework (terrain, deposits, claimed) | — | Medium (grid + building logic) |
| **1c** | Grid generation (radius 5, mountains) | 1b | Medium (generation algorithm) |
| **1d** | Tile purchase + renderer | 1b, 1c | Medium (new mechanic + rendering) |
| **2a** | Processing buildings (smelter, sawmill) | 1a | Medium (new buildings + tick logic) |
| **2b** | Quarry upgrade → cut stone | 1a, 2a | Small |
| **2c** | Free units from buildings | — | Medium (remove training, add production) |
| **2d** | Update all costs | 1a, 2a | Small (data file changes) |
| **3a** | Tech tree data | — | Medium (new data structure) |
| **3b** | BP income change | — | Small |
| **3c** | Deployment slot system | 3a | Small-Medium |
| **3d** | Reinforcement limit | 3a | Small |
| **3e** | Tech tree UI | 3a | Large (new UI panel) |
| **3f** | Building upgrade gating | 3a | Small |
| **4a** | Unit upgrade system | 3f | Medium (new system) |
| **4b** | Battle sim changes | 4a | Large (27 abilities, incremental) |
| **4c** | Unit upgrade UI | 4a | Medium |
| **5a-d** | Cards, relics, equipment, balance | All above | Ongoing |

**Recommended start: Phase 1a + 1b + 1c in parallel**, then 1d for rendering, then Phase 2.
