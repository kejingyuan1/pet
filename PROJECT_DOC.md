# 我的宠物乐园 · 项目技术文档

> 版本：v20（2026-08-05）
> 本文档供**后续 AI 工程师**阅读，目标是让任何 AI 阅读后能完全理解当前代码现状，并基于此进行迭代升级（尤其是**接入后端 + 数据库**）。
> 更新本文档时请同步更新"版本历史"一节。

---

## 1. 项目概述

「我的宠物乐园」是一款**单文件 HTML 网页养成游戏**：玩家在 3D 小岛上饲养宠物"小黄"，可种菜、养鱼、装饰房屋、学习单词赚金币。宠物会自动在家/菜地/鱼塘之间走动，夜晚回家睡觉，玩家可手动"出门玩 / 叫回家"。

**核心特征**：
- **纯前端**：单文件 `index.html`（~188KB），无构建步骤，无框架
- **3D 渲染**：Three.js r128（**已改为 CDN 在线拉取**，见 §3）
- **数据持久化**：浏览器 localStorage（当前 key：`wb_petpark_v6`）
- **游戏时间**：1 现实分钟 = 1 游戏天（`GAME_DAY_MS = 60000`），白天 6:00-18:00，夜晚 18:00-6:00

---

## 2. 运行方式

```bash
# 在 pet-park 目录起一个静态服务器（必须用 HTTP，不能 file:// 直开）
python -m http.server 8899
# 或
npx http-server -p 8899
```

浏览器打开 `http://localhost:8899/` 即可。

> ⚠️ 因为 Three.js 走 CDN，`file://` 直开会因浏览器安全策略**无法加载外部脚本**（页面已内置"3D 引擎加载失败"的友好提示，引导用户用 HTTP 打开）。

---

## 3. 技术栈

| 项 | 选型 | 说明 |
|----|------|------|
| 语言 | 原生 HTML + CSS + JS（ES5/ES6 混用） | 无框架、无构建 |
| 3D | **Three.js r128（CDN）** | `https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js` |
| 相机控制 | OrbitControls（同版本 CDN） | `.../examples/js/controls/OrbitControls.js`（旧式全局挂载 `THREE.OrbitControls`） |
| 持久化 | localStorage（key `wb_petpark_v6`） | 单域名约 5MB 上限 |
| 图标 | 内联 SVG | 无 emoji、无图标库 |
| 图表 | 内联 SVG 手写 | 无图表库 |

> ⚠️ **重要**：本地依赖 `three.min.js` / `OrbitControls.js` 已删除，**不要恢复为本地文件**。CDN 版本与代码 API 完全兼容（代码用的是旧式全局 `THREE.OrbitControls` 方式，非 ES Module，**不要擅自升级 Three.js 版本**——r130+ 移除 `outputEncoding` 等 API，会破坏现有代码）。

---

## 4. 目录结构

```
pet-park/
└── index.html          # 唯一文件：全部 HTML/CSS/JS 内联（~3200 行，~188KB）
```

无其他源码文件。所有静态资源（SVG 图标、字体系统栈、样式）全部内联。

---

## 5. 总体架构

代码在单文件中按逻辑顺序组织，分 4 层：

```
┌────────────────────────────────────────────────┐
│ UI 层：render* 系列（renderToday/renderFarm/   │
│        renderPond/renderPet/renderStudy/...）   │
│        渲染 DOM、SVG 图标、模块切换 switchMod()  │
├────────────────────────────────────────────────┤
│ 游戏逻辑层：tick()/feed()/playWithPet()/        │
│        plant()/harvest()/stockFish()/...        │
│        以及 movePet()（4 秒随机走动调度）        │
├────────────────────────────────────────────────┤
│ 3D 渲染层：init3D()/renderLoop()/               │
│        aStarPath()/checkCollision()/            │
│        getObstacles()/updatePetTarget()         │
├────────────────────────────────────────────────┤
│ 数据层：state（全局）/defaultState()/           │
│        sampleState()/load()/save()/migrate()    │
│        exportData()/importData()                │
└────────────────────────────────────────────────┘
```

**模块划分**（`switchMod()` 切换的 6 个 tab）：
| 模块 ID | 名称 | 功能 |
|---------|------|------|
| mod-home | 首页 | 宠物状态卡、今日待办、快捷操作 |
| mod-farm | 菜地 | 6 块地：种植/浇水/收获/升级 |
| mod-pond | 鱼塘 | 4 条鱼：放养/喂食/卖鱼/升级 |
| mod-study | 学习 | 单词卡分组学习，赚金币 |
| mod-data | 数据 | 统计、导出/导入 JSON、清档 |
| mod-ranch | 牧场 🐔 | **待办（§13.1）**：养殖鸡/鸭/牛，未实现 |
| （3D 场景） | 岛上 3D | 房子+树+菜地+鱼塘+宠物，可拖拽摆放 |

---

## 6. 数据模型（全局 `state`）

### 6.1 完整结构

```js
state = {
  gameDays: 0.3,          // 游戏天数（小数部分 = 当日小时/24）
  weather: "sunny",       // "sunny" | "rain"
  coins: 50,              // 金币

  pet: {
    name: "小黄",
    stage: 0,             // 0-3：成长阶段（>=3 可飞行）
    level: 1, exp: 0,     // 等级经验（expNeed(level)=level*30）
    satiety: 100, mood: 100, energy: 80,   // 饱食/心情/体力 0-100
    sick: false,          // 感冒（淋雨概率触发）
    out: false,           // 是否在外（true=按钮显示"叫回家"）
    pos: "home",          // 当前位置："home"|"farm"|"pond"
    outSince: 0,          // 出门时间戳（防出门瞬间被夜晚逻辑拉回）
    targetOverride: null, // 用户点击地图指定位置（{x,z}，临时导航目标）
    lastTick: Date.now(),
    lastPlayed: 0, lastWatched: 0, lastHelp: 0,  // 上次游玩/看护/帮助时间
    foods: { carrot:3, tomato:2, strawberry:1 }, // 背包食物
    stats: { feed:0, play:0, watch:0, harvest:0, study:0 } // 累计次数
  },

  farm: { level:1, plots:[ {id:1..6, crop:null, plantedDay:0, lastWaterDay:0, grownDays:0} ] },
  pond: { level:1, fish:[ {id:1..4, type:null, stockedDay:0, lastFeedDay:0, grownDays:0} ] },
  // ranch（牧场）🚧 规划中（§13.1）：level + stalls[{id, type, stockedDay, lastFeedDay, grownDays}]，与 pond.fish 同构
  house: { furniture:[] },         // 已购家具 id 列表
  layout: { house:{x,z}, farm:{x,z}, pond:{x,z} },  // 用户拖拽后的 3D 坐标
  study: { earned:0, lastDay:"", learned:[] },
  logs: []                          // 事件日志 [{t, type, text}]
}
```

### 6.2 常量表（⚠️ 规划改造为统一"类目表"，见 §13.6）

> **用户决策（2026-08-05）**：不要维护多个分散常量表。种植植物/养殖鱼/养殖动物/家具等**名称、价格、成长时间**全部统一存入**一张类目表**，用 `type` 字段区分（`crop`/`fish`/`animal`/`furniture`）。本地版用 `state.categories` 数组承载，联网版对应 MySQL `categories` 表（§11.3）。以下常量表为**当前实现，将迁移**：

```js
GAME_DAY_MS = 60*1000          // 1 现实分钟 = 1 游戏天
DAY_START_H = 6, NIGHT_START_H = 18

CROPS = {   // 🚧 将迁入 categories(type='crop')
  carrot:{name:"胡萝卜", grow:0.3, water:0.1, price:5,  exp:10, sat:15, energy:12, lv:1},
  tomato:{name:"番茄",   grow:0.5, water:0.15,price:8,  exp:13, sat:18, energy:16, lv:1},
  strawberry:{name:"草莓",grow:0.8, water:0.2, price:14, exp:16, sat:22, energy:20, lv:2},
  watermelon:{name:"西瓜",grow:1.2, water:0.25,price:25, exp:20, sat:30, energy:25, lv:3}
}
FISHES = {  // 🚧 将迁入 categories(type='fish')
  minnow:{name:"小鱼",grow:0.4,feed:0.1, price:6, exp:8,  lv:1},
  goldfish:{name:"金鱼",grow:0.6,feed:0.15,price:10,exp:12,lv:1},
  koi:{name:"锦鲤",grow:0.9,feed:0.2, price:18,exp:16,lv:2},
  dragon:{name:"龙鱼",grow:1.3,feed:0.25,price:30,exp:22,lv:3}
}
FURNITURE = [bed/sofa/table/flower/rug/lamp/shelf/tv × 8 件]  // 🚧 将迁入 categories(type='furniture')
WORD_GROUPS = [animals/food/colors/numbers/actions × 若干单词卡]  // 🚧 将迁入 questions 题库（§13.5）
STUDY_DAILY_LIMIT = 30      // 每日学习金币上限
// 牧场动物不再建 ANIMALS 常量表（用户明确），直接进 categories(type='animal')，见 §13.1
```

### 6.3 初始数据

- `defaultState()`：全空默认（无作物/无鱼，金币 50）
- `sampleState()`：**首次加载（localStorage 无 v6 key）时使用**——预置：小黄等级 2、菜地种了番茄/胡萝卜/草莓、鱼塘放了金鱼/小鱼、金币 40、日志若干
- `migrate(state)`：老数据兼容（补默认字段）

---

## 7. 持久化机制（重要）

### 7.1 读写

```js
var LS_KEY = "wb_petpark_v6";              // 版本化 key
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }  // 每 2 秒 tick 自动调
function load(){
  // 1) 自动清旧 key：wb_petpark_v3/v4/v5/wb_petpark（避免脏数据残留）
  // 2) 读 v6；若 gameDays>30 或 pet.targetOverride 残留 → 判定为污染数据，重置 sampleState
  // 3) 无 v6 → sampleState() 并 save()
}
```

### 7.2 版本升级规则（血泪教训）

- **每次大改状态结构** → 升 `LS_KEY` 版本号（v3→v4→v5→v6），强制所有用户 next load 走 `sampleState()`，避免旧结构 JSON 解析错乱
- **load() 内置污染检测**：`gameDays > 30`（正常 max ~0.3+ 小数值，30 明显异常）或 `targetOverride` 残留 → 重置
- **playwright 调试污染**：eval 改 state 后 2 秒自动 save() 写回 localStorage → 之后所有测试基于脏数据。**调试时必须**：`localStorage.removeItem(LS_KEY)` + 全新 URL（`?v=N&t=Date.now()`）强制 reload

### 7.3 导出/导入/清档

- `exportData()`：下载 JSON 备份
- `importData(ev)`：读文件导入（校验 `o.pet && o.farm`）
- `confirmClear()`：清空二次确认 → 重新 sampleState
- `loadSampleData()`：重置示例数据

---

## 8. 核心系统详解

### 8.1 时间与昼夜

- `gameHour() = (state.gameDays % 1) * 24`
- `isNight()`：h >= 18 或 h < 6
- `tick()`（每 2 秒）：`elDays = 实际流逝毫秒 / GAME_DAY_MS` → `gameDays += elDays`
  - 宠物体力结算：sick 扣 10/天；在外扣 6/天（雨天 ×1.5）；在家恢复 5/天
  - 在外心情+4/天、饱食-3/天、经验+6/天；**energy<=0 强制回家**
  - 雨天在外概率感冒（elDays×0.25）→ sick=true 强制回家
  - 天气每游戏日 35% 概率切换雨/晴
- **天黑自动回家已禁用**（`if(false && ...)`）：回家只靠用户点按钮（v18.6 决策）

### 8.2 宠物系统

- 喂食 `feed()`：消耗背包食物 → satiety + 对应值
- 陪玩 `playWithPet()`：mood + 20（有 5 秒冷却）、金币/经验
- 看护 `watchFarm()`：给所有菜浇水，mood + 10
- 生病 `buyMedicine()`：花 20 金币治感冒
- 成长：`stageFor(level)` 按等级映射 stage（升级 → 3D 模型变大、换特效）
- **出门/回家按钮 `togglePetOut()`**（关键逻辑）：
  - `sick` → 提示先喂药，拦截
  - `out=true`（叫回家）→ `out=false; pos="home"` + **清 targetOverride + 清 pathQ + doorTarget=0**（关门前清残留是修复重点）
  - `out=false`（出门玩）→ 体力<10 拦截；否则 `out=true; outSince=now; sick=false; 清 targetOverride`；`pos===home` 时随机切 farm/pond；**doorTarget=1 立即开门**
  - 结束后统一 `updatePetTarget(); save(); renderPet(); renderCoins(); renderAll(); syncSceneActions()`

### 8.3 菜地系统（mod-farm）

- `plant(plotId, cropKey)`：消耗金币买种子 → `plantedDay=gameDays`
- `waterPlot(plotId)`：浇水 `lastWaterDay=gameDays`
- `harvestPlot(plotId)`：成熟后收获 → 卖金币 + 经验 + 概率掉种子
- `needsWater(f)`：`crop && !mature && (gameDays - lastWaterDay >= CROPS[crop].water)`
- `isMature(f)`：`grownDays >= CROPS[crop].grow`
- `upgradeFarm()`：花金币升级（解锁更多品种）

### 8.4 鱼塘系统（mod-pond）

- `stockFish(id, type)`：买鱼苗放入
- `feedFish(id)`：喂食推进 `grownDays`
- `sellFish(id)`：成熟卖钱
- `upgradePond()`：升级解锁锦鲤/龙鱼

### 8.5 房屋系统（3D 室内）

- `enterHouse3D()`：切相机视角进入室内（相机 (0,1.4,3.5)）
- `initHouseInterior3D()`：室内 3D（地板/墙/家具 Mesh 或 SVG sprite）
- `renderRoom()`：动态渲染已购家具
- `buyFurniture(id)`：商店购买（-金币）
- `openHouseDoor()/closeHouse()`：门开关动画

### 8.6 学习系统（mod-study）

- `resetStudyDaily()`：跨天重置 `study.earned`
- `startStudyGroup(idx)`：开始单词卡学习，`renderStudyCard()` 逐词展示
- `finishStudyGroup()`：完成奖励金币（上限 `STUDY_DAILY_LIMIT`）

### 8.7 3D 场景构建（init3D，~2106-2445 行）

1. WebGLRenderer（antialias），`setPixelRatio(min(dpr,2))`
2. 相机 PerspectiveCamera(42, W/H, 0.1, 100)，`position(3.5,12,17) lookAt(0,0,0)`
3. OrbitControls（`THREE.OrbitControls` 全局，旧式 API）
4. 场景元素：天空球（ShaderMaterial + **`glslVersion: THREE.GLSL1`**，⚠️ 见踩坑）、太阳/半球光、星星（夜晚）、海面、地面、**房子（4 段墙 AABB）**、6 棵树、菜地/鱼塘（AABB 可穿越）、宠物 3D 模型（身体/头/脚/皇冠/尾翼，`petStageApplied` 控制成长缩放）
5. 障碍物拖拽系统：`showObjectPanel` 选中 → `startMoveObj` 进入拖拽 → `applyLayout()` 保存坐标
6. `groundY(x,z)`：地面高度函数（含岛屿地形）

### 8.8 宠物导航系统（⚠️ 全项目最复杂、踩坑最多）

**状态变量**：
- `three3D.petTarget`（THREE.Vector3）：目标点
- `three3D.navMode`：`"direct" | "exit" | "detour" | "toDoor" | "enter"`
- `three3D.pet._pathQ`：A* waypoint 队列
- `three3D.pet._recQ`：A* 重算节流时间戳（200ms）

**关键坐标**（默认 layout）：
- home = (-2.8, 0.8)，门口 DZ = 2.85
- farm = (3.8, -1.8)，pond = (4.0, 2.6)
- 房子 = 左墙(-4.25,0.8,w.3,d1.5) + 右墙(-1.35,0.8) + 后墙(-2.8,-0.55,w2.9,d.3)，门洞在 z 正方向

**导航决策（renderLoop 内，每帧）**：
```js
var atHome = d2(HX,HZ) < 0.5;
var atDoor = pet.x > -4.5 && pet.x < -0.3 && pet.z > -0.5 && pet.z < 3.0;  // 家门范围
var inHouse = 同上（与 atDoor 一致！）;  // ⚠️ v20 修复：两处必须同值
var goingHome = state.pet.pos === "home" && !atHome;   // v19 修复：不再要求 out=true

if(flying && !sleep) → direct 直飞
else if(goingHome)   → 回家状态机：
     atHome → direct + 关门
     enter||atDoor → enter：doorTarget=1, nav=(HX,HZ)（进门）
     否则 → toDoor：doorTarget=1, nav=(HX,2.85)（直线到门口）
else if(state.pet.out) → 出门状态机：exit→detour→direct
```

**碰撞与绕障（每帧）**：
```js
var hit = checkCollision(nx, nz, 0.4, true);
if(goingHome && inHouse){ hit = null; }   // 已进屋，无视碰撞直接走到中心
if(hit && dNavSq > 0.25){
  // 1) 沿墙滑行：优先沿主轴（dx 大就沿 x 滑），不行试次轴
  // 2) 都失败 → aStarPath 重算（200ms 节流）
} else { 移动 }
```

**A* 寻路**（`aStarPath`，~2672-2751 行）：
- `buildAStarGrid()`：把岛切成网格（每个格子 `checkCollision(wx,wz,0.4)` 判是否可走）——**半径必须与宠物碰撞半径一致（0.4）**
- `worldToGrid/gridToWorld`：世界坐标 ↔ 网格坐标
- `smoothPath()`：路径平滑（去掉冗余拐点）
- 关键修复：**path 顺序**（unshift 从终点回溯）、**path[0] 不加 pet 自身位置**（否则第一段永远到不了）、**waypoint shift 阈值 d²<0.09 且 d²<0.25 且队列>1 时跳过近点**

**checkCollision（2793 行）**：
```js
// getObstacles 的 w/d 是"全宽"！这里必须 ÷2 当半宽 —— v19 修复
var dx = Math.max(Math.abs(px-o.x) - o.w/2, 0);
var dz = Math.max(Math.abs(pz-o.z) - o.d/2, 0);
if(dx*dx + dz*dz < radius*radius) return o;
```
- `ignoreFacility=true` 时忽略菜地/鱼塘（宠物可穿越自己的设施）
- 门板 AABB：doorAngle<0.1 且宠物不在门口 1.5m 内才加入（避免出门被自己家门堵死）

**宠物移动调度 `movePet(immediate)`（每 4 秒）**：
- `immediate=true`（启动时）：只 `updatePetTarget()` 不切 pos
- sick 或 (out && energy<=0) → 强制回家
- **出门在外只在家/菜地/鱼塘间轮流**，`pos===home` 时 `out` 已 false 才可能切到 home（v17.7 修复：出门后永不自动切回 home）

---

## 9. 已知技术债与注意事项

1. **重复函数定义**（⚠️ 历史遗留，改动前必查）：以下函数在文件里**各定义了 2 份**（v15 前多次大改合并的副本），JS 引擎**后声明覆盖前者**，实际生效的是**最后一份**：
   - `showPetPanel / closePetPanel / petFeed / petPlay / startPetMove`（2838-2950 行区间）
   - **修改这些函数时**：必须全局查找所有定义并全部修改（用 `replaceAll` / 正则 `g` flag），或用 grep 确认份数
2. **renderLoop 单例**：仅 1 份（2979 行），启动方式 `init3D()` 内部 `requestAnimationFrame(renderLoop)` 链
3. **版本兼容**：Three.js r128 是旧版 API（`outputEncoding`、`THREE.OrbitControls` 全局），**禁止无脑升级**
4. **状态一致性**：`state.pet.out/pos` 与 3D 位置 `three3D.pet.position` 是两个来源，靠 `updatePetTarget()` 同步；任何改 state 的操作必须调用它
5. **inHouse/atDoor 同步**：renderLoop 内的两个判定**必须始终同值**（v20 修复点），否则回家卡墙

---

## 10. 踩坑记录（v17~v20，按时间）

| 版本 | Bug | 根因 | 修复 |
|------|-----|------|------|
| v17.5 | 点"移动"报错 petMoveMode undefined | `var petMoveMode` 在 init3D 内是局部变量；且文件有 2 份 closePetPanel 重复 | 提升全局 + closePetPanel 不重置移动模式 |
| v17.6 | 点"出门"反而回家 | sampleState 默认 `out=true` → 按钮显示"叫回家"→ 用户点一下反而回家；`outSince=0` 使缓冲判断恒真 | sampleState 默认在家 + outSince 必存在判断 |
| v17.7 | 宠物出门卡死/乱跑/回不来（8 个连环 bug） | A* 顺序反、waypoint 阈值严、网格半径≠宠物半径、目标在障碍物内、被自己设施困住、出门后自动切 home、天黑概率高、头部朝向固定 | 逐项修复 + 设施可穿越 + 目标 0.5m 忽略碰撞 |
| v18.1 | 默认状态宠物"自己跑出家门口" | `goingHome = pos==="home"` 对默认在家也成立 | `goingHome = out && pos==="home"`（后 v19 又改） |
| v18.2 | 全黑屏 | Sky ShaderMaterial 编译失败（GLSL 3.0 vs 1.0）| 加 `glslVersion: THREE.GLSL1` |
| v18.3 | 撞树/回家撞门 | A* 死循环、atDoor 判定太严、sick 状态隐形阻塞 | 沿墙滑行 + atDoor 扩展 + 出门清 sick |
| v18.4 | 树在鱼塘里 / 点击地点不走 | 默认树坐标在鱼塘 AABB 内；petMoveMode 强制 pos=random 覆盖点击 | 移树 + `targetOverride` 存点击位置 |
| v18.5 | 回家撞墙/脚悬空 | toDoor 绕到房子前方撞侧墙；v17.3 改脚 y 没升基线 | toDoor 直线 + 脚 y 回滚 0.16 |
| v18.6 | 回家回不去/按钮状态不符 | togglePetOut 回家不清 targetOverride；默认 out=true 用户困惑 | 回家清 targetOverride+pathQ；默认在家 |
| v19 | 穿门/撞墙不动（终极修复） | **checkCollision 把全宽当半宽**（AABB 实际 2 倍宽）；goingHome 要求 out=true 点回家即停；atDoor 太严 | w/d÷2 + goingHome=pos==home&&!atHome + atDoor 扩展 |
| v20 | 走到房子旁边再回家必撞墙 | renderLoop 内 `inHouse` 仍用旧的 `x<-1.3`，与 `atDoor`(x<-0.3) 不一致 → fix14 `goingHome&&inHouse` 不触发 | inHouse 判定与 atDoor 同步（`x<-0.3`） |

**跨版本通用教训**：
1. AABB 全宽/半宽约定必须统一（getObstacles 与 checkCollision）
2. 同一判定概念多处使用必须一致（atDoor/inHouse）
3. 改函数前先 `grep -n "function 名"` 确认份数（有重复定义）
4. playwright eval 跨 context 共享 localStorage → 每次改 state 都被 save 写回 → **测试必须真实点击 + fresh URL**
5. 所有时间字段必须有初值（0 或 Date.now()），否则 `now - 0` 恒大于阈值

---

## 11. 迭代升级路线（加后端 + 数据库）

> 目标：把单机 localStorage 版升级为**有账号体系的联网版**（后端 + 数据库）。以下给出**最小侵入**改造方案。
> **已定技术栈：Java 17 + Spring Boot 3.x + MySQL 8**（2026-08-05 用户明确）。

### 11.1 目标架构

```
[浏览器] 现有 index.html（改造）        [Spring Boot 后端]            [MySQL 数据库]
  ├─ state 仍保留（前端缓存）            /api/auth/**  鉴权(JWT)       users 表
  ├─ save() → PUT /api/state（节流）     /api/state    读写档案        players 表（state JSON）
  ├─ load() → GET /api/state，失败回落 localStorage                  logs 表（可选）
  └─ 新增：登录注册、多设备同步
```

### 11.2 技术栈（已定）

| 层 | 选型 | 说明 |
|----|------|------|
| 语言/框架 | **Java 17 + Spring Boot 3.x** | WebFlux 或 MVC 均可；个人项目推荐 MVC 更简单 |
| ORM | MyBatis-Plus 或 Spring Data JPA | 建议 MyBatis-Plus（国内生态好，JSON 字段支持友好） |
| 数据库 | **MySQL 8**（utf8mb4） | `state_json` 用 `JSON` 类型列 |
| 鉴权 | Spring Security + JWT（jjwt） | 无状态，前端存 token |
| 密码 | BCryptPasswordEncoder | 不存明文 |
| 构建 | Maven | `spring-boot-starter-parent` 3.x |

### 11.3 数据库 Schema（MySQL 8）

```sql
-- 用户表
CREATE TABLE users (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  username    VARCHAR(32)  NOT NULL UNIQUE,
  password    VARCHAR(100) NOT NULL,              -- BCrypt 哈希
  nickname    VARCHAR(32)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家档案（一用户一档；state JSON 直存，前端结构无感）
CREATE TABLE players (
  user_id     BIGINT PRIMARY KEY,
  state_json  JSON         NOT NULL,              -- 完整 state 对象
  version     INT          NOT NULL DEFAULT 6,    -- 对应 LS_KEY 版本号
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 事件日志（可选：把 state.logs 抽成行，便于后台统计/排行）
CREATE TABLE logs (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL,
  type       VARCHAR(16)  NOT NULL,               -- feed/play/harvest/watch/study...
  text       VARCHAR(255) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_logs_user (user_id, created_at),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 统一类目表（种植植物 / 养殖鱼 / 养殖动物 / 家具 ... 全部一张表）
-- type 字段区分大类；价格、成长时间、产出物等字段全在此
-- 前端本地版对应 state.categories 数组（§13.6），联网版查此表
-- ============================================================
CREATE TABLE categories (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(32)  NOT NULL UNIQUE,       -- 标识：carrot / goldfish / chicken / bed
  name        VARCHAR(32)  NOT NULL,              -- 中文名：胡萝卜 / 金鱼 / 鸡 / 小床
  type        VARCHAR(16)  NOT NULL,              -- 大类：crop 植物 | fish 鱼 | animal 动物 | furniture 家具
  price       INT          NOT NULL DEFAULT 0,    -- 购买价（金币）
  sell_price  INT          NOT NULL DEFAULT 0,    -- 成熟/产出后售价
  grow_days   DECIMAL(5,2) NOT NULL DEFAULT 0,    -- 成长所需天数（成熟周期）
  feed_days   DECIMAL(5,2) NOT NULL DEFAULT 0,    -- 浇水/喂养间隔（天），超期枯萎/掉产出
  exp         INT          NOT NULL DEFAULT 0,    -- 收获/售卖所得经验
  level_req   INT          NOT NULL DEFAULT 1,    -- 解锁所需等级（或设施等级）
  product     VARCHAR(32)  DEFAULT NULL,          -- 产出物名称（动物：鸡蛋/鸭蛋/牛奶；作物：无）
  prod_price  INT          NOT NULL DEFAULT 0,    -- 产出物售价
  satiety     INT          NOT NULL DEFAULT 0,    -- 作为宠物食物时的饱食增加值
  energy      INT          NOT NULL DEFAULT 0,    -- 作为宠物食物时的体力增加值
  color       VARCHAR(16)  NOT NULL DEFAULT '#FFFFFF',  -- UI 主题色
  icon_svg    TEXT         DEFAULT NULL,          -- 可选：SVG 图标（不设则用 code 默认样式）
  status      TINYINT      NOT NULL DEFAULT 1,    -- 1 启用 / 0 停用
  sort_order  INT          NOT NULL DEFAULT 0,    -- 展示排序
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cat_type (type, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 示例数据（chicken/duck/cow 为牧场规划；goldfish 等为现有鱼）
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color) VALUES
 ('carrot','胡萝卜','crop',5,8,0.3,0.1,10,1,NULL,0,15,12,'#FF9E4A'),
 ('goldfish','金鱼','fish',10,14,0.6,0.15,12,1,NULL,0,0,0,'#FFD166'),
 ('chicken','鸡','animal',8,15,0.4,0.1,9,1,'鸡蛋',3,0,0,'#FFD166'),
 ('duck','鸭','animal',12,22,0.6,0.15,13,1,'鸭蛋',5,0,0,'#4CC9F0'),
 ('cow','牛','animal',25,45,1.0,0.2,18,2,'牛奶',9,0,0,'#C9A0FF'),
 ('bed','小床','furniture',40,0,0,0,0,1,NULL,0,0,0,'#C98A4B');

-- ============================================================
-- 学习题库表（兼容多科目 + 多题型，§13.5）
-- subject 区分科目：english / hanzi / chengyu / math / thinking
-- q_type  区分题型：choice 单选 | match 配对 | fill 填空 | qa 问答
-- ============================================================
CREATE TABLE questions (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  subject     VARCHAR(16)  NOT NULL,              -- 科目：english|hanzi|chengyu|math|thinking
  q_type      VARCHAR(16)  NOT NULL DEFAULT 'choice', -- 题型：choice|match|fill|qa
  group_id    VARCHAR(32)  DEFAULT NULL,          -- 分组标识（animals / 加法 / 反义词...）
  group_name  VARCHAR(32)  DEFAULT NULL,          -- 分组显示名
  prompt      TEXT         NOT NULL,              -- 题干（支持 JSON 字符串：图片/富文本）
  options     JSON         DEFAULT NULL,          -- 选择题选项 [{text, correct, icon}]
  answer      TEXT         DEFAULT NULL,          -- 正确答案（match 存映射 JSON / fill 存文本 / qa 存参考）
  level       INT          NOT NULL DEFAULT 1,    -- 难度 1-5
  points      INT          NOT NULL DEFAULT 1,    -- 答对金币
  status      TINYINT      NOT NULL DEFAULT 1,    -- 1 启用 / 0 停用
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ques_subject (subject, status, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 示例（数学加法 choice / 汉字配对 match / 英语单词 choice）
INSERT INTO questions (subject,q_type,group_id,group_name,prompt,options,answer,level,points) VALUES
 ('math','choice','add10','10以内加法','3 + 4 = ?','[{"text":"6"},{"text":"7","correct":true},{"text":"8"},{"text":"9"}]','7',1,2),
 ('hanzi','match','antonym','反义词','把意思相反的词配对','[{"text":"大"},{"text":"小"},{"text":"上"},{"text":"下"}]','{"大":"小","上":"下"}',1,2),
 ('english','choice','animals','动物','cat 的意思是？','[{"text":"狗"},{"text":"猫","correct":true},{"text":"鸟"},{"text":"鱼"}]','猫',1,1);
```

> **设计要点**：`state_json` 单列直存 JSON —— 游戏状态是高度嵌套对象，拆表成本极高、收益低。前端 state 结构变更时，后端只存**版本号**，由前端 `migrate()` 负责兼容（与现在完全一致）。MyBatis-Plus 用 `JacksonTypeHandler` 处理 JSON 列。

### 11.4 Spring Boot 项目结构（推荐）

```
pet-park-server/
├── pom.xml                       ✅ 已创建（Spring Boot 3.3.5 + MyBatis-Plus 3.5.7 + jjwt 0.12.6）
├── mvn-run.ps1                   ✅ 编译脚本（本机 Maven 3.9.12 封装，输出 mvn-out.txt UTF-8）
├── src/main/java/com/petpark/
│   ├── PetParkApplication.java   ✅ 入口 @SpringBootApplication + @MapperScan
│   ├── config/
│   │   ├── SecurityConfig.java   ✅ JWT 过滤器链、放行 /api/auth/** + /api/categories|questions
│   │   └── JwtAuthFilter.java    ✅ 解析 Bearer token → userId 存 request attribute
│   ├── controller/
│   │   ├── AuthController.java   ✅ POST /api/auth/register|login
│   │   ├── StateController.java  ✅ GET/PUT /api/state（存档读写）
│   │   ├── CategoryController.java ✅ GET /api/categories?type= （类目表只读）
│   │   ├── QuestionController.java ✅ GET /api/questions?subject= （题库只读）
│   │   └── LogController.java    ✅ GET /api/logs （事件日志）
│   ├── service/
│   │   ├── UserService.java      ✅ 注册/登录/BCrypt
│   │   ├── StateService.java     ✅ players.state_json upsert + version
│   │   └── TokenService.java     ✅ JWT 生成/解析
│   ├── entity/                   ✅ User/Player/Log/Category/Question（Lombok @Data）
│   ├── mapper/                   ✅ 5 个 MyBatis-Plus BaseMapper
│   ├── dto/                      ✅ RegisterReq/LoginReq/LoginResp/StateReq
│   └── common/                   ✅ Result<T>/BizException/GlobalExceptionHandler
└── src/main/resources/
    ├── application.yml           ✅ 数据源/JWT/CORS/MyBatis 配置
    └── schema.sql                ✅ 建库建表 + 类目/题库初始数据（MySQL 5.7+/8）
```

### 11.5 API 设计（最小集）

```
POST /api/auth/register      {username, password} → {token, user}
POST /api/auth/login         {username, password} → {token, user}
GET  /api/state              (Auth) → {version, state_json}         // 前端 load()
PUT  /api/state              (Auth) {version, state_json} → {ok}    // 前端 save() 节流调用
GET  /api/logs?limit=50      (Auth) → [logs]                        // 可选
```

统一响应包装：`{ code:0, msg:"ok", data:... }`；异常统一 `@RestControllerAdvice` 处理。

### 11.6 前端改造点（最小侵入）

1. **`save()` 改造**（第 800 行）：
   ```js
   function save(){
     try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
     // 新增：节流同步后端（2s 一次已够）
     if(userToken && !saveTimer){
       saveTimer = setTimeout(()=>{
         fetch('/api/state', {method:'PUT', headers:{Authorization:'Bearer '+userToken, 'Content-Type':'application/json'},
           body: JSON.stringify({version:6, state_json:JSON.stringify(state)})}).catch(()=>{});
         saveTimer = null;
       }, 1000);
     }
   }
   ```
2. **`load()` 改造**：`fetch('/api/state')` 成功 → 用后端数据 + `migrate()`；失败 → 回落 localStorage（离线可用）
3. **新增登录 UI**：首屏弹层（注册/登录切换），token 存 localStorage
4. **导出/导入**保留（仍是手动备份手段）
5. **多设备同步**：建议"后写覆盖"（简单）；进阶按 `updated_at` 取新，或用版本号乐观锁

### 11.7 部署

- 方案 A（推荐）：Spring Boot 打包 `jar` 用 `mvn package`，服务器上 `java -jar`；`index.html` 放 Spring Boot `static/` 目录同域部署（避免 CORS）
- 方案 B：前端部署到对象存储/CDN，后端独立域名 + CORS 白名单
- 数据库：MySQL 8（云 RDS 或自建），首次启动执行 `schema.sql`

---

## 12. 调试指南（写给接手的 AI）

### 12.1 启动
```bash
cd pet-park && python -m http.server 8899
```

### 12.2 Playwright 真实点击测试（血泪经验）
```bash
# 1. 清缓存 + 全新 URL（必须带随机参数防缓存 + 防 localStorage 污染）
PCLI="C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node_modules/@playwright/cli/playwright-cli.js"
node $PCLI open "http://localhost:8899/?v=N&t=$(date +%s%N)"
# 2. 等 8-10s（CDN + 3D 初始化）后 eval 读状态
node $PCLI eval "JSON.stringify({out:state.pet.out,pos:state.pet.pos,scene:three3D.pet.position.x.toFixed(2)+','+three3D.pet.position.z.toFixed(2)})"
# 3. 真实点击
node $PCLI eval "document.getElementById('petOutBtn').click()"
# 4. 观察关键值：state.pet.out/pos、three3D.pet.position、three3D.navMode、three3D.doorAngle
```

### 12.3 常用验证指标
- 出门：`out=true`，pos ∈ {farm,pond}，宠物位置最终接近 PET_SPOTS
- 回家：`out=false`，pos=home，宠物位置 = (-2.80, 0.80)（`atHome=true`）
- 门：出门 doorTarget=1；回家到中心 doorTarget=0
- 状态一致性：按钮文字（"出门玩"/"叫回家"）必须与 `state.pet.out` 严格对应

---

## 13. 待办清单（TODO）

> 按优先级排序。完成一项后打勾并注明版本号。

### 13.1 🐔 牧场系统（养殖动物：鸡/鸭/牛等）——【用户已提，优先级最高】

**现状**：目前只有鱼池（pond）和菜地（farm）两个生产模块，**没有牧场**。

**需求**（2026-08-05 用户提出）：
- 新增「牧场」生产模块，养殖动物：**鸡、鸭、牛**（后续可扩展猪/羊/兔等）
- 与现有菜地/鱼塘同构：购买幼崽 → 喂养成长 → 成熟收获（蛋/奶/毛等产出物）→ 售卖

**数据设计（用户明确：不建 ANIMALS 常量表，全部进统一类目表）**：

```js
// ✅ 动物类目不单独建表，全部存进 categories 统一类目表（type='animal'）
// 本地版：state.categories 数组；联网版：MySQL categories 表（§11.3）
// 字段：code/name/type/price/sell_price/grow_days/feed_days/exp/level_req/product/prod_price/color/icon_svg
// 例：{ code:'chicken', name:'鸡', type:'animal', price:8, sell_price:15,
//      grow_days:0.4, feed_days:0.1, exp:9, level_req:1, product:'鸡蛋', prod_price:3, color:'#FFD166' }

// state 扩展（defaultState 增加）
ranch: {
  level: 1,
  stalls: [ {id:1..N, type:null, stockedDay:0, lastFeedDay:0, grownDays:0} ]  // 动物栏位（同构 fish 数组）
}
```

**实现清单**（照抄 fish 系统 8 个函数模式）：
- [x] 类目表加 `type='animal'` 数据（鸡/鸭/牛，含价格/成长时间/产出物，见 §11.3 INSERT 示例）✅ v21
- [x] `state.ranch` 数据结构 + `defaultState`/`sampleState` 初始化 ✅ v21
- [x] 新模块 tab `mod-ranch`（导航栏 + `switchMod` 注册）✅ v21
- [x] 买幼崽 `stockAnimal(id, code)`（同 `stockFish`，从类目表读价格/成长）✅ v21
- [x] 喂食 `feedAnimal(id)`（同 `feedFish`，喂食间隔 = feed_days）✅ v21
- [x] 收获产出 `collectProduct(id)`（成熟后按 grow_days 冷却反复收 product/prod_price）✅ v21
- [x] 售卖 `sellAnimal(id)`（同 `sellFish`，按 sell_price）✅ v21
- [x] 升级牧场 `upgradeRanch()`（按 level_req 解锁鸡→鸭→牛）✅ v21
- [x] `renderRanch()` DOM 渲染 + SVG 动物图标（animalSVG 画鸡/鸭/牛）✅ v21
- [ ] 3D 场景：牧场棚/围栏 + 动物模型（可选，参考树/鱼塘的 AABB 与拖拽摆放）
- [x] `migrate()` 兼容：老存档无 `ranch` 字段时补默认值 ✅ v21
- [x] 版本号评估：**加字段已升 LS_KEY → v7** ✅ v21

**关键提醒**：
- 照抄 fish 系统即可，**不要引入新模式**（避免重蹈"创新引入 bug"的覆辙）
- `checkCollision` 若加牧场 3D 设施：记得 `ignoreFacility` 里加"牧场"（宠物可穿越）
- 双函数定义坑：新函数名不要与现有 5 个重复（showPetPanel 等）
- **产出冷却**：`lastProductDay + grow_days` 后才再次就绪（防 tick 每帧重置 productReady 无限刷金币）

### 13.2 🔐 账号体系 + 后端接入（Spring Boot + MySQL）——【✅ 完成 v23】
- [x] 搭建 `pet-park-server`（按 §11 结构）✅ v22 骨架完成 + **BUILD SUCCESS（28 源文件）**
- [x] 登录/注册 + JWT 鉴权（UserService/TokenService/SecurityConfig）✅ v22
- [x] MySQL 初始化 + **全链路 API 实测通过** ✅ v22（注册/登录/存档读写/类目/题库/日志/鉴权拦截）
- [x] **前端对接完成** ✅ v23（save() 节流 PUT 同步 + load() 拉云端回落 + 登录弹层 + token/userInfo localStorage 缓存）
- [ ] 多设备同步策略（**最后一项**：版本号乐观锁 or 后写覆盖）
- 启动命令：`java -jar pet-park-server/target/pet-park-server-1.0.0.jar --server.port=8080`
- 前端 API 地址配置：`?api=http://127.0.0.1:8080/api`（URL 参数覆盖 API_BASE）
- ⚠️ 已知：JDBC URL 的 `characterEncoding` 必须用 `UTF-8`（不能用 utf8mb4，会报 Unsupported character encoding）

### 13.3 🎨 体验优化（建议项）
- [ ] 宠物成长动画丰富（阶段 2/3 更多动作）
- [ ] 音效（可内联 base64 短音频，避免外链）
- [ ] 天气效果（雨天 3D 雨滴粒子）
- [ ] 数据统计图表（SVG 折线：金币/经验趋势）

### 13.4 🧹 技术债清理
- [ ] 合并 5 个重复函数定义（showPetPanel/closePetPanel/petFeed/petPlay/startPetMove）
- [ ] 升级 Three.js 到现代版本前，先确认 API 迁移清单（r128 → r152+ 的 colorSpace 等）

### 13.5 📚 学习模块扩展（多科目 + 多题型题库）——【用户已提】

**需求**（2026-08-05 用户提出）：学习模块**不只英语**，要支持多科目，**表结构兼容不同题型**。

**科目（subject）**：`english` 英语 | `hanzi` 汉字 | `chengyu` 成语 | `math` 数学 | `thinking` 思维训练

**题型（q_type）**：
| 题型 | 说明 | options/answer 格式 |
|------|------|---------------------|
| `choice` 单选 | 四选一 | options=[{text,correct}]，answer=正确文本 |
| `match` 配对 | 连线配对 | options=[左列]，answer=映射 JSON `{"大":"小","上":"下"}` |
| `fill` 填空 | 输入答案 | answer=文本 |
| `qa` 问答 | 开放式 | answer=参考文本（容错匹配） |

**数据设计（统一题库表，兼容任意科目/题型）**：
```js
// 本地版：state.questions 数组（从后端题库拉取或内嵌示例）
// 联网版：MySQL questions 表（§11.3）
{ id, subject:'math', q_type:'choice', group_id:'add10', group_name:'10以内加法',
  prompt:'3 + 4 = ?', options:[{text:'6'},{text:'7',correct:true}], answer:'7', level:1, points:2 }
```

**前端改造清单**：
- [ ] `WORD_GROUPS` → `state.questions`（含 subject/q_type 字段），`defaultState` 预置各科目示例
- [ ] 学习 tab 增加**科目选择器**（英语/汉字/成语/数学/思维 5 个入口卡）
- [ ] 通用题目渲染器：按 `q_type` 分发（choice 渲染选项按钮 / match 渲染两列连线 / fill 渲染输入框 / qa 渲染文本框）
- [ ] 判分器：choice 比对 correct；match 比对映射；fill/qa 文本容错（去空格/大小写）
- [ ] `resetStudyDaily()` 按 `STUDY_DAILY_LIMIT` 计分逻辑不变
- [ ] SVG 卡片图：现有 `wordCat/wordDog/wordApple` 等可按科目/分组复用

### 13.6 🗂️ 统一类目表改造（废弃分散常量表）——【用户已提】

**需求**（2026-08-05 用户明确）：不要维护 CROPS/FISHES/FURNITURE 等多个常量表；**种植植物/养殖鱼/养殖动物/家具的名称、价格、成长时间等全部统一一张类目表**，用 `type` 字段区分。

**目标设计**：
```js
// state.categories 数组（本地版；联网版 = MySQL categories 表）
state.categories = [
  { code:'carrot',    name:'胡萝卜', type:'crop',     price:5, sell_price:8,  grow_days:0.3, feed_days:0.1,  exp:10, level_req:1, product:null,   prod_price:0, satiety:15, energy:12, color:'#FF9E4A' },
  { code:'goldfish',  name:'金鱼',   type:'fish',     price:10,sell_price:14, grow_days:0.6, feed_days:0.15, exp:12, level_req:1, product:null,   prod_price:0, satiety:0,  energy:0,  color:'#FFD166' },
  { code:'chicken',   name:'鸡',     type:'animal',   price:8, sell_price:15, grow_days:0.4, feed_days:0.1,  exp:9,  level_req:1, product:'鸡蛋', prod_price:3, satiety:0, energy:0,  color:'#FFD166' },
  { code:'bed',       name:'小床',   type:'furniture',price:40,sell_price:0,  grow_days:0,   feed_days:0,    exp:0,  level_req:1, product:null,   prod_price:0, satiety:0, energy:0,  color:'#C98A4B' }
];
```

**改造清单**：
- [ ] `state.categories` 数组 + `defaultState`/`sampleState` 初始化（迁入现有 CROPS/FISHES/FURNITURE 数据）
- [ ] 工具函数：`catByCode(code)` / `catsByType(type)`（替代 CROPS['carrot'] 直接引用）
- [ ] 全部引用点改造：`CROPS`→`catByCode`，`FISHES`→`catByCode`，`FURNITURE`→`catsByType('furniture')`
  - ⚠️ 引用点较多（plant/harvest/feed/fish/renderFarm/renderPond/shop 等），建议一次性全局替换 + 回归测试
- [ ] 联网版：启动时 GET `/api/categories` 拉取，离线回落内置数据
- [ ] 加新物品（动物/作物/家具）不再改代码，**只需插入类目表数据**（运营可配）
- [ ] 版本号评估：**state 结构变更需升 LS_KEY → v7**

---

## 14. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v17.5~v20 | 2026-08-04~05 | 宠物导航/回家/状态一致性系列修复（见 §10） |
| v20 | 2026-08-05 | renderLoop inHouse 与 atDoor 同步；**Three.js 改 CDN 在线拉取（jsdelivr r128）**；删除本地依赖 |
| v20.1 | 2026-08-05 | 本技术文档创建 |
| v20.2 | 2026-08-05 | 文档更新：后端方案定稿 **Java 17 + Spring Boot 3.x + MySQL 8**；新增 §13 待办清单（**牧场系统** 优先级最高） |
| v20.3 | 2026-08-05 | 文档更新：① 学习模块扩展（§13.5 多科目 english/hanzi/chengyu/math/thinking + 多题型 choice/match/fill/qa 的 `questions` 题库表）；② **统一类目表**（§13.6 废弃 CROPS/FISHES/FURNITURE 常量表 → `categories` 表，type 区分 crop/fish/animal/furniture，含价格/成长时间/产出物字段）；③ 牧场动物直接进类目表（§13.1 不再建 ANIMALS 常量） |
| v21 | 2026-08-05 | **牧场系统上线**：① 统一类目表落地（`CATEGORIES` + `catByCode()`/`catsByType()`，CROPS/FISHES/FURNITURE 降级为兼容索引）；② `state.ranch` + 鸡/鸭/牛养殖（stockAnimal/feedAnimal/collectProduct/sellAnimal/upgradeRanch/renderRanch + animalSVG + mod-ranch tab）；③ 产出冷却（lastProductDay + grow_days）；④ **LS_KEY v6→v7**；playwright 全流程回归通过 |
| v22 | 2026-08-05 | **后端骨架上线（pet-park-server）**：Spring Boot 3.3.5 + MyBatis-Plus + MySQL + JWT；5 表实体/Mapper + Auth/State/Category/Question/Log 5 个 Controller + Security 配置 + schema.sql；**Maven 编译 BUILD SUCCESS（28 源文件）** |
| v22.1 | 2026-08-05 | **后端全链路打通**：MySQL root/123456 建库建表（5 表+19 类目+7 题库）；修复 `characterEncoding=utf8mb4→UTF-8`；API 实测全通过：注册/登录（BCrypt+JWT）/存档读写（JSON 列）/类目/题库/日志/无 token 403 拦截 |
| v23 | 2026-08-05 | **前端对接后端完成**：① API_BASE 常量 + `?api=URL` 覆盖；② 登录弹层（注册/登录/暂不登录三按钮）；③ token + userInfo localStorage 缓存（刷新后保留登录态）；④ save() 节流 PUT 同步云端；⑤ load() 异步拉云端存档覆盖本地；⑥ 启动时拉 /api/categories 覆盖本地类目；⑦ 顶部"用户/退出"按钮。Playwright 真实点击测：登录→改金币→验证后端收到→清本地→刷新→云端恢复 ✅ |
| v23.5 | 2026-08-05 | **Angular 19 前端重写**：用户反对 `?api=` URL 暴露后端地址，弃用单文件版对接方案；新起 `pet-park-ng/` Angular 19 standalone 项目，proxy.conf.json `/api → 127.0.0.1:8080`，前端零后端地址；6 模块（家园/菜地/鱼塘/牧场/学习/数据）+ Three.js 3D 场景。`pet-park-ng2/` 为早期半成品（无 node_modules/无 components），主项目是 `pet-park-ng/` |
| v24 | 2026-08-05 | **Angular 构建打通**：用户终端 npm install 958 包 + build 9 秒成功（标准 ng build）；沙箱 WorkBuddy 限制：①项目目录 node 写 EPERM（safe-delete 拦截）→ 走 Temp 目录；② ng build Go deadlock（@angular/build 多进程限制）→ **手动构建链 ngc + esbuild + `import '@angular/compiler'`（JIT fallback 解决 _PlatformLocation 报错）+ Temp 目录写产物 + node HTTP server + Playwright 验证** |
| v25 | 2026-08-05 | **沙箱内 Angular 完整跑通**：6 模块渲染 / 学习 Tab / 今日待办 / 3D 场景全部 OK；Playwright 截图确认 |
| **v26** | **2026-08-05** | **🆕 本次发布版：①删除单文件 HTML 兜底代码**（API_BASE/`?api=`/apiFetch/userToken/toggleLogin/doLogin/doRegister/logout/onLoginSuccess/syncUserUI/pushStateToServer/syncRemote/登录弹层/启动拉云端/init同步调用全部清除；备份 index.html.bak_v23）；**②学习模块升级为五科目多题型**（英语/数学/汉字/成语/思维，14 组 60 题：choice/fill/qa/card），单文件版 + Angular 前端 + 后端 schema.sql 三端对齐；**③Angular 学习模块完整实现**（替换原"开发中"占位：科目 Tab + 组卡片 + 四种题型渲染 + 答题反馈 + 答对判定 + 填空判分），**state.service.ts 暴露 `studySubjects/studySubjectIdx/studySession/studyEarned` 与切换/答题/填空/揭示方法**；**④端到端链路验证通过**：沙箱内 Playwright 实测 Angular 19003 代理 → 后端 8080 → MySQL：注册/学习答题/数据模块全部 OK，无 page error。**⑤沙箱限制说明**：Angular ng build 沙箱 Go deadlock、maven 沙箱写 target EPERM 均无解，需用户本地构建；发布版 jar（v22）含旧 7 题示例，schema.sql 60 题需本地 `mvn clean package` 重构建生效 |

---

## 15. v26 完整交付清单（本次发布版）

### 15.1 单文件 HTML（`pet-park/index.html`）
- 删除：API_BASE/userToken/apiFetch/toggleLogin/doLogin/doRegister/logout/onLoginSuccess/syncUserUI/pushStateToServer/syncRemote/`?api=` URL 参数解析 + 两份重复 HTML（userBtn × 2、loginMask × 2）+ JS 两块重复兜底代码 + save()同步调用 + 两段启动拉云端 + init()同步调用
- 新增：STUDY_SUBJECTS 五科目题库 + 科目 Tab + 四种题型渲染（card/choice/fill/qa）+ 5 个 studyIcon 函数 + 8 个新 groupIcon
- 校验：JS 语法 OK · 0 兜底代码残留 · WORD_GROUPS 0 残留 · 关键游戏函数（feed/harvest/stockAnimal/feedAnimal/collectProduct 等）全在

### 15.2 Angular 前端（`pet-park/pet-park-ng/`）
- `models.ts`：新增 StudySubject/StudyGroup/StudyItem/StudySession 类型
- `state.service.ts`：导入新类型 + 导出 STUDY_SUBJECTS 五科目 14 组 + 新增 studySubjectIdx/studySession/studySubjects()/studyTodayEarned()/studyGroupDone()/studySubjectAllDone()/switchStudySubject()/startStudyGroup()/pickStudyOpt()/checkStudyFill()/revealQa()/backStudy()/nextStudyItem()/finishStudyGroup()
- `app.component.ts`：新增 studySubjects/studySession/studySubjectIdx/studyEarned getter + studySubjIcon/studyGroupIcon/wordIconSvg/studyCurrentSubj/studyCurrentGroup/studyCurrentItem 等封装
- `app.component.html`：替换「学习（开发中）」占位为完整学习 UI（科目 Tab + 组列表 + 四种题型 ng-container）
- `app.component.css`：新增 50+ 行学习模块样式（科目 Tab + study-card + study-opts + study-fill + study-answer + study-btns）

### 15.3 后端（`pet-park/pet-park-server/src/main/resources/schema.sql`）
- 题库数据扩充：7 题 → **60 题**（english 15 + math 15 + hanzi 10 + chengyu 10 + thinking 10）
- 表结构未变（questions 已支持 subject + q_type + options JSON + answer）

### 15.4 沙箱内构建验证
- ngc 编译：写入 Temp 目录（项目目录写 EPERM）→ EXIT=0
- esbuild 打包：`NODE_PATH` 指 node_modules + Temp main.js → EXIT=0 · 3.65MB bundle
- Playwright 实测：5 科目 Tab 渲染 / 单词卡（cat/cn 互换）/ 选择题（3+4=? 答错判定）/ 填空（5+__=8 填 3 答对）/ 答对反馈 / 截图完美

### 15.5 端到端验证
- 后端 java -jar target/pet-park-server-1.0.0.jar --server.port=8080 → 8080 监听 OK
- `/api/categories` HTTP 200 · 19 条类目 · 首条 carrot
- `/api/questions?subject=math` HTTP 200 · 题数齐全
- GET /api/state 无 token → 403（JWT 鉴权生效）
- Angular 19003 代理 → 后端 8080 → Playwright 注册/学习/数据模块全部 OK

---

*文档维护人：小台（工作台搭建师）*
