# Design Inconsistencies & Issues

Issues found during review of DESIGN.md. Each needs a decision to resolve.

---

## Critical Issues

### 1. Starter Kit Resource Gaps
**Problem**: Several starter kits give NO stone, but almost every building requires stone.
- "Frontier Kit" gives 8W 5I — cannot build any resource building (Lumber Mill = 4W 3S, Quarry = 3W 4S, Iron Mine = 4W 4S). Stuck.
- "Beastmaster Kit" gives 12W — no stone, no iron. Can only build another Kennel (6W) or train wolves (5W). Cannot build ANY resource building. Dead end.
- Player has no income source and no way to build one. Entirely reliant on card rewards for missing resource types.

**Needs**: Either all kits give some of each resource type, kits include a starting resource building, or there's another way to bootstrap resources.

### 2. Peasant Training Has No Limit
**Problem**: Training rule says "1 unit per building per build phase." Peasants require no building. So how many peasants can be trained per phase? Unlimited? If so, peasant spam could be a degenerate strategy (dump all resources into 2W 1S fodder). If not, what's the cap?

**Needs**: Define peasant training cap per phase (e.g. 1 per phase? unlimited? capped at bench space?).

### 3. Wave 10/20/30 Are Both Elite AND Boss
**Problem**: Elite = every 5th wave, Boss = every 10th wave. Wave 10 is both. The doc doesn't say which takes priority or if they stack.
- Does wave 10 get elite rewards (Rare+ card) AND boss rewards (Relic card)?
- Does the tech shop reset happen (elite feature)?
- Is it just treated as a boss wave?

**Needs**: Explicit rule for when elite and boss waves overlap.

### 4. Reinforcement Queue Only Fills Frontline — Ranged Has No Backup
**Problem**: Reinforcements "auto-deploy into empty frontline slots when a unit dies." If a ranged unit in the ranged row dies, there's no reinforcement mechanism. Ranged units that die in battle are just gone.
- Is this intentional? It means ranged units are higher risk than melee (no replacement mid-battle).
- Can reinforcement queue hold ranged units? If so, do they deploy to the ranged row?
- Or is the queue strictly melee-only?

**Needs**: Clarify if reinforcements serve ranged row, or if ranged has no mid-battle replacement (and if that's intentional).

---

## Contradictions

### 5. Blacksmith vs Building Upgrade System Overlap
**Problem**: Two separate upgrade systems coexist and it's unclear how they interact:
- **General building upgrades**: Gated by BP tech ("Building Upgrade Unlock Lv2/Lv3"), then costs resources. 3 levels.
- **Blacksmith tier upgrades**: Paid directly with resources (iron + stone, doubling cost). 5 tiers (Crude→Mithril). NOT gated by BP tech.

Is the blacksmith fully excluded from the general building upgrade system? The building upgrade table says yes ("Uses own tier system"). But this means:
- BP "Building Upgrade Unlock Lv2" doesn't apply to blacksmith at all
- Blacksmith can be upgraded at any time without tech gating
- Blacksmith has 5 tiers while everything else has 3 levels

This feels like two unrelated systems that should be reconciled or explicitly separated.

### 6. "Utility Buildings" Referenced But Don't Exist
**Problem**: "What Resources Pay For" lists "Buildings (resource buildings, military buildings, utility buildings)" but the building table has NO utility buildings. Only resource, military, and blacksmith. Either:
- Remove the "utility buildings" reference, OR
- Define what utility buildings are (walls? watchtowers? storage?)

### 7. Enemy Wolf vs Player Wolf — Same Name
**Problem**: Player unit "Wolf" and Early Era enemy "Wolf" share the same name. In wave preview and battle, this could confuse players ("is that my wolf or the enemy wolf?").

**Needs**: Rename one (e.g. enemy "Wild Wolf" or "Dire Wolf" vs player "War Wolf" or just "Wolf").

---

## Ambiguities

### 8. When Does Resource Income Arrive?
**Problem**: Resources come "per build phase" but the timing isn't defined.
- Does income arrive at the START of the build phase (before you spend)?
- Or at the END (after you press Ready)?
- First build phase of the run: you have no resource buildings yet, so no income regardless. But from phase 2 onward, timing matters for planning.

**Needs**: Define when income is collected (start of phase is most intuitive).

### 9. What Replaces a Purchased Tech Shop Slot?
**Problem**: "Purchased upgrades are replaced with new random ones." But:
- Does the replacement come from the full upgrade pool?
- Can the next tier of the upgrade you just bought appear as the replacement?
- Can the same upgrade appear in multiple slots?
- Can upgrades you've already maxed out still appear?

**Needs**: Define shop replacement rules.

### 10. Building Upgrade Unlock Lv3 — Does It Require Lv2?
**Problem**: Utility Tech lists "Building Upgrade Unlock Lv2" and "Building Upgrade Unlock Lv3" as separate purchases. Can a player buy Lv3 without first buying Lv2? Or is Lv2 a prerequisite?

**Needs**: Define if these are sequential requirements.

### 11. Starter Kit Building — Pre-placed or Must Be Built?
**Problem**: "Each kit includes: 1 unit + 1 basic building + small resource bundle." Is the building:
- Given as a free, already-placed building on the map? (Player just starts with it)
- Given as a building token the player places during first build phase?
- Something the player must build from their starting resources?

The phrasing "includes" suggests it's given free, but placement still needs to happen.

### 12. First Build Phase Flow
**Problem**: Turn 1 of a run isn't fully defined:
1. Player picks starter kit
2. Player enters build phase with kit contents
3. Wave 1 preview is visible
4. Player has no resource buildings → no income
5. Player must place their kit building, possibly build a resource building, train a unit

But can they do ALL of this in one phase? Place kit building + build a resource building + train a unit? That's a lot of resources to spend with just the kit bundle.

**Needs**: Define whether the kit building costs resources to place or is free to place.

---

## Balance Concerns

### 13. Salvage vs War Spoils — Nearly Identical
**Problem**: Both Economy Tech upgrades reward combat performance with resources:
- "Salvage" — gain resources from enemy kills in battle
- "War Spoils" — bonus resources after battle based on kills

The difference is timing (during vs after battle) but the player effect is the same: kill enemies → get resources. Having both feels redundant and may confuse players.

**Needs**: Differentiate more clearly, merge them, or replace one.

### 14. Relics Overlap With Tech Upgrades
**Problem**: Several relics duplicate tech effects:
- Relic "Wide Formation" (+1 battle width) = Tech "Battle Width +"
- Relic "War Economy" (+15% gather rate) = Tech "Gather Rate +"

These can stack, which is fine, but:
- Does "Wide Formation" relic count as a battle width tier for tech purposes?
- Are they fully independent stacking systems?
- Could a player feel cheated getting a relic that duplicates tech they already bought?

**Needs**: Define stacking rules and whether relics interact with tech tiers.

### 15. Iron Economy Is Extremely Tight
**Problem**: Iron is rare (1 starting deposit = 3I/phase). But iron demands are heavy:
- Archer training: 3I each
- Archery Range: 4I to build
- Blacksmith: 5I to build
- All equipment crafting: iron
- Blacksmith upgrades: 20I, 40I, 80I, 160I (doubling)
- Iron Mine: 4I to build (need iron to get iron?)

Building an Iron Mine costs 4W 4I. But you need an iron deposit to place it next to, and you start with only 1 iron deposit producing 3I/phase. To build an Iron Mine next to it, you need 4I — takes 2 phases of saving, and then both the mine and the blacksmith want the same deposit. This is very tight.

**Needs**: Review if early iron economy is viable, especially for non-Frontier kits that start with 0 iron.

### 16. Base HP (100) vs Damage Per Enemy (5) — Late Game Scaling
**Problem**: At 100 base HP and 5 damage per surviving enemy, you can only absorb 20 surviving enemies total across all losses. Early waves have ~3-5 enemies, so a loss might cost 15-25 HP. By wave 20+, waves could have 15-20 enemies — one bad loss could be instant death even without a boss.

Is this intentional? It makes late-game losses almost as lethal as boss survival. The 100 HP effectively allows only 1-2 late-game losses before game over.

**Needs**: Confirm this is the intended difficulty curve, or consider if base HP should scale or if damage should be capped per battle.

---

## Minor Issues

### 17. Bench Slot Counting Could Get Confusing
**Problem**: Bench slots come from multiple sources:
- Base: 2 slots
- Per military building: +2 (at lv1)
- Per military building upgrade: +2 per level (lv2 = +2 more, lv3 = +2 more)

A lv3 barracks provides 2 + 2 + 2 = 6 bench slots alone. With 4 military buildings all at lv3, that's 4 * 6 + 2 base = 26 bench slots. Is this intended? Could get cluttered.

### 18. Speed as a Stat Is Undefined
**Problem**: Unit speed is listed as "Normal" or "Fast" but there's no definition of what these mean mechanically. Is it attack speed? Movement speed? Both? How much faster is "Fast"?

### 19. Equipment Crafting Cost Not Defined
**Problem**: Blacksmith tier upgrades have defined costs (20I+10S, 40I+20S, etc.) but the cost of crafting individual equipment pieces (weapons, armor, shields) is never specified. How much iron does a Bronze Sword cost to craft?

### 20. Resource Building Upgrade Output Values Not Defined
**Problem**: Resource building upgrades give "+output bonus" at lv2 and "+further output bonus" at lv3, but no numbers are given. How much extra does a lv2 Lumber Mill produce? This feeds into overall economy balance.
