import { Injectable } from '@angular/core';
import { WorldSocketService } from './world-socket.service';

/** 权威物理快照中的单个刚体（physics-service 下行，含速度用于插值/预测） */
export interface PhysBodyState {
  uid: number;
  gx: number;
  gz: number;
  y: number;
  rot: number;
  vx: number;
  vz: number;
}

/** 插值结果（渲染用） */
export interface PhysInterpState {
  gx: number;
  gz: number;
  y: number;
  rot: number;
}

/**
 * 物理快照客户端（ADR-W7 候选②）
 *
 * 客户端无本地物理：订阅 /topic/world 的 POSITION_SNAPSHOT（10Hz，附 tick），
 * 维护按 tick 排序的插值缓冲（默认 150ms，100-200ms 区间），渲染时取"现在 - 缓冲"时刻的
 * 前后两帧做线性插值；PHYS_RESTART 时清空缓冲，以下一个快照为基线。
 */
@Injectable({ providedIn: 'root' })
export class WorldPhysicsService {

  /** 插值缓冲（ms）：值越大越平滑但延迟越高（设计 02 §8 100-200ms） */
  private bufferMs = 150;

  private history: Array<{ tick: number; time: number; bodies: Map<number, PhysBodyState> }> = [];
  private maxHistory = 24; // 10Hz → ~2.4s 历史

  constructor(private ws: WorldSocketService) {}

  /** 订阅 /topic/world 的物理事件（world3d 组件连接后调用一次） */
  init(): void {
    this.ws.subscribe('/topic/world', frame => {
      let ev: any;
      try { ev = JSON.parse(frame.body); } catch (e) { return; }
      if (!ev.t) return;
      if (ev.t === 'POSITION_SNAPSHOT') {
        this.pushSnapshot(ev.tick as number, ev.bodies as any[]);
      } else if (ev.t === 'PHYS_RESTART') {
        this.clear();
      }
    });
  }

  setBufferMs(ms: number): void {
    this.bufferMs = ms;
  }

  clear(): void {
    this.history = [];
  }

  private pushSnapshot(tick: number, bodies: any[]): void {
    const map = new Map<number, PhysBodyState>();
    if (Array.isArray(bodies)) {
      for (const b of bodies) {
        map.set(Number(b.uid), {
          uid: Number(b.uid),
          gx: Number(b.gx), gz: Number(b.gz), y: Number(b.y), rot: Number(b.rot),
          vx: Number(b.vx ?? 0), vz: Number(b.vz ?? 0),
        });
      }
    }
    this.history.push({ tick, time: performance.now(), bodies: map });
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  /** 取某 uid 在"现在 - 缓冲"时刻的插值姿态；未知返回 null */
  getState(uid: number): PhysInterpState | null {
    if (this.history.length === 0) return null;
    const targetTime = performance.now() - this.bufferMs;

    // 找包夹 targetTime 的两帧（按接收时间排序）
    let s0 = this.history[0];
    let s1: { tick: number; time: number; bodies: Map<number, PhysBodyState> } | null = null;
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].time <= targetTime) s0 = this.history[i];
      else { s1 = this.history[i]; break; }
    }
    if (!s0 || !s0.bodies.has(uid)) return null;

    const b0 = s0.bodies.get(uid)!;
    // 无下一帧（最新）→ 用上一帧 + 速度外推一小段（本地预测非权威，封顶 250ms）
    if (!s1) {
      const dt = Math.min(0.25, (targetTime - s0.time) / 1000);
      return {
        gx: b0.gx + b0.vx * dt,
        gz: b0.gz + b0.vz * dt,
        y: b0.y,
        rot: b0.rot,
      };
    }
    const b1 = s1.bodies.get(uid);
    if (!b1) return { gx: b0.gx, gz: b0.gz, y: b0.y, rot: b0.rot };

    const span = Math.max(1, s1.time - s0.time);
    const f = Math.min(1, Math.max(0, (targetTime - s0.time) / span));
    return {
      gx: lerp(b0.gx, b1.gx, f),
      gz: lerp(b0.gz, b1.gz, f),
      y: lerp(b0.y, b1.y, f),
      rot: lerpAngle(b0.rot, b1.rot, f),
    };
  }

  /** 当前已知的全部 uid（用于远端玩家渲染） */
  knownUids(): number[] {
    if (this.history.length === 0) return [];
    const set = new Set<number>();
    for (const h of this.history) for (const uid of h.bodies.keys()) set.add(uid);
    return Array.from(set);
  }

  get bufferMsValue(): number { return this.bufferMs; }
}

function lerp(a: number, b: number, f: number): number { return a + (b - a) * f; }

/** 角度线性插值（处理 -π/π 环绕） */
function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}
