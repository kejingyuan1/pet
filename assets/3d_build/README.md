# assets/3d_build — 3d_build 资产库精选合并归档

> 合并日期：2026-08-13
> 来源：`git@github.com:kejingyuan1/3d_build.git`（原资产库，保留作为 master 归档）
> 目的：把 3d_build 中有价值的资产整理并入 pet 单一仓库，便于统一管理与发布。
> 已剔除：所有 `_` 前缀临时诊断脚本、`node_modules`、`package-lock.json`、根目录临时 HTML / `generated-images/` 垃圾。

## 目录结构

| 目录 | 内容 | 说明 |
|------|------|------|
| `animals-source/` | 7 只 HY3D 动物 master（draco 压缩） | cat / chicken / cow / dog / duck / fish / sheep。**注意：游戏运行时用的已改名副本在 `pet-park-ng/public/assets/models/`（chicken.glb、cow.glb、duck.glb、pet.glb=cat、goldfish.glb/minnow.glb=fish、tree.glb），此处仅作源归档，勿重复进运行时目录** |
| `buildings/` | 26 个 Quaternius 建筑 GLB | 岛屿房屋/装饰，供场景搭建 |
| `terrain/` | `terrain_island_05.glb` | 岛屿地形 |
| `textures/` | `colormap.png`（Kenney） | 通用顶点色贴图 |
| `tools/` | 建模 / 导入 / 校验脚本 | `asset_generator/`、`build_*.mjs`、`gen_*.py`、`submit_farm_*.py`、`verify_*.mjs` 等（已剔除依赖与临时脚本） |
| `players/` | `boy_fixed.obj` / `boy_tex.png` / `girl_fixed.obj` / `girl_tex.png` | **男孩女孩模型，带完整贴图（非白模）**。`.obj` 为 Y-up 修正版（供 Mixamo auto-rig 上传）；原始带贴图 GLB 在 `pet-park-ng/public/assets/models/boy.glb` & `girl.glb` |
| `docs/` | 美术圣经 / 架构 / 世界游戏设计 / 资产生产文档 | `art/`、`architecture/`、`world-game/`、`asset-production-master.md`、`design/asset-manifest.md` |
| `manifest.json` | 3d_build 资产清单 | 源库 manifest 参考 |
| `ISSUES.md` / `README.md` | 源库问题记录与说明 | 来自 3d_build 根 |

## 关于 boy / girl 模型（再次确认：有上色，非白模）

- 原始 `boy.glb` / `girl.glb` 内部各含 **1 材质 + 1 贴图**（`hasBaseColorTexture → tex0`）。
- `players/` 下提取出的 `boy_tex.png`（棕发/蓝衣）、`girl_tex.png`（棕发/粉脸）即为贴图证据。
- 模型仅存在"绕 X 轴 90° 横躺"的朝向问题，已用 `fix_player_models.mjs` 转 Y-up 并导出 `.obj` + 贴图，待上传 Mixamo 自动绑骨后回灌 GLB。
