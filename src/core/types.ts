// ── Resource System ──

export type ResourceType = 'wood' | 'stone' | 'iron' | 'planks' | 'cut_stone' | 'iron_bars';

export type Resources = Record<ResourceType, number>;

// ── Hex Grid ──

/** Cube coordinates for hex grid (q + r + s = 0) */
export interface HexCoord {
  q: number;
  r: number;
  s: number;
}

export type TerrainType = 'grass' | 'forest' | 'rock' | 'mountain';

export type DepositType = 'wood' | 'stone' | 'iron';

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  deposit: DepositType | null;
  buildingId: string | null;
  claimed: boolean;
}

export interface HexGrid {
  tiles: Map<string, HexTile>; // key = "q,r,s"
  radius: number;
}

// ── Buildings ──

export type BuildingType =
  | 'camp'
  | 'lumber_mill'
  | 'quarry'
  | 'iron_mine'
  | 'barracks'
  | 'archery_range'
  | 'blacksmith'
  | 'kennel'
  | 'guardhouse'
  | 'sawmill'
  | 'smelter';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  cost: Partial<Resources>;
  /** Which deposit type this building must be adjacent to (null = no requirement) */
  requiredDeposit: DepositType | null;
  /** Resource this building produces per tick (null = non-resource building) */
  produces: ResourceType | null;
  productionRate: number;
  /** Resources consumed per production tick (for refinement buildings like sawmill/smelter) */
  consumes?: Partial<Resources>;
  /** Maximum upgrade level for this building (if different from global default) */
  maxLevel?: number;
  /** Description of the building's function */
  description?: string;
  /** Passive income granted each build phase (e.g. camp gives free resources) */
  passiveIncome?: Partial<Resources>;
}

export interface Building {
  id: string;
  type: BuildingType;
  coord: HexCoord;
  level: number;
}

// ── Equipment ──

export type EquipmentSlot = 'weapon' | 'armor' | 'shield';

export type EquipmentTier = 'crude' | 'bronze' | 'iron' | 'steel' | 'mithril';

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipmentSlot;
  tier: EquipmentTier;
  craftCost: Partial<Resources>;
  /** Stat modifiers applied to the unit */
  modifiers: Partial<UnitStats>;
  /** Shields can grant extra lives */
  bonusLives?: number;
  /** Armor grants bonus HP as % of the unit's base maxHp (e.g. 0.20 = +20%) */
  hpPercent?: number;
  /** If true, this equipment is bound to a mercenary unit and cannot be unequipped or recovered on death */
  isMercBound?: boolean;
}

// ── Units ──

export type UnitRole = 'fodder' | 'melee' | 'ranged' | 'glass_cannon' | 'tank' | 'animal';

export interface UnitStats {
  hp: number;
  maxHp: number;
  attack: number;
  cooldown: number;
  /** Damage reduction per hit (flat). Default 0. */
  armor: number;
  /** Chance (0.0–1.0) to reduce incoming damage by 40% (before armor). Default 0. */
  glancingChance: number;
}

export interface UnitDef {
  id: string;
  name: string;
  role: UnitRole;
  baseStats: UnitStats;
  baseLives: number;
  /** Whether this unit can equip weapons (humanoids only) */
  canEquipWeapons: boolean;
  /** Whether this unit can equip armor */
  canEquipArmor: boolean;
  trainingCost: Partial<Resources>;
  /** Which building type trains this unit (null = no building required) */
  trainedAt: BuildingType | null;
  /** Whether this is a boss unit */
  isBoss?: boolean;
  /** Minimum building level required to train this unit (default 1) */
  requiredBuildingLevel?: number;
  /** Number of units spawned per building of this type (default 1) */
  spawnCount?: number;
  /** Movement speed in hexes per second */
  moveSpeed: number;
  /** Attack range in hex distance (melee=1, ranged=3) */
  attackRange: number;
}

export interface Unit {
  id: string;
  defId: string;
  stats: UnitStats;
  cooldownTimer: number;
  /** Movement timer — accumulates TICK_DELTA, moves when >= 1/moveSpeed */
  moveTimer: number;
  lives: number;
  maxLives: number;
  equipment: Partial<Record<EquipmentSlot, EquipmentDef>>;
  /** Current hex position during battle (set when unit is placed on arena) */
  hex?: HexCoord;
  /** Mercenary units (from cards/starter) persist across waves until killed */
  isMercenary?: boolean;
}

// ── Battle ──

export interface BattleState {
  arenaWidth: number;
  arenaDepth: number;
  /** Map from unitId to current hex position */
  unitPositions: Map<string, HexCoord>;
  /** Map from hexKey to unitId */
  hexOccupants: Map<string, string>;
  /** All player units currently on the map */
  playerUnits: Map<string, Unit>;
  /** All enemy units currently on the map */
  enemyUnits: Map<string, Unit>;
  /** Player units waiting to enter (spawn at player rear center) */
  reinforcementQueue: Unit[];
  /** Enemy units waiting to enter (spawn at enemy front center) */
  enemyReinforcementQueue: Unit[];
  /** Max active player units on field at once (= initial deployed count) */
  playerDeploymentSlots: number;
  tick: number;
  result: BattleResult | null;
}

/** Player's pre-battle unit placement choices */
export interface UnitDeployment {
  /** unitId → starting hex (player zone hexes only) */
  placements: Map<string, HexCoord>;
}

export type BattleResult = {
  winner: 'player' | 'enemy';
  /** Surviving enemy units (used to calculate base damage on loss) */
  survivingEnemies: Unit[];
  /** Surviving player units */
  survivingAllies: Unit[];
  bpEarned: number;
};

// ── Waves ──

export interface WaveDef {
  waveNumber: number;
  enemies: { defId: string; count: number }[];
  /** Every 5th wave is elite (tougher enemies, guaranteed Rare+ card) */
  isElite: boolean;
  /** Every 10th wave is a boss wave (boss enemy + entourage, guaranteed Relic) */
  isBoss: boolean;
  /** Optional modifier applied to all enemies in this wave */
  modifier?: WaveModifier;
}

export interface WaveModifier {
  name: string;
  description: string;
  /** Flat stat changes applied to all enemies in the wave */
  statChanges: Partial<UnitStats>;
}

// ── Tech / BP ──

export type TechCategory = 'combat' | 'economy' | 'utility';

export interface TechUpgrade {
  id: string;
  name: string;
  description: string;
  category: TechCategory;
  baseCost: number; // BP cost for tier 1
  maxTier: number;
  /** Effect applied when purchased */
  effect: TechEffect;
}

export type TechEffect =
  | { type: 'stat_boost'; stat: keyof UnitStats; value: number }
  | { type: 'gather_rate'; multiplier: number }
  | { type: 'building_cost'; multiplier: number }
  | { type: 'battle_width'; value: number }
  | { type: 'reserve_size'; value: number }
  | { type: 'unit_lives'; value: number }
  | { type: 'card_rarity_boost'; value: number }
  | { type: 'extra_card_choice'; value: number }
  | { type: 'expand_map' }
  | { type: 'building_upgrade_unlock'; value: number }
  | { type: 'deployment_slot'; value: number }
  | { type: 'reinforcement_slot'; value: number }
  | { type: 'special'; id: string };

// ── Tech Tree (branching) ──

export type TechBranch = 'wood' | 'stone' | 'iron' | 'tactical';

export interface TechNode {
  id: string;
  name: string;
  description: string;
  branch: TechBranch;
  cost: number;
  prereqIds: string[];
  effect: TechEffect;
}

// ── Cards / Rewards ──

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardType = 'resources' | 'unit' | 'bp_bonus' | 'equipment' | 'relic'
  | 'stat_buff' | 'building_upgrade' | 'tech_node';

export interface Card {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  type: CardType;
  effect: CardEffect;
}

export type CardEffect =
  | { type: 'grant_resources'; resources: Partial<Resources> }
  | { type: 'grant_unit'; unitDefId: string }
  | { type: 'grant_bp'; amount: number }
  | { type: 'grant_equipment'; equipmentId: string }
  | { type: 'grant_relic'; relicId: string }
  | { type: 'free_building_upgrade' }
  | { type: 'free_tech_node' }
  | { type: 'stat_buff_single_unit'; stat: 'attack' | 'maxHp' | 'glancingChance'; value: number }
  | { type: 'stat_buff_role'; role: UnitRole; stat: 'attack' | 'maxHp'; value: number };

// ── Relics ──

export interface Relic {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  effect: RelicEffect;
}

export type RelicEffect =
  | { type: 'unit_lives_bonus'; value: number }
  | { type: 'gather_rate_bonus'; multiplier: number }
  | { type: 'new_unit_armor'; equipmentId: string }
  | { type: 'battle_width_bonus'; value: number }
  | { type: 'post_battle_resources'; resources: Partial<Resources> };

// ── Starter Kits ──

export interface StarterKit {
  id: string;
  name: string;
  description: string;
  unitDefId: string;
  buildingType: BuildingType;
  startingResources: Partial<Resources>;
}

// ── Input State ──

export interface InputState {
  hoveredHex: HexCoord | null;
  selectedHex: HexCoord | null;
  /** Building type selected for placement (null = not in placement mode) */
  placingBuilding: string | null;
  lastMouseX: number;
  lastMouseY: number;
  isPanning: boolean;
}

// ── Game Phase ──

export type GamePhase = 'start' | 'build' | 'battle' | 'reward' | 'game_over';

// ── Game State ──

export interface GameState {
  phase: GamePhase;
  wave: number;
  resources: Resources;
  bp: number;
  baseHp: number;
  maxBaseHp: number;

  grid: HexGrid;
  buildings: Map<string, Building>;
  /** Set of hex keys ("q,r,s") for tiles claimed by the player */
  claimedTiles: Set<string>;

  /** All units the player owns (alive) */
  roster: Map<string, Unit>;
  /** Units assigned to fight in the next battle */
  battleRoster: string[];
  /** Units in the reinforcement queue (ordered) */
  reinforcements: string[];
  /** Units on the bench (not in battle or reinforcements) */
  bench: string[];

  /** Purchased tech upgrades: tech ID → current tier (1-based) */
  purchasedTech: Map<string, number>;
  /** Collected relics */
  activeRelics: string[];

  /** Current battle state (only during battle phase) */
  battle: BattleState | null;

  /** Current card choices (only during reward phase) */
  cardChoices: Card[] | null;

  /** Tech shop offerings (refreshed each reward phase) */
  techShop: TechNode[] | null;

  /** Consecutive losses (for pity system) */
  lossStreak: number;

  /** Crafted equipment not yet assigned to a unit */
  equipmentInventory: EquipmentDef[];
  /** Current max tier the blacksmith can craft */
  blacksmithTier: EquipmentTier;

  /** Cumulative bonuses from tech upgrades */
  gatherRateMultiplier: number;
  buildingCostMultiplier: number;
  battleWidthBonus: number;
  /** Max units that can be deployed on the field at battle start */
  deploymentSlots: number;
  reinforcementQueueSize: number;
  cardRarityBoost: number;
  extraCardChoices: number;

  /** Cumulative stat bonuses applied to new units */
  techStatBonuses: Partial<UnitStats>;
  techLivesBonus: number;

  /** Max building level unlocked (1 = no upgrades, 2+ via tech) */
  buildingUpgradeUnlocked: number;

  /** Upcoming wave definition (for wave preview) */
  currentWaveDef: WaveDef | null;

  /** Remembered deployment positions keyed by unit ID (persists between waves) */
  savedDeployment: Map<string, HexCoord>;

  /** When true, the next tech purchase costs 0 BP (from Breakthrough card) */
  freeTechPending: boolean;

  /** Pending single-unit stat buff waiting for unit selection */
  pendingStatBuff: { stat: 'attack' | 'maxHp' | 'glancingChance'; value: number } | null;
}
