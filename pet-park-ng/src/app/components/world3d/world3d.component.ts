import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AuthService } from '../../services/auth.service';
import { StateService } from '../../services/state.service';
import { WorldApiService, WorldConfigResp, ChunkResp, WorldObjectResp, MiningProfile, InventoryItem, SellResult, MineResult, HarvestResult } from '../../services/world-api.service';
import { WorldSocketService } from '../../services/world-socket.service';
import { WorldPhysicsService } from '../../services/world-physics.service';
import { AssetService } from '../../services/asset.service';
import { BOY_RIG, GIRL_RIG } from './rig-configs';

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
  9: 0x6abf4b,  // empty（回落草地色，与后端 EMPTY=9 对齐）
  10: 0x4aa3df // river（浅河蓝，区别于深海；后端 RIVER=10）
};

interface GridData {
  cx: number;
  cz: number;
  height: Float32Array;
  semantic: Uint8Array;
}

@Component({
  selector: 'app-world3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div #mount class="world3d-mount"></div>
    <div class="w3d-toolbar">
      <button (click)="enterBuild()" [class.on]="buildMode">🏗️ 建造</button>
      <button (click)="enterFish()" [class.on]="fishMode">🐟 养鱼</button>
      <button (click)="enterMine()" [class.on]="mineMode">⛏️ 采矿</button>
      <button (click)="enterRemove()" [class.on]="removeMode">🗑️ 拆除</button>
      <button (click)="enterUpgrade()" [class.on]="upgradeMode">⬆️ 升级</button>
      <button (click)="enterHarvest()" [class.on]="harvestMode">🎣 收获</button>
      <button (click)="exitInteract()" [class.on]="!buildMode && !fishMode && !mineMode && !removeMode && !upgradeMode && !harvestMode">🎥 跟随</button>
    </div>
    <div class="w3d-hud">
      <div class="hud-row">金币 {{coins}} · 在线 {{onlineCount}}</div>
      <div class="hud-row">位置 ({{posText}})</div>
      <div class="hud-hint">{{hint}}</div>
    </div>
    <div class="w3d-chat" [class.collapsed]="!chatOpen">
      <div class="chat-head" (click)="toggleChat()">
        <span>💬 聊天 {{chatOpen ? '' : '(' + chatMessages.length + ')'}}</span>
        <span class="chat-toggle">{{chatOpen ? '▾' : '▸'}}</span>
      </div>
      <div class="chat-body" *ngIf="chatOpen">
        <div class="chat-list" #chatList>
          <div class="chat-msg" *ngFor="let m of chatMessages">
            <span class="chat-nick" [class.self]="m.uid === selfUid">{{m.nickname || '玩家'}}：</span>
            <span class="chat-text">{{m.text}}</span>
            <span class="chat-time">{{m.timeText}}</span>
          </div>
          <div class="chat-empty" *ngIf="chatMessages.length === 0">还没有人说话，来打个招呼吧～</div>
        </div>
        <div class="chat-input-row">
          <input #chatInputEl class="chat-input" type="text" maxlength="200" placeholder="按 Enter 发送"
                 [(ngModel)]="chatInput" (keyup.enter)="sendChat()" (keyup.escape)="blurChat()" />
          <button class="chat-send" (click)="sendChat()">发送</button>
        </div>
      </div>
    </div>
    <!-- 采矿 HUD（M4）：能量 / 等级 / 经验 / 背包售卖 -->
    <div class="w3d-mine" *ngIf="miningReady">
      <div class="mine-head">
        <span>⛏️ 采矿 Lv.{{level}}</span>
        <button class="mine-sell-toggle" (click)="toggleSell()">{{sellOpen ? '收起' : '💰 背包'}}</button>
      </div>
      <div class="mine-energy">
        <div class="energy-bar"><div class="energy-fill" [style.width.%]="energyPercent"></div></div>
        <span class="energy-text">⚡ {{energy}}/{{maxEnergy}}</span>
      </div>
      <div class="mine-exp">EXP {{exp}} · 距下级 {{expToNext}}</div>
      <div class="mine-inv" *ngIf="sellOpen">
        <div class="inv-row" *ngFor="let it of inventory">
          <span class="inv-name">{{it.name}} ×{{it.qty}}</span>
          <span class="inv-price">{{it.sellPrice}}/个</span>
          <button class="inv-sell" (click)="sellItem(it)" [disabled]="it.qty <= 0">卖</button>
        </div>
        <div class="inv-empty" *ngIf="inventory.length === 0">背包空空，去采矿吧～</div>
      </div>
    </div>
    <div class="w3d-toast" *ngIf="miningToast">{{miningToast.text}}</div>
  `,
  styles: [`
    .world3d-mount { width: 100%; height: 100%; min-height: 480px; border-radius: 20px; overflow: hidden; background: #8FC8F5; position: relative; }
    .w3d-toolbar { position: absolute; top: 12px; left: 12px; z-index: 5; display: flex; gap: 8px; }
    .w3d-toolbar button { padding: 6px 14px; border: none; border-radius: 12px; background: rgba(255,255,255,.92); color: #333; font-size: 14px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.18); }
    .w3d-toolbar button.on { background: #FF8C42; color: #fff; }
    .w3d-hud { position: absolute; left: 12px; bottom: 12px; z-index: 5; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); font-size: 13px; line-height: 1.6; pointer-events: none; }
    .hud-hint { opacity: .85; max-width: 420px; }
    .w3d-chat { position: absolute; right: 12px; bottom: 12px; z-index: 6; width: 300px; max-width: 42vw; pointer-events: auto; background: rgba(20,30,45,.82); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.3); color: #eee; font-size: 13px; }
    .w3d-chat.collapsed { width: auto; }
    .chat-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; cursor: pointer; background: rgba(255,255,255,.06); user-select: none; }
    .chat-toggle { opacity: .7; }
    .chat-body { display: flex; flex-direction: column; }
    .chat-list { max-height: 220px; min-height: 80px; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
    .chat-msg { line-height: 1.5; word-break: break-word; }
    .chat-nick { color: #8FD3FF; font-weight: 600; }
    .chat-nick.self { color: #FFD27F; }
    .chat-text { color: #f0f0f0; }
    .chat-time { color: rgba(255,255,255,.4); font-size: 11px; margin-left: 6px; }
    .chat-empty { color: rgba(255,255,255,.45); font-style: italic; padding: 8px 0; }
    .chat-input-row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid rgba(255,255,255,.08); }
    .chat-input { flex: 1; border: none; border-radius: 8px; padding: 6px 10px; background: rgba(255,255,255,.92); color: #222; font-size: 13px; outline: none; }
    .chat-send { border: none; border-radius: 8px; padding: 6px 12px; background: #FF8C42; color: #fff; cursor: pointer; font-size: 13px; }
    .chat-send:active { background: #e6782e; }
    .w3d-mine { position: absolute; top: 12px; right: 12px; z-index: 6; width: 240px; max-width: 44vw; background: rgba(20,30,45,.84); border-radius: 12px; color: #eee; font-size: 12px; padding: 8px 10px; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
    .mine-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
    .mine-sell-toggle { border: none; border-radius: 8px; padding: 3px 8px; background: #FF8C42; color: #fff; cursor: pointer; font-size: 12px; }
    .mine-sell-toggle:active { background: #e6782e; }
    .mine-energy { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .energy-bar { flex: 1; height: 10px; background: rgba(255,255,255,.15); border-radius: 6px; overflow: hidden; }
    .energy-fill { height: 100%; background: linear-gradient(90deg,#FFD27F,#FF8C42); transition: width .25s ease; }
    .energy-text { white-space: nowrap; }
    .mine-exp { opacity: .85; margin-bottom: 6px; }
    .mine-inv { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 6px; max-height: 180px; overflow-y: auto; }
    .inv-row { display: flex; align-items: center; gap: 6px; }
    .inv-name { flex: 1; }
    .inv-price { opacity: .7; }
    .inv-sell { border: none; border-radius: 6px; padding: 2px 8px; background: #4CC9F0; color: #08323f; cursor: pointer; font-size: 12px; }
    .inv-sell:disabled { opacity: .4; cursor: not-allowed; }
    .inv-empty { opacity: .5; font-style: italic; padding: 4px 0; }
    .w3d-toast { position: absolute; top: 42%; left: 50%; transform: translate(-50%,-50%); z-index: 9; background: rgba(0,0,0,.72); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 15px; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
  `]
})
export class World3dComponent implements OnInit, OnDestroy {
  @ViewChild('mount') mountRef!: ElementRef;

  buildMode = false;
  fishMode = false;
  // 拆除 / 升级 / 收获（P0 / P2 / P1 审计缺口的前端交互入口）
  removeMode = false;
  upgradeMode = false;
  harvestMode = false;
  hint = 'WASD 移动，空格 跳跃，双击地面跑过去，左键拖拽环绕视角';
  posText = '';
  coins = 0;
  onlineCount = 1;

  // 采矿（M4）
  mineMode = false;          // 采矿模式（OrbitControls 选矿）
  miningReady = false;       // 档案已拉取，HUD 可见
  sellOpen = false;          // 背包/售卖面板展开
  energy = 0;                // 当前能量
  maxEnergy = 100;           // 能量上限
  level = 1;                 // 世界等级
  exp = 0;                   // 累积经验
  expToNext = 100;           // 距下级经验
  inventory: InventoryItem[] = []; // 背包
  miningToast: { text: string; ts: number } | null = null; // 采矿/售卖提示
  private nearestOre: { gx: number; gz: number } | null = null; // 最近可采矿（F 键用）
  /** 能量百分比（模板条形用） */
  get energyPercent(): number { return this.maxEnergy > 0 ? Math.round((this.energy / this.maxEnergy) * 100) : 0; }

  // 聊天（M3）
  chatOpen = true;
  chatInput = '';
  chatMessages: { uid: number; nickname: string; text: string; ts: number; timeText: string }[] = [];
  @ViewChild('chatList') chatListRef?: ElementRef;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();

  private config?: WorldConfigResp;
  private viewRadius = 2;
  private uid = 0;
  /** 暴露给模板：判断聊天消息是否为自己发送 */
  get selfUid(): number { return this.uid; }
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

  // M5 角色/树 GLB 模型模板（HY3D 生成，低模几百 KB，归一化到统一高度后复用）
  private treeModel: THREE.Group | null = null;
  private boyModel: THREE.Group | null = null;
  private girlModel: THREE.Group | null = null;
  private decorPlaced = false; // 男孩/女孩是否已放置（仅放一次）

  // M5 角色程序化动作：模型无骨骼，用整体变换模拟 走/跑/弯腰/待机
  private charAnims: { group: THREE.Group; cx: number; cz: number; baseY: number; phase: number; radius: number; bones?: Record<string, THREE.Object3D> }[] = [];
  private animClock = 0;
  private lastTs = 0;
  private animStateIdx = 0;
  private animStateTimer = 0;
  // 演示用状态循环（实际游戏可替换为真实移动状态：idle/walk/run/bend）
  private static readonly ANIM_STATES = ['walk', 'run', 'bend', 'idle'] as const;
  private static readonly ANIM_STATE_DUR = [3.2, 3.2, 3.0, 2.2]; // 各状态持续秒数

  // 玩家
  private px = 0; private pz = 0; private py = 0; private prot = 0;
  // 平滑显示位置（lerp 跟随物理权威位置，消除一跳一跳）
  private dpx = 0; private dpz = 0; private dpy = 0; private dprot = 0;
  private static readonly SMOOTH_FACTOR = 0.18; // 每帧追赶比例（60fps下约80ms延迟）
  private playerMesh!: THREE.Group;
  private keys: Record<string, boolean> = {};
  // 双击移动目标（世界坐标），null 表示无目标
  private moveTarget: { x: number; z: number } | null = null;
  // P2 双击 A* 寻路：路点队列（世界坐标），依次抵达后清空
  private pathPoints: { x: number; z: number }[] = [];

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
    private state: StateService,
    private assets: AssetService
  ) {}

  ngOnInit(): void {
    this.uid = this.auth.user?.userId ?? 0;
    this.nickname = this.auth.user?.nickname || '我';
    // 调试钩子：首次带 ?debug=1 时启用，并写入 sessionStorage 以便在 SPA 路由/重登后依然生效（不影响正常游戏）
    if ((typeof location !== 'undefined') && new URLSearchParams(location.search).has('debug')) {
      (window as any).__charAnimDebugEnabled = true;
      try { sessionStorage.setItem('__charAnimDebug', '1'); } catch {}
    }
    this.coins = this.state.state.coins ?? 0;
    // 视距：保证能看到足够多的岛屿（22岛分布在±1300范围）
    // 强机放宽到5，窄屏至少4（原值2/3只能看到1-2座岛）
    const baseVR = window.innerWidth >= 1280 ? 5 : 4;
    this.viewRadius = baseVR;

    this.api.config().subscribe({
      next: cfg => {
        if (this.disposed) return;
        // M2 修复（2026-08-12）：总是清空 chunk 缓存（首次 config 时 this.config=undefined 也清，防首次 gridCache 旧数据）
        this.gridCache.clear();
        this.config = cfg;
        this.viewRadius = Math.max(cfg.viewRadius || 0, this.viewRadius); // 前端保底，不被后端小值覆盖
        this.px = cfg.spawnGx;
        this.pz = cfg.spawnGz;
        this.py = cfg.spawnY;
        // 平滑位置同步初始化（避免首次 lerp 从 0,0,0 追赶的大跳）
        this.dpx = this.px; this.dpz = this.pz; this.dpy = this.py; this.dprot = 0;
        this.initScene();
        this.initPlayer();
        this.connectWs();
        this.loadMiningProfile();
        this.preloadModels();   // M5：加载男孩/女孩/树 GLB 模板
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
      if (o.userData?.['shared']) return; // 共享 GLB 模板实例，几何复用不释放
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
    this.scene.background = new THREE.Color(0x7EC8E8);
    // 雾效优化：推远近裁面（减少近处泛白），暖化雾色
    this.scene.fog = new THREE.Fog(0xA0C8D8, 450, 1400);

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
          // 声明 transformed（原 begin_vertex 的职责），再叠加海浪位移
          vec3 transformed = vec3( position );
          float wave1 = sin(transformed.x * 0.02 + uTime * 1.2) * 0.35;
          float wave2 = sin(transformed.y * 0.03 + uTime * 0.8) * 0.25;
          float wave3 = sin((transformed.x + transformed.y) * 0.01 + uTime * 1.5) * 0.5;
          float waveSum = wave1 + wave2 + wave3;
          transformed.z += waveSum;
          vWaveHeight = waveSum;
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
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

    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1500);
    this.camera.position.set(this.px, this.py + 20, this.pz + 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ACES 色调映射：增强对比度与色彩饱和度，解决"白茫茫"问题
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);

    // 灯光（M5 地图视觉优化：降低总光量避免过曝 + ACES 色调映射）
    const sun = new THREE.DirectionalLight(0xFFF4E0, 1.0); // 暖白日光（降低强度）
    sun.position.set(100, 150, 80);
    this.scene.add(sun);
    // 补光（填充阴影区，降低强度）
    const fillLight = new THREE.DirectionalLight(0xB8D4E8, 0.2);
    fillLight.position.set(-60, 40, -50);
    this.scene.add(fillLight);
    // 半球光：天蓝色 + 地面绿色（降低环境光量，让顶点色更饱和）
    this.scene.add(new THREE.HemisphereLight(0x9ED4FF, 0x7ABF5A, 0.45));

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
      } else if (ev.t === 'CHAT' && ev.uid != null && ev.text) {
        this.pushChat(ev.uid, ev.nickname || '', ev.text, ev.ts || Date.now());
      } else if (ev.t === 'TERRAIN_CHANGE' && ev.chunkKey != null) {
        // 矿格被采空：重着色地形 + 移除 3D 矿模型（所有客户端同步）
        this.applyTerrainChange(ev.chunkKey, ev.gx, ev.gz, ev.newType);
      } else if (ev.t === 'OBJECT_REMOVE' && ev.id != null) {
        // P0 拆除：移除网格 + 清缓存（所有客户端同步）
        this.removeObjectMesh(ev.id);
      } else if (ev.t === 'OBJECT_UPDATE' && ev.id != null) {
        // P2 升级 / P1 鱼塘收获：刷新网格（等级缩放 / 生长进度）
        this.updateObjectMesh(ev.id, ev.extJson);
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
      } else if (ev.t === 'MINE_RESULT') {
        // 采矿结果回执（/app/ws.mine）：刷新 HUD + 提示 + 本地地形变化
        this.handleMineResult(ev);
      }
    } catch (e) { /* ignore */ }
  }

  // ================= 聊天（M3） =================
  private pushChat(uid: number, nickname: string, text: string, ts: number): void {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    this.chatMessages.push({ uid, nickname, text, ts, timeText: `${hh}:${mm}` });
    if (this.chatMessages.length > 100) this.chatMessages.shift(); // 仅保留最近 100 条
    this.scrollChatToBottom();
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatListRef?.nativeElement as HTMLElement | undefined;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  sendChat(): void {
    const text = (this.chatInput || '').trim();
    if (!text) return;
    this.ws.send('/app/ws.chat', { text });
    this.chatInput = '';
  }

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) this.scrollChatToBottom();
  }

  blurChat(): void {
    const el = this.chatListRef?.nativeElement as HTMLElement | undefined;
    if (el) (el as HTMLElement).blur?.();
  }

  // ================= 主循环 =================

  private animate(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = this.lastTs ? Math.min((now - this.lastTs) / 1000, 0.05) : 0.016;
    this.lastTs = now;
    // 输入上行（非建造/养鱼模式）：本地不移动，只发输入意图；~30Hz + 按键状态变化立即发
    if (!this.buildMode && !this.fishMode) {
      // 优先处理双击目标移动：有 A* 路点队列则逐点跟随，否则单点 moveTarget，否则手动输入
      if (this.pathPoints.length > 0) {
        this.followPath(now);
      } else if (this.moveTarget) {
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
    this.updateCharAnimations(dt);

    // chunk 流式（节流 ~250ms）
    if (now - this.lastStream > 250) {
      this.lastStream = now;
      this.streamChunks();
      // 邻近矿脉扫描（F 键采矿 + 提示用，仅需玩家附近 chunk）
      this.scanNearbyOre();
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
    if (this.buildMode || this.fishMode || this.mineMode || this.removeMode || this.upgradeMode || this.harvestMode) {
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

  /** 沿 A* 路点队列行走：抵达队首后出队，队列空则停止 */
  private followPath(now: number): void {
    if (!this.pathPoints.length) {
      this.moveTarget = null;
      return;
    }
    const head = this.pathPoints[0];
    const dist = Math.hypot(head.x - this.dpx, head.z - this.dpz);
    if (dist < 0.8) {
      this.pathPoints.shift();
      if (!this.pathPoints.length) {
        this.moveTarget = null;
        if (this.ws.isConnected) {
          this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
        }
        this.hint = '已到达目标位置';
        return;
      }
    }
    this.moveTarget = head;
    this.updateMoveTowardsTarget(now);
  }

  /**
   * P2 双击 A* 寻路：基于已加载 chunk 的语义网格，避开水/树/岩/山/矿，
   * 从 (startGx,startGz) 寻路到 (targetGx,targetGz)，返回逐格中心点路点。
   * 无语义网格或不可达时返回 null（调用方回退直线移动）。
   */
  private findPath(startGx: number, startGz: number, targetGx: number, targetGz: number): { x: number; z: number }[] | null {
    // 可达性：起点/终点所在 cell 必须可走（终点不可走则找最近可走邻格）
    const sc = this.cellChunk(startGx, startGz);
    const tc = this.cellChunk(targetGx, targetGz);
    if (!sc || !tc) return null;

    // 目标若不可走，就近找最近可走格
    let tg = { gx: targetGx, gz: targetGz };
    if (!this.isWalkableCell(targetGx, targetGz)) {
      const near = this.nearestWalkable(targetGx, targetGz);
      if (!near) return null;
      tg = near;
    }

    // 取有语义网格覆盖的 chunk 边界（覆盖起终点所在 chunk）
    const minCx = Math.min(sc.cx, tc.cx), maxCx = Math.max(sc.cx, tc.cx);
    const minCz = Math.min(sc.cz, tc.cz), maxCz = Math.max(sc.cz, tc.cz);
    // 若任一关键 chunk 未加载，无法可靠寻路
    const originX = minCx * CHUNK, originZ = minCz * CHUNK;
    const spanX = (maxCx - minCx + 1) * CHUNK, spanZ = (maxCz - minCz + 1) * CHUNK;
    const getSem = (gx: number, gz: number): number | null => {
      const c = this.cellChunk(gx, gz);
      if (!c) return null;
      const grid = this.gridCache.get(`${c.cx}_${c.cz}`);
      if (!grid) return null;
      const lx = gx - c.cx * CHUNK, lz = gz - c.cz * CHUNK;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) return null;
      return grid.semantic[lz * CHUNK + lx];
    };

    const walk = (gx: number, gz: number): boolean => {
      const s = getSem(gx, gz);
      if (s == null) return false;
      return s === 1 || s === 2 || s === 9; // sand / grass / empty
    };

    const key = (gx: number, gz: number) => `${gx},${gz}`;
    const startK = key(startGx, startGz);
    const targetK = key(tg.gx, tg.gz);
    const open = new Map<string, { gx: number; gz: number; f: number }>();
    const came = new Map<string, string>();
    const gScore = new Map<string, number>();
    const h = (gx: number, gz: number) => Math.hypot(gx - tg.gx, gz - tg.gz);
    open.set(startK, { gx: startGx, gz: startGz, f: h(startGx, startGz) });
    gScore.set(startK, 0);
    const closed = new Set<string>();

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    let found = false;
    let guard = 0;
    const maxIter = spanX * spanZ * 8 + 1000;
    while (open.size && guard++ < maxIter) {
      // 取 f 最小
      let curK = '', cur: { gx: number; gz: number; f: number } | null = null;
      let best = Infinity;
      for (const [k, v] of open) {
        if (v.f < best) { best = v.f; curK = k; cur = v; }
      }
      if (!cur) break;
      open.delete(curK);
      if (curK === targetK) { found = true; break; }
      closed.add(curK);
      for (const [dx, dz] of dirs) {
        const ngx = cur.gx + dx, ngz = cur.gz + dz;
        if (ngx < originX || ngz < originZ || ngx >= originX + spanX || ngz >= originZ + spanZ) continue;
        if (!walk(ngx, ngz)) continue;
        // 对角线防穿墙（两侧正交格均须可走）
        if (dx !== 0 && dz !== 0) {
          if (!walk(cur.gx + dx, cur.gz) || !walk(cur.gx, cur.gz + dz)) continue;
        }
        const nk = key(ngx, ngz);
        if (closed.has(nk)) continue;
        const step = (dx !== 0 && dz !== 0) ? 1.4142 : 1;
        const tentative = (gScore.get(curK) ?? 0) + step;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, curK);
          gScore.set(nk, tentative);
          const f = tentative + h(ngx, ngz);
          open.set(nk, { gx: ngx, gz: ngz, f });
        }
      }
    }
    if (!found) return null;
    // 回溯路径
    const path: { x: number; z: number }[] = [];
    let k = targetK;
    while (k) {
      const [gx, gz] = k.split(',').map(Number);
      path.push({ x: gx + 0.5, z: gz + 0.5 });
      if (k === startK) break;
      k = came.get(k) || '';
    }
    path.reverse();
    // 去掉起点（玩家已在），保留后续路点
    if (path.length > 1) path.shift();
    return path;
  }

  /** cell 所属 chunk（含越界判断） */
  private cellChunk(gx: number, gz: number): { cx: number; cz: number } | null {
    const cx = Math.floor(gx / CHUNK);
    const cz = Math.floor(gz / CHUNK);
    if (!this.gridCache.has(`${cx}_${cz}`)) return null;
    return { cx, cz };
  }

  /** 单格是否可走（需有语义数据且为 sand/grass/empty） */
  private isWalkableCell(gx: number, gz: number): boolean {
    const c = this.cellChunk(gx, gz);
    if (!c) return false;
    const grid = this.gridCache.get(`${c.cx}_${c.cz}`);
    if (!grid) return false;
    const lx = gx - c.cx * CHUNK, lz = gz - c.cz * CHUNK;
    if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) return false;
    const s = grid.semantic[lz * CHUNK + lx];
    return s === 1 || s === 2 || s === 9;
  }

  /** 从 (gx,gz) 就近找最近可走格（搜索半径内螺旋） */
  private nearestWalkable(gx: number, gz: number): { gx: number; gz: number } | null {
    for (let r = 1; r <= 6; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.isWalkableCell(gx + dx, gz + dz)) return { gx: gx + dx, gz: gz + dz };
        }
      }
    }
    return null;
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
    // M5：尝试在出生区块附近放置男孩/女孩（地形与模型均就绪后落位，仅一次）
    this.tryPlaceCharacters();
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
        if (t.userData['shared']) continue; // 共享 GLB 模板几何/材质，仅移除不 dispose
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
    // 计算本 chunk 高度范围，用于归一化高度变化着色
    let hMin = Infinity, hMax = -Infinity;
    for (let i = 0; i < h.length; i++) { if (h[i] < hMin) hMin = h[i]; if (h[i] > hMax) hMax = h[i]; }
    const hRange = Math.max(hMax - hMin, 1); // 防除零
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const i = lz * N + lx;
        positions[i * 3] = resp.cx * CHUNK + lx;
        // M3 修复：WATER 语义格（0）的 Y 钳制到海平面，消除"水下山脉"和"蓝色高地"
        const cell = sem[Math.min(lz, CHUNK - 1) * CHUNK + Math.min(lx, CHUNK - 1)];
        positions[i * 3 + 1] = (cell === 0) ? waterLevel : h[i];
        positions[i * 3 + 2] = resp.cz * CHUNK + lz;
        const c = CELL_COLORS[cell] ?? CELL_COLORS[2];
        // M5 高度变化着色：谷暗峰亮（±12% 亮度），增加地形层次感
        const hNorm = (h[i] - hMin) / hRange;       // 0~1
        const hBright = 0.88 + hNorm * 0.24;         // 0.88~1.12
        colors[i * 3] = (((c >> 16) & 255) / 255) * hBright;
        colors[i * 3 + 1] = (((c >> 8) & 255) / 255) * hBright;
        colors[i * 3 + 2] = ((c & 255) / 255) * hBright;
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, fog: false, side: THREE.DoubleSide });
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

  /** 单棵低模树（M5：优先用 HY3D 真实树 GLB，未加载完成回退到程序化树） */
  private makeTree(): THREE.Group {
    if (this.treeModel) {
      const t = this.treeModel.clone(true);
      t.userData['shared'] = true; // 共享模板几何/材质，卸载时仅移除不 dispose
      return t;
    }
    const g = new THREE.Group();
    // 树干（略粗，带锥度）
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.2, 0.85, 7),
      new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.95 })
    );
    trunk.position.y = 0.42;
    // 三层递减圆锥树冠（松树风格），每层颜色略有变化
    const layers = [
      { r: 0.85, h: 1.4, y: 1.35, c: 0x2D8B2E },  // 底层大
      { r: 0.65, h: 1.1, y: 2.05, c: 0x349A35 },  // 中层
      { r: 0.45, h: 0.8,  y: 2.6, c: 0x3CAA3D },   // 顶层小
    ];
    for (const l of layers) {
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(l.r, l.h, 8),
        new THREE.MeshStandardMaterial({ color: l.c, roughness: 0.85 })
      );
      foliage.position.y = l.y;
      g.add(foliage);
    }
    g.add(trunk);
    return g;
  }

  // ================= M5 角色/树 GLB 模板（HY3D 生成） =================

  /** 预加载三个低模 GLB 模板（男孩/女孩/树），归一化到统一高度后缓存复用 */
  private preloadModels(): void {
    const base = 'assets/models/';
    const norm = (g: THREE.Group | null, h: number) => (g ? this.normalizeModel(g, h) : null);
    // M7：给定加载后的 gltf 场景 + rig 配置，提取 mesh 并构建骨骼层级后归一化
    const rigThenNorm = (g: THREE.Group | null, h: number, rig: any): THREE.Group | null => {
      if (!g) return null;
      let mesh: THREE.Mesh | null = null;
      g.traverse(c => { if ((c as THREE.Mesh).isMesh && !mesh) mesh = c as THREE.Mesh; });
      if (!mesh) return norm(g, h);
      const rigged = this.buildRiggedModel(mesh, rig);
      return this.normalizeModel(rigged, h);
    };
    this.assets.loadModel(base + 'tree.glb').then(g => {
      this.treeModel = norm(g, 3.2);
      if (!this.treeModel) console.warn('[world3d] 树模型加载失败，使用程序化树回退');
      else this.tryPlaceCharacters(); // 树就绪后尝试补放角色（若角色已就绪）
    });
    this.assets.loadModel(base + 'boy.glb').then(g => {
      this.boyModel = rigThenNorm(g, 2.0, BOY_RIG);
      this.tryPlaceCharacters();
    });
    this.assets.loadModel(base + 'girl.glb').then(g => {
      this.girlModel = rigThenNorm(g, 2.0, GIRL_RIG);
      this.tryPlaceCharacters();
    });
  }

  /** 归一化模型：缩放到目标高度，并把底部对齐到局部 y=0（外层 Group 包裹，便于按实例设置世界坐标） */
  private normalizeModel(obj: THREE.Object3D, targetH: number): THREE.Group {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = targetH / Math.max(size.y, 1e-3);
    obj.scale.multiplyScalar(s);
    const box2 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box2.min.y; // 底部贴地（内层局部坐标）
    const outer = new THREE.Group();
    outer.add(obj);
    return outer;
  }

  /**
   * M7 刚性骨骼绑定：将无骨骼 GLB 模型按预计算的 rig 配置拆分为骨骼层级。
   * 原理：rig JSON（gen_rig.py 产出）记录了每根骨骼拥有的三角形索引和 pivot 点。
   * 运行时按 tris 拆分子几何体，每根骨骼的顶点偏移到 pivot 局部空间，
   * 创建 bone Object3D(pivot) 作为父节点 → 旋转 bone 即绕 pivot 刚性旋转该肢体。
   */
  private buildRiggedModel(sceneMesh: THREE.Mesh, rig: any): THREE.Group {
    const geo = sceneMesh.geometry;
    const posAttr = geo.attributes['position'];
    const nrmAttr = geo.attributes['normal'] || null;
    const idxAttr = geo.index || null;
    const nVerts = posAttr.count;

    // 辅助：获取三角形三个顶点的全局索引
    const getTri = (i: number): [number, number, number] => {
      if (idxAttr) { return [idxAttr.getX(i * 3), idxAttr.getX(i * 3 + 1), idxAttr.getX(i * 3 + 2)]; }
      return [i * 3, i * 3 + 1, i * 3 + 2];
    };

    interface BoneEntry { boneObj: THREE.Object3D; mesh: THREE.Mesh; pivot: number[]; parentName: string | null; }
    const bones: Record<string, BoneEntry> = {};

    for (const bone of rig.bones) {
      const vmap: Record<number, number> = {};
      const lpos: number[] = [];
      const lnrm: number[] = [];
      const localTris: number[] = [];
      let li = 0;

      for (const ti of bone.tris) {
        const [v0, v1, v2] = getTri(ti);
        for (const gv of [v0, v1, v2]) {
          if (!(gv in vmap)) {
            vmap[gv] = li++;
            const px = posAttr.getX(gv), py = posAttr.getY(gv), pz = posAttr.getZ(gv);
            // 偏移到 pivot 局部空间（静止时 world 位置 = pivot + localPos = 原始坐标）
            lpos.push(px - bone.pivot[0], py - bone.pivot[1], pz - bone.pivot[2]);
            if (nrmAttr) { lnrm.push(nrmAttr.getX(gv), nrmAttr.getY(gv), nrmAttr.getZ(gv)); }
          }
        }
        localTris.push(vmap[v0], vmap[v1], vmap[v2]);
      }

      // 构建子 BufferGeometry
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
      if (lnrm.length) { sgeo.setAttribute('normal', new THREE.Float32BufferAttribute(lnrm, 3)); }
      sgeo.setIndex(localTris);
      sgeo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.05, color: 0xdddddd });
      // 复用原始材质颜色（若有）
      if (sceneMesh.material && (sceneMesh.material as THREE.MeshStandardMaterial).color) {
        (mat as THREE.MeshStandardMaterial).color = ((sceneMesh.material as THREE.MeshStandardMaterial).color).clone();
      }
      const mesh = new THREE.Mesh(sgeo, mat);

      bones[bone.name] = { boneObj: new THREE.Object3D(), mesh, pivot: bone.pivot, parentName: bone.parent };
    }

    // 创建骨骼 Object3D 并建立父子层级
    const rootGroup = new THREE.Group();
    for (const b of rig.bones) {
      const entry = bones[b.name];
      entry.boneObj.position.set(entry.pivot[0], entry.pivot[1], entry.pivot[2]);
      entry.boneObj.name = b.name;
      entry.boneObj.add(entry.mesh);  // 网格作为子节点（局部坐标已在 pivot 空间）
    }
    for (const b of rig.bones) {
      const entry = bones[b.name];
      if (entry.parentName && bones[entry.parentName]) {
        bones[entry.parentName].boneObj.add(entry.boneObj);
      } else {
        rootGroup.add(entry.boneObj);
      }
    }

    return rootGroup;
  }

  /** 在出生区块附近草地放置男孩/女孩（仅放一次；模型与地形均就绪后才落位） */
  private tryPlaceCharacters(): void {
    if (this.decorPlaced) return;
    if (!this.boyModel || !this.girlModel) return;
    // 需等出生 chunk 地形数据加载（heightAt 才有值）
    if (!this.gridCache.has(`${Math.floor(this.px / CHUNK)}_${Math.floor(this.pz / CHUNK)}`)) return;
    const spots = this.findGrassNear(this.px, this.pz, 2);
    if (spots.length < 2) return; // 找不到两处草地则暂不放置
    this.decorPlaced = true;
    const models = [this.boyModel, this.girlModel];
    const boneNames = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
    spots.forEach((sp, i) => {
      const y = this.heightAt(sp.gx, sp.gz);
      if (y === undefined) return;
      const inst = models[i].clone(true);
      inst.position.set(sp.gx, y, sp.gz);
      inst.rotation.y = (i * 1.7) % (Math.PI * 2);
      inst.userData['shared'] = true;
      this.scene.add(inst);
      // M7：收集骨骼引用（驱动四肢独立运动）
      const bones: Record<string, THREE.Object3D> = {};
      inst.traverse(o => { if (o.name && boneNames.includes(o.name)) bones[o.name] = o; });
      this.charAnims.push({ group: inst, cx: sp.gx, cz: sp.gz, baseY: y, phase: i * 1.3, radius: 4 + i * 1.6, bones });
    });
  }

  /** 以 (cx0,cz0) 为中心、半径 8 内扫描 semantic===2（草地）的格子，返回前 count 个 */
  private findGrassNear(cx0: number, cz0: number, count: number): { gx: number; gz: number }[] {
    const res: { gx: number; gz: number }[] = [];
    const grid = this.gridCache.get(`${Math.floor(cx0 / CHUNK)}_${Math.floor(cz0 / CHUNK)}`);
    if (!grid) return res;
    const baseX = Math.floor(cx0), baseZ = Math.floor(cz0);
    for (let r = 0; r <= 8 && res.length < count; r++) {
      for (let dz = -r; dz <= r && res.length < count; dz++) {
        for (let dx = -r; dx <= r && res.length < count; dx++) {
          const gx = baseX + dx, gz = baseZ + dz;
          const lx = gx - Math.floor(gx / CHUNK) * CHUNK;
          const lz = gz - Math.floor(gz / CHUNK) * CHUNK;
          if (grid.semantic[lz * CHUNK + lx] === 2) res.push({ gx, gz });
        }
      }
    }
    return res;
  }

  /**
   * M7 骨骼驱动角色动作：模型本身无骨骼（skins:0/animations:0），
   * 加载时已由 buildRiggedModel 按 rig 配置拆分为 6 根刚性骨骼（头/躯干/左臂/右臂/左腿/右腿）。
   * 这里 root 组负责整体位置与朝向（巡逻/面向），各骨骼 Object3D 绕自身 pivot 旋转，
   * 实现手和脚独立摆动：待机点头/轻摆、走跑四肢交替前后摆、弯腰绕髋部前倾。
   * root 的 -lean/-pitch 已下放给躯干骨骼，避免整体俯仰。
   */
  private updateCharAnimations(dt: number): void {
    this.animClock += dt;
    // 演示状态循环
    this.animStateTimer += dt;
    const dur = World3dComponent.ANIM_STATE_DUR[this.animStateIdx];
    if (this.animStateTimer >= dur) {
      this.animStateTimer = 0;
      this.animStateIdx = (this.animStateIdx + 1) % World3dComponent.ANIM_STATES.length;
    }
    const state = World3dComponent.ANIM_STATES[this.animStateIdx];
    // 调试快照（仅 ?debug=1 时写入，供自动化验证读取角色动作状态与变换）
    const dbgOn = (window as any).__charAnimDebugEnabled || (() => { try { return sessionStorage.getItem('__charAnimDebug') === '1'; } catch { return false; } })();
    if (dbgOn) {
      (window as any).__charAnimDebug = {
        state, clock: +this.animClock.toFixed(2),
        chars: this.charAnims.map(c => ({
          x: +c.group.position.x.toFixed(3), y: +c.group.position.y.toFixed(3), z: +c.group.position.z.toFixed(3),
          rx: +c.group.rotation.x.toFixed(3), ry: +c.group.rotation.y.toFixed(3), rz: +c.group.rotation.z.toFixed(3),
          // M7：记录各骨骼旋转，便于验证"手脚分开动"（根组只管位置/朝向）
          bones: c.bones ? Object.fromEntries(
            Object.entries(c.bones).map(([k, o]) => [k, {
              rx: +o.rotation.x.toFixed(3), ry: +o.rotation.y.toFixed(3), rz: +o.rotation.z.toFixed(3)
            }])
          ) : null
        }))
      };
    }

    for (const c of this.charAnims) {
      const g = c.group;
      const t = this.animClock + c.phase; // 角色间相位错开，避免完全同步
      const B = c.bones || {};
      const tor = B['torso'], hed = B['head'];
      const al = B['armL'], ar = B['armR'], ll = B['legL'], lr = B['legR'];
      if (state === 'idle') {
        // 待机：呼吸般轻微上下起伏；骨骼：头微点头 + 手臂轻摆 + 躯干归零
        const bob = Math.sin(t * 1.6) * 0.04;
        g.position.set(c.cx, c.baseY + bob, c.cz);
        g.rotation.set(0, g.rotation.y, 0);
        if (tor) tor.rotation.set(0, 0, 0);
        if (hed) hed.rotation.set(Math.sin(t * 1.6) * 0.06, 0, Math.sin(t * 0.9) * 0.03);
        if (al) al.rotation.set(0, 0, Math.sin(t * 0.8) * 0.04);
        if (ar) ar.rotation.set(0, 0, -Math.sin(t * 0.8) * 0.04);
        if (ll) ll.rotation.set(0, 0, 0);
        if (lr) lr.rotation.set(0, 0, 0);
      } else if (state === 'walk' || state === 'run') {
        const isRun = state === 'run';
        const speed = isRun ? 1.7 : 0.9;   // 巡逻角速度
        const freq = isRun ? 3.0 : 2.0;    // 步频
        const amp = isRun ? 0.16 : 0.09;   // 颠簸幅度
        const lean = isRun ? 0.30 : 0.14;  // 前倾程度（由躯干骨骼承担）
        const ang = t * speed;
        const nx = c.cx + Math.cos(ang) * c.radius;
        const nz = c.cz + Math.sin(ang) * c.radius;
        const gy = this.heightAt(nx, nz) ?? c.baseY;
        const bob = Math.sin(t * freq) * amp;          // 迈步上下
        g.position.set(nx, gy + bob, nz);
        // 朝向运动切线方向（root 仅负责朝向，lean 交给躯干骨骼）
        const dx = -Math.sin(ang) * c.radius;
        const dz = Math.cos(ang) * c.radius;
        g.rotation.set(0, Math.atan2(dx, dz), 0);
        // 骨骼驱动：四肢交替摆动（手和脚分开动）
        const s = Math.sin(t * freq);
        if (tor) tor.rotation.set(lean, 0, 0);
        if (hed) hed.rotation.set(0, 0, 0);
        if (al) al.rotation.set(s * 0.50, 0, 0);   // 左臂前摆
        if (ar) ar.rotation.set(-s * 0.50, 0, 0);  // 右臂后摆（反向）
        if (ll) ll.rotation.set(-s * 0.38, 0, 0);  // 左腿后摆（与左臂反相）
        if (lr) lr.rotation.set(s * 0.38, 0, 0);   // 右腿前摆
      } else if (state === 'bend') {
        // 弯腰：整体下沉 + 躯干骨骼绕髋部大幅前倾（手和脚跟随躯干）
        const drop = 0.55;
        const pitch = 1.0;
        const bob = Math.sin(t * 1.4) * 0.03;
        g.position.set(c.cx, c.baseY - drop + bob, c.cz);
        g.rotation.set(0, g.rotation.y, 0);
        if (tor) tor.rotation.set(pitch, 0, 0);
        if (hed) hed.rotation.set(0, 0, 0);
        if (al) al.rotation.set(0.3, 0, 0);   // 手臂随躯干前倾自然下垂向前
        if (ar) ar.rotation.set(0.3, 0, 0);
        if (ll) ll.rotation.set(-pitch * 0.25, 0, 0);
        if (lr) lr.rotation.set(-pitch * 0.25, 0, 0);
      }
    }
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
    (g as any).__isObjGroup = true;
    if (o.type === 'fish_pond') {
      // 鱼塘：蓝色扁圆柱 + 水面
      const pond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.5, 20),
        new THREE.MeshStandardMaterial({ color: 0x4CC9F0, transparent: true, opacity: 0.85 })
      );
      pond.position.y = 0.25;
      g.add(pond);
      // P1 养殖循环：生长进度环（灰=未成熟，金=成熟可收获），随 OBJECT_UPDATE 刷新
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.08, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x9a9a92 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.55;
      ring.name = 'growthRing';
      g.add(ring);
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
      // P2 建筑升级：按等级缩放（Lv1→1.0，Lv2→1.18，Lv3→1.36）
      const lvl = this.objectLevel(o);
      g.userData['level'] = lvl;
      const s = 1 + (lvl - 1) * 0.18;
      g.scale.set(s, s, s);
    }
    g.position.set(o.gx + 0.5, groundY, o.gz + 0.5);
    this.scene.add(g);
    this.objectMeshes.set(o.id, g);
    // 初始化鱼塘生长进度
    if (o.type === 'fish_pond') {
      this.refreshPondGrowth(g, o.extJson);
    }
  }

  /** 从 object 的 extJson 解析建筑等级（默认 1） */
  private objectLevel(o: WorldObjectResp): number {
    const ext = o.extJson as any;
    if (ext && ext.level != null) {
      const lv = Number(ext.level);
      if (!isNaN(lv) && lv >= 1) return lv;
    }
    return 1;
  }

  /** 刷新鱼塘生长进度环（P1）：依据 plantedAt/cycleMs 计算成熟度 → 环色 + 提示 */
  private refreshPondGrowth(group: THREE.Object3D, extJson: any): void {
    const ring = group.getObjectByName('growthRing') as THREE.Mesh | undefined;
    if (!ring) return;
    const ext = (extJson && typeof extJson === 'object') ? extJson : {};
    const plantedAt = typeof ext.plantedAt === 'number' ? ext.plantedAt : 0;
    const cycleMs = typeof ext.cycleMs === 'number' ? ext.cycleMs : 60000;
    const elapsed = plantedAt ? Date.now() - plantedAt : 0;
    const progress = cycleMs > 0 ? Math.min(1, Math.max(0, elapsed / cycleMs)) : 0;
    const ready = progress >= 1;
    const mat = ring.material as THREE.MeshStandardMaterial;
    mat.color.set(ready ? 0xFFD700 : 0x9a9a92);
    const s = 0.4 + progress * 0.8;
    ring.scale.set(s, s, 1);
  }

  /** 移除对象网格（OBJECT_REMOVE 同步 / 本地拆除结果用） */
  private removeObjectMesh(id: number): void {
    const g = this.objectMeshes.get(id);
    if (g) {
      this.scene.remove(g);
      g.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
      });
      this.objectMeshes.delete(id);
    }
    this.worldObjects.delete(id);
  }

  /** 刷新对象网格（OBJECT_UPDATE：升级等级缩放 / 鱼塘收获后进度重置） */
  private updateObjectMesh(id: number, extJson: any): void {
    const g = this.objectMeshes.get(id);
    const o = this.worldObjects.get(id);
    if (!g || !o) return;
    if (typeof extJson === 'object' && extJson != null) {
      o.extJson = extJson;
      if (o.type === 'fish_pond') {
        this.refreshPondGrowth(g, extJson);
      } else {
        const lvl = (extJson.level != null) ? Number(extJson.level) : (g.userData['level'] || 1);
        g.userData['level'] = lvl;
        const s = 1 + (lvl - 1) * 0.18;
        g.scale.set(s, s, s);
      }
    }
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
    this.mineMode = false;
    this.controls.enabled = true;
    this.hint = '建造模式：点击地面放置木屋（100 金币），点击「跟随」退出';
  }

  enterFish(): void {
    this.fishMode = true;
    this.buildMode = false;
    this.mineMode = false;
    this.controls.enabled = true;
    this.hint = '养鱼模式：点击蓝色水面放置鱼塘，点击「跟随」退出';
  }

  enterMine(): void {
    this.mineMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '采矿模式：点击矿石开采（4 能量/次，需靠近矿脉 ≤3.5），点击「跟随」退出';
  }

  /** 拆除模式（P0）：点击自己放置的建筑/鱼塘即可拆除（不退还金币） */
  enterRemove(): void {
    this.removeMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '拆除模式：点击你的建筑/鱼塘拆除，点击「跟随」退出';
  }

  /** 升级模式（P2）：点击自己放置的建筑升级（扣升级费，最高 Lv3） */
  enterUpgrade(): void {
    this.upgradeMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '升级模式：点击你的建筑升级（Lv1→Lv2→Lv3），点击「跟随」退出';
  }

  /** 收获模式（P1）：点击成熟的鱼塘收获（发放金币并进入下一轮养殖） */
  enterHarvest(): void {
    this.harvestMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.controls.enabled = true;
    this.hint = '收获模式：点击金色光环的成熟鱼塘收获，点击「跟随」退出';
  }

  exitInteract(): void {
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = false;
    this.hint = '已回到跟随视角，WASD 移动';
  }

  toggleSell(): void {
    this.sellOpen = !this.sellOpen;
  }

  /** 售卖单个背包矿石（整组）换积分 */
  sellItem(it: InventoryItem): void {
    if (it.qty <= 0) return;
    this.api.sellMining([{ type: it.type, qty: it.qty }]).subscribe({
      next: r => {
        if (r.code === 0 && r.data) {
          this.coins = r.data.coins ?? this.coins;
          this.state.state.coins = this.coins;
          this.showToast(`💰 售卖获得 ${r.data.earnedCoins} 积分`);
        } else {
          this.showToast('售卖失败：' + (r.msg || '未知错误'));
        }
        this.loadMiningProfile(); // 权威刷新背包/能量
      },
      error: () => this.showToast('售卖请求失败')
    });
  }

  /** 拉取采矿档案（能量/等级/经验/背包），权威刷新 HUD */
  private loadMiningProfile(): void {
    this.api.miningProfile().subscribe({
      next: p => {
        if (this.disposed) return;
        this.energy = p.energy;
        this.maxEnergy = p.maxEnergy || 100;
        this.level = p.level;
        this.exp = p.exp;
        this.expToNext = p.expToNext;
        this.inventory = p.inventory || [];
        this.miningReady = true;
      },
      error: () => { this.miningReady = true; } // 仍显示 HUD，能量默认 0
    });
  }

  /** 发送采矿意图（/app/ws.mine），服务端校验矿脉/邻近/能量 */
  private doMine(gx: number, gz: number): void {
    if (!this.ws.isConnected) {
      this.hint = '尚未连接，无法采矿';
      return;
    }
    this.ws.send('/app/ws.mine', { gx, gz });
    this.hint = `⛏️ 采矿中 @(${gx},${gz})...`;
  }

  /** 处理 MINE_RESULT 回执：刷新 HUD + 提示 + 本地地形变化 */
  private handleMineResult(ev: any): void {
    if (ev.code === 0 && ev.data) {
      const d = ev.data as MineResult;
      this.showToast(`⛏️ 采到 ${this.oreName(d.oreType)} +${d.expGained}EXP（背包 ×${d.itemQty}）`);
      this.hint = `采矿成功：${this.oreName(d.oreType)}`;
      // 本地立即重着色 + 移除矿模型（与 TERRAIN_CHANGE 广播一致，去重安全）
      this.applyTerrainChange(`${Math.floor(d.gx / CHUNK)}_${Math.floor(d.gz / CHUNK)}`, d.gx, d.gz, d.newType);
    } else {
      this.showToast('❌ ' + (ev.msg || '采矿失败'));
      this.hint = '采矿失败：' + (ev.msg || '未知错误');
    }
    this.loadMiningProfile(); // 权威刷新能量/经验/背包
  }

  /** 矿格变化：重着色地形顶点 + 移除对应 3D 矿模型（所有客户端通用） */
  private applyTerrainChange(chunkKey: string, gx: number, gz: number, newType: string): void {
    const mesh = this.chunkMeshes.get(chunkKey);
    if (mesh) {
      const [cx, cz] = chunkKey.split('_').map(Number);
      const lx = gx - cx * CHUNK;
      const lz = gz - cz * CHUNK;
      const code = newType === 'empty' ? 9 : (Number(newType) || 2);
      const col = new THREE.Color(CELL_COLORS[code] ?? CELL_COLORS[2]);
      const geo = mesh.geometry as THREE.BufferGeometry;
      const colors = geo.getAttribute('color') as THREE.BufferAttribute;
      const xs = [lx, Math.min(lx + 1, N - 1)];
      const zs = [lz, Math.min(lz + 1, N - 1)];
      for (const x of xs) for (const z of zs) {
        colors.setXYZ(z * N + x, col.r, col.g, col.b);
      }
      colors.needsUpdate = true;
    }
    // 移除该矿 3D 模型（按世界坐标匹配）
    const ores = this.oreMeshes.get(chunkKey);
    if (ores) {
      for (let i = ores.length - 1; i >= 0; i--) {
        const g = ores[i];
        if (Math.abs(g.position.x - (gx + 0.5)) < 0.01 && Math.abs(g.position.z - (gz + 0.5)) < 0.01) {
          this.scene.remove(g);
          g.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            const mat = m.material as THREE.Material | THREE.Material[];
            if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
          });
          ores.splice(i, 1);
          break;
        }
      }
    }
  }

  /** 扫描玩家附近 chunk 的矿脉，供 F 键采矿与提示 */
  private scanNearbyOre(): void {
    const R = 3.5;
    const pcx = Math.floor(this.dpx / CHUNK);
    const pcz = Math.floor(this.dpz / CHUNK);
    let best: { gx: number; gz: number; d: number } | null = null;
    for (const [key, grid] of this.gridCache) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cz - pcz) > 1) continue; // 仅邻近 chunk
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const cell = grid.semantic[lz * CHUNK + lx];
          if (cell !== 6 && cell !== 7 && cell !== 8) continue; // ORE_*
          const gx = cx * CHUNK + lx;
          const gz = cz * CHUNK + lz;
          const d = Math.hypot(this.dpx - gx, this.dpz - gz);
          if (d <= R && (!best || d < best.d)) best = { gx, gz, d };
        }
      }
    }
    this.nearestOre = best ? { gx: best.gx, gz: best.gz } : null;
    if (best && !this.mineMode) {
      this.hint = `附近有矿脉（${Math.round(best.d)} 格内），按 F 开采`;
    } else if (!best && this.hint.indexOf('附近有矿脉') === 0) {
      this.hint = 'WASD 移动，空格 跳跃，双击地面跑过去，左键拖拽环绕视角';
    }
  }

  /** 顶部居中提示（自动消失） */
  private showToast(text: string): void {
    this.miningToast = { text, ts: Date.now() };
    setTimeout(() => {
      if (this.miningToast && Date.now() - this.miningToast.ts >= 1800) {
        this.miningToast = null;
      }
    }, 1800);
  }

  /** 矿石类型中文名 */
  private oreName(code: string): string {
    if (code === 'ore_coal') return '煤矿';
    if (code === 'ore_iron') return '铁矿';
    if (code === 'ore_gold') return '金矿';
    return code;
  }

  private onCanvasClick(x: number, y: number): void {
    if (!this.buildMode && !this.fishMode && !this.removeMode && !this.upgradeMode && !this.harvestMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);

    // 拆除 / 升级 / 收获：射线命中已有对象（建筑/鱼塘）
    if (this.removeMode || this.upgradeMode || this.harvestMode) {
      const objHits = this.raycaster.intersectObjects(Array.from(this.objectMeshes.values()), true);
      const group = objHits.length ? this.findObjectGroup(objHits[0].object) : null;
      if (group) {
        const gx = Math.floor(group.position.x);
        const gz = Math.floor(group.position.z);
        if (this.removeMode) {
          this.api.remove(gx, gz).subscribe({
            next: r => {
              this.hint = r.code === 0 ? '拆除成功！' : '拆除失败：' + r.msg;
              if (r.code === 0 && r.data) this.removeObjectMesh(r.data.id);
            },
            error: () => { this.hint = '拆除请求失败'; }
          });
        } else if (this.upgradeMode) {
          this.api.upgrade(gx, gz).subscribe({
            next: r => {
              this.hint = r.code === 0 ? '升级成功！' : '升级失败：' + r.msg;
              if (r.code === 0 && r.data) this.updateObjectMesh(r.data.id, r.data.extJson);
              this.refreshCoins();
            },
            error: () => { this.hint = '升级请求失败'; }
          });
        } else if (this.harvestMode) {
          this.api.harvest(gx, gz).subscribe({
            next: r => {
              if (r.code === 0 && r.data) {
                if (r.data.ready) {
                  this.hint = `收获成功！获得 ${r.data.reward} 金币`;
                  this.showToast(`🎣 收获 +${r.data.reward} 金币`);
                  if (r.data && this.worldObjects) {
                    // 通过 OBJECT_UPDATE 已刷新；兜底：本地刷新对应鱼塘
                  }
                } else {
                  this.hint = `鱼塘未成熟，还需 ${Math.ceil(r.data.remainingMs / 1000)} 秒`;
                }
                this.refreshCoins();
              } else {
                this.hint = '收获失败：' + (r.msg || '未知错误');
              }
            },
            error: () => { this.hint = '收获请求失败'; }
          });
        }
      } else {
        this.hint = '请点击你的建筑/鱼塘进行操作';
      }
      return;
    }

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
    } else if (this.mineMode) {
      this.doMine(gx, gz);
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

  /** 从射线命中的子网格向上回溯到 objectMeshes 中的对象组 */
  private findObjectGroup(obj: THREE.Object3D): THREE.Group | null {
    let node: THREE.Object3D | null = obj;
    while (node) {
      if (this.objectMeshes && (node as any).__isObjGroup) return node as THREE.Group;
      node = node.parent;
    }
    return null;
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
    if (!this.dragging || this.buildMode || this.fishMode || this.mineMode) return;
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

  /** 双击地面：射线检测地形交点 → A* 寻路（绕开水/树/岩）→ 逐点行走（P2） */
  private onDoubleClick = (e: MouseEvent): void => {
    // 建造/养鱼/拆除/升级/收获模式下双击不触发移动（避免冲突）
    if (this.buildMode || this.fishMode || this.removeMode || this.upgradeMode || this.harvestMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const meshes = Array.from(this.chunkMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    const point = hits[0].point;
    const targetGx = Math.floor(point.x);
    const targetGz = Math.floor(point.z);
    // 清空旧目标/路径
    this.moveTarget = null;
    const startGx = Math.floor(this.dpx);
    const startGz = Math.floor(this.dpz);
    // A* 寻路（基于语义网格避障）
    const path = this.findPath(startGx, startGz, targetGx, targetGz);
    if (path && path.length > 0) {
      this.pathPoints = path;
      this.hint = `🧭 寻路 ${path.length} 个路点 → (${targetGx}, ${targetGz})`;
      this.sendMoveTarget();
    } else {
      // 无语义网格或不可达：回退直线移动
      this.moveTarget = { x: point.x, z: point.z };
      this.hint = `📍 移动目标: (${targetGx}, ${targetGz})（直线）`;
      this.sendMoveTarget();
    }
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
    if ((code.startsWith('Key') || code.startsWith('Arrow')) && (this.moveTarget || this.pathPoints.length)) {
      this.moveTarget = null;
      this.pathPoints = [];
      this.hint = '已取消自动移动，WASD 手动控制';
    }
    // 空格跳跃（非建造/养鱼/采矿模式，且不在输入框中）
    if (code === 'Space' && !this.buildMode && !this.fishMode && !this.mineMode) {
      e.preventDefault();
      this.sendJump();
    }
    // F 键采矿（跟随/采矿模式均可，自动开采最近矿脉）
    if (code === 'KeyF' && this.nearestOre) {
      e.preventDefault();
      this.doMine(this.nearestOre.gx, this.nearestOre.gz);
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
