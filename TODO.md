# Base Auto Battler - Implementation Status & TODO

## Current State

**Working core loop:** Build buildings → train units → fight waves → see results → repeat.
Solid foundation with full data definitions, hex grid, battle engine, and responsive UI.

---

## Tier 1 — Unblocks Core Gameplay Loop

- [ ] **Unit Roster Management UI** — No way to assign units to frontline/ranged/reinforcement/bench. All units auto-deploy.
- [ ] **Equipment System** — Equipment defs exist but no crafting at blacksmith, no equipping units. Iron is useless.
- [ ] **Tech Shop UI** — BP accumulates but can't be spent. Tech defs exist, needs shop modal + applying effects.
- [ ] **Card Selection (post-battle rewards)** — Reward phase skipped entirely. Should show pick-1-of-3 modal.

## Tier 2 — Adds Strategic Depth

- [ ] **Building Upgrades** — No upgrade path for buildings (higher-tier units, more output)
- [ ] **Wave Preview** — Enemies not shown during build phase
- [ ] **Battle Visualization** — Battles are instant/hidden
- [ ] **Multi-deposit Adjacency Bonus** — Buildings touching multiple deposits don't get bonus output

## Tier 3 — Polish & Meta

- [ ] **Relic System** — Defs exist, no collection/application
- [ ] **Starter Kit Selection Screen** — Game starts directly, no kit choice
- [ ] **Run End Screen** — Game just stops at game_over
- [ ] **Save/Load & Meta Progression** — No persistence
