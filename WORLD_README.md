# v49 大世界系统（3D 开开世界）— README

> 2026-08-13 新增：Voronoi 群岛地形 + 服务端权威物理 + 矿石3D模型 + 海浪动画 + 跳跃

## 架构

```
前端 (Angular 19 + Three.js)                    后端 (Spring Boot 3)
┌──────────────────────┐    WebSocket(STOMP)    ┌──────────────────────────┐
│  world3d.component   │ ── /app/ws.input ──→  │  WorldWsController       │
│  ├ 地形渲染(顶点色)   │ ← /topic/world ───   │  ├ input() 预检+转发     │
│  ├ 树木3D(锥形树)     │   POSITION_SNAPSHOT    │  ├ join() 接入+注册物理   │
│  ├ 矿石3D(晶体/岩石)  │                       │  └ build() 放置          │
│  ├ 海浪(shader动画)   │                       │                          │
│  ├ 玩家(圆柱+球)      │                       │  WorldPhysicsService     │
│  │  ├ WASD/空格/双击   │   60Hz tick           │  ├ 重力 + 跳跃           │
│  │  └ 相机跟随        │                       │  ├ 语义碰撞              │
│  └ 相机(轨道模式)     │                       │  └ 10Hz 快照广播         │
│                      │                       │  TerrainService          │
│                      │                       │  ├ Voronoi 22岛          │
│                      │                       │  ├ 域变形海岸线          │
│                      │                       │  ├ 真洼地湖泊            │
│                      │                       │  └ 语义分类              │
└──────────────────────┘                       └──────────────────────────┘
```

## 操作

| 按键/操作 | 效果 |
|-----------|------|
| WASD | 移动（相机相对方向） |
| Space | 跳跃（重力落地，可上坡） |
| 双击地面 | 自动跑到目标 |
| 鼠标拖拽 | 环绕视角 |
| 滚轮 | 缩放 |
| 建造按钮 | 点击放木屋 |

## 地形参数

- 22 座 Voronoi 岛屿，撒布 ±2600，半径 115~190
- 海洋深度 11 单位，岛屿海拔 17 单位
- 细节起伏 fbm ±7，山地阈值 >9（水线以上）
- 沙滩带宽 1.6 单位
- 边缘平滑过渡带 falloff 0.02~0.15（防悬崖）

## 语义类型

| 类型 | 颜色 | 3D模型 |
|------|------|--------|
| WATER | #2f7fd6 | 海平面+波浪shader |
| SAND | #d2b27a | 顶点色 |
| GRASS | #6abf4b | 顶点色 |
| MOUNTAIN | #8a8a7a | 顶点色 |
| TREE | #2d6a2f | 锥形树(棕干+绿冠) |
| ROCK | #9a9a92 | 顶点色 |
| ORE_COAL | #555555 | 黑多面体x3 |
| ORE_IRON | #b0b0b0 | 灰岩+晶体 |
| ORE_GOLD | #ffd700 | 金八面体+微发光 |

## 物理

- 60Hz tick，重力 25，跳跃初速 8.5
- 语义碰撞：WATER/OBSTACLE 不可站
- 10Hz POSITION_SNAPSHOT 广播
- 客户端 150ms 插值缓冲 + lerp 平滑

## 文件清单

**后端 (pet-park-server)**:
- `.../world/service/TerrainService.java` — 群岛生成
- `.../world/service/WorldPhysicsService.java` — 物理引擎
- `.../world/controller/WorldWsController.java` — WS 控制器
- `.../world/service/PhysicsGatewayService.java` — 门面

**前端 (pet-park-ng)**:
- `.../components/world3d/world3d.component.ts` — 主组件
- `.../services/world-physics.service.ts` — 插值客户端
- `.../services/world-api.service.ts` — REST API
- `.../services/world-socket.service.ts` — STOMP 客户端

## 待优化

- [ ] 岛屿边缘进一步平滑
- [ ] 海浪 shader 性能优化
- [ ] 矿石密度降低
- [ ] 双击移动加寻路
- [ ] 远端玩家跳跃动画
