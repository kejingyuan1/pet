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
  ranch: { level: number; stalls: Stall[] };
  house: { furniture: string[] };
  categories: Category[];
  layout: { house: LayoutSpot; farm: LayoutSpot; pond: LayoutSpot };
  study: { earned: number; lastDay: string; learned: string[] };
  logs: Array<{ t: number; type: string; text: string }>;
}

export interface UserInfo {
  userId: number;
  username: string;
  nickname: string;
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

// ================= 学习题库类型（五科目多题型） =================
export type StudyQType = 'card' | 'choice' | 'fill' | 'qa';

export interface StudyItem {
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
