import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GameState, Category, StudySubject, StudySession, GAME_DAY_MS, DAY_START_H, NIGHT_START_H,
  FARM_PLOTS, FARM_UP_COST, POND_SLOTS, POND_UP_COST, RANCH_SLOTS, RANCH_UP_COST, STUDY_DAILY_LIMIT } from '../models';
import { AuthService } from './auth.service';
import { WorldApiService } from './world-api.service';

/** 五科目题库：全部从后端 /api/questions 拉取（不内置题目，杜绝单机版） */

/** 默认类目表（离线兜底；联网后由 /api/categories 覆盖） */
const DEFAULT_CATEGORIES: Category[] = [
  { code:'carrot', name:'胡萝卜', type:'crop', price:5, sell_price:8, grow_days:0.3, feed_days:0.1, exp:10, level_req:1, product:null, prod_price:0, satiety:15, energy:12, color:'#FF9E4A' },
  { code:'tomato', name:'番茄', type:'crop', price:8, sell_price:12, grow_days:0.5, feed_days:0.15, exp:13, level_req:1, product:null, prod_price:0, satiety:18, energy:16, color:'#E63946' },
  { code:'strawberry', name:'草莓', type:'crop', price:14, sell_price:20, grow_days:0.8, feed_days:0.2, exp:16, level_req:2, product:null, prod_price:0, satiety:22, energy:20, color:'#FF6B9D' },
  { code:'watermelon', name:'西瓜', type:'crop', price:25, sell_price:36, grow_days:1.2, feed_days:0.25, exp:20, level_req:3, product:null, prod_price:0, satiety:30, energy:25, color:'#06D6A0' },
  { code:'minnow', name:'小鱼', type:'fish', price:6, sell_price:9, grow_days:0.4, feed_days:0.1, exp:8, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#4CC9F0' },
  { code:'goldfish', name:'金鱼', type:'fish', price:10, sell_price:14, grow_days:0.6, feed_days:0.15, exp:12, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#FFD166' },
  { code:'koi', name:'锦鲤', type:'fish', price:18, sell_price:26, grow_days:0.9, feed_days:0.2, exp:16, level_req:2, product:null, prod_price:0, satiety:0, energy:0, color:'#FF6B9D' },
  { code:'dragon', name:'龙鱼', type:'fish', price:30, sell_price:44, grow_days:1.3, feed_days:0.25, exp:22, level_req:3, product:null, prod_price:0, satiety:0, energy:0, color:'#06D6A0' },
  { code:'chicken', name:'鸡', type:'animal', price:8, sell_price:15, grow_days:0.4, feed_days:0.1, exp:9, level_req:1, product:'鸡蛋', prod_price:3, satiety:0, energy:0, color:'#FFD166' },
  { code:'duck', name:'鸭', type:'animal', price:12, sell_price:22, grow_days:0.6, feed_days:0.15, exp:13, level_req:1, product:'鸭蛋', prod_price:5, satiety:0, energy:0, color:'#4CC9F0' },
  { code:'cow', name:'牛', type:'animal', price:25, sell_price:45, grow_days:1.0, feed_days:0.2, exp:18, level_req:2, product:'牛奶', prod_price:9, satiety:0, energy:0, color:'#C9A0FF' },
  { code:'bed', name:'小床', type:'furniture', price:40, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#C98A4B', icon:'furnBed' },
  { code:'sofa', name:'沙发', type:'furniture', price:60, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#EF476F', icon:'furnSofa' },
  { code:'table', name:'桌子', type:'furniture', price:30, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#C98A4B', icon:'furnTable' },
  { code:'flower', name:'花盆', type:'furniture', price:15, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#EF476F', icon:'furnFlower' },
  { code:'rug', name:'地毯', type:'furniture', price:25, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#4CC9F0', icon:'furnRug' },
  { code:'lamp', name:'台灯', type:'furniture', price:20, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#F0A500', icon:'furnLamp' },
  { code:'shelf', name:'书架', type:'furniture', price:50, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#C98A4B', icon:'furnShelf' },
  { code:'tv', name:'电视', type:'furniture', price:80, sell_price:0, grow_days:0, feed_days:0, exp:0, level_req:1, product:null, prod_price:0, satiety:0, energy:0, color:'#5EC4EA', icon:'furnTv' }
];

const LS_KEY = 'wb_petpark_v7';

/** 全局游戏状态服务：state 管理 + 全部游戏逻辑（从单文件 HTML 迁移） */
@Injectable({ providedIn: 'root' })
export class StateService {
  state: GameState = this.defaultState();
  private saveTimer: any = null;
  private tickTimer: any = null;

  constructor(private http: HttpClient, private auth: AuthService, private worldApi: WorldApiService) {}

  // ================= 初始化 =================
  private defaultState(): GameState {
    const plots = [];
    for (let i = 0; i < 6; i++) plots.push({ id: i + 1, crop: null, plantedDay: 0, lastWaterDay: 0, grownDays: 0 });
    const fish = [];
    for (let j = 0; j < 4; j++) fish.push({ id: j + 1, type: null, stockedDay: 0, lastFeedDay: 0, grownDays: 0 });
    const stalls = [];
    for (let k = 0; k < 4; k++) stalls.push({ id: k + 1, type: null, stockedDay: 0, lastFeedDay: 0, grownDays: 0, productReady: false, lastProductDay: 0 });
    return {
      gameDays: 0.3, weather: 'sunny', coins: 0,
      pet: { name: '小黄', stage: 0, level: 1, exp: 0, satiety: 100, mood: 100, energy: 80, sick: false, out: false,
        pos: 'home', outSince: 0, targetOverride: null, lastTick: Date.now(), lastPlayed: 0, lastWatched: 0, lastHelp: 0,
        foods: { carrot: 3, tomato: 2, strawberry: 1 },
        stats: { feed: 0, play: 0, watch: 0, harvest: 0, study: 0 } },
      farm: { level: 1, plots },
      pond: { level: 1, fish },
      ranch: { level: 1, stalls },
      house: { furniture: [] },
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
      layout: { house: { x: -2.8, z: 0.8 }, farm: { x: 3.8, z: -1.8 }, pond: { x: 4.0, z: 2.6 } },
      study: { earned: 0, lastDay: '', learned: [] },
      logs: []
    };
  }

  private sampleState(): GameState {
    const now = Date.now();
    const s = this.defaultState();
    s.gameDays = 6.5; s.weather = 'sunny'; s.coins = 0;
    s.pet.name = '小黄'; s.pet.stage = 1; s.pet.level = 2; s.pet.exp = 6; s.pet.energy = 85;
    s.pet.out = false; s.pet.pos = 'home'; s.pet.outSince = 0;
    s.pet.satiety = 22; s.pet.mood = 55; s.pet.lastTick = now;
    s.pet.foods = { carrot: 3, tomato: 2, strawberry: 1 };
    s.pet.stats = { feed: 3, play: 1, watch: 2, harvest: 1, study: 1 };
    s.farm.plots[0] = { id: 1, crop: 'tomato', plantedDay: 0.6, lastWaterDay: 1.1, grownDays: 0.5 };
    s.farm.plots[1] = { id: 2, crop: 'carrot', plantedDay: 1.0, lastWaterDay: 1.05, grownDays: 0.05 };
    s.farm.plots[2] = { id: 3, crop: 'strawberry', plantedDay: 1.19, lastWaterDay: 1.19, grownDays: 0 };
    s.pond.fish[0] = { id: 1, type: 'goldfish', stockedDay: 0.5, lastFeedDay: 1.1, grownDays: 0.6 };
    s.pond.fish[1] = { id: 2, type: 'minnow', stockedDay: 1.15, lastFeedDay: 1.15, grownDays: 0 };
    s.logs = [
      { t: now - 25 * 60000, type: 'harvest', text: '收获了一个番茄，卖得 8 金币！' },
      { t: now - 55 * 60000, type: 'feed', text: '给 小黄 喂了胡萝卜 +15 饱食' },
      { t: now - 120 * 60000, type: 'study', text: '完成了英语动物组学习，+10 金币' }
    ];
    return s;
  }

  /** 启动：load 本地 → 异步拉云端 → 拉类目 → 拉题库 → 起 tick 定时器 */
  init(): void {
    this.loadLocal();
    if (this.auth.isLoggedIn) this.syncFromServer();
    this.http.get<{ code: number; msg: string; data: Category[] }>('/api/categories').subscribe({
      next: res => { if (res.code === 0 && res.data && res.data.length) this.state.categories = res.data; },
      error: () => { /* 类目是配置数据，后端不可达时保持内置可接受 */ }
    });
    this.loadQuestions();   // 题库一律从后端获取，前端不内置
    this.tickTimer = setInterval(() => { this.tick(); }, 2000);
  }

  destroy(): void { if (this.tickTimer) clearInterval(this.tickTimer); }

  // ================= 持久化 =================
  loadLocal(): void {
    try {
      ['wb_petpark_v3', 'wb_petpark_v4', 'wb_petpark_v5', 'wb_petpark'].forEach(k => localStorage.removeItem(k));
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.pet && o.farm) {
          if (o.gameDays > 30 || (o.pet && o.pet.targetOverride)) { this.state = this.sampleState(); }
          else { this.state = o; }
          this.migrate();
          return;
        }
      }
    } catch (e) { /* ignore */ }
    this.state = this.sampleState();
    this.save();
  }

  migrate(): void {
    const s = this.state;
    if (typeof s.coins !== 'number') s.coins = 0;   // 无记录默认 0，避免继承旧默认值
    if (typeof s.gameDays !== 'number') s.gameDays = 0.3;
    if (!s.weather) s.weather = 'sunny';
    if (typeof s.pet.energy !== 'number') s.pet.energy = 80;
    if (!s.categories || !s.categories.length) s.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    if (!s.ranch) s.ranch = { level: 1, stalls: [] };
    if (!s.ranch.stalls || !s.ranch.stalls.length) {
      for (let rk = 0; rk < 4; rk++) s.ranch.stalls.push({ id: rk + 1, type: null, stockedDay: 0, lastFeedDay: 0, grownDays: 0, productReady: false, lastProductDay: 0 });
    }
    if (!s.layout) s.layout = { house: { x: -2.8, z: 0.8 }, farm: { x: 3.8, z: -1.8 }, pond: { x: 4.0, z: 2.6 } };
  }

  save(): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ }
    this.pushToServer();
  }

  /** 节流同步云端（有 token 时） */
  pushToServer(): void {
    if (!this.auth.isLoggedIn) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.http.put('/api/state', { version: 7, stateJson: this.state },
        { headers: this.auth.authHeaders() }).subscribe({ error: () => { /* 离线忽略 */ } });
    }, 800);
  }

  /** 拉云端存档覆盖本地 */
  syncFromServer(): void {
    this.http.get<{ code: number; msg: string; data: { version: number; stateJson: GameState } }>(
      '/api/state', { headers: this.auth.authHeaders() }).subscribe({
      next: res => {
        if (res.code === 0 && res.data && res.data.stateJson) {
          this.state = res.data.stateJson;
          this.migrate();
          this.save();
        } else {
          // 云端无档：上传本地
          this.http.put('/api/state', { version: 7, stateJson: this.state },
            { headers: this.auth.authHeaders() }).subscribe();
        }
      },
      error: () => { /* 离线忽略 */ }
    });
  }

  // ================= 工具 =================
  catByCode(code: string | null): Category | null {
    if (!code) return null;
    return this.state.categories.find(c => c.code === code) || null;
  }
  catsByType(type: string): Category[] { return this.state.categories.filter(c => c.type === type); }

  gameHour(): number { return (this.state.gameDays % 1) * 24; }
  isNight(): boolean { const h = this.gameHour(); return h >= NIGHT_START_H || h < DAY_START_H; }

  addCoins(n: number): void { this.state.coins += n; if (this.state.coins < 0) this.state.coins = 0; }
  spendCoins(n: number): boolean { if (this.state.coins < n) return false; this.state.coins -= n; return true; }
  addExp(n: number): void {
    const p = this.state.pet;
    p.exp += n;
    const need = p.level * 30;
    if (p.exp >= need) { p.exp -= need; p.level++; p.stage = Math.min(3, p.level >= 12 ? 3 : (p.level >= 7 ? 2 : (p.level >= 3 ? 1 : 0))); }
  }
  addLog(type: string, text: string): void {
    this.state.logs.push({ t: Date.now(), type, text });
    if (this.state.logs.length > 200) this.state.logs = this.state.logs.slice(-200);
  }
  todayKey(): string { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // ================= tick（每 2 秒） =================
  tick(): void {
    const now = Date.now();
    const p = this.state.pet;
    const el = Math.min(now - p.lastTick, 24 * 3600 * 1000);
    if (el <= 0) return;
    const elDays = el / GAME_DAY_MS;
    const wasNight = this.isNight();
    this.state.gameDays += elDays;
    const rainBonus = this.state.weather === 'rain' ? 1.5 : 1;
    p.satiety = Math.max(0, p.satiety - elDays * 4);
    p.mood = Math.max(0, p.mood - elDays * 2.5);
    p.lastTick = now;
    // 菜地
    for (const f of this.state.farm.plots) {
      if (!f.crop) continue;
      const c = this.catByCode(f.crop);
      if (!c) continue;
      if (f.grownDays >= c.grow_days) continue;
      if (this.state.weather === 'rain') f.lastWaterDay = this.state.gameDays;
      if (this.state.gameDays - f.lastWaterDay < c.feed_days) {
        f.grownDays = Math.min(c.grow_days, f.grownDays + elDays * rainBonus);
      }
    }
    // 鱼塘
    for (const fi of this.state.pond.fish) {
      if (!fi.type) continue;
      const fc = this.catByCode(fi.type);
      if (!fc) continue;
      if (fi.grownDays >= fc.grow_days) continue;
      if (this.state.gameDays - fi.lastFeedDay < fc.feed_days) {
        fi.grownDays = Math.min(fc.grow_days, fi.grownDays + elDays * (rainBonus > 1 ? 1.2 : 1));
      }
    }
    // 牧场（含产出冷却）
    for (const an of this.state.ranch.stalls) {
      if (!an.type) continue;
      const ac = this.catByCode(an.type);
      if (!ac) continue;
      if (an.grownDays >= ac.grow_days) {
        if (!an.productReady && this.state.gameDays - (an.lastProductDay || 0) >= ac.grow_days) an.productReady = true;
        continue;
      }
      if (this.state.gameDays - an.lastFeedDay < ac.feed_days) {
        an.grownDays = Math.min(ac.grow_days, an.grownDays + elDays);
      }
    }
    // 体力
    if (p.sick) {
      p.energy = Math.max(0, p.energy - elDays * 10);
      if (p.energy <= 0) { p.sick = false; this.addLog('watch', p.name + '病终于好了，但需要好好休息…'); }
    } else if (p.out) {
      const cost = elDays * 6 * (this.state.weather === 'rain' ? 1.5 : 1);
      p.energy = Math.max(0, p.energy - cost);
      p.mood = Math.min(100, p.mood + elDays * 4);
      p.satiety = Math.max(0, p.satiety - elDays * 3);
      if (p.stage < 3) p.exp += Math.round(elDays * 6);
      if (this.state.weather === 'rain' && Math.random() < elDays * 0.25) {
        p.sick = true; p.out = false; this.state.pet.pos = 'home';
        this.addLog('watch', p.name + '淋雨感冒了！快喂药治疗！');
      }
      if (p.energy <= 0) { p.out = false; this.state.pet.pos = 'home'; this.addLog('watch', p.name + '玩累了，回家休息。'); }
    } else {
      p.energy = Math.min(100, p.energy + elDays * 5);
    }
    // 天气切换
    if (Math.floor(this.state.gameDays) > Math.floor(this.state.gameDays - elDays)) {
      if (Math.random() < 0.35) this.state.weather = this.state.weather === 'rain' ? 'sunny' : 'rain';
    }
  }

  // ================= 菜地 =================
  plant(plotId: number, cropKey: string): void {
    const f = this.state.farm.plots.find(x => x.id === plotId);
    const c = this.catByCode(cropKey);
    if (!f || !c || f.crop) return;
    if (!this.spendCoins(c.price)) return;
    f.crop = cropKey; f.plantedDay = this.state.gameDays; f.lastWaterDay = this.state.gameDays; f.grownDays = 0;
    this.addLog('feed', '种下了一颗' + c.name + '种子');
    this.save();
  }
  waterPlot(plotId: number): void {
    const f = this.state.farm.plots.find(x => x.id === plotId);
    if (!f || !f.crop) return;
    f.lastWaterDay = this.state.gameDays;
    this.save();
  }
  harvestPlot(plotId: number): void {
    const f = this.state.farm.plots.find(x => x.id === plotId);
    if (!f || !f.crop) return;
    const c = this.catByCode(f.crop);
    if (!c || f.grownDays < c.grow_days) return;
    this.addCoins(c.sell_price);
    this.state.pet.stats.harvest++;
    this.addExp(c.exp);
    this.addLog('harvest', '收获了' + c.name + '，卖得 ' + c.sell_price + ' 金币！');
    if (Math.random() < 0.2) {
      this.state.pet.foods[f.crop] = (this.state.pet.foods[f.crop] || 0) + 1;
      this.addLog('harvest', '还捡到了一颗' + c.name + '种子！');
    }
    f.crop = null; f.grownDays = 0;
    this.save();
  }
  upgradeFarm(): void {
    const lv = this.state.farm.level;
    if (lv >= 3) return;
    const cost = FARM_UP_COST[lv + 1];
    if (!this.spendCoins(cost)) return;
    this.state.farm.level++;
    while (this.state.farm.plots.length < FARM_PLOTS[this.state.farm.level]) {
      this.state.farm.plots.push({ id: this.state.farm.plots.length + 1, crop: null, plantedDay: 0, lastWaterDay: 0, grownDays: 0 });
    }
    this.addLog('level', '菜地升级到 ' + this.state.farm.level + ' 级！');
    this.save();
  }

  // ================= 鱼塘 =================
  stockFish(id: number, type: string): void {
    const f = this.state.pond.fish.find(x => x.id === id);
    const c = this.catByCode(type);
    if (!f || !c || f.type) return;
    const price = Math.ceil(c.price / 2);
    if (!this.spendCoins(price)) return;
    f.type = type; f.stockedDay = this.state.gameDays; f.lastFeedDay = this.state.gameDays; f.grownDays = 0;
    this.addLog('feed', '花了 ' + price + ' 金币买了一条' + c.name + '鱼苗');
    this.save();
  }
  feedFish(id: number): void {
    const f = this.state.pond.fish.find(x => x.id === id);
    if (!f || !f.type) return;
    f.lastFeedDay = this.state.gameDays;
    this.save();
  }
  sellFish(id: number): void {
    const f = this.state.pond.fish.find(x => x.id === id);
    if (!f || !f.type) return;
    const c = this.catByCode(f.type);
    if (!c) return;
    this.addCoins(c.sell_price);
    this.state.pet.stats.harvest++;
    this.addExp(c.exp);
    this.addLog('harvest', '捞起一条' + c.name + '，卖了 ' + c.sell_price + ' 金币');
    f.type = null; f.grownDays = 0;
    this.save();
  }
  upgradePond(): void {
    const lv = this.state.pond.level;
    if (lv >= 3) return;
    const cost = POND_UP_COST[lv + 1];
    if (!this.spendCoins(cost)) return;
    this.state.pond.level++;
    while (this.state.pond.fish.length < POND_SLOTS[this.state.pond.level]) {
      this.state.pond.fish.push({ id: this.state.pond.fish.length + 1, type: null, stockedDay: 0, lastFeedDay: 0, grownDays: 0 });
    }
    this.addLog('level', '鱼塘升级到 ' + this.state.pond.level + ' 级！');
    this.save();
  }

  // ================= 牧场 =================
  stockAnimal(id: number, code: string): void {
    const a = this.state.ranch.stalls.find(x => x.id === id);
    const c = this.catByCode(code);
    if (!a || !c || a.type) return;
    const price = Math.ceil(c.price / 2);
    if (!this.spendCoins(price)) return;
    a.type = code; a.stockedDay = this.state.gameDays; a.lastFeedDay = this.state.gameDays; a.grownDays = 0; a.productReady = false; a.lastProductDay = 0;
    this.addLog('feed', '花了 ' + price + ' 金币买了一只' + c.name + '幼崽');
    this.save();
  }
  feedAnimal(id: number): void {
    const a = this.state.ranch.stalls.find(x => x.id === id);
    if (!a || !a.type) return;
    a.lastFeedDay = this.state.gameDays;
    this.save();
  }
  collectProduct(id: number): void {
    const a = this.state.ranch.stalls.find(x => x.id === id);
    if (!a || !a.type || !a.productReady) return;
    const c = this.catByCode(a.type);
    if (!c) return;
    // 立即收起按钮（防止连点重复收）；本地状态等后端成功再提交
    const wasReady = a.productReady;
    a.productReady = false;
    this.save();
    this.worldApi.collectRanchProduct(a.type).subscribe({
      next: () => {
        // 后端已将产物写入统一背包（world_inventory），不再自动卖币
        a.lastProductDay = this.state.gameDays;
        this.state.pet.stats.harvest++;
        this.addExp(c.exp);
        this.addLog('harvest', '收获了' + c.product + '，已存入背包（可在大世界背包中卖出换金币）');
        this.save();
      },
      error: (err) => {
        // 后端失败：回滚，允许重试
        a.productReady = wasReady;
        this.addLog('error', '收' + c.product + '失败：' + (err?.error?.msg || '服务器错误'));
        this.save();
      }
    });
  }
  sellAnimal(id: number): void {
    const a = this.state.ranch.stalls.find(x => x.id === id);
    if (!a || !a.type) return;
    const c = this.catByCode(a.type);
    if (!c) return;
    this.addCoins(c.sell_price);
    this.state.pet.stats.harvest++;
    this.addExp(c.exp);
    this.addLog('harvest', '卖了' + c.name + '，得 ' + c.sell_price + ' 金币');
    a.type = null; a.grownDays = 0; a.productReady = false;
    this.save();
  }
  upgradeRanch(): void {
    const lv = this.state.ranch.level;
    if (lv >= 3) return;
    const cost = RANCH_UP_COST[lv + 1];
    if (!this.spendCoins(cost)) return;
    this.state.ranch.level++;
    while (this.state.ranch.stalls.length < RANCH_SLOTS[this.state.ranch.level]) {
      this.state.ranch.stalls.push({ id: this.state.ranch.stalls.length + 1, type: null, stockedDay: 0, lastFeedDay: 0, grownDays: 0, productReady: false, lastProductDay: 0 });
    }
    this.addLog('level', '牧场升级到 ' + this.state.ranch.level + ' 级！');
    this.save();
  }

  // ================= 宠物 =================
  feed(cropKey: string): void {
    const p = this.state.pet;
    if ((p.foods[cropKey] || 0) <= 0) return;
    const c = this.catByCode(cropKey);
    if (!c) return;
    p.foods[cropKey]--;
    p.satiety = Math.min(100, p.satiety + c.satiety);
    p.mood = Math.min(100, p.mood + 5);
    p.stats.feed++;
    this.addLog('feed', '给 ' + p.name + ' 喂了' + c.name + ' +' + c.satiety + '饱食');
    this.save();
  }
  playWithPet(): void {
    const p = this.state.pet;
    const now = Date.now();
    if (now - p.lastPlayed < 5000) return;
    p.lastPlayed = now;
    p.mood = Math.min(100, p.mood + 20);
    p.stats.play++;
    this.addCoins(3);
    this.addLog('play', '陪 ' + p.name + ' 玩了一会儿，心情 +20');
    this.save();
  }
  watchFarm(): void {
    const p = this.state.pet;
    const now = Date.now();
    if (now - p.lastWatched < 60000) return;
    p.lastWatched = now;
    let watered = 0;
    for (const f of this.state.farm.plots) {
      if (f.crop && f.grownDays < (this.catByCode(f.crop)?.grow_days ?? 0)) { f.lastWaterDay = this.state.gameDays; watered++; }
    }
    p.mood = Math.min(100, p.mood + 10);
    this.addCoins(2);
    this.addLog('watch', p.name + '看护了菜地，浇了 ' + watered + ' 块地');
    this.save();
  }
  buyMedicine(): void {
    const p = this.state.pet;
    if (!p.sick) return;
    if (!this.spendCoins(20)) return;
    p.sick = false;
    this.addLog('feed', '给 ' + p.name + ' 喂了感冒药，病好了！(-20金币)');
    this.save();
  }
  togglePetOut(): void {
    const p = this.state.pet;
    if (p.sick) return;
    if (p.out) {
      p.out = false; this.state.pet.pos = 'home';
      if (p.targetOverride) p.targetOverride = null;
      this.addLog('watch', p.name + '回家休息～');
    } else {
      if (p.energy < 10) return;
      p.out = true; p.outSince = Date.now();
      if (p.sick) p.sick = false;
      if (p.targetOverride) p.targetOverride = null;
      if (this.state.pet.pos === 'home') this.state.pet.pos = Math.random() < 0.5 ? 'farm' : 'pond';
      this.addLog('watch', p.name + '出门玩啦！');
    }
    this.save();
  }

  // ================= 学习（五科目多题型，题库全部来自后端） =================
  studySubjectIdx = 0;                       // 当前科目 Tab
  studySession: StudySession | null = null;  // 学习会话
  /** 远程题库（从 /api/questions 拉取后重组），未加载完为空 */
  remoteSubjects: StudySubject[] = [];
  questionsLoaded = false;

  /** 从后端拉取题库并按 科目→分组 重组（前端不内置任何题目） */
  loadQuestions(education?: string): void {
    const url = education ? `/api/questions?education=${encodeURIComponent(education)}` : '/api/questions';
    this.http.get<{ code: number; msg: string; data: any[] }>(url).subscribe({
      next: res => {
        if (res.code === 0 && Array.isArray(res.data) && res.data.length) {
          this.remoteSubjects = this.rebuildSubjects(res.data);
          this.questionsLoaded = true;
        }
      },
      error: () => { this.questionsLoaded = false; }
    });
  }

  /** 后端 questions 平铺数据 → 科目/分组结构 */
  private rebuildSubjects(qs: any[]): StudySubject[] {
    const subjectMeta: Record<string, { name: string; icon: string }> = {
      english: { name: '英语', icon: 'en' }, math: { name: '数学', icon: 'math' },
      hanzi: { name: '汉字', icon: 'hz' }, chengyu: { name: '成语', icon: 'cy' },
      thinking: { name: '思维', icon: 'th' }, yuwen: { name: '语文', icon: 'hz' }
    };
    const order = ['english', 'math', 'hanzi', 'chengyu', 'thinking', 'yuwen'];
    const subjects: StudySubject[] = [];
    for (const subjId of order) {
      const meta = subjectMeta[subjId];
      if (!meta) continue;
      const subjQs = qs.filter(q => q.subject === subjId);
      if (!subjQs.length) continue;
      const groupMap = new Map<string, { name: string; qType: string; items: any[] }>();
      for (const q of subjQs) {
        const gid = q.groupId || 'default';
        if (!groupMap.has(gid)) {
          groupMap.set(gid, { name: q.groupName || gid, qType: (q.qType || q.qtype) || 'choice', items: [] });
        }
        groupMap.get(gid)!.items.push(this.toStudyItem(q));
      }
      subjects.push({
        id: subjId, name: meta.name, icon: meta.icon,
        groups: Array.from(groupMap.entries()).map(([gid, g]) => ({
          id: gid, name: g.name, qType: (g.qType as any) || 'choice', items: g.items
        }))
      });
    }
    return subjects;
  }

  /** 后端 Question → 前端 StudyItem（choice 的 options 解析 correct） */
  private toStudyItem(q: any): any {
    if ((q.qType || q.qtype) === 'choice' && Array.isArray(q.options)) {
      const opts: string[] = [];
      let ans = q.answer;
      for (const o of q.options) {
        opts.push(String(o.text));
        if (o.correct) ans = String(o.text);
      }
      return { id: q.id, q: q.prompt, opts, a: ans || String(q.answer) };
    }
    return { id: q.id, q: q.prompt, a: String(q.answer) };
  }

  studySubjects(): StudySubject[] { return this.remoteSubjects; }
  studyTodayEarned(): number { this.resetStudyDaily(); return this.state.study.earned; }
  studyGroupDone(gid: string): boolean { return this.state.study.learned.indexOf(gid) >= 0; }
  studySubjectAllDone(subj: StudySubject): boolean { return subj.groups.every(g => this.studyGroupDone(g.id)); }
  resetStudyDaily(): void {
    const today = this.todayKey();
    if (this.state.study.lastDay !== today) { this.state.study.earned = 0; this.state.study.lastDay = today; }
  }
  switchStudySubject(i: number): void { this.studySubjectIdx = i; this.studySession = null; }
  startStudyGroup(subjIdx: number, groupIdx: number): void {
    if (this.studyTodayEarned() >= STUDY_DAILY_LIMIT) return;
    this.studySession = { subjIdx, groupIdx, itemIdx: 0, answered: false, picked: null };
    this.groupWrongCount = 0;
  }
  /** 本组答错题数（完成组时统计用） */
  groupWrongCount = 0;
  /** 最近完成的一组（展示"查看错题"入口） */
  lastGroupDone: { name: string; wrongCount: number } | null = null;
  pickStudyOpt(i: number): void {
    const s = this.studySession;
    if (!s || s.answered) return;
    const it = this.remoteSubjects[s.subjIdx].groups[s.groupIdx].items[s.itemIdx];
    s.answered = true; s.picked = it.opts ? it.opts[i] : null;
    // 答错 → 异步调后端 AI 答疑 + 记错题本
    if (s.picked !== it.a) { this.groupWrongCount++; this.requestExplain(it.id, String(s.picked)); }
  }
  checkStudyFill(v: string): void {
    const s = this.studySession;
    if (!s || s.answered) return;
    const it = this.remoteSubjects[s.subjIdx].groups[s.groupIdx].items[s.itemIdx];
    s.answered = true;
    s.fillOk = (v.trim().replace(/[，。\s]/g, '') === String(it.a).trim());
    // 答错 → AI 答疑
    if (!s.fillOk) { this.groupWrongCount++; this.requestExplain(it.id, v.trim()); }
  }
  revealQa(): void { const s = this.studySession; if (s && !s.answered) s.answered = true; }
  backStudy(): void { this.studySession = null; this.aiResult = null; }

  // ================= AI 答疑（错题） =================
  /** AI 答疑结果（答错后异步回填） */
  aiResult: { explain: string; weak: string; loading: boolean } | null = null;

  /** 调后端 /api/study/explain：AI 解答 + 缺失知识点（记录进错题本） */
  requestExplain(questionId: number | undefined, userAnswer: string): void {
    if (questionId == null) { this.aiResult = { explain: '', weak: '', loading: false }; return; }
    this.aiResult = { explain: '', weak: '', loading: true };
    this.http.post<{ code: number; msg: string; data: any }>('/api/study/explain',
      { questionId, userAnswer }, { headers: this.auth.authHeaders() }).subscribe({
      next: res => {
        if (res.code === 0 && res.data) {
          this.aiResult = { explain: res.data.aiExplain || '', weak: res.data.weakPoints || '', loading: false };
        } else {
          this.aiResult = { explain: '答疑失败：' + (res.msg || '未知错误'), weak: '', loading: false };
        }
      },
      error: () => { this.aiResult = { explain: '无法连接答疑服务，请稍后再试', weak: '', loading: false }; }
    });
  }
  nextStudyItem(): void {
    const s = this.studySession;
    if (!s) return;
    const g = this.remoteSubjects[s.subjIdx].groups[s.groupIdx];
    if (s.itemIdx + 1 < g.items.length) { s.itemIdx++; s.answered = false; s.picked = null; this.aiResult = null; }
    else this.finishStudyGroup();
  }
  finishStudyGroup(): void {
    const s = this.studySession;
    if (!s) return;
    const subj = this.remoteSubjects[s.subjIdx];
    const g = subj.groups[s.groupIdx];
    // 记录本组完成结果（供"查看错题"入口）
    this.lastGroupDone = { name: subj.name + '·' + g.name, wrongCount: this.groupWrongCount };
    if (this.state.study.learned.indexOf(g.id) < 0) this.state.study.learned.push(g.id);
    this.resetStudyDaily();
    if (this.state.study.earned < STUDY_DAILY_LIMIT) {
      const gain = Math.min(10, STUDY_DAILY_LIMIT - this.state.study.earned);
      this.state.study.earned += gain;
      this.addCoins(gain);
      this.state.pet.stats.study++;
      this.addLog('study', '完成了' + subj.name + g.name + '组学习，+' + gain + ' 金币');
    }
    this.studySession = null;
    this.save();
  }

  // ================= 家具 =================
  buyFurniture(id: string): void {
    const c = this.catByCode(id);
    if (!c || c.type !== 'furniture') return;
    if (!this.spendCoins(c.price)) return;
    if (!this.state.house.furniture.includes(id)) this.state.house.furniture.push(id);
    this.addLog('level', '买了' + c.name);
    this.save();
  }
}
