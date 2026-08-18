import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * 外部资源加载服务（v30 资源化架构）
 *
 * 职责：
 * 1. 加载场景布局配置（public/assets/scene.config.json）
 * 2. 按配置加载外部 3D 模型（.glb/.gltf）
 * 3. 加载外部贴图（textures/）
 * 4. 模型缓存 + 失败自动回退（返回 null 由调用方用内置几何体兜底）
 *
 * 用法（新增外部模型三步）：
 * 1. 把 xxx.glb 放进 public/assets/models/xxx.glb
 * 2. 在 scene.config.json 对应条目填 "model": "assets/models/xxx.glb"
 * 3. 刷新页面即可（加载失败自动回退内置几何体，不报错）
 */

export interface SceneElementConfig {
  id?: string;
  name?: string;
  type?: string;
  model?: string;            // 外部模型路径（assets/models/xxx.glb）
  position?: [number, number, number];
  scale?: [number, number, number];
  rotationY?: number;
  fallback?: Record<string, string | number>;
  useLayoutSpot?: boolean;
  useRanchStall?: number;
  usePondSlot?: number;
  color?: string;
  size?: [number, number, number];
  radius?: number;
  opacity?: number;
  [key: string]: unknown;
}

export interface SceneConfig {
  camera: { position: [number, number, number]; fov: number };
  ground: SceneElementConfig;
  sea: SceneElementConfig;
  buildings: SceneElementConfig[];
  trees: SceneElementConfig[];
  farm: SceneElementConfig;
  pond: SceneElementConfig;
  animals: SceneElementConfig[];
  fish: SceneElementConfig[];
  pet: SceneElementConfig;
}

@Injectable({ providedIn: 'root' })
export class AssetService {
  /** 场景布局配置（默认内置一份，联网加载失败时使用） */
  config: SceneConfig = this.defaultConfig();

  /** 模型缓存：路径 → THREE.Group */
  private modelCache = new Map<string, THREE.Group>();
  /** 贴图缓存：路径 → THREE.Texture */
  private textureCache = new Map<string, THREE.Texture>();

  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private dracoLoader: DRACOLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
    // DRACO 解码器：HY3D 生成的动物 GLB 为 draco 压缩版，必须挂 DRACOLoader 才能解析
    // 🔴 2026-08-16：解码器本地化（src/assets/draco/，three 自带），不再依赖 gstatic CDN——
    //   离线/弱网/无头环境下 CDN 拉取会 pending 卡死 → HY3D 岛屿/动物永远加载不出来
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('assets/draco/');
    // 🔴 无头/弱网环境下 wasm 解码器易失败 → 岛屿/动物 GLB 加载不出来；改用 JS 解码器兜底
    this.dracoLoader.setDecoderConfig({ type: 'js' });
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.textureLoader = new THREE.TextureLoader();
  }

  /** 默认内置配置（不依赖外部文件，保证离线可用） */
  private defaultConfig(): SceneConfig {
    return {
      camera: { position: [3.5, 12, 17], fov: 42 },
      ground: { radius: 10, color: '#7CCE8B', model: '' },
      sea: { radius: 16, color: '#4FA8E8', opacity: 0.55, model: '' },
      buildings: [
        { id: 'house', name: '房屋', model: 'assets/models/house.glb', position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0, fallback: { color: '#FFE8C8', roofColor: '#E86A4B' } }
      ],
      trees: [
        { id: 'tree1', model: 'assets/models/tree.glb', position: [-4.5, 0, -2.2], scale: [1, 1, 1], fallback: { trunk: '#8A5A22', crown: '#4EA860' } },
        { id: 'tree2', model: 'assets/models/tree.glb', position: [-2.0, 0, 4.5], scale: [0.9, 1.1, 0.9], fallback: { trunk: '#8A5A22', crown: '#4EA860' } },
        { id: 'tree3', model: 'assets/models/tree.glb', position: [3.0, 0, 4.5], scale: [1.1, 0.95, 1.1], fallback: { trunk: '#8A5A22', crown: '#4EA860' } },
        { id: 'tree4', model: 'assets/models/tree.glb', position: [3.0, 0, -3.4], scale: [1, 1, 1], fallback: { trunk: '#8A5A22', crown: '#4EA860' } },
        { id: 'tree5', model: 'assets/models/tree.glb', position: [-1.0, 0, -4.0], scale: [0.85, 1.05, 0.85], fallback: { trunk: '#8A5A22', crown: '#4EA860' } },
        { id: 'tree6', model: 'assets/models/tree.glb', position: [0.5, 0, -4.5], scale: [1.05, 0.9, 1.05], fallback: { trunk: '#8A5A22', crown: '#4EA860' } }
      ],
      farm: { model: 'assets/models/farm.glb', position: [0, 0, 0], size: [1.5, 0.08, 1.3], color: '#A8845A', useLayoutSpot: true },
      pond: { model: 'assets/models/pond.glb', position: [0, 0, 0], radius: 0.85, color: '#4CC9F0', opacity: 0.85, useLayoutSpot: true },
      animals: [
        { id: 'chicken1', type: 'chicken', model: 'assets/models/chicken.glb', position: [0, 0, 0], scale: [1, 1, 1], useRanchStall: 0 },
        { id: 'duck1', type: 'duck', model: 'assets/models/duck.glb', position: [0, 0, 0], scale: [1, 1, 1], useRanchStall: 1 },
        { id: 'cow1', type: 'cow', model: 'assets/models/cow.glb', position: [0, 0, 0], scale: [1, 1, 1], useRanchStall: 2 }
      ],
      fish: [
        { id: 'fish1', type: 'goldfish', model: 'assets/models/goldfish.glb', position: [0, 0, 0], scale: [1, 1, 1], usePondSlot: 0 },
        { id: 'fish2', type: 'minnow', model: 'assets/models/minnow.glb', position: [0, 0, 0], scale: [1, 1, 1], usePondSlot: 1 }
      ],
      pet: { model: 'assets/models/pet.glb', scale: [1, 1, 1], fallback: { body: '#FFD166', head: '#FFC46B' } }
    };
  }

  /** 启动：拉取远端 scene.config.json（失败用内置默认） */
  loadConfig(): Promise<void> {
    return new Promise<void>(resolve => {
      fetch('assets/scene.config.json')
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('config not found'))))
        .then((json: SceneConfig) => {
          if (json && json.camera && json.buildings) {
            this.config = this.mergeConfig(this.defaultConfig(), json);
          }
          resolve();
        })
        .catch(() => resolve());  // 内置默认兜底
    });
  }

  /** 深合并：远端配置覆盖默认（保持字段完整） */
  private mergeConfig(base: SceneConfig, remote: SceneConfig): SceneConfig {
    const merged: SceneConfig = JSON.parse(JSON.stringify(base));
    if (remote.camera) merged.camera = { ...base.camera, ...remote.camera };
    if (remote.ground) merged.ground = { ...base.ground, ...remote.ground };
    if (remote.sea) merged.sea = { ...base.sea, ...remote.sea };
    if (remote.farm) merged.farm = { ...base.farm, ...remote.farm };
    if (remote.pond) merged.pond = { ...base.pond, ...remote.pond };
    if (remote.pet) merged.pet = { ...base.pet, ...remote.pet };
    if (Array.isArray(remote.buildings) && remote.buildings.length) merged.buildings = remote.buildings;
    if (Array.isArray(remote.trees) && remote.trees.length) merged.trees = remote.trees;
    if (Array.isArray(remote.animals) && remote.animals.length) merged.animals = remote.animals;
    if (Array.isArray(remote.fish) && remote.fish.length) merged.fish = remote.fish;
    return merged;
  }

  /**
   * 加载外部模型。成功返回 THREE.Group，失败返回 null（调用方回退内置几何体）
   * 带缓存：同一路径只加载一次
   */
  loadModel(modelPath: string | undefined): Promise<THREE.Group | null> {
    if (!modelPath) return Promise.resolve(null);
    if (this.modelCache.has(modelPath)) {
      const cached = this.modelCache.get(modelPath)!;
      return Promise.resolve(cached.clone());
    }
    return new Promise<THREE.Group | null>(resolve => {
      this.gltfLoader.load(
        modelPath,
        gltf => {
          const group = gltf.scene;
          // 递归规范化材质（部分 glb 材质需要补环境光才可见）
          group.traverse(child => {
            const mesh = child as THREE.Mesh;
            if ((mesh as any).isMesh) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              if (mat && (mat as any).isMeshStandardMaterial && mat.emissive) {
                mat.emissiveIntensity = 0.1;
              }
            }
          });
          this.modelCache.set(modelPath, group.clone());
          resolve(group.clone());
        },
        undefined,
        () => resolve(null)  // 加载失败 → null（回退内置）
      );
    });
  }

  /** 加载外部贴图（失败返回 null） */
  loadTexture(path: string | undefined): Promise<THREE.Texture | null> {
    if (!path) return Promise.resolve(null);
    if (this.textureCache.has(path)) return Promise.resolve(this.textureCache.get(path)!);
    return new Promise<THREE.Texture | null>(resolve => {
      this.textureLoader.load(path, tex => {
        // r128 旧式色彩空间 API（texture.encoding）；r152+ 才是 colorSpace
        try {
          (tex as any).encoding = (THREE as any).sRGBEncoding;
        } catch (e) { /* ignore */ }
        this.textureCache.set(path, tex);
        resolve(tex);
      }, undefined, () => resolve(null));
    });
  }

  /** 清缓存（场景重建时用） */
  clearCache(): void {
    this.modelCache.clear();
    this.textureCache.clear();
  }
}
