import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AuthService } from '../../services/auth.service';
import { StateService } from '../../services/state.service';
import { WorldApiService, WorldConfigResp, ChunkResp, WorldObjectResp } from '../../services/world-api.service';
import { WorldSocketService } from '../../services/world-socket.service';
import { WorldPhysicsService } from '../../services/world-physics.service';

/**
 * 大世界 3D 组件（M1 → M2：服务端权威物理改造，ADR-W7 候选②）
 *
 * 能力：
 *  - REST 拉取玩家周围 chunk（默认视距半径 2，强机放开 3），Chunk 流式加载/卸载
 *  - 地形网格用顶点色 + 语义着色（water/sand/grass/mountain/tree/rock/ore，无烘焙贴图）
 *  - 移动 = 输入上行（/app/ws.input，无本地物理）→ physics-service 权威模拟 → POSITION_SNAPSHOT
 *    10Hz → WorldPhysicsService 100-200ms 插值缓冲渲染（M2，取代 M1 本地运动学移动）
 *  - 默认第三人称跟随相机；建造/交互模式切 OrbitControls（three 0.128.0）
 *  - WS（STOMP 极简客户端）接收区域广播：他人放置 / 在线状态 / 权威快照
 *
 * 交互：
 *  - WASD 移动（输入上行）；鼠标左键拖拽环绕视角；滚轮缩放
 *  - 「建造」进入建造模式（OrbitControls 俯视选格，点击放置木屋）
 *  - 「养鱼」进入养鱼模式（点击水面放置鱼塘）
 *  - 「跟随」退出建造/养鱼，回到第三人称跟随
 */

const CHUNK = 64;
const N = 65;             // 65×65 顶点

/** 语义着色（01 §4.3 + 矿脉颜色） */
const CELL_COLORS: Record<number, number> = {
  0: 0x2f7fd6, // water（深海）
  1: 0xd2b27a, // sand
  2: 0x6abf4b, // grass
  3: 0x8a8a7a, // mountain
  4: 0x2d6a2f, // tree
  5: 0x9a9a92, // rock
  6: 0x555555, // ore_coal
  7: 0xb0b0b0, // ore_iron
  8: 0xffd700, // ore_gold
  9: 0x4aa3df, // river（浅河蓝，区别于深海）
  10: 0x6abf4b  // empty（回落草地色）
};

interface GridData {
  cx: number;
  cz: number;
  height: Float32Array;
  semantic: Uint8Array;
}

@Component({
  selector: 'app-world3d',
  template: `
    <div #mount class="world3d-mount"></div>
    <div class="w3d-toolbar">
      <button (click)="enterBuild()" [class.on]="buildMode">🏗️ 建造</button>
      <button (click)="enterFish()" [class.on]="fishMode">🐟 养鱼</button>
      <button (click)="exitInteract()" [class.on]="false">🎥 跟随</button>
    </div>
    <div class="w3d-hud">
      <div class="hud-row">金币 {{coins}} · 在线 {{onlineCount}}</div>
      <div class="hud-row">位置 ({{posText}})</div>
      <div class="hud-hint">{{hint}}</div>
    </div>
  `,
  styles: [`
    .world3d-mount { width: 100%; height: 100%; min-height: 480px; border-radius: 20px; overflow: hidden; background: #8FC8F5; position: relative; }
    .w3d-toolbar { position: absolute; top: 12px; left: 12px; z-index: 5; display: flex; gap: 8px; }
    .w3d-toolbar button { padding: 6px 14px; border: none; border-radius: 12px; background: rgba(255,255,255,.92); color: #333; font-size: 14px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.18); }
    .w3d-toolbar button.on { background: #FF8C42; color: #fff; }
    .w3d-hud { position: absolute; left: 12px; bottom: 12px; z-index: 5; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); font-size: 13px; line-height: 1.6; pointer-events: none; }
    .hud-hint { opacity: .85; max-width: 420px; }
  `]
})
export class World3dComponent implements OnInit, OnDestroy {
  @ViewChild('mount') mountRef!: ElementRef;

  buildMode = false;
  fishMode = false;
  hint = 'WASD 移动，空格 跳跃，双击地面跑过去，左键拖拽环绕视角';
  posText = '';
  coins = 0;
  onlineCount = 1;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();

  private config?: WorldConfigResp;
  private viewRadius = 2;
  private uid = 0;
  private nickname = '';

  // 世界数据
  private gridCache = new Map<string, GridData>();
  private chunkMeshes = new Map<string, THREE.Mesh>();
  private inFlight = new Set<string>();
  private objectMeshes = new Map<number, THREE.Object3D>();
  private worldObjects = new Map<number, WorldObjectResp>();
  private remotePlayers = new Map<number, THREE.Group>();
  /** 每 chunk 的树模型组（TREE 语义 → 3D 树），卸载时清理 */
  private treeMeshes = new Map<string, THREE.Group[]>();
  /** 每 chunk 的矿石模型组（ORE_* 语义 → 3D 矿石），卸载时清理 */
  private oreMeshes = new Map<string, THREE.Group[]>();

  // 玩家
  private px = 0; private pz = 0; private py = 0; private prot = 0;
  // 平滑显示位置（lerp 跟随物理权威位置，消除一跳一跳）
  private dpx = 0; private dpz = 0; private dpy = 0; private dprot = 0;
  private static readonly SMOOTH_FACTOR = 0.18; // 每帧追赶比例（60fps下约80ms延迟）
  private playerMesh!: THREE.Group;
  private keys: Record<string, boolean> = {};
  // 双击移动目标（世界坐标），null 表示无目标
  private moveTarget: { x: number; z: number } | null = null;

  // 相机
  private follow = { yaw: 0.7, pitch: 0.5, dist: 30 };
  private dragging = false;
  private lastX = 0; private lastY = 0;
  private downX = 0; private downY = 0;

  private rafId = 0;
  private disposed = false;
  private lastPosSend = 0;
  private lastStream = 0;
  private lastInputSend = 0;
  private inputSentKeyState = '';

  constructor(
    private api: WorldApiService,
    private ws: WorldSocketService,
    private physics: WorldPhysicsService,
    private auth: AuthService,
    private state: StateService
  ) {}

  ngOnInit(): void {
    this.uid = this.auth.user?.userId ?? 0;
    this.nickname = this.auth.user?.nickname || '我';
    this.coins = this.state.state.coins ?? 0;
    // 强机（桌面宽视口）放开视距 3
    this.viewRadius = window.innerWidth >= 1280 ? 3 : 2;

    this.api.config().subscribe({
      next: cfg => {
        if (this.disposed) return;
        // M2 修复（2026-08-12）：总是清空 chunk 缓存（首次 config 时 this.config=undefined 也清，防首次 gridCache 旧数据）
        this.gridCache.clear();
        this.config = cfg;
        this.viewRadius = cfg.viewRadius || this.viewRadius;
        this.px = cfg.spawnGx;
        this.pz = cfg.spawnGz;
        this.py = cfg.spawnY;
        // 平滑位置同步初始化（避免首次 lerp 从 0,0,0 追赶的大跳）
        this.dpx = this.px; this.dpz = this.pz; this.dpy = this.py; this.dprot = 0;
        this.initScene();
        this.initPlayer();
        this.connectWs();
        this.animate();
      },
      error: () => { this.hint = '世界配置加载失败：请确认后端已启动'; }
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.ws.disconnect();
    this.renderer?.dispose();
    this.scene?.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      if (mat) mat.dispose();
    });
  }

  // ================= 场景初始化 =================

  private initScene(): void {
    const mount = this.mountRef.nativeElement as HTMLElement;
    const W = mount.clientWidth || 900;
    const H = mount.clientHeight || 520;

    this.scene = new THREE.Scene();
    // 天空渐变：晴朗白昼天顶蓝 → 地平线淡青（M4 视觉增强）
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0xB8E0F0, 180, 450);

    // 海面（半透明蓝平面，精确对齐后端 waterLevel；覆盖全视图，渲染于地形之后）
    // v8: 高细分网格 + 顶点动画波浪（正弦波叠加，模拟海面起伏）
    const waterLevel = this.config?.waterLevel ?? -5;
    const waterGeo = new THREE.PlaneGeometry(12000, 12000, 128, 128);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f7fd6, transparent: true, opacity: 0.65,
      roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide,
    });
    // 自定义波浪：顶点着色器做正弦波位移，片元着色器加菲涅尔边缘亮
    waterMat.onBeforeCompile = (shader) => {
        shader.uniforms['uTime'] = { value: 0 };
        shader.uniforms['uWaterLevel'] = { value: waterLevel };
        shader.vertexShader = `
          uniform float uTime;
          uniform float uWaterLevel;
          varying vec3 vWorldPos;
          varying float vWaveHeight;
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `
          vec3 pos = position;
          // 双频率正弦波叠加模拟海浪
          float wave1 = sin(pos.x * 0.02 + uTime * 1.2) * 0.35;
          float wave2 = sin(pos.y * 0.03 + uTime * 0.8) * 0.25;
          float wave3 = sin((pos.x + pos.y) * 0.01 + uTime * 1.5) * 0.5;
          pos.z = wave1 + wave2 + wave3;
          vWaveHeight = pos.z;
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          transformed = pos;
          `
        );
        shader.fragmentShader = `
          uniform float uTime;
          varying vec3 vWorldPos;
          varying float vWaveHeight;
          ${shader.fragmentShader}
        `.replace(
          '#include <dithering_fragment>',
          `
          #include <dithering_fragment>
          // 海岸泡沫：靠近水线+波峰处加白色高光
          float foam = smoothstep(0.3, 0.6, vWaveHeight);
          float distFromCenter = length(vWorldPos.xz) / 4000.0;
          float edgeFoam = smoothstep(0.7, 1.0, distFromCenter) * 0.4;
          gl_FragColor.rgb += vec3((foam * 0.35 + edgeFoam * 0.25));
          // 菲涅尔边缘亮（水面反光感）
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.0);
          gl_FragColor.rgb += vec3(fresnel * 0.15);
          `
        );
        // 保存引用以便每帧更新 uTime
        (waterMat as any).waterShader = shader;
      }
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = waterLevel;
    waterMesh.renderOrder = 1;
    this.scene.add(waterMesh);
    // 存储引用供 animate 更新波浪时间
    (this as any).waterMat = waterMat;

    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 600);
    this.camera.position.set(this.px, this.py + 20, this.pz + 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);

    // 灯光（M4 增强：主阳光 + 补光 + 半球环境光）
    const sun = new THREE.DirectionalLight(0xFFFAE6, 1.3); // 暖白日光
    sun.position.set(100, 150, 80);
    this.scene.add(sun);
    // 补光（填充阴影区）
    const fillLight = new THREE.DirectionalLight(0xB8D4E8, 0.35);
    fillLight.position.set(-60, 40, -50);
    this.scene.add(fillLight);
    // 半球光：天蓝色 + 地面绿色
    this.scene.add(new THREE.HemisphereLight(0x9ED4FF, 0x7ABF5A, 0.75));

    // OrbitControls（默认禁用，跟随模式由自研 rig 控制；建造模式启用）
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // 交互事件
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('wheel', this.onWheel);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  private initPlayer(): void {
    const g = new THREE.Group();
    // three 0.128 无 CapsuleGeometry（r142 才有），用 圆柱+球 组合近似角色
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0xFFC93C })
    );
    body.position.y = 0.72;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xFFB35C })
    );
    head.position.y = 1.45;
    g.add(body, head);
    this.playerMesh = g;
    this.scene.add(g);
  }

  // ================= WS =================

  private connectWs(): void {
    if (!this.auth.isLoggedIn) {
      this.hint = '未登录：请先登录后再进入大世界';
      return;
    }
    this.ws.connect().then(() => {
      if (this.disposed) return;
      this.ws.subscribe('/topic/world', f => this.onWorldEvent(f));
      this.ws.subscribe('/topic/players', f => this.onPlayerEvent(f));
      this.ws.subscribe('/user/queue/reply', f => this.onReply(f));
      // 物理快照客户端（POSITION_SNAPSHOT / PHYS_RESTART）
      this.physics.init();
      const cx = Math.floor(this.px / CHUNK);
      const cz = Math.floor(this.pz / CHUNK);
      this.ws.send('/app/ws.join', { chunkKey: `${cx}_${cz}`, gx: Math.floor(this.px), gz: Math.floor(this.pz) });
      this.hint = '已接入大世界（服务端物理权威），按 WASD 移动探索';
    }).catch(() => {
      this.hint = 'WebSocket 连接失败（世界事件将不可见）';
    });
  }

  private onWorldEvent(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'OBJECT_ADD' && ev.object) {
        this.addObject(ev.object);
        this.hint = `新放置：${ev.object.type} @(${ev.object.gx},${ev.object.gz})`;
      } else if (ev.t === 'PLAYER_JOIN' && ev.uid !== this.uid) {
        this.addRemotePlayer(ev);
        this.hint = `${ev.nickname || '玩家'} 进入世界`;
      } else if (ev.t === 'PLAYER_LEAVE' && ev.uid !== this.uid) {
        this.removeRemotePlayer(ev.uid);
      }
      this.onlineCount = this.remotePlayers.size + 1;
    } catch (e) { /* 忽略坏帧 */ }
  }

  private onPlayerEvent(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'POSITION' && ev.uid !== this.uid) {
        const p = this.remotePlayers.get(ev.uid);
        if (p) {
          p.position.set(ev.gx + 0.5, (ev.y ?? 0) + 0.3, ev.gz + 0.5);
        }
      }
    } catch (e) { /* ignore */ }
  }

  private onReply(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'POSITION_SNAPSHOT') {
        // 以快照为基线：清空区域态 → 重建远端玩家与对象
        for (const g of this.remotePlayers.values()) this.scene.remove(g);
        this.remotePlayers.clear();
        for (const o of this.objectMeshes.values()) this.scene.remove(o);
        this.objectMeshes.clear();
        this.worldObjects.clear();
        if (Array.isArray(ev.players)) {
          for (const p of ev.players) {
            if (p.uid !== this.uid) this.addRemotePlayer(p);
          }
        }
        if (Array.isArray(ev.objects)) {
          for (const o of ev.objects) this.addObject(o);
        }
        this.onlineCount = this.remotePlayers.size + 1;
        if (ev.version && this.config && ev.version !== this.config.version) {
          this.hint = '世界版本已更新，请刷新页面';
        }
      } else if (ev.t === 'BUILD_RESULT') {
        this.hint = ev.code === 0 ? '放置成功' : ('放置失败：' + (ev.msg || '未知错误'));
        this.refreshCoins();
      }
    } catch (e) { /* ignore */ }
  }

  // ================= 主循环 =================

  private animate(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    // 输入上行（非建造/养鱼模式）：本地不移动，只发输入意图；~30Hz + 按键状态变化立即发
    if (!this.buildMode && !this.fishMode) {
      // 优先处理双击目标移动（有目标时自动走向目标）
      if (this.moveTarget) {
        this.updateMoveTowardsTarget(now);
      } else {
        this.sendInputIfNeeded(now);
      }
    }

    // 权威姿态：physics-service 快照插值；快照未到前停留出生点
    const st = this.physics.getState(this.uid);
    if (st) {
      this.px = st.gx; this.py = st.y; this.pz = st.gz; this.prot = st.rot;
    }
    // 平滑插值：水平方向纯 lerp（无地面冲突）
    const k = World3dComponent.SMOOTH_FACTOR;
    this.dpx += (this.px - this.dpx) * k;
    this.dpz += (this.pz - this.dpz) * k;
    // rot 用角度最短路径差分
    let dr = this.prot - this.dprot;
    while (dr > Math.PI) dr -= 2 * Math.PI;
    while (dr < -Math.PI) dr += 2 * Math.PI;
    this.dprot += dr * k;

    // 垂直方向统一单路径插值（修复原双重写入导致的抖动）：
    //   空中 → 纯 lerp 追踪物理跳跃弧线（丝滑）
    //   地面 → 加速收敛到地面高度（防止下陷/悬空）
    const groundY = this.heightAt(this.dpx, this.dpz);
    const targetY = (groundY ?? this.dpy) + 0.35; // 脚底偏移
    const airborne = this.py > targetY + 0.5;       // 降低阈值（原0.8），更快响应起跳/落地
    if (airborne) {
      // 空中：lerp 平滑追踪物理权威 Y（跳跃弧线丝滑）
      this.dpy += (this.py - this.dpy) * k;
    } else {
      // 着地：加速贴地（比水平 lerp 快，防止陷入地形但不过度生硬）
      this.dpy += (targetY - this.dpy) * Math.min(k * 2.5, 0.40);
    }

    // 统一一次性设置玩家位置（不再有第二处覆写）
    this.playerMesh.position.set(this.dpx, this.dpy, this.dpz);
    this.playerMesh.rotation.y = this.dprot;

    // 远端玩家：以物理快照刚体为准
    this.updateRemotePlayersFromPhysics();

    // chunk 流式（节流 ~250ms）
    if (now - this.lastStream > 250) {
      this.lastStream = now;
      this.streamChunks();
    }
    // 轻量位置心跳（保留：UI/调试/兜底；权威位置以 POSITION_SNAPSHOT 为准）
    if (now - this.lastPosSend > 1000 && this.ws.isConnected) {
      this.lastPosSend = now;
      this.ws.send('/app/ws.position', {
        gx: Math.floor(this.px), gz: Math.floor(this.pz),
        y: this.py, rot: this.prot
      });
    }
    this.posText = `${Math.floor(this.px)}, ${Math.floor(this.pz)}, ${this.py.toFixed(1)}`;

    // 相机
    if (this.buildMode || this.fishMode) {
      this.controls.target.set(this.dpx, this.dpy, this.dpz);
      this.controls.update();
    } else {
      this.controls.enabled = false;
      this.updateFollowCamera();
    }
    this.renderer.render(this.scene, this.camera);

    // v8 海浪动画：更新 shader 时间 uniform
    const wMat = (this as any).waterMat as THREE.MeshStandardMaterial | undefined;
    if (wMat && (wMat as any).waterShader) {
      (wMat as any).waterShader.uniforms.uTime.value = performance.now() * 0.001;
    }
  }

  private updateFollowCamera(): void {
    const d = this.follow.dist;
    const cp = Math.cos(this.follow.pitch);
    const cx = this.dpx + d * cp * Math.sin(this.follow.yaw);
    const cy = this.dpy + d * Math.sin(this.follow.pitch);
    const cz = this.dpz + d * cp * Math.cos(this.follow.yaw);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.dpx, this.dpy + 1.2, this.dpz);
  }

  // ================= 移动（M2：输入上行 + 服务端物理权威，ADR-W7 候选②） =================

  /**
   * 计算当前按键 → 世界空间方向 (dx,dz,run)，上行 /app/ws.input。
   * 客户端不做任何本地物理求解；physics-service 按 tick 排队消费输入，权威姿态由 POSITION_SNAPSHOT 下发。
   * 节流：按键状态变化立即发；持续按键 ~30Hz；未按任何键 → 发一次 (0,0) 表示停止。
   */
  private sendInputIfNeeded(now: number): void {
    let ix = 0, iz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iz -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    const run = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    // 世界空间方向（相对相机 yaw：W=相机前方、D=相机右方）
    const yaw = this.follow.yaw;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const len = Math.hypot(ix, iz);
    const dx = len > 0 ? (right.x * ix + forward.x * iz) / len : 0;
    const dz = len > 0 ? (right.z * ix + forward.z * iz) / len : 0;

    const keyState = `${ix}_${iz}_${run ? 1 : 0}`;
    const idle = len === 0;
    if (!idle && keyState === this.inputSentKeyState && now - this.lastInputSend < 33) {
      return; // 持续按键节流 ~30Hz
    }
    if (idle && this.inputSentKeyState === 'idle') {
      return; // 已发过停止
    }
    this.inputSentKeyState = idle ? 'idle' : keyState;
    this.lastInputSend = now;
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx, dz, run } });
    }
  }

  /** 自动走向双击目标：计算方向 → 发输入 → 到达后清除目标 */
  private updateMoveTowardsTarget(now: number): void {
    if (!this.moveTarget) return;
    const tx = this.moveTarget.x;
    const tz = this.moveTarget.z;
    const dx = tx - this.dpx;
    const dz = tz - this.dpz;
    const dist = Math.hypot(dx, dz);
    // 到达判定（< 0.8 单位视为到达）
    if (dist < 0.8) {
      this.moveTarget = null;
      this.hint = '已到达目标位置';
      // 发停止指令
      if (this.ws.isConnected) {
        this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
      }
      return;
    }
    // 归一化方向
    const ndx = dx / dist;
    const ndz = dz / dist;
    // 节流 ~30Hz
    if (now - this.lastInputSend < 33 && this.inputSentKeyState === `auto_${ndx.toFixed(2)}_${ndz.toFixed(2)}`) {
      return;
    }
    this.lastInputSend = now;
    this.inputSentKeyState = `auto_${ndx.toFixed(2)}_${ndz.toFixed(2)}`;
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', {
        seq: Math.floor(now),
        move: { dx: ndx, dz: ndz, run: false },
        targetGx: Math.floor(tx),
        targetGz: Math.floor(tz)
      });
    }
  }

  /** 远端玩家：以物理快照刚体为准（创建/更新/删除） */
  private updateRemotePlayersFromPhysics(): void {
    const uids = this.physics.knownUids();
    const seen = new Set<number>();
    for (const uid of uids) {
      if (uid === this.uid) continue;
      seen.add(uid);
      if (!this.remotePlayers.has(uid)) {
        this.addRemotePlayer({ uid, gx: 0, gz: 0, y: 0 });
      }
      const st = this.physics.getState(uid);
      const g = this.remotePlayers.get(uid);
      if (g && st) {
        g.position.set(st.gx, st.y, st.gz);
        g.rotation.y = st.rot;
      }
    }
    for (const [uid, g] of Array.from(this.remotePlayers.entries())) {
      if (!seen.has(uid)) {
        this.scene.remove(g);
        this.remotePlayers.delete(uid);
      }
    }
  }

  // ================= 地形工具（高度场双线性插值，快照间隙/物体贴地用） =================

  private heightAt(gx: number, gz: number): number | undefined {
    const cx = Math.floor(gx / CHUNK);
    const cz = Math.floor(gz / CHUNK);
    const grid = this.gridCache.get(`${cx}_${cz}`);
    if (!grid) return undefined;
    const fx = gx - cx * CHUNK;
    const fz = gz - cz * CHUNK;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const h = grid.height;
    // 跨边界邻居未加载时钳制到本 chunk 边界（邻居到达后自然校正）
    const x1 = Math.min(x0 + 1, CHUNK);
    const z1 = Math.min(z0 + 1, CHUNK);
    const h00 = h[z0 * N + x0];
    const h10 = h[z0 * N + x1];
    const h01 = h[z1 * N + x0];
    const h11 = h[z1 * N + x1];
    const tx = fx - x0;
    const tz = fz - z0;
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  }

  // ================= Chunk 流式 =================

  private streamChunks(): void {
    const pcx = Math.floor(this.px / CHUNK);
    const pcz = Math.floor(this.pz / CHUNK);
    const R = this.viewRadius;
    const unloadR = R + 1;

    // 卸载超视距 chunk
    for (const key of Array.from(this.chunkMeshes.keys())) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > unloadR) {
        this.unloadChunk(cx, cz, key);
      }
    }
    // 请求缺失 chunk（并发 ≤8）
    const desired: string[] = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx}_${cz}`;
        if (!this.gridCache.has(key) && !this.inFlight.has(key) && this.chunkMeshes.has(key) === false) {
          desired.push(key);
        }
      }
    }
    let issued = 0;
    for (const key of desired) {
      if (issued >= 8) break;
      const [cx, cz] = key.split('_').map(Number);
      this.inFlight.add(key);
      issued++;
      this.api.chunk(cx, cz).subscribe({
        next: resp => this.applyChunk(resp),
        error: () => this.inFlight.delete(key),
        complete: () => this.inFlight.delete(key)
      });
    }
  }

  private applyChunk(resp: ChunkResp): void {
    if (this.disposed) return;
    const key = `${resp.cx}_${resp.cz}`;
    // 语义/高度缓存
    this.gridCache.set(key, {
      cx: resp.cx, cz: resp.cz,
      height: Float32Array.from(resp.height),
      semantic: Uint8Array.from(resp.semantic)
    });
    // 网格
    const mesh = this.buildChunkMesh(resp);
    this.chunkMeshes.set(key, mesh);
    this.scene.add(mesh);
    // 树木（TREE 语义 → 3D 树模型）
    this.spawnTrees(resp);
    // 矿石（ORE_GOLD/ORE_IRON/ORE_COAL → 3D 矿石模型）
    this.spawnOres(resp);
    // 对象
    if (resp.objects) {
      for (const o of resp.objects) this.addObject(o);
    }
  }

  private unloadChunk(cx: number, cz: number, key: string): void {
    const mesh = this.chunkMeshes.get(key);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.chunkMeshes.delete(key);
    }
    this.gridCache.delete(key);
    // 卸载该 chunk 的树模型
    const trees = this.treeMeshes.get(key);
    if (trees) {
      for (const t of trees) {
        this.scene.remove(t);
        t.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
        });
      }
      this.treeMeshes.delete(key);
    }
    // 卸载该 chunk 的矿石模型
    const ores = this.oreMeshes.get(key);
    if (ores) {
      for (const o of ores) {
        this.scene.remove(o);
        o.traverse(obj => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
        });
      }
      this.oreMeshes.delete(key);
    }
    // 卸载该 chunk 内对象网格（重新进入时会随 chunk 重新拉取）
    for (const [id, o] of Array.from(this.objectMeshes.entries())) {
      const obj = this.worldObjects.get(id);
      if (obj && Math.floor(obj.gx / CHUNK) === cx && Math.floor(obj.gz / CHUNK) === cz) {
        this.scene.remove(o);
        this.objectMeshes.delete(id);
      }
    }
  }

  private buildChunkMesh(resp: ChunkResp): THREE.Mesh {
    const h = resp.height;
    const sem = resp.semantic;
    const waterLevel = this.config?.waterLevel ?? -5;
    const positions = new Float32Array(N * N * 3);
    const colors = new Float32Array(N * N * 3);
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const i = lz * N + lx;
        positions[i * 3] = resp.cx * CHUNK + lx;
        // M3 修复：WATER 语义格（0）的 Y 钳制到海平面，消除"水下山脉"和"蓝色高地"
        const cell = sem[Math.min(lz, CHUNK - 1) * CHUNK + Math.min(lx, CHUNK - 1)];
        positions[i * 3 + 1] = (cell === 0) ? waterLevel : h[i];
        positions[i * 3 + 2] = resp.cz * CHUNK + lz;
        const c = CELL_COLORS[cell] ?? CELL_COLORS[2];
        colors[i * 3] = ((c >> 16) & 255) / 255;
        colors[i * 3 + 1] = ((c >> 8) & 255) / 255;
        colors[i * 3 + 2] = (c & 255) / 255;
      }
    }
    const indices: number[] = [];
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const a = lz * N + lx;
        const b = a + 1;
        const c = (lz + 1) * N + lx;
        const d = c + 1;
        indices.push(a, c, b, c, d, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `chunk_${resp.cx}_${resp.cz}`;
    mesh.frustumCulled = false;
    return mesh;
  }

  // ================= 树木渲染（TREE 语义 → 3D 树） =================

  /** 按 chunk 语义中的 TREE 格生成 3D 树模型（树干 + 树冠），带确定性随机旋转/缩放 */
  private spawnTrees(resp: ChunkResp): void {
    const key = `${resp.cx}_${resp.cz}`;
    const trees: THREE.Group[] = [];
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = resp.semantic[lz * CHUNK + lx];
        if (cell !== 4) continue; // 4 = TREE
        const gx = resp.cx * CHUNK + lx;
        const gz = resp.cz * CHUNK + lz;
        const y = this.heightAt(gx + 0.5, gz + 0.5);
        const tree = this.makeTree();
        tree.position.set(gx + 0.5, y ?? 0, gz + 0.5);
        tree.rotation.y = (((gx * 13 + gz * 7) % 360) * Math.PI) / 180;
        const s = 0.85 + (((gx * 31 + gz * 17) % 30) / 100);
        tree.scale.setScalar(s);
        this.scene.add(tree);
        trees.push(tree);
      }
    }
    this.treeMeshes.set(key, trees);
  }

  /** 单棵低模树：棕色树干圆柱 + 深绿圆锥树冠 */
  private makeTree(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6),
      new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 1 })
    );
    trunk.position.y = 0.45;
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9 })
    );
    foliage.position.y = 1.7;
    g.add(trunk, foliage);
    return g;
  }

  // ================= 矿石渲染（ORE_* 语义 → 3D 矿石模型） =================

  /** 按 chunk 语义中的 ORE_* 格生成 3D 矿石模型（露出地面的岩石/晶体） */
  private spawnOres(resp: ChunkResp): void {
    const key = `${resp.cx}_${resp.cz}`;
    const ores: THREE.Group[] = [];
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = resp.semantic[lz * CHUNK + lx];
        let oreType: 'gold' | 'iron' | 'coal' | null = null;
        if (cell === 6) oreType = 'coal';      // ORE_COAL
        else if (cell === 7) oreType = 'iron';   // ORE_IRON
        else if (cell === 8) oreType = 'gold';   // ORE_GOLD
        if (!oreType) continue;
        const gx = resp.cx * CHUNK + lx;
        const gz = resp.cz * CHUNK + lz;
        const y = this.heightAt(gx + 0.5, gz + 0.5);
        const ore = this.makeOre(oreType);
        ore.position.set(gx + 0.5, y ?? 0, gz + 0.5);
        // 随机旋转和轻微缩放变化
        ore.rotation.y = (((gx * 7 + gz * 13) % 360) * Math.PI) / 180;
        const s = 0.8 + (((gx * 23 + gz * 31) % 20) / 100);
        ore.scale.setScalar(s);
        this.scene.add(ore);
        ores.push(ore);
      }
    }
    this.oreMeshes.set(key, ores);
  }

  /** 单个低模矿石：不同类型不同颜色+形状 */
  private makeOre(type: 'gold' | 'iron' | 'coal'): THREE.Group {
    const g = new THREE.Group();
    if (type === 'gold') {
      // 金矿：金黄色八面体晶体（双锥组合）
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35, 0),
        new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.3, metalness: 0.8, emissive: 0x554400 })
      );
      crystal.position.y = 0.4;
      crystal.scale.set(1, 1.5, 1); // 拉高成晶体状
      g.add(crystal);
      // 底座小岩石
      const base = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.25, 0),
        new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.95 })
      );
      base.position.y = 0.12;
      g.add(base);
    } else if (type === 'iron') {
      // 铁矿：深灰色不规则岩石块
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.7, metalness: 0.4 })
      );
      rock.position.y = 0.3;
      rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
      g.add(rock);
      // 小晶体点缀
      for (let i = 0; i < 2; i++) {
        const bit = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.1, 0),
          new THREE.MeshStandardMaterial({ color: 0xA0A0B0, roughness: 0.4, metalness: 0.6 })
        );
        const a = (i / 2) * Math.PI * 2;
        bit.position.set(Math.cos(a) * 0.25, 0.35 + i * 0.12, Math.sin(a) * 0.25);
        g.add(bit);
      }
    } else {
      // 煤矿：黑色多面体堆
      for (let i = 0; i < 3; i++) {
        const coal = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0),
          new THREE.MeshStandardMaterial({ color: 0x2C2C2C, roughness: 0.9, metalness: 0.1 })
        );
        const a = (i / 3) * Math.PI * 2;
        coal.position.set(
          Math.cos(a) * 0.15,
          0.1 + i * 0.15,
          Math.sin(a) * 0.15
        );
        coal.rotation.set(Math.random(), Math.random(), Math.random());
        g.add(coal);
      }
    }
    return g;
  }

  // ================= 世界对象渲染 =================

  private addObject(o: WorldObjectResp): void {
    if (this.worldObjects.has(o.id)) return;
    this.worldObjects.set(o.id, o);
    const y = this.heightAt(o.gx + 0.5, o.gz + 0.5);
    const groundY = y === undefined ? 0 : y;
    const g = new THREE.Group();
    if (o.type === 'fish_pond') {
      // 鱼塘：蓝色扁圆柱 + 水面
      const pond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.5, 20),
        new THREE.MeshStandardMaterial({ color: 0x4CC9F0, transparent: true, opacity: 0.85 })
      );
      pond.position.y = 0.25;
      g.add(pond);
    } else {
      // 建筑：木屋方块 + 屋顶
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.3, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xC98A4B })
      );
      wall.position.y = 0.65;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.3, 0.7, 4),
        new THREE.MeshStandardMaterial({ color: 0xE86A4B })
      );
      roof.position.y = 1.7;
      roof.rotation.y = Math.PI / 4;
      g.add(wall, roof);
    }
    g.position.set(o.gx + 0.5, groundY, o.gz + 0.5);
    this.scene.add(g);
    this.objectMeshes.set(o.id, g);
  }

  // ================= 远端玩家 =================

  private addRemotePlayer(p: any): void {
    if (this.remotePlayers.has(p.uid)) return;
    const colors = [0x66BB6A, 0x42A5F5, 0xAB47BC, 0xFF7043];
    const color = colors[this.remotePlayers.size % colors.length];
    const g = new THREE.Group();
    // three 0.128 无 CapsuleGeometry，用 圆柱+球 组合
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.6, 10),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 0.62;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshStandardMaterial({ color })
    );
    head.position.y = 1.32;
    g.add(body, head);
    g.position.set((p.gx ?? 0) + 0.5, (p.y ?? 0) + 0.3, (p.gz ?? 0) + 0.5);
    this.scene.add(g);
    this.remotePlayers.set(p.uid, g);
  }

  private removeRemotePlayer(uid: number): void {
    const g = this.remotePlayers.get(uid);
    if (g) {
      this.scene.remove(g);
      this.remotePlayers.delete(uid);
    }
  }

  // ================= 交互：建造 / 养鱼 =================

  enterBuild(): void {
    this.buildMode = true;
    this.fishMode = false;
    this.controls.enabled = true;
    this.hint = '建造模式：点击地面放置木屋（100 金币），点击「跟随」退出';
  }

  enterFish(): void {
    this.fishMode = true;
    this.buildMode = false;
    this.controls.enabled = true;
    this.hint = '养鱼模式：点击蓝色水面放置鱼塘，点击「跟随」退出';
  }

  exitInteract(): void {
    this.buildMode = false;
    this.fishMode = false;
    this.controls.enabled = false;
    this.hint = '已回到跟随视角，WASD 移动';
  }

  private onCanvasClick(x: number, y: number): void {
    if (!this.buildMode && !this.fishMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const meshes = Array.from(this.chunkMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    const gx = Math.floor(hits[0].point.x);
    const gz = Math.floor(hits[0].point.z);
    if (this.buildMode) {
      this.api.build(gx, gz, 'wood_house').subscribe({
        next: r => {
          this.hint = r.code === 0 ? '放置成功！' : '放置失败：' + r.msg;
          this.refreshCoins();
        },
        error: e => { this.hint = '放置请求失败'; }
      });
    } else if (this.fishMode) {
      this.api.fish(gx, gz, 'goldfish').subscribe({
        next: r => {
          this.hint = r.code === 0 ? '鱼塘已建！' : '养鱼失败：' + r.msg;
          this.refreshCoins();
        },
        error: () => { this.hint = '养鱼请求失败'; }
      });
    }
  }

  private refreshCoins(): void {
    // 服务端权威扣款后刷新（本地 state.coins 由 home 逻辑维护，此处仅展示；M1 简单处理）
    this.auth.getMe().subscribe({
      next: r => {
        if (r.code === 0 && r.data) {
          this.coins = (r.data as any).coins ?? this.coins;
          this.state.state.coins = this.coins;
        }
      },
      error: () => { /* ignore */ }
    });
  }

  // ================= 事件处理 =================

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || this.buildMode || this.fishMode) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.follow.yaw -= dx * 0.005;
    this.follow.pitch = Math.max(0.1, Math.min(1.35, this.follow.pitch + dy * 0.005));
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.dragging = false;
    const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (dist < 6) {
      this.onCanvasClick(e.clientX, e.clientY);
    }
  };

  /** 双击地面：射线检测地形交点 → 设为移动目标 → 服务端寻路 */
  private onDoubleClick = (e: MouseEvent): void => {
    // 建造/养鱼模式下双击不触发移动（避免冲突）
    if (this.buildMode || this.fishMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const meshes = Array.from(this.chunkMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    const point = hits[0].point;
    // 只在可行走区域（沙/草）才设目标
    // TODO: 后续可加语义检查，当前简化处理
    this.moveTarget = { x: point.x, z: point.z };
    this.hint = `📍 移动目标: (${Math.floor(point.x)}, ${Math.floor(point.z)})`;
    // 立即发送一次目标位置到后端（后续每帧持续发直到到达）
    this.sendMoveTarget();
  };

  /** 发送移动目标到服务端 */
  private sendMoveTarget(): void {
    if (!this.moveTarget || !this.ws.isConnected) return;
    const t = this.moveTarget;
    this.ws.send('/app/ws.input', {
      seq: Math.floor(performance.now()),
      move: { dx: 0, dz: 0, run: false },
      targetGx: Math.floor(t.x),
      targetGz: Math.floor(t.z)
    });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.follow.dist = Math.max(8, Math.min(80, this.follow.dist + e.deltaY * 0.03));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    // 按 WASD/方向键时取消双击自动移动（手动优先）
    const code = e.code ?? '';
    if ((code.startsWith('Key') || code.startsWith('Arrow')) && this.moveTarget) {
      this.moveTarget = null;
      this.hint = '已取消自动移动，WASD 手动控制';
    }
    // 空格跳跃（非建造/养鱼模式，且不在输入框中）
    if (code === 'Space' && !this.buildMode && !this.fishMode) {
      e.preventDefault();
      this.sendJump();
    }
  };

  /** 发送跳跃意图到服务端 */
  private sendJump(): void {
    if (!this.ws.isConnected) return;
    this.ws.send('/app/ws.input', {
      seq: Math.floor(performance.now()),
      move: { dx: 0, dz: 0, run: false },
      action: 'jump'
    });
    this.hint = '⬆️ 跳跃！';
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private onResize = (): void => {
    const mount = this.mountRef.nativeElement as HTMLElement;
    const W = mount.clientWidth || 900;
    const H = mount.clientHeight || 520;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
  };
}
