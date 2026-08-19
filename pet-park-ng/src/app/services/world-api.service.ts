import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';

/** 统一响应包装（后端 Result<T>） */
export interface ApiResult<T> {
  code: number;
  msg: string;
  data: T;
}

/** 世界配置响应 */
export interface WorldConfigResp {
  seed: string;
  version: number;
  chunkSize: number;
  worldRadius: number;
  spawnGx: number;
  spawnGz: number;
  spawnY: number;
  /** 海平面高度 */
  waterLevel: number;
  viewRadius: number;
  singleRoom: boolean;
  /** 服务端权威岛屿中心（cx/cz 世界坐标，r 半径，单位米）；前端 HY3D 视觉层据此对齐，根除前后端错位 */
  islandCenters?: { cx: number; cz: number; r: number }[];
}

/** chunk 响应 */
export interface ChunkResp {
  cx: number;
  cz: number;
  version: number;
  /** 65×65 顶点高度 */
  height: number[];
  /** 64×64 语义 byte 码 */
  semantic: number[];
  objects: WorldObjectResp[];
}

/** 世界对象（建筑/鱼塘） */
export interface WorldObjectResp {
  id: number;
  type: string;
  gx: number;
  gz: number;
  rot: number;
  owner: { uid: number; nickname: string };
  extJson: any;
  state: number;
}

/** 采矿档案 */
export interface MiningProfile {
  energy: number;
  maxEnergy: number;
  level: number;
  exp: number;
  expToNext: number;
  inventory: InventoryItem[];
}

/** 背包条目 */
export interface InventoryItem {
  type: string;
  name: string;
  qty: number;
  sellPrice: number;
}

/** 售卖结果 */
export interface SellResult {
  earnedCoins: number;
  coins: number;
  inventory: InventoryItem[];
}

/** 采矿结果 */
export interface MineResult {
  oreType: string;
  expGained: number;
  energy: number;
  level: number;
  itemQty: number;
  gx: number;
  gz: number;
  newType: string;
}

/** 鱼塘收获结果 */
export interface HarvestResult {
  /** 是否成熟可收获 */
  ready: boolean;
  /** 成熟时发放的奖励金币 */
  reward: number;
  /** 未成熟时还需等待的毫秒数 */
  remainingMs: number;
  /** 操作后玩家金币余额 */
  coins: number;
}

/** 采集结果（砍树 / 摘野果） */
export interface ForageResult {
  /** 获得木材数量 */
  wood: number;
  /** 获得野果数量 */
  berry: number;
  /** 最新背包（含名称/售价） */
  inventory: InventoryItem[];
}

  /** 牧场收蛋结果（动物产物写入背包） */
  export interface RanchCollectResult {
    /** 实际写入背包的物品类型（egg_chicken / egg_duck / milk） */
    itemType: string;
    /** 物品名称（鸡蛋 / 鸭蛋 / 牛奶） */
    itemName: string;
    /** 本次获得数量 */
    qty: number;
    /** 最新背包（含名称/售价） */
    inventory: InventoryItem[];
  }

  /** 玩家世界位置响应（GET /api/world/position） */
  export interface UserWorldStateResp {
    userId: number;
    gx: number;
    gz: number;
    y: number;
    islandIdx: number;
    variantIdx: number;
    updatedAt: string | null;
  }

  /** 保存位置请求体（uid 由 token 解析，不接受客户端 uid 防越权） */
  export interface SavePositionReq {
    gx: number;
    gz: number;
    y: number;
    islandIdx: number;
    variantIdx: number;
  }

/**
 * 大世界 REST 服务（config / chunk 流式 / build / fish / objects / mining）
 * 统一走 /api/world 前缀，鉴权头由 AuthService 提供。
 */
@Injectable({ providedIn: 'root' })
export class WorldApiService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  /** GET /api/world/config */
  config(): Observable<WorldConfigResp> {
    return this.http.get<ApiResult<WorldConfigResp>>('/api/world/config').pipe(map(r => r.data));
  }

  /** GET /api/world/chunk?cx=&cz= */
  chunk(cx: number, cz: number): Observable<ChunkResp> {
    const params = new HttpParams().set('cx', String(cx)).set('cz', String(cz));
    return this.http.get<ApiResult<ChunkResp>>('/api/world/chunk', { params }).pipe(map(r => r.data));
  }

  /** GET /api/world/objects?cx=&cz= */
  objects(cx: number, cz: number): Observable<WorldObjectResp[]> {
    const params = new HttpParams().set('cx', String(cx)).set('cz', String(cz));
    return this.http.get<ApiResult<WorldObjectResp[]>>('/api/world/objects', { params }).pipe(map(r => r.data || []));
  }

  /** POST /api/world/build 放置建筑（服务端权威校验 + 原子写） */
  build(gx: number, gz: number, objectType: string, rot?: number): Observable<ApiResult<WorldObjectResp>> {
    return this.http.post<ApiResult<WorldObjectResp>>('/api/world/build',
      { gx, gz, objectType, rot }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/world/fish 湖中养鱼 */
  fish(gx: number, gz: number, fishType: string): Observable<ApiResult<WorldObjectResp>> {
    return this.http.post<ApiResult<WorldObjectResp>>('/api/world/fish',
      { gx, gz, fishType }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/world/remove 拆除自己放置的建筑/鱼塘 */
  remove(gx: number, gz: number): Observable<ApiResult<WorldObjectResp>> {
    return this.http.post<ApiResult<WorldObjectResp>>('/api/world/remove',
      { gx, gz }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/world/upgrade 升级自己放置的建筑（等级 +1） */
  upgrade(gx: number, gz: number): Observable<ApiResult<WorldObjectResp>> {
    return this.http.post<ApiResult<WorldObjectResp>>('/api/world/upgrade',
      { gx, gz }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/world/harvest 收获自己成熟的鱼塘（成熟发放金币奖励，并重置周期） */
  harvest(gx: number, gz: number): Observable<ApiResult<HarvestResult>> {
    return this.http.post<ApiResult<HarvestResult>>('/api/world/harvest',
      { gx, gz }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/world/forage 砍树/摘野果（写入背包 world_inventory） */
  forage(gx: number, gz: number): Observable<ApiResult<ForageResult>> {
    return this.http.post<ApiResult<ForageResult>>('/api/world/forage',
      { gx, gz }, { headers: this.auth.authHeaders() });
  }

  /** POST /api/ranch/collect 牧场收蛋/动物产物（写入背包 world_inventory） */
  collectRanchProduct(animalCode: string): Observable<ApiResult<RanchCollectResult>> {
    return this.http.post<ApiResult<RanchCollectResult>>('/api/ranch/collect',
      { animalCode }, { headers: this.auth.authHeaders() });
  }

  /** GET /api/ranch/animals —— 服务端权威的已拥有牧场动物 code 全集（用于进牧场覆盖本地） */
  getOwnedRanchAnimals(): Observable<string[]> {
    return this.http.get<ApiResult<string[]>>('/api/ranch/animals',
      { headers: this.auth.authHeaders() }).pipe(map(r => r.data || []));
  }

  /** POST /api/ranch/buy —— 购买牧场动物（服务端落库），返回 { ok, owned: 当前已拥有全集 } */
  buyRanchAnimal(code: string): Observable<{ ok: boolean; owned: string[] } | null> {
    return this.http.post<ApiResult<{ ok: boolean; owned: string[] }>>('/api/ranch/buy',
      { code }, { headers: this.auth.authHeaders() }).pipe(map(r => r.data));
  }

  /** GET /api/world/mining/profile 采矿档案（能量/等级/经验/背包） */
  miningProfile(): Observable<MiningProfile> {
    return this.http.get<ApiResult<MiningProfile>>('/api/world/mining/profile',
      { headers: this.auth.authHeaders() }).pipe(map(r => r.data));
  }

  /** POST /api/world/mining/sell 售卖矿石换积分 */
  sellMining(items: { type: string; qty: number }[]): Observable<ApiResult<SellResult>> {
    return this.http.post<ApiResult<SellResult>>('/api/world/mining/sell',
      items, { headers: this.auth.authHeaders() });
  }

  /** GET /api/world/cultivation 养成汇总（等级/经验/能量/积分 + 收益曲线 + 解锁里程碑） */
  cultivation(): Observable<ApiResult<any>> {
    return this.http.get<ApiResult<any>>('/api/world/cultivation',
      { headers: this.auth.authHeaders() });
  }

  /** GET /api/world/codex 图鉴（鱼 + 矿石，标已发现） */
  codex(): Observable<ApiResult<any>> {
    return this.http.get<ApiResult<any>>('/api/world/codex',
      { headers: this.auth.authHeaders() });
  }

  /** GET /api/world/position —— 返回上次保存的世界位置（无记录 null） */
  getLastPosition(uid: number): Observable<UserWorldStateResp | null> {
    return this.http.get<ApiResult<UserWorldStateResp | null>>('/api/world/position',
      { headers: this.auth.authHeaders() }).pipe(map(r => r.data));
  }

  /** POST /api/world/position —— 保存当前世界位置（uid 由 token 解析，防越权） */
  savePosition(uid: number, pos: SavePositionReq): Observable<ApiResult<void>> {
    return this.http.post<ApiResult<void>>('/api/world/position', pos,
      { headers: this.auth.authHeaders() });
  }
}
