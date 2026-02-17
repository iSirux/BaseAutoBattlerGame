# Code ↔ Design Alignment — Prioritized Fix List

Ordered by impact on gameplay correctness and design alignment. Each item references DESIGN_VS_CODE.md for details.

---

## P0 — Bugs / Broken Mechanics

Must fix. These cause incorrect behavior in the current game.

- [ ] **Fix enemy multi-life bug** (#21) — Enemy units with lives > 1 (bosses) don't decrement lives on death. They die in one HP bar instead of respawning. Bosses are drastically easier than intended.
- [ ] **Fix Militia Kit giving Swordsman** (#12) — Starter kit says "Militia" but gives a Swordsman. Either rename the kit or change the unit.

---

## P1 — Core Identity Alignment

These define what the game IS. Without them, the game plays as a different game than designed.

- [ ] **Align unit roster to design** (#1, #2, #3) — Replace code roster with design's 5 base units: Peasant (fodder), Militia (melee), Archer (ranged), Guard (tank), Wolf (animal). Remove Swordsman, Spearman, Berserker, Bear from base roster (they can become meta-unlock units later). Set stats to design values.
- [ ] **Add Guardhouse building** (#5) — New military building that trains Guard units. Add to building defs.
- [ ] **Add Defender Kit** (#13) — Fourth starter kit: Guard + Guardhouse + 5W 10S.
- [ ] **Align building costs to design** (#6) — Adjust all building costs to match design doc values (currently ~5x too high).
- [ ] **Align unit training costs to design** (#7) — Adjust training costs to match design doc (currently 2-4x too high, wrong resource types).
- [ ] **Align starting resources to design** (#10) — Scale down starter kit resources to match design values.
- [ ] **Align resource production rates** (#8) — All resource buildings produce 3/phase base. Currently Lumber=5, Quarry=4, Mine=3.
- [ ] **Align adjacency bonus** (#9) — Change from +50% multiplicative to +1 flat per extra deposit.
- [ ] **Implement base damage formula** (#19) — Change from sum-of-attack to flat 5 damage per surviving enemy. Add boss-survives-instant-kill.

---

## P2 — Missing Core Mechanics

Gameplay systems that the design relies on but don't exist in code yet.

- [ ] **Add Peasant building-free training** (#26) — Peasants trainable without any building. Needs a training cap per phase (design open question — suggest 1 per phase or unlimited with bench cap).
- [ ] **Add 1-per-building training limit** (#30) — Each military building can only train 1 unit per build phase. Track which buildings have trained this phase.
- [ ] **Add bench size limit** (#29) — Bench capacity = 2 base + 2 per military building (+ 2 per building upgrade level). Enforce in `moveUnitToBench`.
- [ ] **Add unit selling** (#28) — Sell units for 50% of training cost × (current lives / max lives). Return resources, remove unit.
- [ ] **Add ranged row cap** (#35) — Cap ranged units in battle to battle width. Excess ranged go to reinforcements or bench.
- [ ] **Implement auto-equip** — Design says new units auto-equip best available gear. Not in code.

---

## P3 — Tech System Overhaul

Significant rework. Can be done incrementally.

- [ ] **Implement tiered tech upgrades** (#22) — Replace one-time-purchase system with tiered upgrades. Each upgrade has multiple tiers at escalating cost (5/10/20 BP). Same upgrade can appear again at next tier after purchase.
- [ ] **Add missing combat tech** (#22) — Per-unit-type buffs (Melee Damage, Ranged Damage, Tank HP, Animal Speed), defensive (Armor +, Shield Block Chance +), positional (Frontline Fortitude, Ranged Precision, Reinforcement Rally).
- [ ] **Add missing economy tech** (#22) — Salvage, Double Harvest, War Spoils, Prospector, Recycler, Efficient Construction.
- [ ] **Add missing utility tech** (#22) — Map Expansion, Building Upgrade Unlock Lv2, Building Upgrade Unlock Lv3.
- [ ] **Fix tech shop refresh timing** (#23) — Reset on elite waves (every 5th wave), not the wave after. Currently triggers on waves 1, 6, 11... should be 5, 10, 15...

---

## P4 — Building Upgrades & Map Expansion

Adds strategic depth. Depends on P3 utility tech (Building Upgrade Unlock, Map Expansion).

- [ ] **Implement building upgrade system** (#27) — 3 levels per building. Gated by BP tech unlock. Costs 2x build cost per level. Resource buildings get +output, military buildings unlock new unit types + 2 bench slots per level.
- [ ] **Implement map expansion** (#24, #25) — Start at radius 4 (not 6). Add Utility tech "Map Expansion" with escalating BP cost (5, 10, 20, 40, 80...). Each purchase adds +1 hex ring. Reveal new deposits on expansion.
- [ ] **Fix iron deposit distribution** (#11) — Guarantee 1 iron deposit in starting area. Adjust deposit rarity: wood most common, stone medium, iron rare.

---

## P5 — Enemy & Wave Content

Adds variety. Can be done in passes.

- [ ] **Add missing Early era enemies** (#15) — Bandit (melee), enemy Wolf (fast), Bandit Archer (ranged). Rename existing Goblin to keep. Use these for waves 1-9.
- [ ] **Add Mid era enemies** (#15) — Skeleton (fodder), Dark Archer (ranged). Orc Warrior and Troll already exist. Fix Troll to tank role (#16).
- [ ] **Add Late era enemies** (#15) — Dark Knight (tank), Demon Imp (fast swarm), Warlock (ranged), Siege Golem (mega tank).
- [ ] **Fix Troll role** (#16) — Change from glass_cannon to tank. Increase HP, lower ATK.
- [ ] **Rework wave generation to match era system** (#18) — Distinct Early/Mid/Late/Endless era transitions with themed templates per era.
- [ ] **Add wave modifiers for Endless era** (#17) — Implement Enraged, Armored, Swarming, Hastened, Resilient modifiers for waves 30+.
- [ ] **Rename enemy Wolf** — Avoid confusion with player Wolf unit. Use "Wild Wolf" or "Dire Wolf".

---

## P6 — Meta & Persistence

Important for retention but game is playable without these.

- [ ] **Add save/load system** (#31) — Auto-save at start of each build phase. One active save slot. Meta-progression saved separately.
- [ ] **Add meta-progression** (#32) — Legacy points (1 per wave + 5 per boss killed). Unlock shop with categorized tabs (Kits, Relics, Units, Buildings) and tiered progression within each category.
- [ ] **Add end screen** (#34) — Stats summary (wave reached, units trained, enemies killed, buildings built, relics collected), score (wave count), legacy points earned, meta unlocks.
- [ ] **Add onboarding checklist** (#33) — Dismissable panel each run: Place building, Gather resources, Train unit, Equip unit, Start battle. Checks off as completed.

---

## Execution Notes

- **P0 + P1 should be done together** as a single alignment pass. Changing stats/costs piecemeal will break balance mid-way.
- **P2 can be done incrementally** — each mechanic is independent.
- **P3 is the biggest rework** — consider doing the tiered upgrade structure first, then adding upgrades in batches.
- **P4 depends on P3** — Building Upgrade Unlock and Map Expansion are utility tech items.
- **P5 is pure content** — can be added anytime without breaking existing systems.
- **P6 is independent** — save system and meta can be built in parallel with other work.
- **Swordsman, Spearman, Berserker, Bear** can be preserved as future meta-unlock units (building lv2/lv3 unlocks). Don't delete the code — move to a separate unlockable pool.
