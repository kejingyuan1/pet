import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { AssetService } from '../../services/asset.service';
import { StateService } from '../../services/state.service';
import { HOUSE_TIERS, RANCH_ANIMALS, DAILY_CLAIM_COINS, RANCH_BABIES, RANCH_EGGS, EGG_LAYERS, EGG_COINS } from '../../models';

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
    .ranch-stage { position: absolute; inset: 52px 0 0 0;
      background: linear-gradient(180deg, #bfe3ff 0%, #e9f7ff 55%, #d7f0d2 100%); }
    .ranch-stage canvas { display: block; }
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

  constructor(public state: StateService, private asset: AssetService) {}

  ngAfterViewInit(): void {
    this.initThree();
    this.loadShowroom();
    this.animate();
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
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    this.camera.position.set(0, 5.2, 13);
    this.camera.lookAt(0, 1.2, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);

    // 灯光：半球光 + 平行光 + 环境光，确保模型可见且不发白（借鉴 world3d 教训）
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d9a8d, 0.95);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(6, 12, 8);
    this.scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(amb);

    // 地面圆盘（淡绿草地）
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11, 48),
      new THREE.MeshStandardMaterial({ color: 0x9bd37a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.scene.add(ground);

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(host);
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
          pivot.position.set(0, 0, -4.8);
          pivot.add(g);
          this.scene.add(pivot);
          this.housePivot = pivot;
        }
      }
      // 7 个动物：始终展示，便于检查模型是否可用
      const pos = [
        { x: -3.3, z: 1.6 }, { x: -1.1, z: 1.6 }, { x: 1.1, z: 1.6 }, { x: 3.3, z: 1.6 },
        { x: -2.2, z: -1.4 }, { x: 0, z: -1.4 }, { x: 2.2, z: -1.4 }
      ];
      for (let i = 0; i < RANCH_ANIMALS.length; i++) {
        const a = RANCH_ANIMALS[i];
        const g = await this.asset.loadModel(a.model);
        if (tok !== this.loadToken) return;
        if (g) {
          this.fitModel(g, 1.7);
          const pivot = new THREE.Group();
          pivot.position.set(pos[i].x, 0, pos[i].z);
          pivot.add(g);
          this.scene.add(pivot);
          this.animalPivots.push(pivot);
        }
      }
      // 🔴 幼崽区：拥有对应成年动物才展示其幼崽（lifecycle 模型接入游戏）
      const owned = this.state.state.ranch.ownedAnimals;
      const babySpots = [{ x: -2.6, z: 4.0 }, { x: -0.9, z: 4.0 }, { x: 0.9, z: 4.0 }, { x: 2.6, z: 4.0 }];
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
      const eggSpots = [{ x: -4.6, z: 2.4 }, { x: -3.7, z: 3.0 }, { x: -2.8, z: 3.6 }];
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

  /** 暴露给 E2E/调试：展厅里已加载的幼崽/蛋数量与场景节点数 */
  private publishDebug(): void {
    (window as any).__ranchDebug = {
      babyCount: this.babyPivots.length,
      eggCount: this.eggPivots.length,
      animalCount: this.animalPivots.length,
      sceneChildren: this.scene ? this.scene.children.length : 0,
      availableEggs: this.state.availableEggs(),
      coins: this.state.state.coins
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
    this.animalPivots.forEach((p, i) => { p.rotation.y = t * 0.5 + i * 0.9; });
    if (this.housePivot) this.housePivot.rotation.y = Math.sin(t * 0.2) * 0.15;
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  };

  private disposeThree(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObs?.disconnect();
    this.clearShowroom();
    this.renderer?.dispose();
    if (this.renderer?.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
  }

  // ================= 面板交互 =================
  onBuildHouse(): void {
    if (this.state.buildHouse()) this.reloadShowroom();
  }
  onUpgradeHouse(): void {
    if (this.state.upgradeHouse()) this.reloadShowroom();
  }
  onBuyAnimal(code: string): void {
    if (this.state.buyAnimal(code)) this.reloadShowroom();
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
}
