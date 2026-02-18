# Design Doc vs Codebase - Inconsistencies

Comparison of DESIGN.md against actual implementation. Each item notes the design intent and what the code actually does.

---

## Unit Roster Mismatches

### 1. Unit roster — design and code now aligned
**Design & Code**: 5 base units (Peasant, Militia, Archer, Guard, Wolf) + 8 unlockable units (Swordsman, Champion, Crossbowman, Sharpshooter, Sentinel, Warden, Dire Wolf, Alpha Wolf).

Each military building has a full 3-tier track:
- Barracks: Militia → Swordsman → Champion (offensive melee)
- Archery Range: Archer → Crossbowman → Sharpshooter (ranged DPS)
- Guardhouse: Guard → Sentinel → Warden (defensive tank)
- Kennel: Wolf → Dire Wolf → Alpha Wolf (fast swarm)

### 2. Militia role mismatch
**Design**: Militia is the **melee fighter** role (8 HP, 4 ATK, 2 lives)
**Code**: Militia is labeled **fodder** role (15 HP, 4 ATK, 1 life)

### 3. Unit stat values diverge significantly
| Unit | Design | Code |
|------|--------|------|
| Militia HP | 8 | 15 |
| Militia Lives | 2 | 1 |
| Archer HP | 6 | 18 |
| Archer ATK | 3 | 10 |
| Wolf HP | 8 | 22 |
| Wolf ATK | 3 | 9 |
| Wolf Lives | 2 | 1 |

Code stats are roughly 2-3x higher across the board.

### 4. Wolf equipment — code blocks shields, design says armor only
**Design**: Wolf can wear armor only (no weapons, no shields)
**Code**: `canEquipWeapons: false, canEquipArmor: true` — shields use the `canEquipWeapons` check (`if (def.slot === 'shield' && !unitDef.canEquipWeapons) return false`), so wolf can't equip shields. This matches design intent but through a non-obvious mechanism.

---

## Building Mismatches

### 5. Guardhouse building missing from code
**Design**: Guardhouse building (trains Guard units, 3W 8S cost)
**Code**: No guardhouse. Only 7 buildings: Lumber Mill, Quarry, Iron Mine, Barracks, Archery Range, Blacksmith, Kennel.

### 6. Building costs differ significantly
| Building | Design Cost | Code Cost |
|----------|------------|-----------|
| Lumber Mill | 4W 3S | 20W 10S |
| Quarry | 3W 4S | 20W 10S |
| Iron Mine | 4W 4S | 20W 10S |
| Barracks | 6W 4S | 30W 20S |
| Archery Range | 5W 4I | 25W 15I |
| Blacksmith | 5S 5I | 25S 15I |
| Kennel | 6W | 25W |

Code costs are roughly **5x higher** than design.

### 7. Unit training costs differ
| Unit | Design Cost | Code Cost |
|------|------------|-----------|
| Militia | 6W 3S | 10W |
| Archer | 4W 3I | 15W 10I |
| Wolf | 5W | 20W |

Code costs are 2-4x higher and use different resource types (Militia costs no stone in code).

---

## Resource & Economy Mismatches

### 8. Resource production rates differ
**Design**: All resource buildings produce **3 per phase** base rate
**Code**: Lumber Mill = **5**/phase, Quarry = **4**/phase, Iron Mine = **3**/phase

### 9. Adjacency bonus formula differs
**Design**: +1 flat per additional matching deposit
**Code**: +50% per additional deposit (multiplicative with gather rate multiplier)

### 10. Starting resources differ
| Kit | Design | Code |
|-----|--------|------|
| Militia | 10W 5S | 60W 40S 10I |
| Frontier | 8W 5I | 50W 20S 30I |
| Beastmaster | 12W | 80W 30S 0I |

Code values are ~6-8x higher. Makes sense given that building costs are also 5x higher.

### 11. Iron deposit distribution
**Design**: Iron rare, 1 deposit guaranteed in starting area
**Code**: 2 iron clusters of size 1 each, randomly placed at distance >2 from center. No guarantee one is in starting area — center area deposits are cleared.

---

## Starter Kit Mismatches

### 12. Militia Kit gives Swordsman, not Militia
**Design**: "Militia Kit" gives a Militia unit
**Code**: `unitDefId: 'swordsman'` — gives a Swordsman instead

### 13. Defender Kit missing from code
**Design**: 4 starter kits (Militia, Frontier, Beastmaster, Defender)
**Code**: Only 3 kits (Militia, Frontier, Beastmaster). No Defender Kit with Guard + Guardhouse.

### 14. Starter kit building placement
**Design**: ambiguous on whether kit building is pre-placed or must be built
**Code**: Building is **placed free at center tile (0,0)**. Clear and working.

---

## Enemy Roster Mismatches

### 15. Enemy types don't match design eras
**Design** defines enemies by era:
- Early (1-9): Bandit, Wolf, Goblin, Bandit Archer
- Mid (10-19): Orc Warrior, Skeleton, Dark Archer, Troll
- Late (20-29): Dark Knight, Demon Imp, Warlock, Siege Golem

**Code** has only 5 enemy types + 3 bosses:
- Goblin (fodder), Orc Warrior (melee), Orc Brute (tank), Goblin Archer (ranged), Troll (glass_cannon)
- Bosses: Goblin King, Orc Warlord, Troll Chieftain

**Missing from code**: Bandit, Wolf (enemy), Bandit Archer, Skeleton, Dark Archer, Dark Knight, Demon Imp, Warlock, Siege Golem

### 16. Troll role mismatch
**Design**: Troll is a **tank** ("Massive HP pool. Holds the line for ranged.")
**Code**: Troll is **glass_cannon** (40 HP, 14 ATK, 3 SPD)

### 17. No wave modifiers in code
**Design**: Endless era (30+) applies random modifiers (Enraged, Armored, Swarming, Hastened, Resilient)
**Code**: Waves 30+ just cycle through bosses with scaled entourage counts. No modifier system exists.

### 18. Wave era boundaries differ
**Design**: Clear era tiers (1-9 early, 10-19 mid, 20-29 late, 30+ endless)
**Code**: Waves 1-3 goblins, 4-6 mixed, 7-9 orc heavy, 10+ late mix. No distinct mid/late era transition.

---

## Battle Mechanics Mismatches

### 19. Base damage formula differs
**Design**: **5 flat damage per surviving enemy**, boss survival = instant game over
**Code**: Damage = **sum of surviving enemies' attack stats** (`result.survivingEnemies.reduce((sum, e) => sum + e.stats.attack, 0)`)

No boss instant-kill mechanic in code.

### 20. BP formula differs
**Design**: Win = wave × 2, Loss = wave / 2
**Code**: Win = `base * 2`, Loss = `Math.max(1, Math.floor(base / 2))` where base = waveNumber. The loss floor of 1 BP matches design intent ("never zero") but isn't explicitly in the design.

### 21. Enemy lives not decremented on death
**Code** (battle.ts:182-184): When enemy frontline units die, the code sets `livesRemaining: 0` in the sink and immediately nulls the slot, **without checking or decrementing lives**. Player units (line 161) properly do `unit.lives--`. This means enemy multi-life units (bosses with 2-3 lives) don't actually use their lives in combat.

---

## Tech System Mismatches

### 22. Tech upgrade structure differs significantly
**Design**: Tiered upgrades (same upgrade bought multiple times at increasing cost), base cost 5 BP with tier multiplier (5/10/20 BP), 30+ total upgrades across Combat/Economy/Utility with many specific upgrades (per-unit-type buffs, positional bonuses, Salvage, War Spoils, Prospector, etc.)

**Code**: Only 13 flat one-time-purchase upgrades. No tiered system. No per-unit-type buffs. No positional bonuses. No economy tech beyond gather rate and building cost.

Missing from code:
- All per-unit-type buffs (Melee Damage, Ranged Damage, Tank HP, Animal Speed)
- All defensive tech (Armor +, Shield Block Chance +)
- All positional tech (Frontline Fortitude, Ranged Precision, Reinforcement Rally)
- Economy: Salvage, Double Harvest, War Spoils, Prospector, Recycler
- Utility: Map Expansion, Building Upgrade Unlock Lv2/Lv3

### 23. Tech shop refresh timing
**Design**: Shop persists, purchased slots replaced with new random. Full reset every 5 waves aligned with elite waves.
**Code**: Shop resets when `state.wave % 5 === 1` (i.e. waves 1, 6, 11, 16...) which is the wave AFTER the elite, not the elite wave itself. Also tech upgrades are one-time purchases (`purchasedTech` is a Set), not tiered.

---

## Map / Grid Mismatches

### 24. Grid radius differs
**Design**: Starting radius = 4 (~61 tiles), expandable via tech
**Code**: Fixed radius = **6** (~127 tiles), no expansion mechanic

### 25. No map expansion in code
**Design**: Map expands via Utility tech purchases with escalating BP cost
**Code**: Grid is generated once at fixed radius 6. No expansion system exists.

---

## Missing Systems (in design, not in code)

### 26. No Peasant (building-free training)
Design specifies peasants can be trained without any building. No such mechanic exists in code.

### 27. No building upgrade system
Design specifies 3-level building upgrades gated by BP tech. No building levels in code — buildings have no `level` property.

### 28. No unit selling
Design specifies selling units for 50% cost × lives ratio. No sell mechanic in code.

### 29. No bench size limit
Design specifies bench size = 2 base + 2 per military building. Code has no bench limit — `moveUnitToBench` has no capacity check.

### 30. No 1-per-building training limit
Design specifies 1 unit per building per build phase. Code allows unlimited training as long as you have resources and the building type exists.

### 31. No save/load system
Design specifies auto-save each build phase with one save slot. No persistence in code.

### 32. No meta-progression
Design specifies legacy points, unlock shop with categorized tabs and tiered progression. Not implemented.

### 33. No onboarding checklist
Design specifies dismissable onboarding panel each run. Not implemented.

### 34. No end screen / run summary
Design specifies stats summary, score, meta unlocks earned. Not implemented beyond game_over event.

### 35. No ranged row cap
**Design**: Ranged row slots = battle width (same cap as frontline)
**Code**: No cap on ranged units. All ranged units from `battleRoster` go to the ranged array without limit.

---

## Summary

| Category | Count |
|----------|-------|
| Unit mismatches | 4 |
| Building mismatches | 3 |
| Economy/resource mismatches | 4 |
| Starter kit mismatches | 3 |
| Enemy mismatches | 4 |
| Battle mechanics mismatches | 3 |
| Tech system mismatches | 2 |
| Map/grid mismatches | 2 |
| Missing systems | 10 |
| **Total** | **35** |

Most discrepancies suggest the codebase was built independently (or before) the design doc, with the design doc representing the intended target state. The code is functional and playable but needs alignment with the design decisions.
