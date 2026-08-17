// ================= 宠物乐园 state 类型定义 =================

export interface Category {
  code: string;
  name: string;
  type: 'crop' | 'fish' | 'animal' | 'furniture';
  price: number;
  sell_price: number;
  grow_days: number;
  feed_days: number;
  exp: number;
  level_req: number;
  product: string | null;
  prod_price: number;
  satiety: number;
  energy: number;
  color: string;
  icon?: string;
  [key: string]: unknown;
}

export interface Plot {
  id: number;
  crop: string | null;
  plantedDay: number;
  lastWaterDay: number;
  grownDays: number;
}

export interface Fish {
  id: number;
  type: string | null;
  stockedDay: number;
  lastFeedDay: number;
  grownDays: number;
}

export interface Stall {
  id: number;
  type: string | null;
  stockedDay: number;
  lastFeedDay: number;
  grownDays: number;
  productReady: boolean;
  lastProductDay: number;
}

export interface LayoutSpot { x: number; z: number; }

export interface GameState {
  gameDays: number;
  weather: 'sunny' | 'rain';
  coins: number;
  pet: {
    name: string;
    stage: number;
    level: number;
    exp: number;
    satiety: number;
    mood: number;
    energy: number;
    sick: boolean;
    out: boolean;
    pos: string;               // home | farm | pond
    outSince: number;
    targetOverride: { x: number; z: number } | null;
    lastTick: number;
    lastPlayed: number;
    lastWatched: number;
    lastHelp: number;
    foods: Record<string, number>;
    stats: { feed: number; play: number; watch: number; harvest: number; study: number };
  };
  farm: { level: number; plots: Plot[] };
  pond: { level: number; fish: Fish[] };
  ranch: { level: number; stalls: Stall[]; ownedAnimals: string[]; lastEggDay?: string };
  house: { owned: boolean; level: number; furniture: string[] };
  categories: Category[];
  layout: { house: LayoutSpot; farm: LayoutSpot; pond: LayoutSpot };
  study: { earned: number; lastDay: string; learned: string[] };
  dailyClaimDay: string;
  logs: Array<{ t: number; type: string; text: string }>;
}

export interface UserInfo {
  userId: number;
  username: string;
  nickname: string;
  /** 角色：user 普通 / admin 管理员 */
  role?: string;
  /** 积分（users.coins 独立字段，后端权威） */
  coins?: number;
  /** 学历：PRIMARY_1..PRIMARY_6 / JUNIOR_1..JUNIOR_3 / SENIOR_1..SENIOR_3 / UNIVERSITY_1..UNIVERSITY_4 */
  education?: string;
  /** 性别：M 男 / F 女（决定玩家模型 boy/girl） */
  gender?: string;
  token?: string;
}

// 常量
export const GAME_DAY_MS = 60 * 1000;
export const DAY_START_H = 6;
export const NIGHT_START_H = 18;
export const STUDY_DAILY_LIMIT = 30;
export const FARM_PLOTS: Record<number, number> = { 1: 4, 2: 5, 3: 6 };
export const FARM_UP_COST: Record<number, number> = { 2: 100, 3: 250 };
export const POND_SLOTS: Record<number, number> = { 1: 4, 2: 6, 3: 8 };
export const POND_UP_COST: Record<number, number> = { 2: 150, 3: 350 };
export const RANCH_SLOTS: Record<number, number> = { 1: 4, 2: 6, 3: 8 };
export const RANCH_UP_COST: Record<number, number> = { 2: 150, 3: 350 };

// ================= 房屋（进入牧场的前提） =================
/** 房屋升级链：6 级，对应 building_quaternius GLB（已部署到 public/assets/models/houses/） */
export interface HouseTier {
  level: number;
  name: string;
  model: string;        // assets/models/houses/house_tN.glb
  buildCost: number;    // 升到该级所需金币（从 0 级建 1 层 = HOUSE_TIERS[0].buildCost）
}
export const HOUSE_TIERS: HouseTier[] = [
  { level: 1, name: '一层小屋', model: 'assets/models/houses/house_t1.glb', buildCost: 120 },
  { level: 2, name: '二层小楼', model: 'assets/models/houses/house_t2.glb', buildCost: 200 },
  { level: 3, name: '三层小宅', model: 'assets/models/houses/house_t3.glb', buildCost: 320 },
  { level: 4, name: '四层公寓', model: 'assets/models/houses/house_t4.glb', buildCost: 480 },
  { level: 5, name: '阔气四层', model: 'assets/models/houses/house_t5.glb', buildCost: 680 },
  { level: 6, name: '六层高楼', model: 'assets/models/houses/house_t6.glb', buildCost: 900 }
];

// ================= 牧场可购买动物（HY3D 生成的 7 个模型） =================
/** 这 7 个模型即本次需要"在游戏中检查是否可用"的目标资产 */
export interface RanchAnimal {
  code: string;
  name: string;
  model: string;        // assets/models/animals/hy3_xxx_draco.glb
  price: number;
}
export const RANCH_ANIMALS: RanchAnimal[] = [
  { code: 'cat',     name: '猫', model: 'assets/models/animals/hy3_cat_draco.glb',     price: 60 },
  { code: 'dog',     name: '狗', model: 'assets/models/animals/hy3_dog_draco.glb',     price: 80 },
  { code: 'chicken', name: '鸡', model: 'assets/models/animals/hy3_chicken_draco.glb', price: 40 },
  { code: 'duck',    name: '鸭', model: 'assets/models/animals/hy3_duck_draco.glb',    price: 50 },
  { code: 'cow',     name: '牛', model: 'assets/models/animals/hy3_cow_draco.glb',     price: 120 },
  { code: 'sheep',   name: '羊', model: 'assets/models/animals/hy3_sheep_draco.glb',   price: 100 },
  { code: 'fish',    name: '鱼', model: 'assets/models/animals/hy3_fish_draco.glb',    price: 45 }
];

/** 每日签到领取金币（便于体验"购买房屋 / 购买动物"流程） */
export const DAILY_CLAIM_COINS = 300;

// ================= 牧场生命周期模型（幼崽 / 蛋） =================
/** 幼崽模型：code → GLB（已部署到 public/assets/models/lifecycle/）。
 *  拥有对应成年动物后，牧场「幼崽区」展示其幼崽。 */
export const RANCH_BABIES: Record<string, string> = {
  cat:     'assets/models/lifecycle/lifecycle_cat_baby.glb',
  chicken: 'assets/models/lifecycle/lifecycle_chicken_baby.glb',
  cow:     'assets/models/lifecycle/lifecycle_cow_calf.glb',
  dog:     'assets/models/lifecycle/lifecycle_dog_baby.glb',
  duck:    'assets/models/lifecycle/lifecycle_duck_baby.glb',
  fish:    'assets/models/lifecycle/lifecycle_fish_baby.glb',
  goose:   'assets/models/lifecycle/lifecycle_goose_baby.glb',
  pig:     'assets/models/lifecycle/lifecycle_pig_piglet.glb',
  sheep:   'assets/models/lifecycle/lifecycle_sheep_lamb.glb'
};

/** 产蛋模型：会下蛋的动物 code → 蛋 GLB（已部署到 public/assets/models/lifecycle/） */
export const RANCH_EGGS: Record<string, string> = {
  chicken: 'assets/models/lifecycle/lifecycle_chicken_egg_brown.glb',
  duck:    'assets/models/lifecycle/lifecycle_duck_egg.glb',
  goose:   'assets/models/lifecycle/lifecycle_goose_egg.glb'
};

/** 会下蛋的动物种类（用于「产蛋区」与拾蛋玩法） */
export const EGG_LAYERS: string[] = ['chicken', 'duck', 'goose'];

/** 每枚蛋拾取收益（金币） */
export const EGG_COINS = 6;

// ================= 学习题库类型（五科目多题型） =================
export type StudyQType = 'card' | 'choice' | 'fill' | 'qa';

export interface StudyItem {
  id?: number;           // 题目 ID（questions.id，答疑用）
  q?: string;            // 题目（choice/fill/qa）
  a?: string;            // 答案（card 类型无）
  opts?: string[];       // 选项（choice）
  en?: string;           // 单词（card）
  cn?: string;           // 中文（card）
  icon?: string;         // 图标函数名（card）
}

export interface StudyGroup {
  id: string;
  name: string;
  qType: StudyQType;
  items: StudyItem[];
}

export interface StudySubject {
  id: string;
  name: string;
  icon: string;          // 图标函数名
  groups: StudyGroup[];
}

export interface StudySession {
  subjIdx: number;
  groupIdx: number;
  itemIdx: number;
  answered: boolean;
  picked?: string | null;
  fillOk?: boolean;
}
