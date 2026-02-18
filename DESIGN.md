# Base Auto Battler - Game Design Document

## Core Concept

A roguelike auto-battler where the player builds a base, gathers resources, trains units, and survives increasingly difficult waves of enemies. Each run is self-contained. The core tension is **resource investment** (base/economy vs. military) balanced against a separate **tech progression** (Battle Points).

**Objective:** Pure survival. Survive as many waves as possible. No wave cap — runs go until the base falls. High score = wave count.

**Aesthetic:** Medieval, top-down 2D, hex grid, Rimworld-style characters.

---

## Gameplay Loop

1. **Build/Prepare Phase** — Player-ended (no timer). Manage base, train units, buy tech, equip gear. Preview upcoming wave in the arena. Press "Ready" when done.
2. **Deploy Phase** — Player interactively places their units on their deployment zone of the hex battle arena before combat begins. Unplaced units go to the reinforcement queue.
3. **Battle Phase** — Auto-battle. Units BFS-pathfind across the hex arena toward enemies, attacking when in range. No player control during combat.
4. **Reward Phase** — Receive BP + pick 1 of 3 cards. Boss/elite waves give enhanced rewards.
5. Repeat with escalating difficulty.

---

## Screen Layout

- **Scrollable/pannable single world view**
- Base hex grid on the left portion; battle arena to the right
- Player can pan between both freely
- During **build phase**: the upcoming wave is visible in the arena as a static hex-grid formation — enemies shown in their deployment zone (rows 0–2), player units auto-arranged in their zone (rows 9–11). Clickable for stat inspection.
- After pressing Ready: camera pans to the arena, the **Deployment UI** opens — player places units on highlighted player-zone hexes before simulation runs
- During **battle phase**: units animate across the hex grid, moving toward enemies and attacking when in range
- Battle speed controls: **1x / 2x / 4x / Skip**
- **Persistent resource bar** showing current resources AND income rate (e.g. "Wood: 45 (+12/phase)")
- Building tooltips show individual output and adjacency bonus breakdown

---

## Economy

### Resources (3 types)

| Resource | Primary Use |
|----------|-------------|
| **Wood** | Buildings, basic unit training |
| **Stone** | Fortifications, advanced buildings |
| **Iron** | Equipment (weapons, armor, shields), elite units |

### Resource Distribution

- **Wood** deposits: most common
- **Stone** deposits: medium frequency
- **Iron** deposits: rare (1 deposit guaranteed in starting area, more found through map expansion)

### Resource Gathering

- **Resource buildings** (lumber mill, quarry, mine) placed on the hex grid
- Buildings must be placed **adjacent to resource deposits** on the map
- Deposits are **semi-randomly placed** each run, creating unique base layouts
- Deposits do **not** deplete — steady income once built
- **Per-phase flat income**: each resource building generates **3 resources per phase** (base rate)
- **Multi-deposit adjacency bonus**: +1 per additional deposit of matching type adjacent to the building (e.g. lumber mill touching 2 wood deposits = 3 + 1 = 4 wood/phase)

### What Resources Pay For

- Unit training (unit-specific resource costs)
- Buildings (resource buildings, military buildings, utility buildings)
- Building upgrades (2x build cost per level)
- Equipment crafting (blacksmith produces weapons/armor/shields from iron)
- Blacksmith tier upgrades (iron + stone, doubling cost per tier)
- Resources are the **base vs. military** trade-off

---

## Battle Points (BP)

BP is a **separate progression currency** for tech and stat upgrades. Not used for units or buildings.

### Earning BP

- **Wave-scaled flat amount**: base BP = wave number (wave 5 = 5 BP, wave 10 = 10 BP)
- **Win doubles it**, loss halves it
- BP is always earned — even losses give some progression
- Simple and predictable; players can plan ahead

### Spending BP — Tech Shop

- **4-slot shop** with random upgrades offered after each battle
- **No reroll** — shop persists between phases. Purchased upgrades are replaced with new random ones.
- **Full shop reset every 5 waves** (aligned with elite waves as milestone moments)
- **Tiered upgrades**: each upgrade can only be bought once per tier. After purchase, an upgraded version may appear later (e.g. "Unit Damage +1" → later "Unit Damage +2" at higher cost). Number of tiers varies by upgrade.
- **Base cost: 5 BP**. Tier multiplier: tier 1 = 5 BP, tier 2 = 10 BP, tier 3 = 20 BP.
- Upgrade categories:

| Category | Examples |
|----------|---------|
| **Combat** | See Combat Tech section |
| **Economy** | See Economy Tech section |
| **Utility** | Battle width +, reinforcement queue +, map expansion, card rarity boost, building upgrade unlock, extra card choice |

### Combat Tech (~10+ upgrades)

Stat upgrades:
- Unit Damage + (3 tiers)
- Unit HP + (3 tiers)
- Attack Speed + (3 tiers)

Per-unit-type buffs:
- Melee Damage + (2 tiers)
- Ranged Damage + (2 tiers)
- Tank HP + (2 tiers)
- Animal Speed + (2 tiers)

Defensive:
- Armor + (3 tiers)
- Shield Block Chance + (2 tiers)

Positional:
- Frontline Fortitude: front-deployed units get +HP (2 tiers)
- Ranged Precision: ranged units get +damage (2 tiers)
- Reinforcement Rally: reinforcements deploy with temporary +attack (1 tier)

### Economy Tech (~8+ upgrades)

- Gather Rate + (3 tiers) — all resource buildings produce more
- Salvage (2 tiers) — gain resources from enemy kills in battle
- Double Harvest (2 tiers) — chance for 2x income per phase
- War Spoils (2 tiers) — bonus resources after battle based on kills
- Prospector (1 tier) — reveal deposit locations in unexpanded map areas
- Recycler (1 tier) — selling equipment refunds some iron
- Efficient Construction (2 tiers) — building costs reduced

### Utility Tech (~8+ upgrades)

- Battle Width + (3 tiers)
- Reinforcement Queue + (3 tiers)
- Map Expansion (soft cap via escalating cost: 5 BP, 10, 20, 40, 80...)
- Card Rarity Boost (2 tiers)
- Extra Card Choice (1 tier) — pick from 4 cards instead of 3
- Building Upgrade Unlock Lv2 (1 tier) — allows upgrading buildings to level 2
- Building Upgrade Unlock Lv3 (1 tier) — allows upgrading buildings to level 3

---

## Post-Battle Rewards

After every battle, the player receives:

1. **BP** (always, scaled as above)
2. **Pick 1 of 3 random cards**

### Card Pool

| Card Type | Examples |
|-----------|---------|
| **Resources** | Bundle of wood/stone/iron |
| **Units** | A specific trained unit, ready to deploy |
| **BP Bonus** | Extra Battle Points |
| **Equipment** | Weapon, armor, or shield (bypass crafting) |
| **Relics** | Persistent passive bonuses for the run |

### Relic Examples

- "Iron Will" — units gain +1 life
- "War Economy" — +15% gather rate
- "Armorer's Blessing" — new units start with basic armor
- "Wide Formation" — +1 battle width
- "Scavenger" — gain small resources after each battle

### Card Rarity

4 tiers, with chances scaling by wave:

| Tier | Color | Availability |
|------|-------|-------------|
| **Common** | White/Grey | Always frequent |
| **Rare** | Blue | Appear from wave 3+ |
| **Epic** | Purple | Appear from wave 7+ |
| **Legendary** | Gold | Appear from wave 12+, very rare |

Higher waves shift the probability curve toward rarer cards.
**Pity system**: consecutive losses increase rare card chance.

### Boss/Elite Wave Rewards

- **Elite waves** (every 5th wave): guaranteed Rare+ card in the selection
- **Boss waves** (every 10th wave): guaranteed Relic card in the selection

---

## Units

### Unit Properties

- **HP** — health points
- **Attack** — damage per hit
- **Cooldown** — seconds between attacks (lower = faster)
- **Move Speed** — hexes per second crossed during battle movement
- **Attack Range** — hex distance at which the unit can strike (melee = 1, ranged = 3, spear = 2)
- **Lives** — per-unit stat; unit is permanently lost only when lives reach 0
- **Equipment slots** (humanoids only): weapon, armor, shield

### Unit Lives

- Lives are a **per-unit stat**, defined individually for each unit type
- Shields can grant +1 life
- When a unit is killed in battle, it loses 1 life and returns at full HP for the next battle (if lives remain)
- At 0 lives, the unit is **permanently gone**

### Base Unit Roster (5 units)

| Unit | Role | HP | ATK | Cooldown | Move | Range | Lives | Equipment | Training |
|------|------|----|-----|----------|------|-------|-------|-----------|----------|
| **Peasant** | Fodder | 6 | 1 | 2.0s | 1.5/s | 1 | 1 | Weapon, Armor, Shield | Camp |
| **Militia** | Melee | 8 | 4 | 1.4s | 2.0/s | 1 | 2 | Weapon, Armor, Shield | Barracks |
| **Archer** | Ranged | 6 | 3 | 1.2s | 2.0/s | 3 | 2 | Weapon, Armor, Shield | Archery Range |
| **Guard** | Tank | 14 | 2 | 2.5s | 1.5/s | 1 | 2 | Weapon, Armor, Shield | Guardhouse |
| **Wolf** | Animal | 8 | 3 | 0.7s | 4.0/s | 1 | 2 | Armor only | Kennel (×2 spawn) |

- **Peasant** is trained at the Camp (the free starter building), always available.
- **Wolf** spawns 2 per Kennel building. Cannot equip weapons or shields.
- Additional unit types unlocked via **military building upgrades** and **card rewards**.

### Unlockable Units

| Unit | Role | HP | ATK | Cooldown | Move | Range | Lives | Unlock |
|------|------|----|-----|----------|------|-------|-------|--------|
| **Swordsman** | Melee | 12 | 5 | 1.2s | 2.5/s | 1 | 2 | Barracks lv2 |
| **Spearman** | Tank | 16 | 3 | 1.8s | 1.5/s | 2 | 2 | Guardhouse lv2 |
| **Berserker** | Glass Cannon | 8 | 8 | 0.6s | 3.0/s | 1 | 1 | Barracks lv3 |
| **Bear** | Animal | 20 | 6 | 1.3s | 2.0/s | 1 | 2 | Kennel lv2 |

### Unit Types / Niches

- **Fodder** — cheap, absorbs hits and buys time (Peasant)
- **Melee fighter** — standard frontline, balanced stats (Militia, Swordsman)
- **Ranged** — high attack range, stays back and fires across the battlefield (Archer)
- **Tank** — high HP, holds ground and creates space (Guard, Spearman)
- **Glass Cannon** — high damage, low survivability (Berserker)
- **Animals** — can't equip weapons, fast movers that can flank (Wolf, Bear)

### Abilities

- **No active abilities** at launch. Units only auto-attack.
- Differentiation comes from stats, equipment, move speed, attack range, and deployment position
- Future consideration: passive/triggered abilities

### Equipment

- Crafted at a **blacksmith** building using iron
- **Flat progression tiers** — each tier is strictly better:

| Tier | Examples |
|------|---------|
| **Crude** | Rock club, hide vest |
| **Bronze** | Bronze sword, bronze plate |
| **Iron** | Iron sword, iron armor |
| **Steel** | Steel blade, steel plate |
| **Mithril** | Mithril edge, mithril mail |

- Blacksmith **upgraded with resources** (iron + stone) to unlock next equipment tier
- **Doubling cost** per tier upgrade: Crude→Bronze: 5I + 3S, Bronze→Iron: 10I + 6S, Iron→Steel: 20I + 12S, Steel→Mithril: 40I + 24S
- Slot types:
  - **Weapons**: increase attack damage
  - **Armor**: increase HP / damage reduction
  - **Shields**: grant +1 life or block chance
- Only **humanoid units** can equip weapons; animals can only wear armor
- **Auto-equip**: new units automatically equip best available gear. Player can manually reassign anytime.

### Unit Management

- **Selling units**: flat resource refund (mercenary units only). Auto-spawned units cannot be sold.
- **Bench size**: base of 2 slots, +2 per military building (barracks, archery range, guardhouse, kennel).
- Units on the bench are not available during battle.
- Units in the **active roster** participate in battles; units in the **reinforcement queue** enter later when their spawn hex is clear.

### Unit Training (Auto-Spawn System)

- Military buildings **automatically spawn** one unit per build phase at no resource cost
- Each building spawns the best unit its level supports
- Higher-level buildings unlock better unit types
- The number of buildings of a type = the number of that unit type spawned per phase

| Building | Lv1 Unit | Lv2 Unit | Lv3 Unit |
|----------|----------|----------|----------|
| Camp | Peasant | — | — |
| Barracks | Militia | Swordsman | Berserker |
| Archery Range | Archer | — | — |
| Guardhouse | Guard | Spearman | — |
| Kennel | Wolf ×2 | Bear | — |

---

## Battle Mechanics

### The Hex Battle Arena

The battle takes place on a flat-top hex grid:

- **Dimensions**: `arenaWidth` columns × 12 rows
  - `arenaWidth = 4 + battleWidthBonus` (scales with tech upgrades)
  - Rows 0–11, where row 0 is the enemy side and row 11 is the player side
- **Deployment zones**:
  - Enemy: rows 0–2 (auto-placed, centered within 4 columns)
  - Player: rows 9–11 (interactive placement during the Deploy Phase)
- **Coordinate system**: flat-top cube coordinates (q = column, r = row)

### Deploy Phase

Before each battle starts (after pressing Ready):

1. Camera pans to the arena
2. A **side panel** lists all units available to place
3. Player clicks a unit → selects it; clicks a highlighted player-zone hex → places it there
4. Placed units can be clicked again on the hex to un-place them
5. **Auto-Deploy** button fills all remaining unplaced units automatically (tanks front, ranged back)
6. **Start Battle** confirms the placement and runs the simulation
7. Units not placed on the grid enter the **reinforcement queue** and spawn later at the player-side center hex

### Movement

- Each unit has a **move speed** (hexes per second) and a **move timer** that accumulates each tick
- When `moveTimer >= 1 / moveSpeed`, the unit attempts to move
- Target: the nearest enemy by hex distance
- Pathfinding: **BFS** toward the target, avoiding occupied hexes
- Units **skip movement** if any enemy is already within their attack range

### Attacking

- Each unit has a **cooldown** timer; when it reaches the unit's cooldown value, the unit attacks
- The unit attacks the **closest enemy within its attack range**
- Attack range is measured in hex steps:
  - Melee units (range 1): must be adjacent
  - Spearmen (range 2): can reach one hex further
  - Ranged units (range 3): fire across a significant portion of the arena
- Attack type (melee lunge animation vs. projectile) is determined by range

### Reinforcements

- Units not placed during deployment enter the reinforcement queue
- Each tick, if the **spawn hex** (center of the player's rear row) is unoccupied, the next unit in queue enters the battlefield there
- Enemy reinforcements spawn at the center of the enemy's front row (row 0)

### Battle Width & Flanking

- A wider arena (more columns via `battleWidthBonus`) gives the player extra columns that enemies do not use
- Enemies deploy centered within their fixed 4-column width
- Player units placed in the outer columns can **flank** — approaching enemies from the side while front-deployed tanks engage head-on
- This creates genuine positional depth: formation design, chokepoints, protected ranged units

### Battle Flow

- Battles are simulated **instantly** (deterministic tick engine, 500-tick cap = 50 simulated seconds), then **played back** at chosen speed
- No player control during playback — strategy is locked in at the deployment step
- Player can watch at 1x / 2x / 4x speed or skip to the result
- Battles fought to the death — one side always wins
- Buildings are **never damaged** by battles

### Wave Preview (Build Phase)

- During the build phase, the upcoming wave is displayed on the hex arena
- Enemies shown in their deployment zone (rows 0–2), player units auto-arranged in their zone (rows 9–11)
- Clickable for detailed stat tooltips
- Refreshes live as the player trains units or purchases tech

---

## Waves & Difficulty

### Wave Structure

- **Infinite waves** — no cap, difficulty scales forever
- **Every 5th wave**: Elite wave (tougher enemies, guaranteed Rare+ card reward, tech shop resets)
- **Every 10th wave**: Boss wave (boss enemy with entourage, guaranteed Relic reward, instant kill if boss survives)

### Wave Design

- **Themed templates** — each wave has a composition theme
- Exact enemy count **scales with wave number** within the theme
- Templates are grouped by era/tier:

### Enemy Roster by Era

**Early Era (Waves 1–9)**

| Enemy | Role | HP | ATK | Move | Range | Description |
|-------|------|----|-----|------|-------|-------------|
| Bandit | Melee | 10 | 3 | 2.5/s | 1 | Standard melee fighter. |
| Wild Wolf | Animal | 8 | 4 | 4.0/s | 1 | Fast, rushes toward frontline. |
| Goblin | Fodder | 12 | 4 | 2.5/s | 1 | Weak but numerous. |
| Bandit Archer | Ranged | 6 | 4 | 2.0/s | 3 | Hangs back and fires. |

**Mid Era (Waves 10–19)**

| Enemy | Role | HP | ATK | Move | Range | Description |
|-------|------|----|-----|------|-------|-------------|
| Orc Warrior | Melee | 35 | 9 | 2.0/s | 1 | Tough melee fighter. |
| Skeleton | Melee | 15 | 5 | 2.0/s | 1 | Numerous and fragile. |
| Dark Archer | Ranged | 12 | 8 | 2.0/s | 3 | High-damage ranged. Priority target. |
| Troll | Tank | 60 | 6 | 1.5/s | 1 | Massive HP. Slow but absorbs punishment. |

**Late Era (Waves 20–29)**

| Enemy | Role | HP | ATK | Move | Range | Description |
|-------|------|----|-----|------|-------|-------------|
| Dark Knight | Tank | 60 | 10 | 2.0/s | 1 | Heavily armored melee. |
| Demon Imp | Glass Cannon | 15 | 12 | 3.5/s | 1 | Fast, weak, overwhelming in swarms. |
| Warlock | Ranged | 20 | 14 | 2.0/s | 3 | Powerful long-range attacker. |
| Siege Golem | Tank | 100 | 8 | 1.5/s | 1 | Nearly unkillable without focused DPS. |

**Endless Era (Waves 30+)**

- **All previous enemies** with scaling stats based on wave number
- **Random wave modifiers** applied for variety:

| Modifier | Effect |
|----------|--------|
| Enraged | +30% attack damage |
| Armored | +30% HP |
| Swarming | +50% enemy count, −30% individual stats |
| Hastened | +30% speed |
| Resilient | +1 life to all enemies |

- Waves 30+ pick randomly from all era templates with scaled stats and 1–2 random modifiers

### Bosses

| Boss | HP | ATK | Cooldown | Lives | Description |
|------|----|-----|----------|-------|-------------|
| Goblin King | 80 | 12 | 1.5s | 2 | Wave 10. Leads a goblin horde. |
| Orc Warlord | 120 | 18 | 1.5s | 3 | Wave 20. Leads orc warriors. |
| Troll Chieftain | 160 | 22 | 2.0s | 3 | Wave 30. Slow, nearly unstoppable. |

Boss survives = **instant game over** regardless of base HP.

---

## Base

### Base Health

- The base has a **fixed 100 HP** pool
- Losing a battle: **5 damage per surviving enemy**
- **Boss survives = instant game over**
- Base reaches 0 HP = run over

### Buildings

| Building | Function | Cost |
|----------|----------|------|
| Camp | Spawns Peasants; starter building | Free (starter kit) |
| Lumber Mill | Gathers wood (near wood deposits) | 4W 3S |
| Quarry | Gathers stone (near stone deposits) | 3W 4S |
| Iron Mine | Gathers iron (near iron deposits) | 4W 4S |
| Barracks | Spawns militia-class units, +bench slots | 6W 4S |
| Archery Range | Spawns archers, +bench slots | 5W 4I |
| Guardhouse | Spawns tank-class units, +bench slots | 3W 8S |
| Blacksmith | Crafts equipment (own tier upgrade system) | 5S 5I |
| Kennel | Spawns animal units (×2 per building), +bench slots | 6W |

- Buildings are **never destroyed** during battles

### Building Upgrades

- **Gated by tech**: must purchase "Building Upgrade Unlock Lv2" (BP) before upgrading any building to lv2, and "Building Upgrade Unlock Lv3" for lv3
- Once unlocked, individual buildings are upgraded by **spending resources**: **2x build cost per level** (lv2 = 2x, lv3 = 4x original cost)
- **3 levels** per building (base, lv2, lv3)

| Building Type | Lv2 Benefit | Lv3 Benefit |
|--------------|-------------|-------------|
| Resource buildings | Higher output | Further output bonus |
| Military buildings | Spawn better unit type + bench slots | Spawn elite unit type + bench slots |
| Blacksmith | (Uses own tier system: Crude→Bronze→Iron→Steel→Mithril) | — |

---

## Map / Grid

- **Hex grid**, no terrain effects (flat tiles with cosmetic variety)
- **Starting size: 4-hex radius** (~61 tiles)
- **Expanding map** via tech (Utility category, escalating BP cost: 5, 10, 20, 40, 80...)
- Each expansion adds **+1 hex ring**
- **Soft cap**: escalating costs make 4–5 expansions realistic (final radius ~8–9)
- New deposits revealed as the map expands
- Resource deposit distribution: **wood most common, stone medium, iron rare**
- 1 iron deposit guaranteed in starting area
- Semi-random generation per run:
  - Resource deposit placement and clustering
  - Cosmetic tile variety
- 6 directions of adjacency; buildings snap to hex tiles

---

## Build Phase UX

- **Click-to-select, click-to-place**: select a building from the build bar, then click a hex tile to place it
- Unit management: click units in the roster panel to assign to active roster / reinforcement queue / bench
- **Onboarding checklist**: dismissable panel shown every run with checklist items (Place building, Gather resources, Train unit, Equip unit, Start battle). Checks off as player completes each action.

---

## Starting a Run

- Player picks **1 of 4 starter kits**
- Each kit includes: 1 unit + 1 basic building + small resource bundle
- Examples:
  - "Militia Kit" — Militia + Barracks + resources
  - "Frontier Kit" — Archer + Archery Range + resources
  - "Beastmaster Kit" — Wolf + Kennel + resources
  - "Defender Kit" — Guard + Guardhouse + resources

---

## Anti-Death-Spiral Mechanisms

- **BP always earned** even on loss (halved, but never zero)
- **Pity scaling** on card rarity — consecutive losses increase rare card chance
- **Reinforcement queue** — undeployed units still enter the battlefield mid-fight
- **Peasants always available** — Camp spawns them each phase as a free fallback
- **Auto-Deploy** — players who skip the deployment UI still get a reasonable default layout
- Runs are meant to end — but players should feel they have comeback tools

---

## Run End & Scoring

### End Screen

- **Stats summary**: wave reached, units trained, enemies killed, buildings built, relics collected
- **Score**: wave count is the primary and only score
- **Meta unlocks**: show any new unlocks earned during this run
- **Legacy points earned**: display breakdown (waves + boss bonuses)

### Scoring

- **Wave count only** — simple, clear single metric
- Stats shown for flavor but do not affect ranking

---

## Meta Progression (Between Runs)

### Legacy Points

- Earned per run: **1 point per wave survived + 5 bonus per boss killed**
- Spent in the **Unlock Shop** between runs

### Unlock Shop

- **Categorized tabs**: Kits, Relics, Units, Buildings
- **Tiered progression** within each category: unlock tier 1 items to reveal tier 2, etc.
- Unlock types:
  - **Starter Kits** — new starting options
  - **Relics** — added to the card pool for future runs
  - **Unit Types** — new units available via building upgrades in future runs
  - **Building Types** — new buildings available in future runs
- **No permanent stat boosts** — each run stands on its own

### Saving

- **Auto-save each build phase** — game saves at the start of each build phase
- Can resume a run later
- One active save slot
- Meta progression (legacy points, unlocks) saved separately

---

## Tech Stack

- Web app (TypeScript, Pixi.js v8, Vite)
- Procedural sounds via zzfx, procedural VFX via Pixi graphics
- Flat-top hex grid for both the base map and the battle arena
- Battle arena: `BATTLE_HEX_SIZE = 28`, `ARENA_DEPTH = 12` rows
- HMR for fast dev iteration

---

## Open Questions (Balancing / Future)

- Exact enemy stat scaling formula per wave in endless era
- Wave modifier probability and stacking rules for waves 30+
- Equipment stat bonuses per tier (exact numbers)
- Boss entourage compositions
- Whether flanking/positional bonuses (e.g. attack bonus for hitting from the side) should be added
- Passive/triggered unit abilities as a future feature
- Sound/VFX direction details
- Mobile layout refinements (deployment UI on small screens)
