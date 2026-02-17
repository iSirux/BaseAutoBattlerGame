# Base Auto Battler - Game Design Document

## Core Concept

A roguelike auto-battler where the player builds a base, gathers resources, trains units, and survives increasingly difficult waves of enemies. Each run is self-contained. The core tension is **resource investment** (base/economy vs. military) balanced against a separate **tech progression** (Battle Points).

**Objective:** Pure survival. Survive as many waves as possible. No wave cap - runs go until the base falls. High score = wave count.

**Aesthetic:** Medieval, top-down 2D, hex grid, Rimworld-style characters.

---

## Gameplay Loop

1. **Build/Prepare Phase** - Player-ended (no timer). Manage base, train units, buy tech, equip gear. Preview upcoming wave. Press "Ready" when done.
2. **Battle Phase** - Auto-battle against incoming wave in separate arena.
3. **Reward Phase** - Receive BP + pick 1 of 3 cards. Boss/elite waves give enhanced rewards.
4. Repeat with escalating difficulty.

---

## Screen Layout

- **Scrollable/pannable single world view**
- Base and hex grid on the bottom portion
- Battle arena on the top portion ("above" the base)
- Player can scroll between both freely
- During build phase, the **upcoming wave is visible** in the arena as a **static formation**, clickable for detailed stat inspection per enemy
- During battle phase, the battle plays out in the arena
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
- Deposits do **not** deplete - steady income once built
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
- BP is always earned - even losses give some progression
- Simple and predictable; players can plan ahead

### Spending BP - Tech Shop

- **4-slot shop** with random upgrades offered after each battle
- **No reroll** - shop persists between phases. Purchased upgrades are replaced with new random ones.
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
- Frontline Fortitude: frontline units get +HP (2 tiers)
- Ranged Precision: ranged row gets +damage (2 tiers)
- Reinforcement Rally: reinforcements deploy with temporary +attack (1 tier)

### Economy Tech (~8+ upgrades)

- Gather Rate + (3 tiers) - all resource buildings produce more
- Salvage (2 tiers) - gain resources from enemy kills in battle
- Double Harvest (2 tiers) - chance for 2x income per phase
- War Spoils (2 tiers) - bonus resources after battle based on kills
- Prospector (1 tier) - reveal deposit locations in unexpanded map areas
- Recycler (1 tier) - selling equipment refunds some iron
- Efficient Construction (2 tiers) - building costs reduced

### Utility Tech (~8+ upgrades)

- Battle Width + (3 tiers)
- Reinforcement Queue + (3 tiers)
- Map Expansion (soft cap via escalating cost: 5 BP, 10, 20, 40, 80...)
- Card Rarity Boost (2 tiers)
- Extra Card Choice (1 tier) - pick from 4 cards instead of 3
- Building Upgrade Unlock Lv2 (1 tier) - allows upgrading buildings to level 2
- Building Upgrade Unlock Lv3 (1 tier) - allows upgrading buildings to level 3

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

- "Iron Will" - units gain +1 life
- "War Economy" - +15% gather rate
- "Armorer's Blessing" - new units start with basic armor
- "Wide Formation" - +1 battle width
- "Scavenger" - gain small resources after each battle

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

- **HP** - health points
- **Attack** - damage dealt
- **Speed** - attack speed / movement
- **Lives** - per-unit stat, defined individually for each unit type
- **Equipment slots** (humanoids only): weapon, armor, shield

### Unit Lives

- Lives are a **per-unit stat**, defined individually for each unit type
- Shields can grant +1 life
- When a unit dies in battle, it loses 1 life and is available for the next battle (if lives remain)
- At 0 lives, the unit is **permanently gone**

### Base Unit Roster (5 units)

| Unit | Role | HP | ATK | Speed | Lives | Equipment | Training | Cost |
|------|------|----|-----|-------|-------|-----------|----------|------|
| **Peasant** | Fodder | 6 | 1 | Normal | 1 | Weapon, Armor, Shield | No building needed | 2W 1S |
| **Militia** | Melee | 8 | 4 | Normal | 2 | Weapon, Armor, Shield | Barracks | 6W 3S |
| **Archer** | Ranged | 6 | 3 | Fast | 2 | Weapon, Armor, Shield | Archery Range | 4W 3I |
| **Guard** | Tank | 14 | 2 | Normal | 2 | Weapon, Armor, Shield | Guardhouse | 3W 8S |
| **Wolf** | Fast Melee | 8 | 3 | Fast | 2 | Armor only | Kennel | 5W |

- **Peasant** is unique: trained without any building, just costs resources. Always available as a fallback.
- **Wolf** cannot equip weapons or shields, only armor.
- Additional unit types unlocked via **military building upgrades** and **meta progression**.

### Unit Types / Niches

- **Fodder** - cheap, absorbs hits (Peasant)
- **Melee fighter** - standard frontline, balanced stats (Militia)
- **Ranged** - attacks from ranged row, fast attack speed (Archer)
- **Tank** - high HP, low damage, holds the line (Guard)
- **Animals** - can't equip weapons, can wear armor, fast (Wolf)

### Abilities

- **No active abilities** at launch. Units only auto-attack.
- Differentiation comes from stats, equipment, and unit type behavior
- Future consideration: passive/triggered abilities

### Equipment

- Crafted at a **blacksmith** building using iron
- **Flat progression tiers** - each tier is strictly better:

| Tier | Examples |
|------|---------|
| **Crude** | Rock club, hide vest |
| **Bronze** | Bronze sword, bronze plate |
| **Iron** | Iron sword, iron armor |
| **Steel** | Steel blade, steel plate |
| **Mithril** | Mithril edge, mithril mail |

- Blacksmith **upgraded with resources** (iron + stone) to unlock next equipment tier
- **Doubling cost** per tier upgrade: Crude→Bronze: 20I + 10S, Bronze→Iron: 40I + 20S, Iron→Steel: 80I + 40S, Steel→Mithril: 160I + 80S
- Slot types:
  - **Weapons**: increase attack damage
  - **Armor**: increase HP / damage reduction
  - **Shields**: grant +1 life or block chance
- Only **humanoid units** can equip weapons; animals can only wear armor
- **Auto-equip**: new units automatically equip best available gear. Player can manually reassign anytime.

### Unit Management

- **Selling units**: sell value = 50% of training cost * (current lives / max lives). Fewer lives = lower sell value.
- **Bench size**: base of 2 slots, +2 per military building (barracks, archery range, guardhouse, kennel). Building upgrades add +2 more bench slots per level.

### Unit Training

- Specific buildings produce specific unit types
- **1 unit per building per build phase**. Want faster army growth? Build more military buildings.
- Training costs resources (see unit roster table)
- Higher-level buildings unlock better unit types

| Building | Lv1 Unit | Lv2 Unit | Lv3 Unit |
|----------|----------|----------|----------|
| Barracks | Militia | (TBD - meta unlock) | (TBD - meta unlock) |
| Archery Range | Archer | (TBD - meta unlock) | (TBD - meta unlock) |
| Guardhouse | Guard | (TBD - meta unlock) | (TBD - meta unlock) |
| Kennel | Wolf | (TBD - meta unlock) | (TBD - meta unlock) |

---

## Battle Mechanics

### Battle Width

- A fixed number of **frontline slots** (starts at ~4, upgradeable via tech)
- Melee units occupy frontline slots
- Ranged units attack from the **ranged row** behind the frontline and do **not** occupy frontline slots
- **Ranged row cap = battle width** (same number of slots as frontline, scales together)
- If all frontline units die, ranged units are exposed to melee

### Targeting

- Default: units attack the **closest enemy**
- Future consideration: type-based targeting for specific unit types

### Army Layout

Three zones:
1. **Frontline** - melee units in battle width slots. These fight first.
2. **Ranged Row** - ranged units behind the frontline. Slots = battle width. Attack without taking frontline slots. Exposed if frontline falls.
3. **Reinforcement Queue** - ordered list of units that auto-deploy into empty frontline slots when a unit dies. Player sets the order. Starts at 2 slots, upgradeable via tech.

Plus:
- **Bench** - non-combat storage. Units managed between battles. Not deployed during combat.

### Battle Flow

- Battles are fought to the death - one side always wins
- Units auto-fight (no player control during battle)
- Player strategy is in composition, equipment, and reinforcement order
- Battles happen in the **separate arena** (above the base in the scrollable view)
- Buildings are **never damaged** by battles

---

## Waves & Difficulty

### Wave Structure

- **Infinite waves** - no cap, difficulty scales forever
- **Every 5th wave**: Elite wave (tougher enemies, guaranteed Rare+ card reward, tech shop resets)
- **Every 10th wave**: Boss wave (boss enemy, possibly with entourage, guaranteed Relic reward, instant kill if boss survives)

### Wave Design

- **Themed templates** - each wave has a composition theme
- Exact enemy count **scales with wave number** within the theme
- Templates are grouped by era/tier:

### Enemy Roster by Era

**Early Era (Waves 1-9)**

| Enemy | Role | Description |
|-------|------|-------------|
| Bandit | Melee | Standard melee fighter. The baseline threat. |
| Wolf | Fast Melee | Fast, aggressive. Rushes frontline quickly. |
| Goblin | Ranged | Weak ranged attacker. Annoying in numbers. |
| Bandit Archer | Ranged | Stronger ranged. Introduces ranged vs melee dynamic. |

**Mid Era (Waves 10-19)**

| Enemy | Role | Description |
|-------|------|-------------|
| Orc Warrior | Melee | Tough melee fighter. Hits hard, takes hits. |
| Skeleton | Fodder | Numerous, fragile. Floods the frontline. |
| Dark Archer | Ranged | High-damage ranged. Priority target. |
| Troll | Tank | Massive HP pool. Holds the line for ranged. |

**Late Era (Waves 20-29)**

| Enemy | Role | Description |
|-------|------|-------------|
| Dark Knight | Tank | Heavily armored melee. Very tough to kill. |
| Demon Imp | Fast Swarm | Fast, weak individually, numerous. Overwhelm through numbers. |
| Warlock | Ranged | Powerful ranged. Dangerous if left alive. |
| Siege Golem | Mega Tank | Massive HP. Slow but nearly unkillable without focused damage. |

**Endless Era (Waves 30+)**

- **All previous enemies** with scaling stats based on wave number
- **Random wave modifiers** applied for variety:

| Modifier | Effect |
|----------|--------|
| Enraged | +30% attack damage |
| Armored | +30% HP |
| Swarming | +50% enemy count, -30% individual stats |
| Hastened | +30% speed |
| Resilient | +1 life to all enemies |

- Waves 30+ pick randomly from all era templates with scaled stats and 1-2 random modifiers

### Wave Preview

- During build phase, the **full upcoming wave** is displayed in the arena
- Enemies shown in **static formation**, clickable for detailed stat tooltips
- Player can see: exact enemy types, counts, and stats
- Allows strategic preparation (train counters, adjust equipment, reorder reinforcements)

---

## Base

### Base Health

- The base has a **fixed 100 HP** pool
- Losing a battle: **5 damage per surviving enemy**
- **Boss survives = instant game over** (bosses must be killed)
- Base reaches 0 HP = run over

### Buildings

| Building | Function | Cost |
|----------|----------|------|
| Lumber Mill | Gathers wood (near wood deposits) | 4W 3S |
| Quarry | Gathers stone (near stone deposits) | 3W 4S |
| Iron Mine | Gathers iron (near iron deposits) | 4W 4S |
| Barracks | Trains melee units, +2 bench slots | 6W 4S |
| Archery Range | Trains ranged units, +2 bench slots | 5W 4I |
| Guardhouse | Trains tank units, +2 bench slots | 3W 8S |
| Blacksmith | Crafts equipment (own tier upgrade system) | 5S 5I |
| Kennel | Trains animal units, +2 bench slots | 6W |

- Buildings are **never destroyed** during battles

### Building Upgrades

- **Gated by tech**: must purchase "Building Upgrade Unlock Lv2" (BP) before upgrading any building to lv2, and "Building Upgrade Unlock Lv3" for lv3
- Once unlocked, individual buildings are upgraded by **spending resources**: **2x build cost per level** (lv2 = 2x, lv3 = 4x original cost)
- **3 levels** per building (base, lv2, lv3)
- **Mixed benefits** by building type:

| Building Type | Lv2 Benefit | Lv3 Benefit |
|--------------|-------------|-------------|
| Resource buildings | +output bonus | +further output bonus |
| Military buildings | Unlock new unit type + 2 bench slots | Unlock elite unit type + 2 bench slots |
| Blacksmith | (Uses own tier system: Crude→Bronze→Iron→Steel→Mithril) | - |

---

## Map / Grid

- **Hex grid**, no terrain effects (flat tiles with cosmetic variety)
- **Starting size: 4-hex radius** (~61 tiles)
- **Expanding map** via tech (Utility category, escalating BP cost: 5, 10, 20, 40, 80...)
- Each expansion adds **+1 hex ring**
- **Soft cap**: no hard limit but escalating costs make 4-5 expansions realistic (final radius ~8-9)
- New deposits are revealed as the map expands
- Resource deposit distribution: **wood most common, stone medium, iron rare**
- 1 iron deposit guaranteed in starting area
- Semi-random generation per run:
  - Resource deposit placement and clustering
  - Cosmetic tile variety
- 6 directions of adjacency
- Buildings snap to hex tiles

---

## Build Phase UX

- **Click-to-select, click-to-place**: select a building/action from a sidebar menu, then click a hex tile to place
- Sidebar shows available actions: build, train, equip, sell, tech shop
- Unit management: click units to assign to frontline/ranged row/reinforcement queue/bench
- **Onboarding checklist**: dismissable panel shown every run with checklist items (Place building, Gather resources, Train unit, Equip unit, Start battle). Checks off as player completes each action. Can be dismissed at any time.

---

## Starting a Run

- Player picks **1 of 3 starter kits**
- Each kit includes: 1 unit + 1 basic building + small resource bundle
- Kits are randomized from unlocked pool
- Examples:
  - "Militia Kit" - Militia + Barracks + 10W 5S
  - "Frontier Kit" - Archer + Archery Range + 8W 5I
  - "Beastmaster Kit" - Wolf + Kennel + 12W
  - "Defender Kit" - Guard + Guardhouse + 5W 10S

---

## Anti-Death-Spiral Mechanisms

- **BP always earned** even on loss (halved, but never zero)
- **Pity scaling** on card rarity - consecutive losses increase rare card chance
- **Reinforcement queue** - reserves soften blow of frontline wipes
- **Peasants always available** - no building needed, cheap fallback units
- Runs are meant to end - but players should feel they have comeback tools

---

## Run End & Scoring

### End Screen

- **Stats summary**: wave reached, units trained, enemies killed, buildings built, relics collected
- **Score**: wave count is the primary and only score
- **Meta unlocks**: show any new unlocks earned during this run
- **Legacy points earned**: display breakdown (waves + boss bonuses)

### Scoring

- **Wave count only** - simple, clear single metric
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
  - **Starter Kits** - new starting options
  - **Relics** - added to the card pool for future runs
  - **Unit Types** - new units available via building upgrades in future runs
  - **Building Types** - new buildings available in future runs
- **No permanent stat boosts** - each run stands on its own

### Saving

- **Auto-save each build phase** - game saves at the start of each build phase
- Can resume a run later
- One active save slot
- Meta progression (legacy points, unlocks) saved separately

---

## Tech Stack

- Web app
- HMR (Hot Module Replacement) for fast dev iteration
- Procedural sounds, VFX, and graphics
- Prioritize development speed

---

## Open Questions (Balancing / Future)

- Specific unit stats for meta-unlock units (building lv2/lv3 units)
- Boss designs and specific boss mechanics
- Resource building output values at each upgrade level
- Exact stat scaling for enemies per wave
- Wave template compositions (exact enemy counts per theme)
- Wave modifier probability and stacking rules for 30+
- Equipment stat bonuses per tier
- Sound / VFX direction and procedural generation approach
- Specific UI layout and button placement
