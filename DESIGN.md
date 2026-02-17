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
- During build phase, the **upcoming wave is visible** in the arena with **full info** (enemy types, counts, stats) so the player can plan accordingly
- During battle phase, the battle plays out in the arena

---

## Economy

### Resources (3 types)

| Resource | Primary Use |
|----------|-------------|
| **Wood** | Buildings, basic unit training |
| **Stone** | Fortifications, advanced buildings |
| **Iron** | Equipment (weapons, armor, shields), elite units |

### Resource Gathering

- **Resource buildings** (lumber mill, quarry, mine) placed on the hex grid
- Buildings must be placed **adjacent to resource deposits** on the map
- Deposits are **semi-randomly placed** each run, creating unique base layouts
- Deposits do **not** deplete - steady income once built
- More buildings on more deposits = higher income
- Building placement is a strategic layer: balance resource access vs. defensive positioning

### What Resources Pay For

- Unit training (unit-specific resource costs)
- Buildings (resource buildings, military buildings, utility buildings)
- Equipment crafting (blacksmith produces weapons/armor/shields from iron)
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

- **Random shop** with 3-4 upgrades offered after each battle
- Can **reroll** the shop for a BP cost (encourages saving vs. spending decisions)
- Upgrade categories:

| Category | Examples |
|----------|---------|
| **Combat** | Unit damage +, unit HP +, attack speed +, type-specific buffs |
| **Economy** | Gather rate +, building cost -, unit training speed +, resource capacity + |
| **Utility** | Battle width +1, reserve size +1, card rarity boost, extra card choice, unit lives +1, map expansion |

- **Map expansion** is a tech unlock (see Map section)

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
- **Lives** - number of times a unit can die before permanently lost (per-unit stat)
- **Equipment slots** (humanoids only): weapon, armor, shield

### Unit Lives

- Lives are a **per-unit stat**, defined individually for each unit type
- Shields can grant +1 life
- When a unit dies in battle, it loses 1 life and is available for the next battle (if lives remain)
- At 0 lives, the unit is **permanently gone**

### Unit Types / Niches

- **Fodder** - cheap, absorbs hits
- **Melee fighter** - standard frontline, balanced stats
- **Ranged** - attacks from behind frontline, doesn't take a battle width slot
- **Glass cannon** - high damage, low HP
- **Tank** - high HP, low damage, holds the line
- **Animals** - can't equip weapons, can wear armor

### Abilities

- **No active abilities** at launch. Units only auto-attack.
- Differentiation comes from stats, equipment, and unit type behavior
- May add passive/triggered abilities in future iterations

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

- Blacksmith **building level** determines max craftable tier
- Slot types:
  - **Weapons**: increase attack damage
  - **Armor**: increase HP / damage reduction
  - **Shields**: grant +1 life or block chance
- Only **humanoid units** can equip weapons; animals can only wear armor

### Unit Training

- Specific buildings produce specific unit types (barracks -> melee, archery range -> ranged, etc.)
- Training costs resources (wood, stone, iron depending on unit)
- Training takes time within the build phase

---

## Battle Mechanics

### Battle Width

- A fixed number of **frontline slots** (starts at ~4, upgradeable via tech)
- Melee units occupy frontline slots
- Ranged units attack from behind and do **not** occupy slots
- If all frontline units die, ranged units are exposed

### Targeting

- Default: units attack the **closest enemy**
- Future consideration: type-based targeting for specific unit types

### Reserves

Two pools:
- **Bench** - staging ground, units not in the current battle roster. Managed between battles.
- **Reinforcement Queue** - ordered list of units that auto-deploy when a frontline unit dies. Player sets the order.

### Battle Flow

- Battles are fought to the death - one side always wins
- Units auto-fight (no player control during battle)
- Player strategy is in composition, positioning, equipment, and reinforcement order
- Battles happen in the **separate arena** (above the base in the scrollable view)
- Buildings are **never damaged** by battles

---

## Waves & Difficulty

### Wave Structure

- **Infinite waves** - no cap, difficulty scales forever
- **Every 5th wave**: Elite wave (tougher enemies, guaranteed Rare+ card reward)
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
- Player can see: exact enemy types, counts, and stats
- Allows strategic preparation (train counters, adjust equipment, reorder reinforcements)

---

## Base

### Base Health

- The base has a total **HP pool**
- Losing a battle means **losing base health**, proportional to how many enemy units survive and their remaining HP
- Base reaches 0 HP = run over

### Buildings

| Building | Function | Cost Type |
|----------|----------|-----------|
| Lumber Mill | Gathers wood (near wood deposits) | Wood, Stone |
| Quarry | Gathers stone (near stone deposits) | Wood, Stone |
| Iron Mine | Gathers iron (near iron deposits) | Wood, Stone |
| Barracks | Trains melee units | Wood, Stone |
| Archery Range | Trains ranged units | Wood, Iron |
| Blacksmith | Crafts equipment from iron (upgradeable tiers) | Stone, Iron |
| Kennel | Trains animal units | Wood |

- Buildings are **never destroyed** during battles
- Blacksmith has upgrade levels that unlock higher equipment tiers

---

## Map / Grid

- **Hex grid**
- **Expanding map** - starts small, grows via tech upgrades (BP)
- Map expansion is a Utility tech purchase, competing with other tech options
- Semi-random generation per run:
  - Resource deposit placement
  - Terrain features
  - New deposits revealed as map expands
- 6 directions of attack/adjacency
- Buildings snap to hex tiles
- Starting area is compact - forces early trade-offs on building placement

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

## Meta Progression (Between Runs)

Kept light to preserve roguelike feel:

- **Unlock new starter kits** via achievements
- **Unlock new unit types / buildings** that can appear in future runs
- **Unlock new relics** added to the card pool
- **No permanent stat boosts** - each run stands on its own

---

## Tech Stack

- Web app
- HMR (Hot Module Replacement) for fast dev iteration
- Procedural sounds, VFX, and graphics
- Prioritize development speed

---

## Open Questions

- Starting map size (hex radius) and expansion increment per tech level
- Build phase UX details (unit drag-and-drop? click-to-place?)
- Animal unit specifics
- Detailed tech upgrade list and BP costs
- Battle animation / speed controls (1x/2x/skip?)
- Terrain features and their effects
- Detailed enemy unit roster
- Blacksmith upgrade costs and tier progression
- Resource income rates and balancing
- Reinforcement queue size limits
