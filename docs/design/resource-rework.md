# Resource & Economy Rework

## Problem Statement

The current economy is "place once, forget forever." After waves 1-3, resource buildings are set up and the economy becomes passive background noise. All three resources (wood, stone, iron) behave identically — they're just different colors of money with no strategic identity.

## Design Goals

- Resources should have **distinct identities** — different tempos, processing needs, and strategic roles
- The base should **stay relevant** throughout the game, not be a solved puzzle by wave 4
- Resource decisions should create **meaningful trade-offs**, not just "buy everything eventually"
- Processing should be **asymmetric** — not every resource follows the same pipeline

---

## Resource Identities

### Wood — The Immediate Resource
- **Identity:** Fast, flexible, disposable. Chop and use.
- **Processing:** None required for basic use. Optional sawmill for advanced goods.
- **Tempo:** Immediate. The early-game resource.
- **Role:** Basic buildings, ranged units, expendable troops, and **fuel for smelting**.
- **Late-game relevance:** Consumed as smelter fuel — iron production eats wood, creating ongoing demand.

### Stone — The Infrastructure Resource
- **Identity:** Slow, defensive, structural. Build for the long haul.
- **Processing:** Raw stone works for basic buildings. Quarry upgrade (level 2+) produces cut stone for defensive equipment and advanced construction.
- **Tempo:** Medium. The mid-game investment resource.
- **Role:** Buildings, shields, fortifications, building upgrades, defensive units.

### Iron — The Power Resource
- **Identity:** Requires investment, highest payoff. Ore is useless until smelted.
- **Processing:** Mandatory. Iron mine produces ore; ore is unusable. Smelter building converts ore → iron bars.
- **Tempo:** Slow. The late-game power spike.
- **Role:** All serious weapons, heavy armor, elite unit training.
- **Bottleneck by design:** Smelter is a separate building competing for grid space. Smelter throughput limits iron availability.

### The Triangle
```
           WOOD
          (speed)
         /       \
        /  army    \
       /  choices   \
      /               \
  STONE ————————————— IRON
 (defense)          (offense)
```

- **Wood-heavy:** Archers, wolves, fodder. Cheap, wide, replaceable.
- **Stone-heavy:** Guards, shields, upgraded buildings. Durable, slow, outlasts.
- **Iron-heavy:** Swordsmen, heavy weapons, elite gear. Expensive setup, dominant once online.

---

## Processing System

### Asymmetric Processing

Not all resources process the same way. That's the point.

| Resource | Raw Form | Processing Required | Processing Method | Refined Form |
|----------|----------|-------------------|-------------------|-------------|
| Wood | Logs | None (basic use) / Optional (advanced) | Sawmill building (optional) | Planks |
| Stone | Raw stone | None (basic) / Upgrade-gated (advanced) | Quarry upgraded to level 2+ | Cut stone |
| Iron | Ore | **Always required** | Smelter building (mandatory, separate) | Iron bars |

### Smelter Details

- **New building type.** Placed on the hex grid like any other building. **Works anywhere** — does not require iron mine adjacency.
- **Adjacency bonus:** Smelter adjacent to iron mine gets +1 throughput. Rewards spatial planning without hard-gating placement.
- **Consumes wood as fuel.** Each round the smelter runs, it burns wood to produce iron bars. This creates cross-resource dependency — iron production taxes your wood supply.
- **Throughput is limited.** A smelter converts a fixed amount of ore per round (e.g., 3 ore → 2 iron bars, costs 1 wood fuel). Want more iron? Build more smelters — but that's more grid space and more wood consumed.

### Blacksmith

- Consumes **iron bars directly from stockpile**. No adjacency requirements.
- Tier gated by tech tree (Advanced Forging → steel, Master Forging → mithril).

### Fuel Costs (Tentative)

| Smelter Level | Ore Input | Wood Fuel | Iron Output |
|--------------|-----------|-----------|-------------|
| 1 | 3 ore | 1 wood | 2 bars |
| 2 | 5 ore | 2 wood | 4 bars |
| 3 | 8 ore | 3 wood | 6 bars |

### Sawmill (Optional Building)

- Converts raw wood → planks
- Planks needed for: tier 2+ buildings, composite bows, advanced archery units
- **Not required early game** — that's wood's identity (immediately usable)
- Becomes relevant mid-game when you want to upgrade buildings or field elite ranged units

### Stone Processing (Via Quarry Upgrade)

- Level 1 quarry: produces raw stone (basic buildings)
- Level 2 quarry: produces cut stone (shields, building upgrades, guardhouse units)
- Level 3 quarry: produces dressed stone (elite defensive equipment, advanced structures)
- No separate building needed — processing is the upgrade itself

---

## Unit Production

### Buildings Are Factories

Units are **free**. Buildings produce them automatically — the building IS the investment. No per-unit training cost.

| Mechanic | Detail |
|----------|--------|
| Production rate | 1 unit per military building per wave (on advanceToBuild) |
| Level scaling | Building lv2 → can produce tier 2 units. Lv3 → tier 3 units. |
| Choice | Upgrade auto-selects new unit. Player can switch which unit type to produce. |
| Accumulation | Units persist until killed. Army grows over time. |
| Death impact | Losing a unit = waiting 1+ waves to replace it from the same building. |

### Building → Unit Mapping

| Building | Lv1 Units | Lv2 Units | Lv3 Units |
|----------|-----------|-----------|-----------|
| Barracks | Militia | Swordsman | Champion |
| Archery Range | Archer | Crossbowman | Sharpshooter |
| Guardhouse | Guard | Sentinel | Warden |
| Kennel | Wolf | Dire Wolf | Alpha Wolf |

- Higher-level units replace lower-level production (or player chooses which tier to produce)
- Peasants: starter unit / card reward only. Not produced by buildings.

### Why Free Units Work

Resources have **6 competing sinks** already:
1. **Buildings** (place + upgrade) — the unit investment IS here
2. **Processing buildings** (smelter, sawmill) — grid space + resources
3. **Unit upgrades** (thematic abilities, 27 total) — ongoing resource cost
4. **Equipment crafting** (blacksmith) — iron bars sink
5. **Smelter fuel** (ongoing wood consumption)
6. **Tile expansion** (claiming new hex tiles) — see Hex Grid section

Adding a per-unit training cost on top would double-tax the player. The building is expensive enough.

### Future: Temporary Unit Purchase

Not in initial design, but reserved for future:
- Spend BP to hire a mercenary for 1 battle
- Spend refined resources for a one-wave elite unit
- Card rewards can still grant free units (persists until killed)

---

## Hex Grid & Expansion

### Grid Generation

The full map is generated at a large radius (**radius 5 = 91 tiles**) at game start. Deposits, terrain, and mountains are all placed and **visible from wave 1** — no fog of war. The player can see the whole map and plan their expansion path.

### Claimed Tiles

Only the **center area is claimed** at start.

| Start | Claimed Radius | Tiles Owned | Notes |
|-------|---------------|-------------|-------|
| Initial | 1 | **7 tiles** | Very tight. Starter building + 1-2 resource buildings fills it. |

Unclaimed tiles are visible but greyed out. Cannot build on them until claimed.

### Tile Purchase (Expansion)

Build-phase action: spend resources to **claim one tile adjacent to an already-claimed tile**.

| Mechanic | Detail |
|----------|--------|
| Cost | Flat base + slight distance scaling: **2 wood + 1 stone + 1 per ring beyond radius 1** |
| Limit | 1 tile per wave? Or unlimited if you can afford it? (needs playtesting) |
| Adjacency | Must be adjacent to an already-claimed tile. Expansion is organic, outward. |
| Direction | Player chooses WHERE to expand. Push toward iron? Toward open grass? |

**Cost: wood only.** Fits wood's identity as the immediate/expansion resource.

| Tile Distance from Center | Cost |
|--------------------------|------|
| Ring 2 (adjacent to start) | 2 wood |
| Ring 3 | 2 wood |
| Ring 4 | 3 wood |
| Ring 5 (outer edge) | 3 wood |

- **No limit per wave** — buy as many as you can afford. Resources are the only gate.
- Cheap individually, adds up significantly over 30 waves.
- Expansion is another **resource sink** that competes with buildings, upgrades, and equipment.
- Wood-only cost means wood stays relevant even when you're deep in iron/stone paths.

### Terrain (Functional, Not Cosmetic)

| Terrain | Buildable? | Notes |
|---------|-----------|-------|
| **Grass** | Yes — any building | Premium real estate. Grass near deposits is the best hex on the map. |
| **Forest** | Limited — wood buildings only | Lumber mill, sawmill. Can't place barracks or smelter. |
| **Rock** | Limited — stone buildings only | Quarry, masonry. Can't place barracks or smelter. |
| **Mountain** | **Unbuildable** | Blocks expansion paths. Must route around. Natural walls. |

### Deposits (Unbuildable)

**Deposit tiles cannot be built on.** Resource buildings must be placed **adjacent** to their deposit type.

This means:
- A wood deposit cluster of 3 tiles = 3 unbuildable tiles, but the hexes around them are prime lumber mill locations.
- An iron deposit 4 tiles away requires buying a path of tiles to reach it, then placing a mine adjacent.
- Deposits + mountains create natural corridors and contested space on the grid.

### Grid Pressure Math

Starting with 7 claimed tiles on a radius-5 map:
- ~2-3 of those 7 tiles may have deposits (unbuildable) or forests/rocks (restricted)
- Realistically **3-4 buildable grass tiles** at start
- Starter building takes 1. First free resource building takes 1. That leaves 1-2 open tiles.
- **Expansion is mandatory from wave 2-3 onward.** You can't fit everything in 7 tiles.
- By wave 10 you might have claimed 15-20 tiles total, but mountains and deposits eat into that.
- By wave 20, 25-35 tiles claimed. Grid is an active puzzle the entire game.

### Starting Guarantee

**Always 1 wood deposit within radius 1 or 2.** Player can always place their first free lumber mill and get economy going immediately. No RNG-screwed starts.

### Deposit Placement (Generation)

Generated at game start across the full radius-5 map:

| Deposit | Clusters | Tiles per Cluster | Total ~Tiles | Placement |
|---------|----------|-------------------|-------------|-----------|
| Wood | 3 | 2-3 | 6-9 | Spread across map, **1 guaranteed near center** |
| Stone | 2 | 2-3 | 4-6 | Mid-range from center |
| Iron | 1-2 | 1-2 | 2-3 | Far from center (requires expansion to reach) |

Iron being far from center reinforces its identity: you need to expand (spend wood) to even reach it, then build a smelter (spend BP on Metallurgy tech), then fuel the smelter (spend more wood). Iron is the most invested resource by design.

### Mountain Placement

**8-12 mountain tiles** scattered across the map, creating meaningful routing decisions:
- Block direct expansion paths (must route around)
- Create chokepoints and corridors in the grid layout
- Some deposits may only be accessible through narrow paths between mountains
- Mountains near center are more impactful (early game constraint)
- Mountains never placed in radius 1 (don't cripple the starting area)

---

## Open Questions

- [ ] Exact resource quantities / production rates (needs playtesting)
- [ ] Do raw resources have any late-game use, or only refined? (Probably: raw wood always useful as fuel, raw stone for basic repairs)
- [ ] Should smelter require adjacency to iron mine, or work anywhere?
- [x] ~~Sawmill: separate building or lumber mill upgrade?~~ **Separate building.** More grid pressure, reinforces spatial decision-making.
- [x] ~~How does this interact with card rewards?~~ **Rarity determines raw vs refined.** Common/rare cards grant raw resources. Epic/legendary grant refined.
- [ ] Equipment crafting: does blacksmith consume iron bars directly, or does it need its own adjacency to smelter?
- [ ] Should deposits deplete? (Would compound the "base stays relevant" goal but adds more complexity)
- [ ] Relic interactions with new processing system

---

## Card Rewards & Resource Tiers

### Raw vs Refined in Card Drops

Card rarity determines whether you get raw or refined resources:

| Rarity | Resource Type | Example |
|--------|--------------|---------|
| Common | Raw only | 6 logs, 4 raw stone, 3 ore |
| Rare | Mostly raw, some refined | 8 logs, 2 planks, 4 raw stone |
| Epic | Mix of raw + refined | 4 planks, 3 cut stone, 2 iron bars |
| Legendary | Mostly refined | 6 planks, 4 cut stone, 4 iron bars |

This means:
- **Common cards** never bypass your processing bottleneck — you still need smelters/sawmills
- **Legendary cards** are genuinely powerful because refined resources skip the processing tax
- Creates a natural reason to invest in card rarity boosts (Fortune's Favor tech, loss streak pity)

### Other Card Types

- **Unit cards:** Unchanged — grant a free unit. But now unit rarity aligns with resource cost (common = raw-resource units, legendary = iron-gated elites)
- **Equipment cards:** Still grant finished equipment, but the tier gating already handles rarity
- **BP cards:** Unchanged
- **New card type: Processing boost?** e.g., "Smelter runs double this round" or "Free sawmill conversion for 3 rounds"

---

## Tech Tree

### Design Principles

- **Fixed tree, visible from wave 1.** Player plans their path. No RNG shop.
- **All BP cost.** Single currency, earned from battle.
- **Two branch types:** Resource branches (economy/processing) and Tactical branch (army management).
- **No generic stat buffs** in the tree. No "+2 attack to all units." That's boring. Unit power comes from the **Unit Upgrade system** (see below), which costs resources.
- **Tech = unlocks and infrastructure.** Processing buildings, building tiers, deployment capacity, card rewards.
- **Players should never complete the full tree.** Even a perfect 30-wave run should leave ~30-40% unpurchased. Forces identity.

### BP Economy (30-Wave Target)

Reduced BP income — tree completion should feel aspirational, not inevitable.

| | Formula | Example |
|--|---------|---------|
| **Win** | 3 BP flat | Wave 1 win = 3, Wave 30 win = 3 |
| **Loss** | 1 BP flat | Consistent pity income |
| **Boss kill bonus** | +5 BP | Waves 10, 20, 30 |

| Run Type | BP Earned (30 waves) |
|----------|---------------------|
| Perfect (30 wins, 3 bosses) | **105 BP** |
| Good (24 wins, 6 losses, 2 bosses) | **88 BP** |
| Struggling (18 wins, 12 losses, 1 boss) | **71 BP** |

Tree total: **~160-180 BP** → perfect run completes ~60%, struggling run ~40%.

### Army Limits

| Mechanic | Base Value | Notes |
|----------|-----------|-------|
| **Deployment slots** | 4 | Hard cap on units placed in deployment phase |
| **Reinforcement queue** | 1 | Units that spawn mid-battle when a hex frees up |
| **Bench** | Unlimited(ish) | Available between battles for swapping, not during |

- **Battle roster = deployed + reinforcements.** Everything else is benched.
- With 4 deploy + 1 reinforcement, your initial fighting force is **5 units max**.
- Bench becomes critical: swap in counters for the upcoming wave, rotate injured units out.
- Deployment slots are **premium upgrades** — always +1, escalating cost. Each one is a major power spike.

---

### Resource Branches (Economy / Processing)

These branches unlock **what you can build and produce**. No combat effects.

#### Wood Branch — Processing & Production

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Sawmill Blueprint | 5 BP | Unlocks Sawmill building (logs → planks) | Root |
| Lumber Economy | 8 BP | Wood production +30%, sawmill output +50% | Sawmill Blueprint |
| Master Carpentry | 12 BP | Planks required for tier 2+ building upgrades (enables them) | Lumber Economy |

**Total: 25 BP**

#### Stone Branch — Infrastructure & Building Tiers

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Masonry | 5 BP | Quarry can upgrade to lv2 (produces cut stone) | Root |
| Advanced Construction | 10 BP | All buildings can upgrade to lv2. Unlocks tier 2 unit upgrades. | Masonry |
| Master Construction | 14 BP | All buildings can upgrade to lv3. Quarry lv3 = dressed stone. Tier 3 unit upgrades. | Advanced Construction |

**Total: 29 BP**

#### Iron Branch — Smelting & Forging

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Metallurgy | 5 BP | Unlocks Smelter building (ore → iron bars, consumes wood fuel) | Root |
| Efficient Smelting | 8 BP | Smelter fuel cost halved, iron mine +1 ore output | Metallurgy |
| Advanced Forging | 12 BP | Blacksmith unlocks steel tier. Smelter throughput +50%. | Efficient Smelting |
| Master Forging | 16 BP | Blacksmith unlocks mithril tier. | Advanced Forging |

**Total: 41 BP**

**Resource branch grand total: ~95 BP**

---

### Tactical Branch (Military / Deployment)

Separate from resources. Controls **how you fight** — army size, deployment, reinforcements, card rewards.

#### Deployment Nodes

Each +1 deployment slot is **individually purchased, escalating cost**. These are the most impactful nodes in the game.

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Deployment +1 (4→5) | 8 BP | +1 deployment slot | Root |
| Deployment +1 (5→6) | 12 BP | +1 deployment slot | Previous |
| Deployment +1 (6→7) | 16 BP | +1 deployment slot | Previous |
| Deployment +1 (7→8) | 20 BP | +1 deployment slot | Previous |

**Total: 56 BP** for +4 slots (4→8). Most players get +1 or +2.

#### Reinforcement Nodes

Same pattern — +1 each, escalating.

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Reinforcement +1 (1→2) | 6 BP | +1 reinforcement queue slot | Root |
| Reinforcement +1 (2→3) | 10 BP | +1 reinforcement queue slot | Previous |
| Reinforcement +1 (3→4) | 15 BP | +1 reinforcement queue slot | Previous |

**Total: 31 BP** for +3 slots (1→4).

#### Utility Nodes

| Node | Cost | Effect | Prereq |
|------|------|--------|--------|
| Extended Deployment | 10 BP | +1 deployment row (rows 8-11 instead of 9-11) | Deployment +1 (first) |
| Fortune's Favor | 8 BP | Card rarity boost | Any resource T1 |
| Extra Scout | 6 BP | +1 card choice after battle | Root |

**Tactical branch grand total: ~111 BP**

---

### Full Tree Summary

| Branch | Total BP | What It Does |
|--------|----------|-------------|
| Wood (processing) | 25 | Sawmill, plank production, carpentry |
| Stone (infrastructure) | 29 | Building upgrades, unit upgrade tier gates |
| Iron (forging) | 41 | Smelter, forge tiers, mithril |
| Tactical (deployment) | 56 | Deploy more units (+1 each, escalating) |
| Tactical (reinforcement) | 31 | Reinforce faster (+1 each, escalating) |
| Tactical (utility) | 24 | Deployment zone, cards |
| **Grand total** | **~206 BP** | |

| Run Type | BP Earned | Tree % Completable |
|----------|-----------|-------------------|
| Perfect 30 waves | 105 BP | ~51% |
| Good 30 waves | 88 BP | ~43% |
| Struggling 30 waves | 71 BP | ~34% |
| Perfect 15 waves | 50 BP | ~24% |

**This is intentional.** A perfect player completing half the tree means every node purchase is a real sacrifice. "Do I get my 6th deployment slot or unlock Master Forging?" is a genuine dilemma.

---

## Unit Upgrade System

### Design

**No generic stat buffs.** Instead, each unit type has **thematic upgrades** that change how it plays on the hex grid. These cost **resources** (not BP), creating an ongoing resource sink throughout the game.

### How It Works

- Each unit type has **3 upgrade tiers**
- **Tier 1:** Always available. Cheap, modest effect.
- **Tier 2:** Requires building level 2 (gated by Advanced Construction tech, 15 BP into stone branch).
- **Tier 3:** Requires building level 3 (gated by Master Construction tech, 29 BP into stone branch).
- Upgrades cost the **unit's primary resource** — reinforces resource identity.
- Upgrades apply to **all current and future units** of that type.
- Building the upgrade path for your key units IS the mid/late-game resource sink.

### Gate Structure

```
Unit Upgrade Tier 1 ← always available, costs resources
Unit Upgrade Tier 2 ← requires Advanced Construction (stone tech) + building lv2
Unit Upgrade Tier 3 ← requires Master Construction (stone tech) + building lv3
```

This creates a **strong coupling between stone branch and unit power**. Even an iron-focused player needs to dip into stone to access tier 2-3 unit upgrades. Cross-branch dependency by design.

### Unit Upgrades (Thematic, Hex-Aware)

#### Barracks Units

**Militia** (basic melee, wood+iron identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Shield Wall | 5 wood, 3 stone | +3 HP when adjacent to another militia |
| 2 | Rallying Cry | 8 wood, 4 iron bars | Adjacent allies get +1 attack |
| 3 | Veteran's Resolve | 10 planks, 6 iron bars | +1 life |

**Swordsman** (elite melee, iron identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Riposte | 6 iron bars | Counter-attack for 50% damage when hit in melee |
| 2 | Cleave | 10 iron bars, 4 stone | Attacks deal 50% damage to enemies adjacent to target |
| 3 | Executioner | 14 iron bars, 6 planks | +50% damage to targets below 30% HP |

**Champion** (elite melee, iron identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Riposte | 6 iron bars | Counter-attack for 50% damage when hit in melee |
| 2 | Cleave | 10 iron bars, 4 stone | Attacks deal 50% damage to enemies adjacent to target |
| 3 | Executioner | 14 iron bars, 6 planks | +50% damage to targets below 30% HP |

#### Archery Range Units

**Archer** (basic ranged, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Quickdraw | 5 wood | -0.15s cooldown |
| 2 | Fire Arrows | 6 planks, 3 iron bars | Attacks apply 1 dmg/tick for 3 ticks (DoT) |
| 3 | Volley | 10 planks, 5 iron bars | Every 3rd attack hits all enemies in a 2-hex radius |

**Crossbowman** (heavy ranged, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Heavy Bolt | 5 wood, 2 iron bars | +1 attack vs armored targets (armor > 0) |
| 2 | Piercing Shot | 8 planks, 4 iron bars | Attacks ignore 1 armor |
| 3 | Siege Bolts | 12 planks, 6 iron bars | +50% damage to targets with armor ≥ 2 |

**Sharpshooter** (elite ranged, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Steady Aim | 6 planks | +2 attack when not moving (stood still this tick) |
| 2 | Headshot | 10 planks, 5 iron bars | 20% chance for double damage on attack |
| 3 | Deadeye | 14 planks, 8 iron bars | First attack each battle is guaranteed critical (2x damage) |

#### Guardhouse Units

**Guard** (basic tank, stone identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Brace | 4 stone, 3 wood | +5 HP when not moving (stood still this tick) |
| 2 | Taunt | 6 cut stone, 4 iron bars | Enemies within 2 hex prioritize attacking this guard |
| 3 | Fortress | 10 dressed stone | -30% damage taken. Cannot move. |

**Sentinel** (heavy tank, stone identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Brace for Charge | 4 stone, 3 wood | Double damage vs units that moved this tick |
| 2 | Phalanx | 8 cut stone | +2 armor per adjacent sentinel |
| 3 | Hold the Line | 12 dressed stone, 4 iron bars | Enemies cannot move through adjacent hexes (zone of control) |

**Warden** (elite tank, stone identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Shield Wall | 5 stone, 3 wood | +3 HP when adjacent to another guardhouse unit |
| 2 | Rallying Presence | 8 cut stone, 4 iron bars | Adjacent allies get +1 armor |
| 3 | Unbreakable | 14 dressed stone, 6 iron bars | Survive lethal hit once per battle with 1 HP |

#### Kennel Units

**Wolf** (fast animal, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Pack Hunting | 4 wood | +2 attack per adjacent friendly wolf/kennel unit |
| 2 | Hamstring | 6 planks | Attacks reduce target moveSpeed by 50% for 2 ticks |
| 3 | Pack Leader | 10 planks, 4 iron bars | Adjacent kennel units attack 20% faster |

**Dire Wolf** (heavy fast animal, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Savage Bite | 5 wood | +1 attack per consecutive hit on same target |
| 2 | Frenzy | 8 planks, 3 iron bars | +1.0 moveSpeed when below 50% HP |
| 3 | Bloodlust | 12 planks, 5 iron bars | +1 attack per kill this battle (stacking) |

**Alpha Wolf** (elite fast animal, wood identity)

| Tier | Name | Cost | Effect |
|------|------|------|--------|
| 1 | Intimidating Howl | 6 wood, 3 stone | On entering battle, adjacent enemies have -1 attack for 5 ticks |
| 2 | Apex Predator | 10 planks, 4 iron bars | +50% damage to targets below 30% HP |
| 3 | Unstoppable Pack | 14 planks, 8 iron bars | All kennel units gain +2 moveSpeed for 5 ticks when any kennel unit dies |

### Unit Upgrade Design Properties

1. **Hex grid matters.** Pack Hunting, Phalanx, Shield Wall, Taunt — all reward specific hex positioning. Deployment phase becomes a real puzzle.
2. **Each upgrade changes behavior**, not just numbers. Taunt changes targeting AI. Hold the Line blocks movement. Fortress makes guards immovable. These are qualitative shifts.
3. **Resource identity reinforced.** Kennel units cost wood. Guardhouse units cost stone. Barracks units cost iron. Upgrading your army pulls from the same resources you need for buildings and equipment.
4. **Stone branch gates all tier 2-3 upgrades.** This makes Advanced/Master Construction universally valuable — even iron-rush or wood-rush players need stone tech to unlock their best unit upgrades.
5. **Every building has a full 3-tier track.** Each military building produces 3 unit tiers that stay within the same niche (same range, speed class, role). Higher tiers are strictly better versions, not role changes.
6. **Ongoing resource sink.** At 12 unit types × 3 tiers, that's 36 upgrades to purchase with resources. You'll never buy all of them. Focus on your core building tracks.
7. **Tier 3 upgrades are build-defining.** Fortress Guard, Hold the Line Sentinel, Deadeye Sharpshooter, Executioner Champion, Unstoppable Pack Alpha Wolf — these are the "I built my whole strategy around this" moments.

---

## Game Flow (Revised, 30-Wave Target)

### Wave 1-3: Scramble Phase
- **7 claimed tiles.** 3-4 actually buildable (deposits/terrain block the rest).
- Starter building + first free resource building fills most of your space.
- **Expanding 1-2 tiles** toward nearby deposits is the immediate priority.
- 4 deployment slots, 1 reinforcement. Fighting with starter unit + first produced unit.
- Buy first tech node: Metallurgy? Sawmill Blueprint? Masonry? **First real strategic decision.**
- Tier 1 unit upgrades available — Pack Hunting for wolves, Shield Wall for militia.
- Resources split between: tile expansion, buildings, tier 1 unit upgrades.

### Wave 4-8: Foundation Phase
- ~12-15 claimed tiles. Expansion toward first iron or stone cluster underway.
- Smelter or sawmill comes online depending on tech path.
- First deployment slot upgrade (4→5) is a big moment — one more body on the field.
- Military buildings producing 1 unit/wave. Army growing to 5-7 units.
- First refined resources flowing. Can start crafting real equipment.
- **Bench starts filling.** Rotate units based on wave composition.
- Tier 1-2 unit upgrades being purchased. Army starts having character.
- **Grid tension real:** every tile claimed is wood+stone not spent on upgrades.

### Wave 9-15: Identity Phase
- ~18-22 claimed tiles. Reached distant deposits. Multiple resource chains running.
- Boss at wave 10 — +5 BP bonus. Major tech purchase.
- 5-6 deployment slots. 2 reinforcements if invested. Army at 8-12 units, only 6-7 fight.
- Player's resource branch identity is clear: wood/stone/iron focus.
- Tier 2 unit upgrades (need Advanced Construction) are the power spike.
- Equipment tiers climbing: bronze → iron → steel if forging path pursued.
- **Wave preview matters.** Swap bench units to counter enemy composition.
- Base is a living system. Expansion slowing — most key tiles claimed.

### Wave 16-25: Mastery Phase
- ~25-30 claimed tiles. Most of the useful map is owned.
- 6-7 deployment slots if heavily invested.
- Tier 3 unit upgrades (need Master Construction) are build-defining.
- Mithril equipment for iron-path players.
- Resources shift from expansion to upgrades and equipment. All sinks competing.
- **Hard choices every wave.** Upgrade this unit type or craft equipment? Buy a deploy slot or a forge upgrade?

### Wave 26-30: Endgame
- Boss at 30 is the "final" challenge.
- Players have ~50% of tree at best. Build identity is locked in.
- Tier 3 upgrades, high-tier equipment, 7-8 deployment slots = peak army.
- Every BP and resource matters. No waste.

### Wave 30+: Infinite Scaling
- Enemies scale. Modifiers stack.
- Player has reached peak tech — no more meaningful purchases.
- Survival depends on roster management, positioning, and upgrade choices already made.
- How far can your build go?

---

## Open Questions

### Resolved
- [x] ~~Sawmill: separate building or upgrade?~~ **Separate building.**
- [x] ~~Card rewards raw vs refined?~~ **Rarity determines: common/rare = raw, epic/legendary = refined.**
- [x] ~~Unit training cost?~~ **Free from buildings. Building IS the investment.**
- [x] ~~Tech tree or shop?~~ **Fixed tree, visible from wave 1.**
- [x] ~~Tech currency?~~ **All BP.**
- [x] ~~Map expansion tech?~~ **Removed. Expansion is per-tile resource purchase (wood only).**
- [x] ~~Arena width tech?~~ **Removed. Arena width is fixed.**
- [x] ~~Generic stat buffs?~~ **Removed from tech. Unit-specific upgrades instead.**
- [x] ~~Building upgrade auto-selects unit?~~ **Yes, auto-selects new tier. Player can switch.**
- [x] ~~Smelter adjacency?~~ **Adjacency bonus only.** Works anywhere, +throughput when next to iron mine.
- [x] ~~Blacksmith adjacency?~~ **Direct from stockpile.** No spatial requirement.
- [x] ~~Tile purchase limit?~~ **Unlimited per wave.** Resources are the only gate.
- [x] ~~Unit upgrades retroactive?~~ **Yes.** All current + future units of that type.
- [x] ~~Deposits deplete?~~ **No.** Permanent. Expansion + processing already keeps base active.
- [x] ~~Peasant upgrades?~~ **None.** Peasants are starter fodder, meant to be replaced.
- [x] ~~Starting deposit guarantee?~~ **Yes.** Always 1 wood deposit within radius 1-2.
- [x] ~~Tile cost?~~ **Wood only.** 2 wood for rings 2-3, 3 wood for rings 4-5.
- [x] ~~Mountain density?~~ **Medium (8-12).** Meaningful routing, not a maze.
- [x] ~~Terrain-restricted tiles?~~ **Restricted but buildable.** Forest = wood buildings, rock = stone buildings.
- [x] ~~Relics?~~ **Keep as boss-wave card rewards.** Update effects to fit new systems.

### Still Open (Playtesting / Future)
- [ ] Exact resource production rates / processing throughput
- [ ] Relic effect redesign (what specific effects fit the new systems?)
- [ ] Visual design: tech tree UI, unit upgrade UI, tile purchase UI, grid ownership display
- [ ] Equipment crafting costs with new resource tiers (raw vs refined costs?)
- [ ] Balance: BP income (3/win, 1/loss) — does it feel right over 30 waves?
- [ ] Balance: deployment slots base 4 — too many? too few?
- [ ] Balance: 1 unit/building/wave production rate — too fast? too slow?
