import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * 极简 STOMP 客户端（原生 WebSocket，不引第三方依赖）
 *
 * 设计：ADR-W2 STOMP 区域广播。M1 用原生 WebSocket + 手写 STOMP 帧解析，
 * 避免新增 npm 依赖（项目锁定 three 0.128.0，尽量少动依赖树）。
 * 协议：CONNECT → CONNECTED；SUBSCRIBE；SEND；MESSAGE（按 subscription id 路由）。
 *
 * 下行：
 *  - /topic/world      世界事件（OBJECT_ADD / PLAYER_JOIN / PLAYER_LEAVE ...）
 *  - /topic/players    玩家位置（POSITION，含 y）
 *  - /user/queue/reply 个人回复（join 快照 / build 结果）
 */
@Injectable({ providedIn: 'root' })
export class WorldSocketService {

  private ws: WebSocket | null = null;
  private connected = false;
  private subSeq = 0;
  /** subscription id → 回调 */
  private subs = new Map<string, (frame: StompFrame) => void>();
  private buffer = '';
  private connectResolve: (() => void) | null = null;
  private connectReject: ((e: any) => void) | null = null;

  constructor(private auth: AuthService) {}

  /** 连接状态（供 UI 订阅）：connecting / connected / reconnecting / disconnected */
  connectionState$ = new BehaviorSubject<ConnState>('disconnected');

  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private manualClose = false;

  get isConnected(): boolean { return this.connected; }

  private setConnState(s: ConnState): void { this.connectionState$.next(s); }

  /** 连接 WS 端点
   *  - M2 修复（2026-08-12）：URL 路由兼容
   *    · Angular dev server 4200/proxy：保留原行为用 location.host（Angular proxy ws:true 转发到 8080）
   *    · Python http.server / 其它简易服务器在 4200 上无 proxy：自动降级直连 localhost:8080
   *    · 生产环境：location.host 由反代（nginx/spring cloud gateway）兜底
   *  - 服务端 SecurityConfig 已 setAllowedOriginPatterns("*")，CORS/WS 握手不受限
   *  - P0 修复（2026-08-14）：断线自动重连 + 心跳保活；暴露 connectionState$ 供 UI 显示
   */
  connect(): Promise<void> {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    // 已在连接中（含重连握手阶段）：复用，避免重复建连
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return Promise.resolve();
    }
    this.manualClose = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // 自动检测：Angular dev server 默认可信端口（含 4200/4201 等常用 dev proxy 端口）
    const knownProxyPorts = new Set(['4200', '4201', '4202', '5173', '3000']);
    let wsHost = location.host;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      if (!knownProxyPorts.has(location.port)) {
        // 非已知 proxy 端口（Python http.server / nginx 直服 dist 等）→ 直连后端 8080
        wsHost = `${location.hostname}:8080`;
      }
    }
    const url = `${proto}://${wsHost}/ws?token=${encodeURIComponent(this.auth.token || '')}`;
    this.setConnState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      // STOMP 子协议必须在 WS 握手时声明（Spring 端点为 v12.stomp）
      const ws = new WebSocket(url, 'v12.stomp');
      this.ws = ws;
      ws.onopen = () => {
        // CONNECT 帧：声明 10s 心跳（客户端每 5s 发一次保活，探测静默断线）
        this.rawSend('CONNECT\naccept-version:1.2\nhost:petpark\nheart-beat:10000,10000\n\n\0');
      };
      ws.onmessage = (ev) => this.onMessage(ev.data as string);
      ws.onerror = (ev) => {
        // 连接期错误：仅首次 reject（避免重连循环里反复 reject 触发未捕获异常）
        if (this.connectReject) { this.connectReject(ev); this.connectReject = null; }
      };
      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.stopHeartbeat();
        this.subs.clear(); // 服务端已移除订阅，本地清理以便重连后重建
        if (this.manualClose) {
          this.setConnState('disconnected');
        } else {
          this.setConnState('disconnected');
          this.scheduleReconnect(); // 自动重连（指数退避）
        }
      };
    });
  }

  /** 订阅目的地（destination 为 /topic/* 或 /user/queue/*） */
  subscribe(destination: string, cb: (frame: StompFrame) => void): void {
    const id = 'sub-' + (++this.subSeq);
    this.subs.set(id, cb);
    this.rawSend(`SUBSCRIBE\nid:${id}\ndestination:${destination}\n\n\0`);
  }

  /** 发送 JSON 消息到应用目的地（/app/ws.join 等） */
  send(destination: string, body: unknown): void {
    this.rawSend(`SEND\ndestination:${destination}\ncontent-type:application/json\n\n${JSON.stringify(body)}\0`);
  }

  /** 断开并清理订阅（组件销毁时调用：主动断开，不触发重连） */
  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopHeartbeat();
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.rawSend('DISCONNECT\n\n\0');
        this.ws.close();
      }
    } catch (e) { /* ignore */ }
    this.ws = null;
    this.connected = false;
    this.subs.clear();
    this.setConnState('disconnected');
  }

  // ================= 内部：重连 / 心跳 =================

  /** 指数退避重连：1s → 2s → 4s → 8s → 封顶 10s */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualClose) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4)), 10000);
    this.setConnState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // 连接结果交由 onclose / CONNECTED 处理；失败会再次调度
      this.connect().catch(() => { /* onclose 会再次触发重连 */ });
    }, delay);
  }

  /** 应用层心跳：每 5s 发一个 STOMP 心跳帧（EOL），探测静默断线（移动端 WiFi 漂移常见） */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.rawSend('\n');
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ================= 内部：STOMP 帧 =================

  private rawSend(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private onMessage(data: string): void {
    this.buffer += data;
    // STOMP 帧以 \0 结尾，可能一次收到多帧 / 半帧
    let idx;
    while ((idx = this.buffer.indexOf('\0')) >= 0) {
      const frameText = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      this.handleFrame(frameText);
    }
  }

  private handleFrame(frameText: string): void {
    const lines = frameText.split('\n');
    const command = (lines.shift() || '').trim();
    if (!command) { return; }
    // 解析 header
    const headers: Record<string, string> = {};
    while (lines.length && lines[0].trim() !== '') {
      const line = lines.shift() || '';
      const p = line.indexOf(':');
      if (p > 0) {
        headers[line.slice(0, p).trim()] = line.slice(p + 1).trim();
      }
    }
    const body = lines.join('\n');

    if (command === 'CONNECTED') {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.setConnState('connected');
      if (this.connectResolve) { this.connectResolve(); this.connectResolve = null; }
      return;
    }
    if (command === 'ERROR') {
      console.error('[world-ws] STOMP 错误', body, headers);
      return;
    }
    if (command === 'MESSAGE') {
      const subId = headers['subscription'];
      const cb = subId ? this.subs.get(subId) : undefined;
      if (cb) {
        cb({ command, headers, body });
      }
      return;
    }
    // 其它帧（RECEIPT/HEARTBEAT 等）忽略
  }
}

/** STOMP 消息帧（解析后） */
export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

/** WS 连接状态（供 UI 展示） */
export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
