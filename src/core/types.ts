// ── Resource System ──

export type ResourceType = 'wood' | 'stone' | 'iron';

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
}

export interface HexGrid {
  tiles: Map<string, HexTile>; // key = "q,r,s"
  radius: number;
}

// ── Buildings ──

export type BuildingType =
  | 'lumber_mill'
  | 'quarry'
  | 'iron_mine'
  | 'barracks'
  | 'archery_range'
  | 'blacksmith'
  | 'kennel';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  cost: Partial<Resources>;
  /** Which deposit type this building must be adjacent to (null = no requirement) */
  requiredDeposit: DepositType | null;
  /** Resource this building produces per tick (null = non-resource building) */
  produces: DepositType | null;
  productionRate: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  coord: HexCoord;
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
}

// ── Units ──

export type UnitRole = 'fodder' | 'melee' | 'ranged' | 'glass_cannon' | 'tank' | 'animal';

export interface UnitStats {
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
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
  /** Which building type trains this unit */
  trainedAt: BuildingType;
}

export interface Unit {
  id: string;
  defId: string;
  stats: UnitStats;
  lives: number;
  maxLives: number;
  equipment: Partial<Record<EquipmentSlot, EquipmentDef>>;
}

// ── Battle ──

export interface BattleState {
  frontline: (Unit | null)[];
  ranged: Unit[];
  reinforcementQueue: Unit[];
  enemyFrontline: (Unit | null)[];
  enemyRanged: Unit[];
  battleWidth: number;
  tick: number;
  result: BattleResult | null;
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
}

// ── Tech / BP ──

export type TechCategory = 'combat' | 'economy' | 'utility';

export interface TechUpgrade {
  id: string;
  name: string;
  description: string;
  category: TechCategory;
  cost: number; // BP cost
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
  | { type: 'extra_card_choice'; value: number };

// ── Cards / Rewards ──

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardType = 'resources' | 'unit' | 'bp_bonus' | 'equipment' | 'relic';

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
  | { type: 'grant_relic'; relicId: string };

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
  startingResources: Resources;
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

  /** All units the player owns (alive) */
  roster: Map<string, Unit>;
  /** Units assigned to fight in the next battle */
  battleRoster: string[];
  /** Units in the reinforcement queue (ordered) */
  reinforcements: string[];
  /** Units on the bench (not in battle or reinforcements) */
  bench: string[];

  /** Purchased tech upgrades */
  purchasedTech: Set<string>;
  /** Collected relics */
  activeRelics: string[];

  /** Current battle state (only during battle phase) */
  battle: BattleState | null;

  /** Current card choices (only during reward phase) */
  cardChoices: Card[] | null;

  /** Tech shop offerings (refreshed each reward phase) */
  techShop: TechUpgrade[] | null;

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
  reinforcementQueueSize: number;
  cardRarityBoost: number;
  extraCardChoices: number;

  /** Cumulative stat bonuses applied to new units */
  techStatBonuses: Partial<UnitStats>;
  techLivesBonus: number;
}
