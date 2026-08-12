import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StateService } from '../../services/state.service';
import { AssetService, SceneElementConfig } from '../../services/asset.service';

/**
 * 3D 海岛场景组件（v30 资源化架构）
 *
 * 资源驱动模式：
 * - 房屋 / 树 / 菜地 / 鱼塘 / 动物 / 宠物 / 地图 全部由 scene.config.json 配置驱动
 * - 配置了 model 路径 → 优先加载外部 .glb/.gltf 模型
 * - 模型缺失或加载失败 → 自动回退内置几何体（不报错，页面始终可用）
 * - 后续新增外部模型三步：放文件 → 改配置 → 刷新
 */
@Component({
  selector: 'app-scene3d',
  template: '<div #mount class="scene3d-mount"></div>',
  styles: ['.scene3d-mount{width:100%;height:100%;min-height:320px;border-radius:20px;overflow:hidden;background:#BFE8F7}']
})
export class Scene3dComponent implements OnInit, OnDestroy {
  @ViewChild('mount') mountRef!: ElementRef;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private pet!: THREE.Group;
  private rafId = 0;
  private disposed = false;

  /** 布局点（房子/菜地/鱼塘位置，来自存档 layout） */
  private get layout() { return this.state.state.layout; }

  constructor(private state: StateService, private assets: AssetService) {}

  ngOnInit(): void {
    // 启动时先拉远端配置（失败用内置），再建场景
    this.assets.loadConfig().then(() => {
      if (!this.disposed) this.initScene();
    });
  }

  ngAfterViewInit(): void {
    // 场景构建由 ngOnInit 的 loadConfig 完成后触发（保证配置已就绪）
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.renderer?.dispose();
  }

  private initScene(): void {
    const mount = this.mountRef.nativeElement;
    const W = mount.clientWidth || 800, H = mount.clientHeight || 400;
    const cfg = this.assets.config;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8FC8F5);

    this.camera = new THREE.PerspectiveCamera(cfg.camera?.fov || 42, W / H, 0.1, 100);
    const camPos = cfg.camera?.position || [3.5, 12, 17];
    this.camera.position.set(camPos[0], camPos[1], camPos[2]);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.buildWorld();
    this.animate();
  }

  /** 异步构建世界：地面/海面立即放，模型异步加载 */
  private buildWorld(): void {
    const cfg = this.assets.config;

    // 灯光（固定，不属于可替换资源）
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xBFE3FF, 0x8FBF7F, 0.55);
    this.scene.add(hemi);

    // 地面（可替换：外部模型 or 内置圆盘）
    this.buildGround(cfg.ground);

    // 海面（可替换）
    this.buildSea(cfg.sea);

    // 房屋（可替换：外部模型 or 内置墙+屋顶）
    if (cfg.buildings?.length) {
      cfg.buildings.forEach(b => this.buildElement(b, () => this.buildHouseFallback(b)));
    }

    // 树（可替换）
    if (cfg.trees?.length) {
      cfg.trees.forEach(t => this.buildElement(t, () => this.buildTreeFallback(t)));
    }

    // 菜地
    if (cfg.farm) {
      const pos: [number, number, number] = cfg.farm.useLayoutSpot
        ? [this.layout.farm.x, 0, this.layout.farm.z]
        : (cfg.farm.position || [0, 0, 0]);
      const farmCfg: SceneElementConfig = { ...cfg.farm, position: pos };
      this.buildElement(farmCfg, () => this.buildFarmFallback(farmCfg));
    }

    // 鱼塘
    if (cfg.pond) {
      const pos: [number, number, number] = cfg.pond.useLayoutSpot
        ? [this.layout.pond.x, 0, this.layout.pond.z]
        : (cfg.pond.position || [0, 0, 0]);
      const pondCfg: SceneElementConfig = { ...cfg.pond, position: pos };
      this.buildElement(pondCfg, () => this.buildPondFallback(pondCfg));
    }

    // 动物（牧场 → 外部模型 or 内置占位）
    if (cfg.animals?.length) {
      cfg.animals.forEach(a => this.buildElement(a, () => this.buildAnimalFallback(a)));
    }

    // 鱼（鱼塘 → 外部模型 or 内置占位）
    if (cfg.fish?.length) {
      cfg.fish.forEach(f => this.buildElement(f, () => this.buildFishFallback(f)));
    }

    // 宠物（外部模型 or 内置组合）
    this.buildPet(cfg.pet);
  }

  // ================= 通用构建：外部模型优先，失败回退 =================
  private buildElement(conf: SceneElementConfig, fallback: () => THREE.Object3D): void {
    this.assets.loadModel(conf.model).then(group => {
      if (this.disposed) return;
      if (group) {
        this.applyTransform(group, conf);
        this.scene.add(group);
      } else {
        const obj = fallback();
        if (obj) this.scene.add(obj);
      }
    });
  }

  /** 应用位置/缩放/旋转（配置优先，兼容数组/对象两种形态） */
  private applyTransform(obj: THREE.Object3D, conf: SceneElementConfig): void {
    if (conf.position) obj.position.set(conf.position[0], conf.position[1], conf.position[2]);
    if (conf.scale) obj.scale.set(conf.scale[0], conf.scale[1], conf.scale[2]);
    if (conf.rotationY) obj.rotation.y = conf.rotationY;
  }

  // ================= 内置回退几何体（模型缺失时兜底） =================

  private buildGround(conf: SceneElementConfig): void {
    this.assets.loadModel(conf.model).then(g => {
      if (this.disposed) return;
      if (g) { this.applyTransform(g, conf); this.scene.add(g); return; }
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(conf.radius || 10, 48),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color || '#7CCE8B') })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
    });
  }

  private buildSea(conf: SceneElementConfig): void {
    this.assets.loadModel(conf.model).then(g => {
      if (this.disposed) return;
      if (g) { this.applyTransform(g, conf); this.scene.add(g); return; }
      const sea = new THREE.Mesh(
        new THREE.CircleGeometry(conf.radius || 16, 48),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color || '#4FA8E8'), transparent: true, opacity: conf.opacity ?? 0.55 })
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = -0.06;
      this.scene.add(sea);
    });
  }

  /** 从 fallback 配置安全取颜色（索引签名需 bracket 访问） */
  private fbColor(conf: SceneElementConfig | undefined, key: string, def: string): string {
    if (conf && conf.fallback && conf.fallback[key] !== undefined) return String(conf.fallback[key]);
    return def;
  }

  private buildHouseFallback(conf: SceneElementConfig): THREE.Object3D {
    const H = this.layout.house;
    const pos = conf.position || [H.x, 0, H.z];
    const color = new THREE.Color(this.fbColor(conf, 'color', '#FFE8C8'));
    const roofColor = new THREE.Color(this.fbColor(conf, 'roofColor', '#E86A4B'));
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color });
    const buildBox = (x: number, z: number, w: number, d: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z);
      group.add(m);
    };
    buildBox(-1.45, 0, 0.3, 1.5, 1.2);
    buildBox(1.45, 0, 0.3, 1.5, 1.2);
    buildBox(0, -1.35, 2.9, 0.3, 1.2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: roofColor }));
    roof.position.set(0, 1.75, -0.2);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    group.position.set(pos[0], pos[1] || 0, pos[2]);
    return group;
  }

  private buildTreeFallback(conf: SceneElementConfig): THREE.Object3D {
    const pos = conf.position || [0, 0, 0];
    const trunkC = new THREE.Color(this.fbColor(conf, 'trunk', '#8A5A22'));
    const crownC = new THREE.Color(this.fbColor(conf, 'crown', '#4EA860'));
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6),
      new THREE.MeshStandardMaterial({ color: trunkC }));
    trunk.position.y = 0.4;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshStandardMaterial({ color: crownC }));
    crown.position.y = 1.15;
    group.add(trunk, crown);
    group.position.set(pos[0], pos[1] || 0, pos[2]);
    return group;
  }

  private buildFarmFallback(conf: SceneElementConfig): THREE.Object3D {
    const pos = conf.position || [this.layout.farm.x, 0, this.layout.farm.z];
    const size = conf.size || [1.5, 0.08, 1.3];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color || '#A8845A') }));
    mesh.position.set(pos[0], (pos[1] || 0) + size[1] / 2, pos[2]);
    return mesh;
  }

  private buildPondFallback(conf: SceneElementConfig): THREE.Object3D {
    const pos = conf.position || [this.layout.pond.x, 0, this.layout.pond.z];
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(conf.radius || 0.85, 24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(conf.color || '#4CC9F0'), transparent: true, opacity: conf.opacity ?? 0.85 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos[0], (pos[1] || 0) + 0.03, pos[2]);
    return mesh;
  }

  private buildAnimalFallback(conf: SceneElementConfig): THREE.Object3D {
    // 简单动物占位（彩色圆球组合），外部模型缺失时兜底
    const colors: Record<string, string> = { chicken: '#FFD166', duck: '#4CC9F0', cow: '#C9A0FF' };
    const c = new THREE.Color(colors[conf.type || ''] || '#FFD166');
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshStandardMaterial({ color: c }));
    body.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: c }));
    head.position.set(0, 0.38, 0.16);
    group.add(body, head);
    // 牧场围栏位置（简单摆放）
    const stallIdx = conf.useRanchStall ?? 0;
    const farm = this.layout.farm;
    group.position.set(farm.x - 2.0 + stallIdx * 1.4, 0, farm.z + 2.4);
    return group;
  }

  private buildFishFallback(conf: SceneElementConfig): THREE.Object3D {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0xFFB35C }));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.12;
    group.add(body);
    const pond = this.layout.pond;
    const slotIdx = conf.usePondSlot ?? 0;
    group.position.set(pond.x + (slotIdx % 2) * 0.6 - 0.3, 0.05, pond.z + Math.floor(slotIdx / 2) * 0.6 - 0.3);
    return group;
  }

  private buildPet(conf: SceneElementConfig): void {
    const home = this.layout.house;
    this.assets.loadModel(conf.model).then(group => {
      if (this.disposed) return;
      this.pet = group || this.buildPetFallback(conf);
      if (conf.scale) this.pet.scale.set(conf.scale[0], conf.scale[1], conf.scale[2]);
      this.pet.position.set(home.x, 0, home.z);
      this.scene.add(this.pet);
    });
  }

  private buildPetFallback(conf: SceneElementConfig): THREE.Group {
    const bodyC = new THREE.Color(this.fbColor(conf, 'body', '#FFD166'));
    const headC = new THREE.Color(this.fbColor(conf, 'head', '#FFC46B'));
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({ color: bodyC }));
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshStandardMaterial({ color: headC }));
    head.position.set(0, 0.95, 0.15);
    group.add(body, head);
    return group;
  }

  private animate(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    if (this.pet) this.pet.position.y = Math.sin(performance.now() / 800) * 0.03;
    this.renderer.render(this.scene, this.camera);
  }
}
