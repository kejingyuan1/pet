# 外部模型资源接入指南（v30 资源化架构）

本项目的 3D 场景已改为**资源驱动**：所有房屋、树、菜地、鱼塘、动物、宠物、地图
都可以通过外部模型文件（`.glb` / `.gltf`）引入，布局由配置文件统一管理。

## 目录结构

```
pet-park-ng/
└── public/
    └── assets/
        ├── scene.config.json      ← 场景布局配置（改这里！）
        ├── models/                ← 放 .glb/.gltf 模型文件
        │   ├── house.glb          （示例：房屋）
        │   ├── tree.glb           （示例：树）
        │   ├── farm.glb           （示例：菜地）
        │   ├── pond.glb           （示例：鱼塘）
        │   ├── chicken.glb        （示例：鸡）
        │   ├── duck.glb           （示例：鸭）
        │   ├── cow.glb            （示例：牛）
        │   ├── goldfish.glb       （示例：金鱼）
        │   ├── minnow.glb         （示例：小鱼）
        │   └── pet.glb            （示例：宠物）
        └── textures/              ← 放贴图（jpg/png/webp）
```

## 三步接入外部模型

### 第 1 步：放模型文件
把 `.glb` 或 `.gltf` 文件放进 `public/assets/models/` 目录。

### 第 2 步：改配置
编辑 `public/assets/scene.config.json`，在对应条目填 `model` 路径：

```json
{
  "buildings": [
    {
      "id": "house",
      "name": "房屋",
      "model": "assets/models/house.glb",   ← 这里填模型路径
      "position": [0, 0, 0],                 ← 位置 (x, y, z)
      "scale": [1, 1, 1],                    ← 缩放
      "rotationY": 0,                        ← 绕 Y 轴旋转（弧度）
      "fallback": { "color": "#FFE8C8" }     ← 模型缺失时的内置兜底
    }
  ]
}
```

### 第 3 步：刷新页面
模型加载成功 → 使用外部模型；加载失败/文件缺失 → 自动回退内置几何体（不报错）。

## 配置字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `camera` | object | 相机位置 `[x,y,z]` + 视场角 `fov` |
| `ground` | object | 地面：`model`/`radius`/`color` |
| `sea` | object | 海面：`model`/`radius`/`color`/`opacity` |
| `buildings[]` | array | 房屋等建筑：`model`/`position`/`scale`/`rotationY` |
| `trees[]` | array | 树：同上 + `fallback`（树冠/树干颜色） |
| `farm` | object | 菜地：`useLayoutSpot:true` 自动跟随存档菜地位置 |
| `pond` | object | 鱼塘：同上 |
| `animals[]` | array | 动物：`type`（chicken/duck/cow）+ `useRanchStall`（栏位） |
| `fish[]` | array | 鱼：`type` + `usePondSlot`（鱼塘格） |
| `pet` | object | 宠物：`model` + `fallback` |

## 模型规范建议

- **格式**：优先 `.glb`（单文件、体积小）；`.gltf` 需配套 `.bin` + 贴图文件
- **朝向**：模型默认朝 -Z 方向（Three.js 标准）；如方向不对用 `rotationY` 调整
- **尺度**：建议模型在 1-2 米量级（场景单位是米）；如太大用 `scale` 缩小
- **轴心**：模型原点建议在地面接触点（这样 position.y=0 即贴地）
- **贴图**：`.glb` 内嵌贴图最省事；外置贴图放 `textures/` 并在 `.gltf` 中引用相对路径

## 示例：加一棵新树

1. `models/tree_oak.glb` 放进目录
2. 配置加一行：
```json
{ "id": "tree7", "model": "assets/models/tree_oak.glb", "position": [6, 0, 2], "scale": [1.4, 1.4, 1.4] }
```
3. 刷新 → 场景里出现一棵橡树

## 技术实现（开发参考）

- `src/app/services/asset.service.ts`：资源加载服务
  - `loadConfig()` 拉取 `assets/scene.config.json`（失败用内置默认）
  - `loadModel(path)` GLTFLoader 加载 + 缓存 + 失败返回 null
  - `loadTexture(path)` 贴图加载 + 缓存
- `src/app/components/scene3d/scene3d.component.ts`：场景构建
  - 每个元素「外部模型优先，失败回退内置几何体」
  - 布局点（房子/菜地/鱼塘位置）跟随存档 `state.layout`
