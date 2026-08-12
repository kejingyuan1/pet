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

/**
 * 大世界 REST 服务（config / chunk 流式 / build / fish / objects）
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
}
