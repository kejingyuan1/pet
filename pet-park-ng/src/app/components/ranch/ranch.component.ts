import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { AssetService } from '../../services/asset.service';
import { StateService } from '../../services/state.service';
import { HOUSE_TIERS, RANCH_ANIMALS, DAILY_CLAIM_COINS, RANCH_BABIES, RANCH_EGGS, EGG_LAYERS, EGG_COINS } from '../../models';

/**
 * 牧场鱼池参数：围栏外圈草地上、**左前方**（x=-6, z=5）。
 *
 * 位置选择的两个硬约束：
 *  1) 必须在默认固定相机（position(0,5.2,13) lookAt(0,2.6,0), fov=45°, aspect≈1.6）的视野内可被看见；
 *     若放右侧 x=8 会被右侧「动物商店」HTML 面板遮挡，且超出视野右沿（鱼在围栏外用户根本看不见）。
 *     放左前方 (-6, 5) 处于视野左下区域，无 UI 遮挡，距离原点 √61≈7.81 > 围栏半径 4.85+池半径 2.2=7.05，完全在围栏外。
 *  2) depth 是鱼池的"参考高度"（非下沉深度）：外圈草地 meadow 是不透明平面、位于 y=-0.02，
 *     会盖住任何在它下方的物体，故池底/水面/石圈都以 depth 为基准向上抬（depth-0.01 / depth+0.01），
 *     让水池真正浮在草地上、可被看见。设 depth=0.0 → 池底 -0.01（高于草地）、水面/石圈 +0.01。
 */
const POND = { x: -6, z: 5, r: 2.2, depth: 0.0 };
/** 鱼沿池周游：半径 1.6，6~8 秒一圈（取 7s） */
const FISH_SWIM_R = 1.6;
const FISH_PERIOD = 7;

/**
 * 单个动物的行为状态：栅栏内随机游走 + 走路/低头吃草
 * 关键事实：HY3D 导出的动物 GLB（hy3_xxx_draco.glb）只有 1 个 node + 1 个 mesh 且不含 animation clip，
 * 因此走/吃无法用 AnimationMixer 播放，只能由代码程序化驱动：游走 + 身体 bob + 俯仰吃草。
 */
interface AnimalState {
  pivot: THREE.Group;          // 动物所在的 Group（fitModel 后底部贴 y=0）
  code: string;                // 动物 code（cat/dog/chicken/duck/cow/sheep/fish）—— 鱼走「悬浮漂移」特殊处理
  targetX: number;             // 当前游走目标 x（栅栏内，盘面 r≤3.4，避开房屋与幼崽/蛋区）
  targetZ: number;             // 当前游走目标 z
  speed: number;               // 移动速度（u/s）
  phase: number;               // 随机相位，避免 7 只动物同步 bob/sway
  baseY: number;               // 基础 y：陆生动物 0；鱼 0.35（悬浮，避开地面穿插）
  busyUntil: number;           // 忙到何时（秒）：吃草/闲歇期间不移动
  isEating: boolean;           // busy 期间是「吃草（前倾）」还是「闲歇（站立）」
  petUntil: number;            // 抚摸窗口结束时间（秒）：t < petUntil 期间低头反馈；初始 0
}

/**
 * 牧场（3D 展厅 + 动物商店 + 房屋中心）
 *
 * 设计要点（第一性原理）：
 * - 进入牧场的前提是玩家拥有自己的房屋（state.house.owned）—— 没有房屋时只显示"房屋中心"，可建造/升级。
 * - 建造/拥有房屋后，3D 展厅加载"房屋 GLB + 7 个动物 GLB"，玩家可直接检查每个模型是否可用。
 * - 动物商店用于购买动物（购买后计入已拥有），是"在牧场里可以购买动物"的落地。
 * - 复用 AssetService.loadModel（已挂本地 DRACO 解码器 + 模型缓存），不重复造轮子，也不碰 world3d 巨大的组件。
 */
@Component({
  selector: 'app-ranch',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="ranch-overlay">
    <div class="ranch-topbar">
      <div class="ranch-title">🐮 我的牧场</div>
      <div class="ranch-coins">💰 {{ state.state.coins }} 金币</div>
      <button class="ranch-close" (click)="close.emit()" title="返回游戏">✕</button>
    </div>

    <!-- 3D 展厅 -->
    <div class="ranch-stage" #stage></div>

    <!-- 左下：房屋中心 -->
    <div class="ranch-panel ranch-house">
      <h4>🏠 我的房屋</h4>
      <div *ngIf="!state.state.house.owned" class="rh-tip">进入牧场的前提是拥有自己的房屋。先建造一座吧！</div>
      <div *ngIf="state.state.house.owned" class="rh-tier">当前：{{ state.houseTier()?.name }}（{{ state.state.house.level }}/6 级）</div>

      <button *ngIf="!state.state.house.owned" class="rh-btn" [disabled]="state.state.coins < 120" (click)="onBuildHouse()">
        建造一层小屋（120 金）
      </button>
      <button *ngIf="state.state.house.owned && state.state.house.level < 6" class="rh-btn"
              [disabled]="!state.canUpgradeHouse()" (click)="onUpgradeHouse()">
        升级到 {{ nextTierName() }}（{{ state.nextHouseCost() }} 金）
      </button>
      <div *ngIf="state.state.house.owned && state.state.house.level >= 6" class="rh-max">已升至顶级房屋 🎉</div>

      <hr class="rh-sep">
      <button class="rh-claim" *ngIf="state.canClaimDaily()" (click)="onClaimDaily()">💰 领取每日金币（{{ dailyCoins }}）</button>
      <div class="rh-claimed" *ngIf="!state.canClaimDaily()">今日已签到 ✅</div>
    </div>

    <!-- 右下：动物商店 -->
    <div class="ranch-panel ranch-shop">
      <h4>🛒 动物商店</h4>
      <div class="shop-list">
        <div class="shop-item" *ngFor="let a of state.ranchAnimalList()">
          <span class="si-name">{{ a.name }}</span>
          <span class="si-price">{{ a.price }} 金</span>
          <button class="si-buy" *ngIf="!state.ownsAnimal(a.code)"
                  [disabled]="!state.state.house.owned || state.state.coins < a.price" (click)="onBuyAnimal(a.code)">购买</button>
          <span class="si-owned" *ngIf="state.ownsAnimal(a.code)">已拥有 ✓</span>
        </div>
      </div>
      <div class="shop-hint" *ngIf="!state.state.house.owned">拥有房屋后即可购买动物</div>

      <hr class="rh-sep">
      <h4>🥚 产蛋区</h4>
      <div class="egg-row" *ngIf="state.state.house.owned">
        <span class="egg-count">待拾蛋：{{ state.availableEggs() }} 枚</span>
        <button class="egg-btn" *ngIf="state.canCollectEggs()" (click)="onCollectEggs()">拾取鸡蛋（{{ eggReward() }} 金）</button>
        <span class="egg-done" *ngIf="!state.canCollectEggs()">今日已拾取 ✅</span>
      </div>
      <div class="egg-hint" *ngIf="state.state.house.owned && state.availableEggs() === 0 && !hasEggLayer()">购买鸡/鸭/鹅后可在此拾蛋</div>
    </div>

    <div class="ranch-hint" *ngIf="state.state.house.owned">展台上的 7 个动物模型会一直展示；已购买的动物会在前方「幼崽区」展示其幼崽，下蛋动物会在左侧「产蛋区」产蛋。</div>
    <div class="ranch-hint" *ngIf="!state.state.house.owned">建造房屋后，展台上会出现房屋与 7 个动物模型供你检查。</div>
  </div>
  `,
  styles: [`
    .ranch-overlay { position: fixed; inset: 0; z-index: 200; background: #0d1b2a; display: block; }
    .ranch-topbar { position: absolute; top: 0; left: 0; right: 0; height: 52px; display: flex; align-items: center;
      justify-content: space-between; padding: 0 16px; background: rgba(13,27,42,.92); color: #fff; z-index: 3;
      box-shadow: 0 2px 12px rgba(0,0,0,.4); }
    .ranch-title { font-size: 1.15rem; font-weight: 800; }
    .ranch-coins { font-weight: 700; color: #FFD166; }
    .ranch-close { width: 36px; height: 36px; border: none; border-radius: 10px; background: rgba(255,255,255,.12);
      color: #fff; font-size: 1.1rem; cursor: pointer; }
    .ranch-close:hover { background: rgba(255,255,255,.24); }
    .ranch-stage { position: absolute; inset: 52px 0 0 0; cursor: pointer;
      background: linear-gradient(180deg, #bfe3ff 0%, #e9f7ff 55%, #d7f0d2 100%); }
    .ranch-stage canvas { display: block; cursor: pointer; }
    .ranch-panel { position: absolute; bottom: 16px; width: 250px; background: rgba(255,255,255,.96);
      border-radius: 14px; padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.28); z-index: 3; }
    .ranch-house { left: 16px; }
    .ranch-shop { right: 16px; }
    .ranch-panel h4 { margin: 0 0 8px; font-size: 1rem; color: #234; }
    .rh-tip, .rh-tier { font-size: .85rem; color: #456; margin-bottom: 8px; }
    .rh-btn, .rh-claim { width: 100%; border: none; border-radius: 10px; padding: 9px; font-weight: 700; cursor: pointer;
      font-size: .9rem; margin-top: 4px; }
    .rh-btn { background: #06D6A0; color: #063; }
    .rh-btn:disabled { background: #cfd8dc; color: #879; cursor: not-allowed; }
    .rh-claim { background: #FFD166; color: #7a5200; }
    .rh-claimed { font-size: .82rem; color: #2a9d4a; margin-top: 6px; text-align: center; }
    .rh-max { font-size: .9rem; color: #2a9d4a; font-weight: 700; margin: 6px 0; }
    .rh-sep { border: none; border-top: 1px dashed #dde; margin: 10px 0; }
    .shop-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
    .shop-item { display: flex; align-items: center; gap: 8px; font-size: .9rem; }
    .si-name { flex: 1; font-weight: 600; color: #234; }
    .si-price { color: #b8860b; font-weight: 700; font-size: .82rem; }
    .si-buy { border: none; border-radius: 8px; padding: 5px 12px; background: #4CC9F0; color: #024; font-weight: 700; cursor: pointer; }
    .si-buy:disabled { background: #cfd8dc; color: #879; cursor: not-allowed; }
    .si-owned { color: #2a9d4a; font-weight: 700; font-size: .82rem; }
    .shop-hint { font-size: .78rem; color: #e76f51; margin-top: 8px; }
    .egg-row { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .egg-count { font-size: .85rem; color: #456; font-weight: 600; }
    .egg-btn { border: none; border-radius: 8px; padding: 7px 10px; background: #FFD166; color: #7a5200;
      font-weight: 700; cursor: pointer; font-size: .85rem; }
    .egg-btn:hover { background: #ffc94d; }
    .egg-done { font-size: .82rem; color: #2a9d4a; font-weight: 700; }
    .egg-hint { font-size: .76rem; color: #b8860b; margin-top: 6px; }
    .ranch-hint { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(13,27,42,.8); color: #fff; padding: 7px 14px; border-radius: 20px; font-size: .8rem; z-index: 3; }
  `]
})
export class RanchComponent implements AfterViewInit, OnDestroy {
  @ViewChild('stage', { static: true }) stage!: ElementRef<HTMLDivElement>;
  @Output() close = new EventEmitter<void>();

  dailyCoins = DAILY_CLAIM_COINS;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private rafId = 0;
  private animalPivots: THREE.Group[] = [];
  private babyPivots: THREE.Group[] = [];
  private eggPivots: THREE.Group[] = [];
  private housePivot: THREE.Group | null = null;
  private resizeObs?: ResizeObserver;
  private loadToken = 0;   // 展厅加载代次：使在途的异步 loadShowroom 过期，避免连续购买时重复叠加模型
  /** 动物行为状态：每个动物 pivot 配一个 AnimalState，用于栅栏内游走 + 走路/吃草 */
  private animalStates: AnimalState[] = [];
  /** 点击抚摸的 raycaster 回调引用（disposeThree 时 removeEventListener，避免反复进出牧场泄漏监听） */
  private petClickHandler?: (e: MouseEvent) => void;
  /** 环境（天空贴图 / 草地 / 围栏 / 草簇）共享的 geometry/material/texture，组件销毁时统一 dispose 避免 GPU 泄漏 */
  /** 环境共享资源（草地/围栏/天空/云 一次性创建，离开牧场统一 dispose） */
  private envDisposables: { dispose(): void }[] = [];
  /** 天空云朵 Mesh 列表（animate 里慢漂移，让画面更"活"）；用 PlaneGeometry billboard 面向相机 */
  private cloudSprites: THREE.Mesh[] = [];
  private cloudBaseX: number[] = [];
  private cloudSpeed: number[] = [];
  /** 上一帧时间（秒），用于 animate 计算 dt */
  private lastT = 0;
  /** 帧计数：每 ~30 帧（≈0.5s）发布一次 __ranchDebug，给 E2E/调试实时读位姿用 */
  private dbgFrame = 0;
  /** 鱼池水面 ShaderMaterial 引用（animate 里更新 uTime；dispose 入 envDisposables） */
  private pondWaterMat?: THREE.ShaderMaterial;

  constructor(public state: StateService, private asset: AssetService) {}

  ngAfterViewInit(): void {
    this.initThree();
    this.animate();
    // 🔴 进牧场先从服务端拉权威 ownedAnimals（覆盖本地，防"没买却已拥有"），再建展厅
    void this.enterRanch();
  }

  /** 进牧场流程：先服务端权威同步，再加载展厅（含鱼池与鱼） */
  private async enterRanch(): Promise<void> {
    try {
      await this.state.loadOwnedAnimalsFromServer();
    } catch (e) {
      // 离线/未登录/后端不可达：保留本地 ownedAnimals，不影响进牧场
    }
    await this.loadShowroom();
  }

  ngOnDestroy(): void {
    this.disposeThree();
  }

  // ================= 3D 初始化 =================
  private initThree(): void {
    const host = this.stage.nativeElement;
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    // 相机改为「高位全景 3/4 俯视」：position(0,9,12) lookAt(-2,1.5,1) fov=50°。
    // 硬约束：围栏内 paddock(0,0,r=4.85) + 围栏外鱼池 POND(-6,0,5) + 后方房屋(-0..0,z=-3.6) 必须在同一帧内可被看见，
    // 且鱼池不可被右侧「动物商店」HTML 面板（屏幕 x>1020）或左下「我的房屋」面板（x<220,y∈520-640）遮挡。
    // 几何投影验证：鱼池中心 → 屏幕 (294, 624) clear；paddock 中心 → (765, 453) clear；视野上沿 y≈10（云朵带不裁）。
    this.camera.position.set(0, 9, 12);
    this.camera.lookAt(-2, 1.5, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);

    // 点击抚摸：在展台 canvas 上注册 raycaster 拾取，命中动物后开启 ~2s 低头反馈窗口
    this.petClickHandler = (event: MouseEvent) => {
      const renderer = this.renderer;
      const scene = this.scene;
      const cam = this.camera;
      if (!renderer || !scene || !cam || this.animalPivots.length === 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(this.animalPivots, true);
      if (hits.length === 0) return;
      // 向上回溯命中 mesh 所属的 animalPivot 祖先
      let obj: THREE.Object3D | null = hits[0].object;
      let pivot: THREE.Group | null = null;
      while (obj) {
        if (this.animalPivots.indexOf(obj as THREE.Group) !== -1) { pivot = obj as THREE.Group; break; }
        obj = obj.parent;
      }
      if (!pivot) return;
      const st = this.animalStates.find(s => s.pivot === pivot);
      if (st) st.petUntil = performance.now() * 0.001 + 2.0;
    };
    this.renderer.domElement.addEventListener('click', this.petClickHandler);

    // 灯光：半球光 + 平行光 + 环境光，确保模型可见且不发白（借鉴 world3d 教训）
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d9a8d, 0.95);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(6, 12, 8);
    this.scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(amb);

    // 环境：天空 + 双层草地（外圈 meadow / 内圈 paddock）+ 木围栏 + 草簇装饰
    this.buildEnvironment();

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(host);
  }

  // ================= 环境（天空 / 草地 / 围栏 / 草簇） =================
  /**
   * 搭建围栏圈起的草地 + 渐变天空
   * 关键事实：HY3D 导出的 7 个动物 GLB 全部是 1 node + 1 mesh + 0 animation clip（实测 gltf.animations=[]），
   * 因此"走路/吃草"无法用 AnimationMixer 播放，本组件改为程序化驱动（见 updateAnimal / pickTarget）。
   */
  private buildEnvironment(): void {
    if (!this.scene) return;

    // 1) 天空：Canvas 渐变贴图作为 scene.background（替换之前粗糙的 CSS 蓝渐变）
    const skyTex = this.makeSkyTexture();
    this.scene.background = skyTex;
    this.envDisposables.push(skyTex);

    // 2) 外圈大草地（meadow）
    const outerGeo = new THREE.CircleGeometry(12, 64);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x9bd37a, roughness: 0.95 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.scene.add(outer);
    this.envDisposables.push(outerGeo, outerMat);

    // 3) 围栏内 paddock（更深、更饱和的草绿，替换"光秃白地板"的单色圆盘）
    const paddockGeo = new THREE.CircleGeometry(4.85, 48);
    const paddockMat = new THREE.MeshStandardMaterial({ color: 0x6BBF59, roughness: 0.9 });
    const paddock = new THREE.Mesh(paddockGeo, paddockMat);
    paddock.rotation.x = -Math.PI / 2;
    paddock.position.y = 0;
    this.scene.add(paddock);
    this.envDisposables.push(paddockGeo, paddockMat);

    // 4) 木围栏：2 圈横栏（torus 旋转到 XZ 平面）+ 32 根立柱
    this.buildFence(4.9);

    // 5) 草簇装饰：~30 根小锥体（4 面），70% 撒在 paddock 内，30% 撒在外圈 meadow
    this.buildGrassTufts(4.75, 30);

    // 6) 云朵：4 朵 Sprite 浮在空中，慢漂移——让"蓝渐变"天空不再显得"过于粗糙"
    this.buildClouds(4);
    // 7) 鱼池：围栏外圈草地上新建圆形水池，把鱼从围栏移出、改在池中游
    this.buildPond();
  }

  /**
   * 圆形鱼池：池底（不透明深色圆盘，防穿模）+ 水面（半透明 Gerstner 风格 ShaderMaterial，
   * depthWrite:false 防穿模，uTime 系数 0.00005 与 v50 对齐、轻摇）+ 池边石圈（torus 装饰）。
   * 所有 geometry/material 入 envDisposables，离开牧场统一释放避免 GPU 泄漏。
   */
  private buildPond(): void {
    if (!this.scene) return;
    const { x, z, r, depth } = POND;

    // 池底：不透明深色圆盘（略低于水面，但必须高于草地 -0.02，否则会被草地遮挡看不见）
    // 关键：外圈草地 meadow 是半径 12 的不透明平面、位于 y=-0.02，会盖住任何在它下方的物体；
    // 因此池底/水面/石圈都要抬到 y>-0.02 之上才能真正"浮"在草地上形成可见水池。
    const bottomGeo = new THREE.CircleGeometry(r, 48);
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x14506b, roughness: 1, metalness: 0 });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(x, depth - 0.01, z);
    this.scene.add(bottom);
    this.envDisposables.push(bottomGeo, bottomMat);

    // 水面：最简 Gerstner 风格 ShaderMaterial（半透明 + depthWrite:false），uTime 轻摇
    const waterGeo = new THREE.CircleGeometry(r, 48);
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // 池心为原点的径向坐标（uv 0..1 → -1..1）
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          // 多重低频波纹（系数小，与 v50 的 0.00005 时间尺度一致 → 轻摇不急）
          float w = sin(p.x * 6.0 + uTime) * 0.5
                  + sin(p.y * 5.0 - uTime * 0.8) * 0.5
                  + sin((p.x + p.y) * 4.0 + uTime * 0.6) * 0.4;
          // 岸边稍深、中心稍亮，制造浅水通透感
          vec3 shallow = vec3(0.20, 0.62, 0.78);
          vec3 deep    = vec3(0.08, 0.32, 0.45);
          vec3 col = mix(deep, shallow, smoothstep(1.0, 0.0, d));
          col += w * 0.05;                         // 波纹明暗扰动
          float edge = smoothstep(1.0, 0.92, d);   // 边缘柔和淡出，避免硬切
          gl_FragColor = vec4(col, 0.72 * edge);
        }
      `
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, depth + 0.01, z);   // 水面高于池底、高于草地，半透明可见
    this.scene.add(water);
    this.envDisposables.push(waterGeo, waterMat);
    this.pondWaterMat = waterMat;

    // 池边：石圈（torus 装饰，给水池边界感）
    const ringGeo = new THREE.TorusGeometry(r, 0.12, 8, 48);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x9a8c7a, roughness: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, depth + 0.01, z);   // 池边石圈与水面临近平齐，浮在草地上
    this.scene.add(ring);
    this.envDisposables.push(ringGeo, ringMat);
  }

/**
 * 云朵：canvas 画 3 个白色椭圆合成 puff，返回透明 CanvasTexture；
 * 用 PlaneGeometry + MeshBasicMaterial（共享几何/贴图，各 mesh 独立 material）做 sky billboard。
 * 位置放在「可见远景天空带」 y∈[5.5,9]，z∈[-20,-8]——位置由 camera.lookAt=2.6 + fov=45° 决定，
 * 必须落在 z=-15 处的视野上沿 y≈10 以下才不会被裁掉。
 */
private buildClouds(count: number): void {
  if (!this.scene) return;
  const tex = this.makeCloudTexture();
  this.envDisposables.push(tex);
  const geo = new THREE.PlaneGeometry(4, 2.2);
  this.envDisposables.push(geo);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95
    });
    this.envDisposables.push(mat);
    const m = new THREE.Mesh(geo, mat);
    const x = (Math.random() - 0.5) * 32;
    const y = 5.5 + Math.random() * 3.5;
    const z = -20 + Math.random() * 12;
    m.position.set(x, y, z);
    const sc = 0.9 + Math.random() * 0.6;
    m.scale.set(sc, sc * 0.6, 1);
    this.scene.add(m);
    this.cloudSprites.push(m);
    this.cloudBaseX.push(x);
    this.cloudSpeed.push(0.12 + Math.random() * 0.18);
  }
}

  /**
   * 云朵贴图：透明底上画 3 个白色椭圆（soft alpha），合成一朵蓬松云
   * 128x64 拉伸到 sprite 上是 3~5 单位宽，足够装饰天空又不会喧宾夺主
   */
  private makeCloudTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 64);
    const puffs = [
      { x: 38, y: 38, r: 22 },
      { x: 64, y: 28, r: 28 },
      { x: 92, y: 40, r: 24 }
    ];
    for (const p of puffs) {
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grd.addColorStop(0.00, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    try { (tex as any).encoding = (THREE as any).sRGBEncoding; } catch { /* r152+ 忽略 */ }
    return tex;
  }

  /**
   * 木围栏：radius 处一圈 2 道横栏（torus）+ N 根立柱
   * torus 默认在 XY 平面，绕 X 转 90° 后平放成水平环
   */
  private buildFence(r: number): void {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.85 });
    const railGeo = new THREE.TorusGeometry(r, 0.045, 6, 64);
    const postGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.62, 6);

    // 上、下两道横栏（y=0.18 / y=0.5）
    for (const y of [0.18, 0.5]) {
      const rail = new THREE.Mesh(railGeo, woodMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      this.scene!.add(rail);
    }
    // 立柱（每 ~0.2 弧度一根 → 32 根），柱高 0.62，中心 y=0.31
    const N = 32;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(Math.sin(a) * r, 0.31, Math.cos(a) * r);
      this.scene!.add(post);
    }
    this.envDisposables.push(railGeo, postGeo, woodMat);
  }

  /**
   * 草簇：4 面小锥体（高 0.2，底径 0.18），分内外两块撒
   * 70% 落在 paddock 内（r<rMax），30% 落在外圈 meadow（rMax<r<11）
   * 跳过房屋周围 1.6 单位，避免戳进房子
   */
  private buildGrassTufts(rMax: number, count: number): void {
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x4F9A3F, roughness: 1 });
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.2, 4);
    const outerMax = 11;
    const insideCount = Math.round(count * 0.7);
    for (let i = 0; i < count; i++) {
      const inside = i < insideCount;
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 6; t++) {
        const a = Math.random() * Math.PI * 2;
        const r = inside
          ? Math.random() * rMax * 0.96
          : (rMax + 0.3 + Math.random() * (outerMax - rMax - 0.3));
        x = Math.sin(a) * r;
        z = Math.cos(a) * r;
        if (Math.hypot(x, z + 3.6) > 1.6) { ok = true; break; }
      }
      if (!ok) continue;
      const m = new THREE.Mesh(tuftGeo, tuftMat);
      m.position.set(x, 0.1, z);
      m.rotation.y = Math.random() * Math.PI;
      this.scene!.add(m);
    }
    this.envDisposables.push(tuftGeo, tuftMat);
  }

  /**
   * 渐变天空贴图：顶深天蓝 → 中浅蓝 → 接近地平线偏暖白
   * 16x256 的窄条即可（scene.background 拉伸铺满），用 CanvasTexture 避免外部资源依赖
   */
  private makeSkyTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.00, '#4A8FD0');  // 顶部天蓝
    grd.addColorStop(0.40, '#7EC0E8');  // 中部浅蓝
    grd.addColorStop(0.80, '#BDE0F0');  // 地平线上方淡蓝
    grd.addColorStop(1.00, '#E8F2EA');  // 地平线偏暖白
    g.fillStyle = grd;
    g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    try { (tex as any).encoding = (THREE as any).sRGBEncoding; } catch { /* r152+ 忽略 */ }
    return tex;
  }

  private onResize(): void {
    if (!this.renderer || !this.camera || !this.stage) return;
    const w = this.stage.nativeElement.clientWidth || 800;
    const h = this.stage.nativeElement.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** 把模型归一化：缩放至 targetSize，x/z 居中，底部贴 y=0 */
  private fitModel(obj: THREE.Object3D, targetSize: number): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    obj.scale.setScalar(targetSize / maxDim);
    const box2 = new THREE.Box3().setFromObject(obj);
    const center = box2.getCenter(new THREE.Vector3());
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box2.min.y;
  }

  /** 加载展厅：有房屋才加载房屋 + 7 个动物（满足"进入牧场前提=有房屋"） */
  private async loadShowroom(): Promise<void> {
    if (!this.scene) return;
    this.clearShowroom();
    const tok = this.loadToken;

    if (this.state.state.house.owned) {
      const housePath = this.state.houseModelPath();
      if (housePath) {
        const g = await this.asset.loadModel(housePath);
        if (tok !== this.loadToken) return;
        if (g) {
          this.fitModel(g, 3.6);
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, -3.6);
          pivot.add(g);
          this.scene.add(pivot);
          this.housePivot = pivot;
        }
      }
      // 7 个动物：初始分布在围栏内（盘面 r≤3.3），随即由 updateAnimal 接管随机游走
      const pos = [
        { x: -2.8, z: 1.0 }, { x: -0.95, z: 1.2 }, { x: 0.95, z: 1.2 }, { x: 2.8, z: 1.0 },
        { x: -2.0, z: -0.9 }, { x: 0, z: -0.9 }, { x: 2.0, z: -0.9 }
      ];
      // 陆生动物（跳过 fish）：分布到围栏内 pos 槽位，由 updateAnimal 接管随机游走
      let pIdx = 0;
      for (let i = 0; i < RANCH_ANIMALS.length; i++) {
        const a = RANCH_ANIMALS[i];
        if (a.code === 'fish') continue;   // 🔴 鱼移入鱼塘，不进围栏
        const g = await this.asset.loadModel(a.model);
        if (tok !== this.loadToken) return;
        if (g) {
          this.fitModel(g, 1.7);
          const pivot = new THREE.Group();
          pivot.position.set(pos[pIdx].x, 0, pos[pIdx].z);
          // YXZ：先转 Y（朝向），再 pitch X（低头吃草），z 用于走路 sway；保证「低头」是沿身体前方俯仰
          pivot.rotation.order = 'YXZ';
          pivot.add(g);
          this.scene.add(pivot);
          this.animalPivots.push(pivot);

          const state: AnimalState = {
            pivot,
            code: a.code,
            targetX: pos[pIdx].x,
            targetZ: pos[pIdx].z,
            speed: 0.9 + Math.random() * 0.6,
            phase: Math.random() * Math.PI * 2,
            baseY: 0,
            busyUntil: 0,
            isEating: false,
            petUntil: 0
          };
          this.pickTarget(state);
          this.animalStates.push(state);
        }
        pIdx++;
      }
      // 🔴 鱼：独立加载，放进鱼塘沿圆周游（baseY=0.05 贴水面），不再悬浮在围栏草地
      const fishA = RANCH_ANIMALS.find(a => a.code === 'fish');
      if (fishA) {
        const fg = await this.asset.loadModel(fishA.model);
        if (tok !== this.loadToken) return;
        if (fg) {
          this.fitModel(fg, 1.0);
          const pivot = new THREE.Group();
          // 初始位置：池周圆周一点（半径 1.6，angle=0）；baseY=0.0 介于池底(-0.01)与水面(+0.01)之间 → 半透明水下可见
          pivot.position.set(POND.x + FISH_SWIM_R, 0.0, POND.z);
          pivot.rotation.order = 'YXZ';
          pivot.add(fg);
          this.scene.add(pivot);
          this.animalPivots.push(pivot);
          const fstate: AnimalState = {
            pivot,
            code: 'fish',
            targetX: POND.x + FISH_SWIM_R,
            targetZ: POND.z,
            speed: 0,
            phase: Math.random() * Math.PI * 2,
            baseY: 0.0,
            busyUntil: 0,
            isEating: false,
            petUntil: 0
          };
          this.animalStates.push(fstate);
        }
      }
      // 🔴 幼崽区：拥有对应成年动物才展示其幼崽（lifecycle 模型接入游戏）
      // 位置放在 paddock 前排（z≈2.9..3.0），避开游走区（z<2.3）和围栏（r=4.85）
      const owned = this.state.state.ranch.ownedAnimals;
      const babySpots = [{ x: -2.2, z: 2.9 }, { x: -0.75, z: 3.0 }, { x: 0.75, z: 3.0 }, { x: 2.2, z: 2.9 }];
      let bi = 0;
      for (const code of owned) {
        const babyPath = RANCH_BABIES[code];
        if (!babyPath || bi >= babySpots.length) continue;
        const bg = await this.asset.loadModel(babyPath);
        if (tok !== this.loadToken) return;
        if (bg) {
          this.fitModel(bg, 0.9);
          const pivot = new THREE.Group();
          pivot.position.set(babySpots[bi].x, 0, babySpots[bi].z);
          pivot.add(bg);
          this.scene.add(pivot);
          this.babyPivots.push(pivot);
          bi++;
        }
      }
      // 🔴 产蛋区：拥有下蛋动物在其「巢位」展示蛋模型（lifecycle 蛋模型接入游戏）
      // 放在 paddock 左前侧（z=2.5..3.3），避开游走区（z<2.3），全部在围栏内（r<4.1）
      const eggSpots = [{ x: -3.3, z: 2.5 }, { x: -2.9, z: 2.9 }, { x: -2.5, z: 3.3 }];
      let ei = 0;
      for (const code of owned) {
        const eggPath = RANCH_EGGS[code];
        if (!eggPath || ei >= eggSpots.length) continue;
        const eg = await this.asset.loadModel(eggPath);
        if (tok !== this.loadToken) return;
        if (eg) {
          this.fitModel(eg, 0.5);
          const pivot = new THREE.Group();
          pivot.position.set(eggSpots[ei].x, 0, eggSpots[ei].z);
          pivot.add(eg);
          this.scene.add(pivot);
          this.eggPivots.push(pivot);
          ei++;
        }
      }
    }
    this.publishDebug();
  }

  /** 暴露给 E2E/调试：展厅里已加载的幼崽/蛋数量与场景节点数 + 每只动物的实时位姿（用于确认「在栅栏里走动」） */
  private publishDebug(): void {
    (window as any).__ranchDebug = {
      babyCount: this.babyPivots.length,
      eggCount: this.eggPivots.length,
      animalCount: this.animalPivots.length,
      sceneChildren: this.scene ? this.scene.children.length : 0,
      availableEggs: this.state.availableEggs(),
      coins: this.state.state.coins,
      // 每只动物：code + 位置（x/z/y，保留 2 位小数）+ 偏航/俯仰 + 是否忙（吃草/闲歇）
      animals: this.animalStates.map(s => ({
        code: s.code,
        x: +s.pivot.position.x.toFixed(2),
        z: +s.pivot.position.z.toFixed(2),
        y: +s.pivot.position.y.toFixed(2),
        ry: +s.pivot.rotation.y.toFixed(2),
        rx: +s.pivot.rotation.x.toFixed(2),
        eating: s.isEating,
        petting: s.petUntil > performance.now() * 0.001,
        busy: s.busyUntil > performance.now() / 1000
      })),
      fenceRadius: 4.85,
      ts: performance.now() | 0
    };
  }

  private clearShowroom(): void {
    if (!this.scene) return;
    this.loadToken++;   // 使在途 loadShowroom 过期
    const remove = (g: THREE.Group | null) => {
      if (!g) return;
      this.scene!.remove(g);
      g.traverse(o => {
        const m = o as THREE.Mesh;
        if ((m as any).isMesh) {
          m.geometry?.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach(x => x.dispose());
          else (mat as THREE.Material)?.dispose();
        }
      });
    };
    this.animalPivots.forEach(remove);
    this.animalPivots = [];
    this.animalStates = [];   // 行为状态随 pivot 一同清空
    this.babyPivots.forEach(remove);
    this.babyPivots = [];
    this.eggPivots.forEach(remove);
    this.eggPivots = [];
    remove(this.housePivot);
    this.housePivot = null;
  }

  private animate = (): void => {
    this.rafId = requestAnimationFrame(this.animate);
    const t = performance.now() * 0.001;
    const dt = Math.min(0.05, this.lastT ? t - this.lastT : 0.016);
    this.lastT = t;
    // 鱼池水面：更新 uTime（系数 0.00005 与 v50 对齐，轻摇不急）
    if (this.pondWaterMat) {
      this.pondWaterMat.uniforms['uTime'].value = performance.now() * 0.00005;
    }
    // 7 只动物：程序化游走 + 走路/吃草（HY3D GLB 无 animation clip，故代码驱动；详见 buildEnvironment 注释）
    this.animalStates.forEach(s => this.updateAnimal(s, t, dt));
    // 房屋：保持轻微左右摇摆
    if (this.housePivot) this.housePivot.rotation.y = Math.sin(t * 0.2) * 0.15;
    // 云朵慢漂移：到 +16 处回卷到 -16，让天空"活"起来而不是死贴图
    for (let i = 0; i < this.cloudSprites.length; i++) {
      const sp = this.cloudSprites[i];
      sp.position.x = this.cloudBaseX[i] + t * this.cloudSpeed[i];
      if (sp.position.x > 16) {
        sp.position.x -= 32;
        this.cloudBaseX[i] -= 32;
      }
    }
    // 周期性发布调试位姿（给 E2E 验证游走用）
    if (++this.dbgFrame % 30 === 0) this.publishDebug();
    // 原始诊断（每帧）：帧号 + 状态数 + 第一只动物的 raw 位姿/target —— 排查「游走是否真正在跑」
    const first = this.animalStates[0];
    (window as any).__animDbg = {
      frame: this.dbgFrame,
      states: this.animalStates.length,
      t: +t.toFixed(3),
      dt: +dt.toFixed(4),
      first: first ? {
        px: first.pivot.position.x,
        pz: first.pivot.position.z,
        py: first.pivot.position.y,
        tx: first.targetX,
        tz: first.targetZ,
        speed: first.speed,
        baseY: first.baseY,
        busyUntil: +first.busyUntil.toFixed(3)
      } : null
    };
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  };

  private disposeThree(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObs?.disconnect();
    this.clearShowroom();
    // 释放环境资源（天空贴图 / 草地 / 围栏 / 草簇 / 云 的共享 geometry & material），避免反复进出牧场累积 GPU 泄漏
    this.envDisposables.forEach(d => { try { d.dispose(); } catch { /* 忽略重复 dispose */ } });
    this.envDisposables = [];
    // 移除云朵 sprite（它们独立 add 到 scene，clearShowroom 不管）
    this.cloudSprites.forEach(s => { this.scene?.remove(s); (s.material as THREE.Material)?.dispose?.(); });
    this.cloudSprites = [];
    this.cloudBaseX = [];
    this.cloudSpeed = [];
    if (this.scene) this.scene.background = null;
    this.renderer?.dispose();
    // 移除点击抚摸监听，避免反复进出牧场累积监听（内存/事件泄漏）
    if (this.petClickHandler) {
      this.renderer?.domElement.removeEventListener('click', this.petClickHandler);
      this.petClickHandler = undefined;
    }
    if (this.renderer?.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.lastT = 0;
  }

  // ================= 面板交互 =================
  onBuildHouse(): void {
    if (this.state.buildHouse()) this.reloadShowroom();
  }
  onUpgradeHouse(): void {
    if (this.state.upgradeHouse()) this.reloadShowroom();
  }
  onBuyAnimal(code: string): void {
    // buyAnimal 已改为异步（先落库后端）；成功后重建展厅以更新"已拥有 ✓"与幼崽/蛋展示
    this.state.buyAnimal(code).then(ok => { if (ok) this.reloadShowroom(); });
  }
  onCollectEggs(): void {
    const coins = this.state.collectEggs();
    if (coins > 0) this.publishDebug();
  }
  /** 拾蛋可获得的金币（availableEggs × EGG_COINS） */
  eggReward(): number {
    return this.state.availableEggs() * (typeof EGG_COINS !== 'undefined' ? EGG_COINS : 6);
  }
  /** 是否已拥有任意下蛋动物（鸡/鸭/鹅） */
  hasEggLayer(): boolean {
    return EGG_LAYERS.some(c => this.state.ownsAnimal(c));
  }
  onClaimDaily(): void {
    this.state.claimDailyCoins();
  }
  nextTierName(): string {
    const lv = this.state.state.house.level;
    return HOUSE_TIERS[lv] ? HOUSE_TIERS[lv].name : '';
  }
  /** 建造/升级后重新加载展厅 */
  private reloadShowroom(): void {
    this.clearShowroom();
    this.loadShowroom();
  }

  // ================= 动物行为（程序化游走 + 走路/吃草） =================
  /**
   * 在栅栏内挑一个目标点（盘面 r≤3.4，避开房屋 1.5 与前排幼崽/蛋区 z>2.3）
   * 最多重试 8 次；失败回落到 (0, 1.0)
   */
  private pickTarget(s: AnimalState): void {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.sqrt(Math.random()) * 3.0;   // 0.4..3.4
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (z > 2.3) continue;                            // 跳过前排幼崽/蛋区
      if (Math.hypot(x, z + 3.6) < 1.5) continue;       // 跳过房屋
      s.targetX = x; s.targetZ = z; return;
    }
    s.targetX = 0; s.targetZ = 1.0;
  }

  /**
   * 逐帧更新一只动物：
   * - pet 最高优先级：t < petUntil 期间低头（pitch→0.5）+ 轻微点头（position.y 起伏），覆盖一切其它状态
   * - busy 期间（站立闲歇）：停下，pitch→0（绝不低头），body 不起伏
   * - 非 busy：朝 target 走，平滑转向（rotation.y→heading），身体上下 bob（baseY+0~0.05），左右 sway（rotation.z）
   * - 到达目标：只做「短暂站立闲歇」0.5~1.4s（不再随机低头吃草）；同时 pickTarget 选下一个目标
   */
  private updateAnimal(s: AnimalState, t: number, dt: number): void {
    const p = s.pivot;
    // 抚摸反馈（最高优先级）：低头 + 轻微点头，覆盖一切其它状态
    if (t < s.petUntil) {
      // 鱼被抚摸 = 俯冲一点 + 点头（petPitch 取负值）；陆生 = 低头
      const petPitch = s.code === 'fish' ? -0.3 : 0.5;
      p.rotation.x = this.lerp(p.rotation.x, petPitch, Math.min(1, dt * 8));
      p.rotation.z = this.lerp(p.rotation.z, 0, Math.min(1, dt * 8));
      p.position.y = s.baseY + Math.sin(t * 6) * 0.02;
      return;
    }
    if (t < s.busyUntil) {
      // 闲歇（站立）：rotation.x 缓动到 0，绝不低头；body 不起伏
      p.rotation.x = this.lerp(p.rotation.x, 0, Math.min(1, dt * 6));
      p.rotation.z = this.lerp(p.rotation.z, 0, Math.min(1, dt * 6));
      p.position.y = s.baseY;
      return;
    }
    // 🔴 鱼：沿鱼塘圆周游（让位 pet；busy 不参与）。不随机游走，按池周参数驱动作圆。
    if (s.code === 'fish') {
      const w = (Math.PI * 2) / FISH_PERIOD;
      const ang = t * w;
      const tx = POND.x + Math.cos(ang) * FISH_SWIM_R;
      const tz = POND.z + Math.sin(ang) * FISH_SWIM_R;
      // 切线方向（游动方向）：(-sin ang, cos ang)，沿用与陆生一致的 atan2(dx,dz) 朝向
      const headAng = Math.atan2(-Math.sin(ang), Math.cos(ang));
      p.position.x = tx;
      p.position.z = tz;
      p.position.y = s.baseY + Math.sin(t * 2.5) * 0.02;   // 轻微 bob
      p.rotation.x = this.lerp(p.rotation.x, 0, Math.min(1, dt * 6));
      let diff = headAng - p.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rotation.y = p.rotation.y + diff * Math.min(1, dt * 3.5);
      p.rotation.z = Math.sin(t * 4 + s.phase) * 0.04;      // 游动 sway
      s.targetX = tx; s.targetZ = tz;
      return;
    }

    // 朝目标走
    const dx = s.targetX - p.position.x;
    const dz = s.targetZ - p.position.z;
    const dist = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    // 最短路径 lerp 到 heading
    const curY = p.rotation.y;
    let diff = heading - curY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rotation.y = curY + diff * Math.min(1, dt * 3.5);
    p.rotation.x = this.lerp(p.rotation.x, 0, Math.min(1, dt * 6));
    p.rotation.z = Math.sin(t * 9 + s.phase) * 0.05;
    if (dist > 0.08) {
      const step = Math.min(s.speed * dt, dist);
      p.position.x += (dx / dist) * step;
      p.position.z += (dz / dist) * step;
      // 步态 bob：始终 ≥ baseY（避免脚穿地）
      p.position.y = s.baseY + (Math.sin(t * 9 + s.phase) + 1) * 0.5 * 0.05;
    } else {
      p.position.y = s.baseY;
      // 到达：只做「短暂站立闲歇」，不再随机低头吃草
      s.isEating = false;
      s.busyUntil = t + 0.5 + Math.random() * 0.9;     // 闲歇 0.5~1.4s
      this.pickTarget(s);
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
