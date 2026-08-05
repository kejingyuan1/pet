import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StateService } from '../../services/state.service';

/**
 * 3D 海岛场景组件（Angular 版）
 * - Three.js r128（与单文件版 API 一致）
 * - 岛 / 房子 / 树 / 菜地 / 鱼塘 / 宠物 静态展示 + OrbitControls
 * - 宠物导航（A* / 回家状态机）后续迭代接入
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

  constructor(private state: StateService) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initScene();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.renderer?.dispose();
  }

  private initScene(): void {
    const mount = this.mountRef.nativeElement;
    const W = mount.clientWidth || 800, H = mount.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8FC8F5);

    this.camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    this.camera.position.set(3.5, 12, 17);
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

  private buildWorld(): void {
    // 灯光
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xBFE3FF, 0x8FBF7F, 0.55);
    this.scene.add(hemi);

    // 地面（圆岛）
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({ color: 0x7CCE8B })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 海面（大圆环）
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(16, 48),
      new THREE.MeshStandardMaterial({ color: 0x4FA8E8, transparent: true, opacity: 0.55 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.06;
    this.scene.add(sea);

    // 房子（4 面墙 + 门洞）
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xFFE8C8 });
    const buildBox = (x: number, z: number, w: number, d: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z);
      this.scene.add(m);
    };
    const H = this.state.state.layout.house;
    buildBox(H.x - 1.45, H.z, 0.3, 1.5, 1.2);       // 左墙
    buildBox(H.x + 1.45, H.z, 0.3, 1.5, 1.2);       // 右墙
    buildBox(H.x, H.z - 1.35, 2.9, 0.3, 1.2);        // 后墙
    // 屋顶
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: 0xE86A4B })
    );
    roof.position.set(H.x, 1.75, H.z - 0.2);
    roof.rotation.y = Math.PI / 4;
    this.scene.add(roof);

    // 树
    const treePos = [[-4.5, -2.2], [-2.0, 4.5], [3.0, 4.5], [3.0, -3.4], [-1.0, -4.0], [0.5, -4.5]];
    treePos.forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6),
        new THREE.MeshStandardMaterial({ color: 0x8A5A22 }));
      trunk.position.set(tx, 0.4, tz);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x4EA860 }));
      crown.position.set(tx, 1.15, tz);
      this.scene.add(trunk, crown);
    });

    // 菜地（绿色方块）
    const farm = this.state.state.layout.farm;
    const farmMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.3),
      new THREE.MeshStandardMaterial({ color: 0xA8845A }));
    farmMesh.position.set(farm.x, 0.04, farm.z);
    this.scene.add(farmMesh);

    // 鱼塘（蓝色圆盘）
    const pond = this.state.state.layout.pond;
    const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshStandardMaterial({ color: 0x4CC9F0, transparent: true, opacity: 0.85 }));
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.set(pond.x, 0.03, pond.z);
    this.scene.add(pondMesh);

    // 宠物（简单圆球组合）
    this.pet = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xFFD166 }));
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xFFC46B }));
    head.position.set(0, 0.95, 0.15);
    this.pet.add(body, head);
    const home = this.state.state.layout.house;
    this.pet.position.set(home.x, 0, home.z);
    this.scene.add(this.pet);
  }

  private animate(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    // 宠物轻微浮动
    if (this.pet) this.pet.position.y = Math.sin(performance.now() / 800) * 0.03;
    this.renderer.render(this.scene, this.camera);
  }
}
