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
- **Per-phase flat income**: each resource building generates a fixed amount per build phase
- **Multi-deposit adjacency bonus**: a building adjacent to multiple deposits of its type produces more (e.g. lumber mill touching 2 wood deposits gets bonus output). Rewards reading the map and placing buildings on rich deposit clusters.

### What Resources Pay For

- Unit training (unit-specific resource costs)
- Buildings (resource buildings, military buildings, utility buildings)
- Building upgrades (resource cost to upgrade each building)
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
- **Tiered upgrades**: each upgrade can only be bought once. After purchase, an upgraded version may appear later (e.g. "Unit Damage +1" → later "Unit Damage +2" at higher cost). Prevents spamming the same upgrade, creates progression within each upgrade path.
- Upgrade categories:

| Category | Examples |
|----------|---------|
| **Combat** | Unit damage +, unit HP +, attack speed +, type-specific buffs |
| **Economy** | Gather rate +, building cost -, unit training speed +, resource capacity + |
| **Utility** | Battle width +1, reinforcement queue +1, card rarity boost, extra card choice, map expansion, building upgrade unlock |

- **Building upgrade unlock**: BP tech that allows building upgrades. Must be purchased before any building can be upgraded with resources.

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

### Unit Types / Niches

- **Fodder** - cheap, absorbs hits
- **Melee fighter** - standard frontline, balanced stats
- **Ranged** - attacks from ranged row behind frontline, doesn't take a frontline slot
- **Glass cannon** - high damage, low HP
- **Tank** - high HP, low damage, holds the line
- **Animals** - can't equip weapons, can wear armor

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
- **Doubling cost** per tier upgrade (e.g. Crude→Bronze: 20 iron + 10 stone, Bronze→Iron: 40 iron + 20 stone, etc.)
- Slot types:
  - **Weapons**: increase attack damage
  - **Armor**: increase HP / damage reduction
  - **Shields**: grant +1 life or block chance
- Only **humanoid units** can equip weapons; animals can only wear armor
- **Auto-equip**: new units automatically equip best available gear. Player can manually reassign anytime.

### Unit Management

- **Selling units**: sell value = 50% of training cost * (current lives / max lives). Fewer lives = lower sell value.
- **Bench size**: base of 2 slots, +2 per military building (barracks, archery range, kennel). Building upgrades add more bench slots.

### Unit Training

- Specific buildings produce specific unit types (barracks → melee, archery range → ranged, etc.)
- **1 unit per building per build phase**. Want faster army growth? Build more military buildings.
- Training costs resources (wood, stone, iron depending on unit)
- Higher-level buildings unlock better unit types (see Building Upgrades)

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
- **Every 10th wave**: Boss wave (boss enemy, possibly with entourage, guaranteed Relic reward)

### Wave Design

- **Themed templates** - each wave has a composition theme
- Exact enemy count **scales with wave number** within the theme
- Templates are grouped by era/tier:

| Wave Range | Era | Example Themes |
|-----------|-----|----------------|
| 1-9 | Early | Bandit raid, wild beasts, militia deserters |
| 10-19 | Mid | Armored warband, archer volley, cavalry charge |
| 20-29 | Late | Shield wall, siege force, elite guard |
| 30+ | Endless | Scaled versions of all themes, increasing stats |

- Boss waves have **unique bosses** - some solo, some with themed entourage (depends on the boss)
- Within each era, a template is picked semi-randomly, with enemy count and stats scaled to the current wave number

### Wave Preview

- During build phase, the **full upcoming wave** is displayed in the arena
- Enemies shown in **static formation**, clickable for detailed stat tooltips
- Player can see: exact enemy types, counts, and stats
- Allows strategic preparation (train counters, adjust equipment, reorder reinforcements)

---

## Base

### Base Health

- The base has a **fixed 100 HP** pool
- Losing a battle means **losing base health**, proportional to how many enemy units survive and their remaining HP
- Base reaches 0 HP = run over

### Buildings

| Building | Function | Cost Type |
|----------|----------|-----------|
| Lumber Mill | Gathers wood (near wood deposits) | Wood, Stone |
| Quarry | Gathers stone (near stone deposits) | Wood, Stone |
| Iron Mine | Gathers iron (near iron deposits) | Wood, Stone |
| Barracks | Trains melee units, +2 bench slots | Wood, Stone |
| Archery Range | Trains ranged units, +2 bench slots | Wood, Iron |
| Blacksmith | Crafts equipment (upgradeable tiers) | Stone, Iron |
| Kennel | Trains animal units, +2 bench slots | Wood |

- Buildings are **never destroyed** during battles

### Building Upgrades

- **Gated by tech**: must purchase "Building Upgrade" tech (BP) before any building can be upgraded
- Once unlocked, individual buildings are upgraded by **spending resources**
- **3 levels** per building (base, lv2, lv3) - may require multiple tech tiers to unlock lv3
- **Mixed benefits** by building type:

| Building Type | Lv2 Benefit | Lv3 Benefit |
|--------------|-------------|-------------|
| Resource buildings | +output bonus | +further output bonus |
| Military buildings | Unlock new unit type + 2 bench slots | Unlock elite unit type + 2 bench slots |
| Blacksmith | (Uses own tier upgrade system instead) | - |

- Blacksmith uses its own **resource-based tier upgrade** system (Crude → Bronze → Iron → Steel → Mithril) with doubling costs, separate from the general building upgrade system

---

## Map / Grid

- **Hex grid**, no terrain effects (flat tiles with cosmetic variety)
- **Expanding map** - starts small, grows via tech upgrades (BP spent in Utility category)
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
  - "Militia Kit" - swordsman + barracks + wood/stone
  - "Frontier Kit" - archer + archery range + wood/iron
  - "Beastmaster Kit" - wolf + kennel + wood

---

## Anti-Death-Spiral Mechanisms

- **BP always earned** even on loss (halved, but never zero)
- **Pity scaling** on card rarity - consecutive losses increase rare card chance
- **Reinforcement queue** - reserves soften blow of frontline wipes
- Runs are meant to end - but players should feel they have comeback tools

---

## Run End & Scoring

### End Screen

- **Stats summary**: wave reached, units trained, enemies killed, buildings built, relics collected
- **Score**: wave count is the primary and only score
- **Meta unlocks**: show any new unlocks earned during this run

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
  - **Unit Types** - new units that can appear in future runs
  - **Building Types** - new buildings available in future runs
- **No permanent stat boosts** - each run stands on its own
- **No cosmetics** for now (can be added later)

### Saving

- **Auto-save each phase** - game saves at the start of each build phase
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

## Open Questions

- Starting map size (hex radius) and expansion increment per tech level
- Animal unit specifics
- Detailed tech upgrade list and BP costs
- Detailed enemy unit roster and boss designs
- Resource income rates and adjacency bonus values
- Specific unit stats, costs, and lives per unit type
- Building upgrade resource costs per level
- Tech tier costs for building upgrade unlocks (lv2 unlock, lv3 unlock)
- Exact base damage formula on loss
