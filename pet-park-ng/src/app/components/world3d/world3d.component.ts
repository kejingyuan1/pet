import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AuthService } from '../../services/auth.service';
import { StateService } from '../../services/state.service';
import { WorldApiService, WorldConfigResp, ChunkResp, WorldObjectResp, MiningProfile, InventoryItem, SellResult, MineResult, HarvestResult } from '../../services/world-api.service';
import { WorldSocketService, ConnState } from '../../services/world-socket.service';
import { WorldPhysicsService } from '../../services/world-physics.service';
import { AssetService } from '../../services/asset.service';
import { ChatService } from '../../services/chat.service';

/**
 * 大世界 3D 组件（M1 → M2：服务端权威物理改造，ADR-W7 候选②）
 *
 * 能力：
 *  - REST 拉取玩家周围 chunk（默认视距半径 2，强机放开 3），Chunk 流式加载/卸载
 *  - 地形网格用顶点色 + 语义着色（water/sand/grass/mountain/tree/rock/ore，无烘焙贴图）
 *  - 移动 = 输入上行（/app/ws.input，无本地物理）→ physics-service 权威模拟 → POSITION_SNAPSHOT
 *    10Hz → WorldPhysicsService 100-200ms 插值缓冲渲染（M2，取代 M1 本地运动学移动）
 *  - 默认第三人称跟随相机；建造/交互模式切 OrbitControls（three 0.128.0）
 *  - WS（STOMP 极简客户端）接收区域广播：他人放置 / 在线状态 / 权威快照
 *
 * 交互：
 *  - WASD 移动（输入上行）；鼠标左键拖拽环绕视角；滚轮缩放
 *  - 「建造」进入建造模式（OrbitControls 俯视选格，点击放置木屋）
 *  - 「养鱼」进入养鱼模式（点击水面放置鱼塘）
 *  - 「跟随」退出建造/养鱼，回到第三人称跟随
 */

const CHUNK = 64;
const N = 65;             // 65×65 顶点

/** 语义着色（01 §4.3 + 矿脉颜色） */
const CELL_COLORS: Record<number, number> = {
  0: 0x2f7fd6, // water（深海）
  1: 0xd2b27a, // sand
  2: 0x6abf4b, // grass
  3: 0x8a8a7a, // mountain
  4: 0x2d6a2f, // tree
  5: 0x9a9a92, // rock
  6: 0x555555, // ore_coal
  7: 0xb0b0b0, // ore_iron
  8: 0xffd700, // ore_gold
  9: 0x6abf4b,  // empty（回落草地色，与后端 EMPTY=9 对齐）
  10: 0x29B6F6 // river（亮河道蓝，区别于海洋青；后端 RIVER=10）
};

interface GridData {
  cx: number;
  cz: number;
  height: Float32Array;
  semantic: Uint8Array;
}

@Component({
  selector: 'app-world3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div #mount class="world3d-mount"></div>
    <div class="w3d-toolbar">
      <button (click)="enterBuild()" [class.on]="buildMode">🏗️ 建造</button>
      <button (click)="enterFish()" [class.on]="fishMode">🐟 养鱼</button>
      <button (click)="enterMine()" [class.on]="mineMode">⛏️ 采矿</button>
      <button (click)="enterRemove()" [class.on]="removeMode">🗑️ 拆除</button>
      <button (click)="enterUpgrade()" [class.on]="upgradeMode">⬆️ 升级</button>
      <button (click)="enterHarvest()" [class.on]="harvestMode">🎣 收获</button>
      <button (click)="enterForage()" [class.on]="forageMode">🌳 采集</button>
      <button (click)="exitInteract()" [class.on]="!buildMode && !fishMode && !mineMode && !removeMode && !upgradeMode && !harvestMode">🎥 跟随</button>
      <button (click)="toggleHelp()" [class.on]="showHelp">❓ 帮助</button>
      <button (click)="toggleCult()" [class.on]="showCult">📖 养成</button>
    </div>
    <div class="w3d-hud">
      <div class="hud-row">金币 {{coins}} · 在线 {{onlineCount}}</div>
      <div class="hud-row">位置 ({{posText}})</div>
      <div class="hud-hint">{{hint}}</div>
      <div class="hud-run" *ngIf="running">🏃 奔跑中</div>
    </div>
    <!-- 采矿 HUD（M4）：能量 / 等级 / 经验 / 背包售卖 -->
    <div class="w3d-mine" *ngIf="miningReady">
      <div class="mine-head">
        <span>⛏️ 采矿 Lv.{{level}}</span>
        <button class="mine-sell-toggle" (click)="toggleSell()">{{sellOpen ? '收起' : '💰 背包'}}</button>
      </div>
      <div class="mine-energy">
        <div class="energy-bar"><div class="energy-fill" [style.width.%]="energyPercent"></div></div>
        <span class="energy-text">⚡ {{energy}}/{{maxEnergy}}</span>
      </div>
      <div class="mine-exp">EXP {{exp}} · 距下级 {{expToNext}}</div>
      <div class="mine-inv" *ngIf="sellOpen">
        <div class="inv-row" *ngFor="let it of inventory">
          <img class="inv-icon" [src]="'assets/icons/'+it.type+'.svg'" [alt]="it.name" />
          <span class="inv-name">{{it.name}} ×{{it.qty}}</span>
          <span class="inv-price">{{it.sellPrice}}/个</span>
          <button class="inv-sell" (click)="sellItem(it)" [disabled]="it.qty <= 0">卖</button>
        </div>
        <div class="inv-empty" *ngIf="inventory.length === 0">背包空空，去采矿吧～</div>
      </div>
    </div>
    <div class="w3d-toast" *ngIf="miningToast">{{miningToast.text}}</div>
    <div class="w3d-help" *ngIf="showHelp" (click)="toggleHelp()">
      <div class="help-card" (click)="$event.stopPropagation()">
        <div class="help-head">操作指南 <button class="help-close" (click)="toggleHelp()">✕</button></div>
        <ul class="help-list">
          <li><b>WASD / 方向键</b>：移动（相对相机方向）</li>
          <li><b>空格</b>：跳跃（可配合方向键跳起向前）</li>
          <li><b>双击 W / A / S / D</b>：进入奔跑（速度更快，松开退出）</li>
          <li><b>Shift</b>：按住也可奔跑</li>
          <li><b>双击地面</b>：自动寻路跑过去（绕过水 / 树 / 岩）</li>
          <li><b>左键拖拽</b>：环绕视角；<b>滚轮</b>：缩放</li>
          <li><b>F</b>：靠近矿脉时开采（或点自动出现的 ⛏️）</li>
          <li><b>G</b>：靠近水边时钓鱼（或点自动出现的 🎣）</li>
          <li><b>H</b>：开关本帮助</li>
          <li>顶栏：🏗️建造 / 🐟养鱼 / ⛏️采矿 / 🗑️拆除 / ⬆️升级 / 🎣收获 / 🌳采集</li>
          <li>手机：左摇杆移动，右下 ⤴️跳 / 🏃跑；靠近矿/水会自动出现 ⛏️/🎣 按钮</li>
        </ul>
      </div>
    </div>

    <!-- 连接状态指示（P0-3） -->
    <div class="hud-conn conn-{{connState}}">
      <span class="conn-dot"></span><span>{{connLabel}}</span>
    </div>

    <!-- P1-昼夜：连接状态下方显示游戏内时间 + 阶段图标 -->
    <div class="hud-time" *ngIf="worldTime">
      <span class="time-icon">{{phaseIcon}}</span>
      <span class="time-text">{{timeLabel}}</span>
      <span class="time-phase">{{worldTime.phase}}</span>
    </div>

    <!-- P1-小地图：右上角（左键走过去/右键查看位置） -->
    <canvas #minimap class="minimap" width="160" height="160"
      (pointerdown)="onMinimapClick($event)"
      (contextmenu)="$event.preventDefault()"></canvas>

    <!-- 触屏控制层（P0-1）：仅触屏设备显示 -->
    <div class="touch-layer" *ngIf="touchActive">
      <div class="joystick" (pointerdown)="onJoyStart($event)" (pointermove)="onJoyMove($event)" (pointerup)="onJoyEnd($event)" (pointercancel)="onJoyEnd($event)">
        <div class="joy-knob" [style.transform]="'translate(' + joyKnob.x + 'px,' + joyKnob.y + 'px)'"></div>
      </div>
      <div class="touch-btns">
        <button class="tbtn tbtn-run" [class.on]="running" (pointerdown)="onTouchRun()">🏃</button>
        <button class="tbtn tbtn-jump" (pointerdown)="onTouchJump()"></button>
      </div>
    </div>

    <!-- P1-引导：上下文动作提示（靠近矿/水自动出现，桌面/触屏通用） -->
    <div class="ctx-actions" *ngIf="nearestOre || (nearWater && !fishMode)">
      <button class="cbtn cbtn-mine" *ngIf="nearestOre" (pointerdown)="onCtxMine()">⛏️ 挖矿</button>
      <button class="cbtn cbtn-fish" *ngIf="nearWater && !fishMode" (pointerdown)="onCtxFish()">🎣 钓鱼</button>
    </div>

    <!-- P1-新手引导：首次进入分步教学卡片 -->
    <div class="onboard" *ngIf="showOnboarding">
      <div class="onboard-card">
        <div class="onboard-step">第 {{onboardingStep + 1}} / {{onboardingSteps.length}} 步</div>
        <div class="onboard-title">{{onboardingSteps[onboardingStep].title}}</div>
        <div class="onboard-desc">{{onboardingSteps[onboardingStep].desc}}</div>
        <div class="onboard-actions">
          <button class="onboard-skip" (pointerdown)="finishOnboarding()">跳过</button>
          <button class="onboard-next" (pointerdown)="nextOnboarding()">{{onboardingStep === onboardingSteps.length - 1 ? '完成' : '下一步'}}</button>
        </div>
      </div>
    </div>

    <!-- P1-养成：图鉴 + 收益曲线 + 解锁里程碑 -->
    <div class="cult" *ngIf="showCult">
      <div class="cult-card">
        <div class="cult-head">
          <span>📖 养成图鉴</span>
          <button class="cult-close" (pointerdown)="toggleCult()">✕</button>
        </div>
        <div class="cult-prog">
          <div class="cult-lv">Lv.{{cultivation?.level || 1}}</div>
          <div class="cult-expwrap">
            <div class="cult-expbar"><div class="cult-expfill" [style.width.%]="cultExpPercent"></div></div>
            <div class="cult-exptext">EXP {{cultivation?.exp || 0}} / 距下级 {{cultivation?.expToNext || 100}}</div>
          </div>
          <div class="cult-meta">⚡{{cultivation?.energy || 0}}/{{cultivation?.maxEnergy || 100}} · 💰{{cultivation?.coins || 0}}</div>
        </div>
        <div class="cult-section">🐟 鱼类图鉴 ({{codex?.fishDiscovered || 0}}/{{codex?.fishTotal || 0}})</div>
        <div class="codex-grid">
          <div class="codex-cell" *ngFor="let f of codex?.fish" [class.found]="f.discovered">
            <div class="codex-ico">{{f.discovered ? '🐟' : '❔'}}</div>
            <div class="codex-name">{{f.discovered ? f.name : '？？？'}}</div>
          </div>
        </div>
        <div class="cult-section">⛏️ 矿石图鉴 ({{codex?.oreDiscovered || 0}}/{{codex?.oreTotal || 0}})</div>
        <div class="codex-grid">
          <div class="codex-cell" *ngFor="let o of codex?.ore" [class.found]="o.discovered">
            <div class="codex-ico">{{o.discovered ? '💎' : '❔'}}</div>
            <div class="codex-name">{{o.discovered ? o.name : '？？？'}}</div>
          </div>
        </div>
        <div class="cult-section">🔓 解锁里程碑</div>
        <div class="unlock-list">
          <div class="unlock-row" *ngFor="let u of cultivation?.unlocks" [class.on]="u.unlocked">
            <span class="unlock-lv">Lv.{{u.level}}</span>
            <span class="unlock-name">{{u.name}}</span>
            <span class="unlock-state">{{u.unlocked ? '✅' : '🔒'}}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* 世界画布：absolute 填满 scene3d-wrap，不依赖 flex 百分比链 */
    .world3d-mount { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 16px; overflow: hidden; background: linear-gradient(160deg,#7EC8E8,#A0D8EF); }
    @media (max-width: 768px) {
      .world3d-mount { border-radius: 14px; }
    }
    /* 工具栏：自动换行，小屏紧凑 */
    .w3d-toolbar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px; }
    .w3d-toolbar button { padding: 5px 11px; border: none; border-radius: 10px; background: rgba(255,255,255,.90); color: #444; font-size: 13px; cursor: pointer; box-shadow: 0 1px 5px rgba(0,0,0,.14); transition: background .15s, transform .1s; }
    .w3d-toolbar button:hover { background: rgba(255,255,255,.98); }
    .w3d-toolbar button.on { background: rgba(80,160,220,.88); color: #fff; box-shadow: 0 1px 8px rgba(80,160,220,.35); }
    .w3d-hud { position: absolute; left: 10px; bottom: 54px; z-index: 5; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.55); font-size: 12px; line-height: 1.55; pointer-events: none; }
    @media (max-width: 768px) {
      .w3d-hud { bottom: auto; top: 52px; left: 8px; right: 8px; font-size: 11px; }
    }
    .hud-hint { opacity: .82; max-width: 360px; }

    /* 背包面板：桌面加大，移动端全宽 */
    .w3d-mine { position: absolute; top: 170px; right: 10px; z-index: 6; width: 300px; max-width: 48vw; max-height: 60vh; overflow-y: auto; background: rgba(18,26,40,.90); border-radius: 14px; color: #eee; font-size: 13px; padding: 10px 12px; box-shadow: 0 6px 24px rgba(0,0,0,.32); backdrop-filter: blur(6px); }
    @media (max-width: 768px) {
      .w3d-mine { top: auto; bottom: 80px; left: 8px; right: 8px; width: auto; max-width: none; max-height: 35vh; }
    }
    .mine-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
    .mine-sell-toggle { border: none; border-radius: 8px; padding: 4px 10px; background: rgba(80,160,220,.82); color: #fff; cursor: pointer; font-size: 12px; transition: background .15s; }
    .mine-sell-toggle:active { background: rgba(60,140,200,.92); }
    .mine-energy { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .energy-bar { flex: 1; height: 11px; background: rgba(255,255,255,.12); border-radius: 6px; overflow: hidden; }
    .energy-fill { height: 100%; background: linear-gradient(90deg,#7DD3FC,#38BDF8); transition: width .25s ease; border-radius: 6px; }
    .energy-text { white-space: nowrap; font-size: 12px; }
    .mine-exp { opacity: .82; margin-bottom: 8px; font-size: 12px; }
    .mine-inv { display: flex; flex-direction: column; gap: 5px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 8px; max-height: none; }
    @media (min-width: 769px) { .mine-inv { max-height: 320px; overflow-y: auto; } }
    .inv-row { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 8px; background: rgba(255,255,255,.04); transition: background .12s; }
    .inv-row:hover { background: rgba(255,255,255,.08); }
    .inv-icon { width: 28px; height: 28px; flex-shrink: 0; image-rendering: pixelated; border-radius: 6px; background: rgba(255,255,255,.08); padding: 3px; box-sizing: content-box; }
    .inv-name { flex: 1; font-size: 13px; }
    .inv-price { opacity: .65; font-size: 12px; }
    .inv-sell { border: none; border-radius: 8px; padding: 3px 10px; background: rgba(76,201,240,.78); color: #063642; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s; }
    .inv-sell:hover { background: #4CC9F0; }
    .inv-sell:disabled { opacity: .35; cursor: not-allowed; }
    .inv-empty { opacity: .5; font-style: italic; padding: 4px 0; }
    .w3d-toast { position: absolute; top: 42%; left: 50%; transform: translate(-50%,-50%); z-index: 9; background: rgba(0,0,0,.72); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 15px; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
    .hud-run { display: inline-block; margin-top: 4px; padding: 2px 10px; background: rgba(70,130,180,.82); color: #fff; border-radius: 10px; font-weight: 600; font-size: 12px; text-shadow: none; }
    .w3d-help { position: absolute; inset: 0; z-index: 20; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; }
    .help-card { width: min(420px, 86vw); background: #fff; color: #2a2a2a; border-radius: 14px; padding: 16px 18px; box-shadow: 0 10px 40px rgba(0,0,0,.4); font-size: 14px; }
    .help-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 16px; margin-bottom: 10px; }
    .help-close { border: none; background: #eee; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-size: 14px; }
    .help-close:active { background: #ddd; }
    .help-list { margin: 0; padding-left: 18px; line-height: 1.9; }

    /* P1-新手引导：分步教学卡片（底部居中，不挡操作） */
    .onboard { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 15; width: min(420px, 88vw); pointer-events: auto; }
    .onboard-card { background: rgba(255,255,255,.96); color: #2a2a2a; border-radius: 14px; padding: 14px 16px; box-shadow: 0 8px 30px rgba(0,0,0,.4); font-size: 14px; }
    .onboard-step { font-size: 12px; color: #38BDF8; font-weight: 700; margin-bottom: 4px; }
    .onboard-title { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
    .onboard-desc { line-height: 1.7; opacity: .9; margin-bottom: 12px; }
    .onboard-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .onboard-skip { border: none; background: #eee; color: #666; border-radius: 10px; padding: 7px 16px; cursor: pointer; font-size: 13px; }
    .onboard-skip:active { background: #ddd; }
    .onboard-next { border: none; background: rgba(70,140,200,.88); color: #fff; border-radius: 10px; padding: 7px 18px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .15s; }
    .onboard-next:active { background: rgba(55,120,180,.95); }

    /* P1-养成：图鉴 + 养成面板（左下，可滚动） */
    .cult { position: absolute; left: 12px; bottom: 12px; z-index: 14; width: min(340px, 92vw); max-height: 70vh; overflow-y: auto; pointer-events: auto; }
    .cult-card { background: rgba(255,255,255,.97); color: #2a2a2a; border-radius: 14px; padding: 12px 14px; box-shadow: 0 8px 30px rgba(0,0,0,.4); font-size: 13px; }
    .cult-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 15px; margin-bottom: 8px; }
    .cult-close { border: none; background: #eee; border-radius: 8px; width: 26px; height: 26px; cursor: pointer; font-size: 13px; }
    .cult-close:active { background: #ddd; }
    .cult-prog { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .cult-lv { font-weight: 800; font-size: 16px; color: #38BDF8; }
    .cult-expwrap { flex: 1; min-width: 120px; }
    .cult-expbar { height: 9px; background: rgba(0,0,0,.1); border-radius: 6px; overflow: hidden; }
    .cult-expfill { height: 100%; background: linear-gradient(90deg,#7DD3FC,#38BDF8); transition: width .3s ease; }
    .cult-exptext { font-size: 11px; opacity: .75; margin-top: 2px; }
    .cult-meta { width: 100%; font-size: 12px; opacity: .85; }
    .cult-section { font-weight: 700; margin: 10px 0 6px; font-size: 13px; }
    .codex-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .codex-cell { background: rgba(0,0,0,.05); border-radius: 10px; padding: 6px 4px; text-align: center; }
    .codex-cell.found { background: linear-gradient(160deg,#E0F4FF,#C8F0FA); box-shadow: inset 0 0 0 1px rgba(56,189,248,.35); }
    .codex-ico { font-size: 20px; }
    .codex-name { font-size: 11px; margin-top: 2px; opacity: .9; }
    .unlock-list { display: flex; flex-direction: column; gap: 4px; }
    .unlock-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 8px; background: rgba(0,0,0,.04); opacity: .55; }
    .unlock-row.on { opacity: 1; background: linear-gradient(90deg,#E8F8EE,#C8F0D8); }
    .unlock-lv { font-weight: 700; color: #38BDF8; min-width: 44px; }
    .unlock-name { flex: 1; }
    .unlock-state { font-size: 13px; }
    .help-list li { margin: 2px 0; }
    .help-list b { color: #d2691e; }

    /* P0-3：连接状态指示 */
    .hud-conn { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 7; display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; background: rgba(0,0,0,.42); pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
    .conn-dot { width: 8px; height: 8px; border-radius: 50%; background: #aaa; box-shadow: 0 0 6px rgba(0,0,0,.3); }
    .hud-conn.conn-connected { background: rgba(40,150,80,.85); }
    .hud-conn.conn-connected .conn-dot { background: #6cff9e; }
    .hud-conn.conn-connecting, .hud-conn.conn-reconnecting { background: rgba(200,140,30,.9); }
    .hud-conn.conn-connecting .conn-dot, .hud-conn.conn-reconnecting .conn-dot { background: #ffd27f; animation: connPulse 1s infinite; }
    .hud-conn.conn-disconnected { background: rgba(190,50,50,.9); }
    .hud-conn.conn-disconnected .conn-dot { background: #ff8c8c; }
    @keyframes connPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

    /* P1-昼夜：连接状态下方游戏内时钟 */
    .hud-time { position: absolute; top: 44px; left: 50%; transform: translateX(-50%); z-index: 7; display: flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; background: rgba(0,0,0,.36); pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
    .hud-time .time-icon { font-size: 14px; }
    .hud-time .time-phase { opacity: .82; font-weight: 500; }

    /* P0-1：触屏控制层（虚拟摇杆 + 按钮） */
    .touch-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }

    /* P1-小地图：右上角 HUD */
    .minimap { position: absolute; top: 12px; right: 12px; z-index: 6; width: 160px; height: 160px; border-radius: 10px; border: 2px solid rgba(255,255,255,.4); background: rgba(10,20,30,.5); box-shadow: 0 3px 12px rgba(0,0,0,.35); pointer-events: auto; cursor: pointer; }
    .minimap:hover { border-color: rgba(255,255,255,.85); }
    .joystick { position: absolute; left: 22px; bottom: 26px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.4); pointer-events: auto; touch-action: none; }
    .joy-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(255,255,255,.8); box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    /* 触屏按钮：低调半透明，不抢戏 */
    .touch-btns { position: absolute; right: 18px; bottom: 28px; display: flex; gap: 12px; align-items: flex-end; }
    @media (max-width: 768px) {
      .joystick { left: 14px; bottom: 14px; width: 100px; height: 100px; }
      .joy-knob { width: 44px; height: 44px; margin: -22px 0 0 -22px; }
      .touch-btns { right: 10px; bottom: 14px; gap: 8px; }
    }
    .tbtn { width: 58px; height: 58px; border-radius: 50%; border: 2px solid rgba(255,255,255,.4); background: rgba(40,55,75,.60); color: #fff; font-size: 24px; pointer-events: auto; touch-action: none; box-shadow: 0 2px 8px rgba(0,0,0,.22); transition: transform .1s, background .15s; backdrop-filter: blur(2px); }
    .tbtn:active { transform: scale(.92); }
    .tbtn-run { background: rgba(70,130,180,.65); }
    .tbtn-run.on { background: rgba(70,130,180,.85); box-shadow: 0 0 0 3px rgba(120,180,230,.45); }
    .tbtn-jump { background: rgba(60,90,70,.60); }
    /* 起跳小人象形图（圆头+躯干+双臂上举+双腿张开跳姿+地面虚线），一眼看懂是"跳" */
    .tbtn-jump::before {
      content: '';
      display: block;
      width: 30px;
      height: 30px;
      margin: 0 auto;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'%3E%3Ccircle cx='20' cy='9' r='4'/%3E%3Cpath d='M20 13V24'/%3E%3Cpath d='M20 16L12 8'/%3E%3Cpath d='M20 16L28 8'/%3E%3Cpath d='M20 24L13 33'/%3E%3Cpath d='M20 24L27 33'/%3E%3Cpath d='M6 37H34' stroke-dasharray='3 3' opacity='.5'/%3E%3C/svg%3E");
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }

    /* 上下文动作按钮：低调玻璃态，不突兀 */
    .ctx-actions { position: absolute; right: 18px; bottom: 100px; z-index: 9; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    .cbtn { width: 66px; height: 66px; border-radius: 16px; border: 2px solid rgba(255,255,255,.45); color: #fff; font-size: 13px; font-weight: 600; pointer-events: auto; touch-action: none; box-shadow: 0 3px 12px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: transform .1s; }
    .cbtn:active { transform: scale(.92); }
    .cbtn-mine { background: rgba(100,90,70,.72); }
    .cbtn-fish { background: rgba(50,120,150,.72); }
  `]
})
export class World3dComponent implements OnInit, OnDestroy {
  @ViewChild('mount') mountRef!: ElementRef;
  @ViewChild('minimap') minimapRef!: ElementRef;
  private lastMinimap = 0;

  buildMode = false;
  fishMode = false;
  // 拆除 / 升级 / 收获（P0 / P2 / P1 审计缺口的前端交互入口）
  removeMode = false;
  upgradeMode = false;
  harvestMode = false;
  forageMode = false;
  hint = 'WASD 移动 · 空格跳跃 · 双击 W/A/S/D 奔跑 · 双击地面跑过去 · 左键拖拽转视角 · H 键帮助';
  posText = '';
  coins = 0;
  onlineCount = 1;

  // 采矿（M4）
  mineMode = false;          // 采矿模式（OrbitControls 选矿）
  miningReady = false;       // 档案已拉取，HUD 可见
  sellOpen = false;          // 背包/售卖面板展开
  energy = 0;                // 当前能量
  maxEnergy = 100;           // 能量上限
  level = 1;                 // 世界等级
  exp = 0;                   // 累积经验
  expToNext = 100;           // 距下级经验
  inventory: InventoryItem[] = []; // 背包
  miningToast: { text: string; ts: number } | null = null; // 采矿/售卖提示
  nearestOre: { gx: number; gz: number } | null = null; // 最近可采矿（F 键 / 上下文按钮用）
  /** 最近水域（钓鱼用） */
  nearestWater: { gx: number; gz: number } | null = null;
  /** 是否临水（显示钓鱼按钮） */
  nearWater = false;
  /** 能量百分比（模板条形用） */
  get energyPercent(): number { return this.maxEnergy > 0 ? Math.round((this.energy / this.maxEnergy) * 100) : 0; }

  // 聊天（M3）——已移至 app 层级，此处仅通过 ChatService 推送

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private _resizeObserver: ResizeObserver | null = null;

  // 昼夜系统（P1 支柱①）：灯光引用 + 相位状态
  private sunLight!: THREE.DirectionalLight;
  private fillLightRef!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  /** 当前昼夜相位（DAY_NIGHT 帧写入），模板 HUD 绑定 */
  worldTime: { frac: number; hour: number; minute: number; elevation: number; isNight: boolean; phase: string } | null = null;
  private dayNightBlend = 1;   // 当前天空混合系数 0(夜)..1(昼)，animate 中向 target 插值
  private targetBlend = 1;     // 目标混合系数
  private skyDay = new THREE.Color(0x7EC8E8);
  private skyNight = new THREE.Color(0x0B1026);
  private fogDay = new THREE.Color(0xA0C8D8);
  private fogNight = new THREE.Color(0x3D5068);  // 夜霧大幅提亮（保证夜间地形可辨识）
  /** HUD 时间文案（模板绑定，避免每秒重算） */
  timeLabel = '--:--';
  phaseIcon = '☀️';

  private config?: WorldConfigResp;
  private viewRadius = 2;
  private uid = 0;
  /** 暴露给模板：判断聊天消息是否为自己发送 */
  get selfUid(): number { return this.uid; }
  private nickname = '';

  // 世界数据
  private gridCache = new Map<string, GridData>();
  private chunkMeshes = new Map<string, THREE.Mesh>();
  private _lastWaterPushTs = 0;           // 水域推回冷却锁（防止每帧与服务端快照打架导致抖动）
  private inFlight = new Set<string>();
  private objectMeshes = new Map<number, THREE.Object3D>();
  private worldObjects = new Map<number, WorldObjectResp>();
  private remotePlayers = new Map<number, THREE.Group>();
  /** 每 chunk 的树模型组（TREE 语义 → 3D 树），卸载时清理 */
  private treeMeshes = new Map<string, THREE.Group[]>();
  /** 每 chunk 的矿石模型组（ORE_* 语义 → 3D 矿石），卸载时清理 */
  private oreMeshes = new Map<string, THREE.Group[]>();

  // M5 角色/树 GLB 模型模板（HY3D 生成，低模几百 KB，归一化到统一高度后复用）
  private treeModel: THREE.Group | null = null;
  private boyModel: THREE.Group | null = null;
  private girlModel: THREE.Group | null = null;
  /** HY3D 7 只动物模板（cat/dog/chicken/duck/cow/sheep/fish），归一化后缓存复用 */
  private animalModels: Record<string, THREE.Group> = {};
  /** HY3D 矿产模板（小/中/大三种规格，draco 压缩） */
  private oreModel: THREE.Group | null = null;
  /** 野生生物容器：一次性散布后常驻世界，不随 chunk 卸载 */
  private wildlifeGroup: THREE.Group | null = null;
  private animalsSpawned = false;
  private decorPlaced = false; // 男孩/女孩是否已放置（仅放一次）

  // ====== 天空装饰（星星 + 云朵） ======
  private starField!: THREE.Points;          // 夜晚星空粒子
  private starMaterial!: THREE.ShaderMaterial; // 星星材质（透明度随昼夜变化）
  private cloudGroup!: THREE.Group;           // 云朵容器

  // （已移除旧 waterPlane — 大平面穿透地形导致蓝色三角碎片）
  // 新版水面：自定义 ShaderMaterial 着色器水面（Gerstner 波浪 + 颜色渐变 + 泡沫 + 高光）
  private waterPlane!: THREE.Mesh;
  private waterUniforms!: { [key: string]: THREE.IUniform };
  private static readonly STAR_COUNT = 1800;   // 星星数量
  private static readonly CLOUD_COUNT = 12;    // 云朵数量

  // 🔴 水域调试钩子：记录所有已放置对象的世界坐标，供 playwright 断言"无对象在水中"
  private treeList: { x: number; z: number }[] = [];
  private charList: { x: number; y: number; z: number }[] = [];

  // HY3D 地图地形：实例化的岛屿视觉层（覆盖程序化块状岛屿，保留网格做物理）
  private hy3dTerrainGroup: THREE.Group | null = null;
  private islandCenters: { cx: number; cz: number; r: number }[] = [];
  // 🔴🔴 HY3D 岛屿 LOD：模板缓存 + 已实例化索引集合（性能优化，只加载100m内）
  private _hy3dTemplates: THREE.Group[] = [];           // 4 个变体模板
  private _hy3dMeta: { radius: number; baseY: number; height: number }[] = [];
  private _hy3dLoaded = false;                           // 模板是否已加载完
  private _activeIslands = new Set<number>();            // 当前已实例化的岛屿索引
  private readonly ISLAND_LOD_RADIUS = 100;              // 加载半径（米）
  private readonly ISLAND_UNLOAD_BUFFER = 130;           // 卸载缓冲区（避免频繁增删）
  private animalList: { x: number; y: number; z: number }[] = [];
  private oreList: { x: number; y: number; z: number; type: string }[] = []; // 🔴 矿石坐标跟踪（用于调试+水域校验）
  private _dbgTick = 0;

  // M5 角色程序化动作：模型无骨骼，用整体变换模拟 走/跑/弯腰/待机
  private charAnims: { group: THREE.Group; cx: number; cz: number; baseY: number; phase: number; radius: number; bones?: Record<string, THREE.Object3D> }[] = [];
  private animClock = 0;
  private lastTs = 0;
  private animStateIdx = 0;
  private animStateTimer = 0;
  // 演示用状态循环（实际游戏可替换为真实移动状态：idle/walk/run/bend）
  private static readonly ANIM_STATES = ['walk', 'run', 'bend', 'idle'] as const;
  private static readonly ANIM_STATE_DUR = [3.2, 3.2, 3.0, 2.2]; // 各状态持续秒数

  // 玩家
  private px = 0; private pz = 0; private py = 0; private prot = 0;
  // 平滑显示位置（lerp 跟随物理权威位置，消除一跳一跳）
  private dpx = 0; private dpz = 0; private dpy = 0; private dprot = 0;

  // 🔴🔴 跳跃防护（2026-08-16 修复连按空格飞天）
  private _lastJumpTs = 0;                          // 上次跳跃时间戳
  private _lastYLogTs = 0;                           // 上次 Y-DEBUG 日志时间戳
  private static readonly JUMP_COOLDOWN_MS = 800;   // 跳跃冷却（ms），防止连按叠加
  private static readonly MAX_ABOVE_GROUND = 2.5;   // 允许离地最大高度（正常跳最高2m，超过则强制压回）
  // 🔴🔴🔴 跳跃本地抛物线参数（2026-08-16）：与服务端 WorldPhysicsService 完全一致
  //   JUMP_VEL=8.5 / GRAVITY=25 → 滞空 0.68s、最高 1.44m，落地零突跳（丝滑）
  private static readonly JUMP_VEL = 8.5;
  private static readonly JUMP_GRAVITY = 25.0;
  // 障碍网格（静态：树/矿/建筑）chunkKey -> set("gx,gz")，与 gridCache 同生命周期
  private obstacleGrid: Map<string, Set<string>> = new Map();
  // 导航卡住检测 / 重寻路
  private navGoal: { x: number; z: number } | null = null; // 双击最终目标（世界坐标）
  private stuckTimer = 0;        // 连续停滞秒数
  private lastStuckX = 0; private lastStuckZ = 0;
  private navRetries = 0;        // 重寻路次数（上限防抖）
  private lastNavNow = 0;
  private static readonly SMOOTH_FACTOR = 0.18; // 每帧追赶比例（60fps下约80ms延迟）
  private playerMesh!: THREE.Group;
  private keys: Record<string, boolean> = {};
  // 双击移动目标（世界坐标），null 表示无目标
  private moveTarget: { x: number; z: number } | null = null;
  private miniTarget: { x: number; z: number } | null = null;  // 小地图点击的目标点（绘制红圈标记）
  private viewTarget: { x: number; y: number; z: number } | null = null; // 小地图右键查看目标（相机飞过去）
  // P2 双击 A* 寻路：路点队列（世界坐标），依次抵达后清空
  private pathPoints: { x: number; z: number }[] = [];

  // 奔跑状态：双击方向键(WW/AA/SS/DD)或按住 Shift 触发；静止超过 0.4s 自动退出
  running = false;
  private runKey: string | null = null;
  private runIdleSince = 0;
  private lastTapCode = '';
  private lastTapTime = 0;
  // 操作帮助面板（按 H 或点「❓ 帮助」开关）
  showHelp = false;

  // 新手引导（P1 支柱②）：首次进入分步教学
  showOnboarding = false;
  onboardingStep = 0;

  // 养成循环（P1 支柱③）：图鉴 + 养成汇总面板
  showCult = false;
  cultivation: any = null;
  codex: any = null;
  /** 等级内经验进度百分比（exp % 100） */
  get cultExpPercent(): number {
    if (!this.cultivation) return 0;
    const e = this.cultivation.exp || 0;
    return Math.round(e % 100);
  }
  onboardingSteps: { title: string; desc: string }[] = [
    { title: '欢迎来到宠物乐园大世界', desc: '用左下角摇杆或键盘 WASD / 方向键移动，探索这片土地吧。' },
    { title: '采矿', desc: '走到发光的矿石旁，点击 ⛏️挖矿 按钮或按 F 键采集资源。' },
    { title: '钓鱼', desc: '走到水边，点击 🎣钓鱼 按钮或按 G 键，享受悠闲垂钓。' },
    { title: '建造农场', desc: '点击左上工具栏「建造」放置小屋与装饰，打造专属农场。' },
    { title: '开始你的冒险', desc: '随时按 H 查看完整操作帮助。祝你玩得开心！' }
  ];

  // 连接状态（P0-3）：订阅 WS service 的 connectionState$
  connState: ConnState = 'disconnected';
  private wsStateSub: { unsubscribe(): void } | null = null;
  // 触屏控制（P0-1）：虚拟摇杆 + 跳跃/奔跑按钮
  touchActive = false;
  private touchVec = { x: 0, y: 0 };   // 归一化摇杆方向：x=右(+ix) / y=前(+iz)
  private joystickId: number | null = null;
  private joyBase = { x: 0, y: 0 };
  joyKnob = { x: 0, y: 0 };            // 供模板绑定旋钮位移
  /** 连接状态文案（模板用） */
  get connLabel(): string {
    switch (this.connState) {
      case 'connected': return '已连接';
      case 'connecting': return '连接中…';
      case 'reconnecting': return '重连中…';
      default: return '已断开';
    }
  }

  // 相机
  private follow = { yaw: 0.5, pitch: 0.55, dist: 22 }; // 聚焦岛屿：近距离+适中俯角，看清陆地细节
  private dragging = false;
  private lastX = 0; private lastY = 0;
  private downX = 0; private downY = 0;

  private rafId = 0;
  private disposed = false;
  private lastPosSend = 0;
  private lastStream = 0;
  private lastInputSend = 0;
  private inputSentKeyState = '';

  constructor(
    private api: WorldApiService,
    private ws: WorldSocketService,
    private physics: WorldPhysicsService,
    private auth: AuthService,
    private state: StateService,
    private assets: AssetService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.uid = this.auth.user?.userId ?? 0;
    this.nickname = this.auth.user?.nickname || '我';
    // 调试钩子：首次带 ?debug=1 时启用，并写入 sessionStorage 以便在 SPA 路由/重登后依然生效（不影响正常游戏）
    if ((typeof location !== 'undefined') && new URLSearchParams(location.search).has('debug')) {
      (window as any).__charAnimDebugEnabled = true;
      try { sessionStorage.setItem('__charAnimDebug', '1'); } catch {}
    }
    this.coins = this.state.state.coins ?? 0;
    // 视距：保证能看到足够多的岛屿（22岛分布在±1300范围）
    // 强机放宽到5，窄屏至少4（原值2/3只能看到1-2座岛）
    const baseVR = window.innerWidth >= 1280 ? 5 : 4;
    this.viewRadius = baseVR;

    // P0-1：探测触屏设备（手机/平板），启用虚拟摇杆与触控按钮；?touch=1 可强制开启以便调试
    this.touchActive = (typeof window !== 'undefined') &&
      (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0) ||
      (typeof location !== 'undefined' && new URLSearchParams(location.search).has('touch'));

    this.api.config().subscribe({
      next: cfg => {
        if (this.disposed) return;
        // M2 修复（2026-08-12）：总是清空 chunk 缓存（首次 config 时 this.config=undefined 也清，防首次 gridCache 旧数据）
        this.gridCache.clear();
        this.config = cfg;
        this.viewRadius = Math.max(cfg.viewRadius || 0, this.viewRadius); // 前端保底，不被后端小值覆盖
        this.px = cfg.spawnGx;
        this.pz = cfg.spawnGz;
        this.py = cfg.spawnY;
        // 平滑位置同步初始化（避免首次 lerp 从 0,0,0 追赶的大跳）
        this.dpx = this.px; this.dpz = this.pz; this.dpy = this.py; this.dprot = 0;
        // 🔴 启动水域安全：3秒后等 chunk 加载完毕，若仍在水里则强制传送到陆地
        setTimeout(() => this.forceWaterSafety(), 3000);
        this.initScene();
        this.initPlayer();
        this.connectWs();
        this.loadMiningProfile();
        this.preloadModels();   // M5：加载男孩/女孩/树 GLB 模板
        this.loadHy3dTerrain(); // HY3D 岛屿视觉层（覆盖程序化块状岛屿）
        this.animate();
      },
      error: () => { this.hint = '世界配置加载失败：请确认后端已启动'; }
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this.wsStateSub?.unsubscribe();
    this.wsStateSub = null;
    this.ws.disconnect();
    // 清理天空装饰
    if (this.starField) { this.scene?.remove(this.starField); this.starField.geometry.dispose(); this.starMaterial.dispose(); }
    if (this.cloudGroup) { this.scene?.remove(this.cloudGroup); }
    // 清理水面
    if (this.waterPlane) { this.scene?.remove(this.waterPlane); this.waterPlane.geometry.dispose(); (this.waterPlane.material as THREE.Material).dispose(); }
    // 清理 HY3D 地形岛屿层
    if (this.hy3dTerrainGroup) {
      this.scene?.remove(this.hy3dTerrainGroup);
      this.hy3dTerrainGroup.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !o.userData?.['shared']) {
          // 几何/材质由模板共享，traverse 仅移除引用；模板清理交由 asset.service 缓存管理
        }
      });
      this.hy3dTerrainGroup = null;
    }
    // （waterPlane 已移除）
    this.renderer?.dispose();
    this.scene?.traverse(o => {
      if (o.userData?.['shared']) return; // 共享 GLB 模板实例，几何复用不释放
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      if (mat) mat.dispose();
    });
  }

  // ================= 场景初始化 =================

  private initScene(): void {
    const mount = this.mountRef.nativeElement as HTMLElement;
    const W = mount.clientWidth || 900;
    const H = mount.clientHeight || 520;

    this.scene = new THREE.Scene();
    
    // 天空渐变：晴朗白昼天顶蓝 → 地平线淡青（M4 视觉增强）
    this.scene.background = new THREE.Color(0x87CEEB);
    // 雾效：推远近裁面，暖化雾色，增加密度隐藏远处水天交界线（消除"无限蓝"感）
    this.scene.fog = new THREE.Fog(0xB8D4E8, 520, 1200);   // 拉远雾起點(520)與終點(1200)，減少近距霧化吞地形

    // 🔴 水面：半透明波浪平面（createWaterPlane），chunk 网格已不渲染水三角
    const waterLevel = this.config?.waterLevel ?? -5;

    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1500);
    // 相机初始位置：高俯视（群岛世界需要更陡的视角才能看到岛屿全貌，避免"全在水上"感）
    // 相机初始位置：降低高度+拉近距离，聚焦岛屿陆地（避免"全看海洋"）
    this.camera.position.set(this.px, this.py + 18, this.pz + 16);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H, false); // CSS 由后续 100% 覆盖控制
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ACES 色调映射：增强对比度与色彩饱和度，解决"白茫茫"问题
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);

    // M6 响应式画布：canvas CSS 100% 填充 + ResizeObserver 追踪容器尺寸变化
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this._resizeObserver = new ResizeObserver(() => this.onResize());
    this._resizeObserver.observe(mount);
    // 延迟强制一次 resize（等 Angular 布局稳定后修正初始尺寸）
    setTimeout(() => this.onResize(), 400);

    // 灯光（M5 地图视觉优化：降低总光量避免过曝 + ACES 色调映射）
    const sun = new THREE.DirectionalLight(0xFFF4E0, 1.0); // 暖白日光（降低强度）
    sun.position.set(100, 150, 80);
    this.scene.add(sun);
    this.sunLight = sun;
    // 补光（填充阴影区，降低强度）
    const fillLight = new THREE.DirectionalLight(0xB8D4E8, 0.2);
    fillLight.position.set(-60, 40, -50);
    this.scene.add(fillLight);
    this.fillLightRef = fillLight;
    // 半球光：天蓝色 + 地面绿色（降低环境光量，让顶点色更饱和）
    const hemi = new THREE.HemisphereLight(0x9ED4FF, 0x7ABF5A, 0.45);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // ====== 星空（夜晚可见，白天淡出） ======
    this.createStarField();
    // ====== 云朵（昼夜均可见） ======
    this.createClouds();

    // ====== 半透明水面（填充 chunk 网格中过滤掉的水域空洞） ======
    this.createWaterPlane();

    // OrbitControls（默认禁用，跟随模式由自研 rig 控制；建造模式启用）
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // 交互事件
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('wheel', this.onWheel);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);

    // 调试钩子（E2E 昼夜验证用，无害）：强制相位 + 立即应用光照（跳过插值，便于 headless 确定性读取）
    (window as any).__forcePhase = (frac: number) => {
      const elevation = Math.sin(2 * Math.PI * frac - Math.PI / 2);
      this.worldTime = {
        frac, hour: Math.floor(frac * 24), minute: Math.floor(((frac * 24) % 1) * 60),
        elevation, isNight: elevation < -0.1, phase: 'debug'
      };
      this.targetBlend = Math.max(0, Math.min(1, (elevation + 0.25) / 0.5));
      this.dayNightBlend = this.targetBlend; // 立即生效（E2E 确定性）
      this.updateDayNight(1);                // 直接套用目标光照状态
      this.timeLabel = `${String(this.worldTime.hour).padStart(2, '0')}:${String(this.worldTime.minute).padStart(2, '0')}`;
      this.phaseIcon = this.worldTime.isNight ? '🌙' : '☀️';
      (window as any).__petWorldTime = this.worldTime;
    };
    (window as any).__petSceneInfo = () => {
      let chunkMeshes = 0, treeGroups = 0, totalVerts = 0;
      const boxes: string[] = [];
      this.scene.traverse(o => {
        const m = o as THREE.Mesh;
        const n = m.name || '';
        if (n.startsWith('chunk_')) {
          chunkMeshes++;
          const g = m.geometry as THREE.BufferGeometry;
          if (g?.attributes?.['position']) totalVerts += (g.attributes['position'] as THREE.BufferAttribute).count;
          const bb = g?.boundingBox;
          if (bb) boxes.push(`${n}: y[${bb.min.y.toFixed(1)}~${bb.max.y.toFixed(1)}] verts=${(g.attributes['position'] as THREE.BufferAttribute).count}`);
        }
        if (n.startsWith('tree_') || (o as any).type === 'Group') treeGroups++;
      });
      return {
        bg: (this.scene.background as THREE.Color).getHexString(),
        exposure: this.renderer.toneMappingExposure,
        sunIntensity: this.sunLight.intensity,
        blend: this.dayNightBlend,
        chunkMeshes, totalVerts, treeGroups,
        sampleBoxes: boxes.slice(0, 4),
        player: { px: this.px.toFixed(1), py: this.py.toFixed(1), pz: this.pz.toFixed(1) },
        sceneChildren: this.scene.children.length
      };
    };
    // 首次进入触发新手引导（localStorage 去重）
    this.maybeStartOnboarding();
    // 新手引导调试/重置钩子（E2E 用，无害）
    (window as any).__onboarding = () => ({ show: this.showOnboarding, step: this.onboardingStep });
    (window as any).__resetOnboarding = () => {
      try { localStorage.removeItem('pp_onboarded'); } catch (e) {}
      this.showOnboarding = true; this.onboardingStep = 0;
    };
    // 模拟「首入判定」真实逻辑（E2E 去重验证用，无害）：返回是否应显示引导
    (window as any).__simulateFirstEntry = () => {
      this.showOnboarding = false;
      this.maybeStartOnboarding();
      return this.showOnboarding;
    };
  }

  // ================= 新手引导（P1 支柱②） =================
  private maybeStartOnboarding(): void {
    try {
      if (!localStorage.getItem('pp_onboarded')) {
        this.showOnboarding = true;
        this.onboardingStep = 0;
      }
    } catch (e) { /* localStorage 不可用时忽略 */ }
  }

  /** 手动「下一步」：末步视为完成 */
  nextOnboarding(): void {
    if (this.onboardingStep < this.onboardingSteps.length - 1) {
      this.onboardingStep++;
    } else {
      this.finishOnboarding();
    }
  }

  /** 完成/跳过：关闭并标记已引导 */
  finishOnboarding(): void {
    this.showOnboarding = false;
    try { localStorage.setItem('pp_onboarded', '1'); } catch (e) {}
  }

  /** 自动推进：当玩家完成对应动作且引导停在该步时前进（避免重复触发） */
  private advanceOnboardingIf(step: number): void {
    if (this.showOnboarding && this.onboardingStep === step) {
      this.onboardingStep++;
      if (this.onboardingStep >= this.onboardingSteps.length) this.finishOnboarding();
    }
  }

  private initPlayer(): void {
    // 先创建一个临时占位符（小灰人），等 boy/girl GLB 加载完成后替换
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.28, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 })
    );
    body.position.y = 0.62;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 })
    );
    head.position.y = 1.25;
    g.add(body, head);
    this.playerMesh = g;
    g.renderOrder = 999; // 🔴 玩家始终渲染在最上层（避免被HY3D地形遮挡）
    g.traverse(o => { if (o instanceof THREE.Mesh) o.renderOrder = 999; });
    this.scene.add(g);

    // 异步加载玩家模型：按性别选 boy.glb（男 M）/ girl.glb（女 F）
    const modelFile = (this.auth.user?.gender === 'F') ? 'girl.glb' : 'boy.glb';
    this.assets.loadModel('assets/models/' + modelFile).then(glb => {
      if (!glb || this.disposed) return;
      const normalized = this.normalizeModel(glb, 2.0);
      // 复制当前占位符的位置/旋转
      normalized.position.copy(this.playerMesh.position);
      normalized.rotation.copy(this.playerMesh.rotation);
      // 替换场景中的旧 mesh
      this.scene.remove(this.playerMesh);
      this.scene.add(normalized);
      this.playerMesh = normalized;
      normalized.renderOrder = 999;
      normalized.traverse(o => { if (o instanceof THREE.Mesh) o.renderOrder = 999; });
      console.log('[world3d] 玩家角色已替换为 ' + modelFile);
    }).catch(() => {
      console.warn('[world3d] ' + modelFile + ' 加载失败，保留占位符');
    });
  }

  // ================= WS =================

  private connectWs(): void {
    if (!this.auth.isLoggedIn) {
      this.hint = '未登录：请先登录后再进入大世界';
      return;
    }
    // 订阅连接状态：每次「已连接」（含断线自动重连）都重建订阅 + 重新 join
    if (!this.wsStateSub) {
      this.wsStateSub = this.ws.connectionState$.subscribe(state => {
        this.connState = state;
        if (state === 'connected') {
          this.setupWorldChannel();
        }
      });
    }
    this.ws.connect().catch(() => {
      this.hint = 'WebSocket 连接失败（世界事件将不可见）';
    });
  }

  /** 建立世界频道：订阅主题 + 物理客户端初始化 + 加入房间（断线重连后需重建） */
  private setupWorldChannel(): void {
    if (this.disposed) return;
    this.ws.subscribe('/topic/world', f => this.onWorldEvent(f));
    this.ws.subscribe('/topic/players', f => this.onPlayerEvent(f));
    this.ws.subscribe('/user/queue/reply', f => this.onReply(f));
    // 物理快照客户端（POSITION_SNAPSHOT / PHYS_RESTART）
    this.physics.init();
    const cx = Math.floor(this.px / CHUNK);
    const cz = Math.floor(this.pz / CHUNK);
    this.ws.send('/app/ws.join', { chunkKey: `${cx}_${cz}`, gx: Math.floor(this.px), gz: Math.floor(this.pz) });
    this.hint = '已接入大世界（服务端物理权威），按 WASD 移动探索';
  }

  private onWorldEvent(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'OBJECT_ADD' && ev.object) {
        this.addObject(ev.object);
        this.hint = `新放置：${ev.object.type} @(${ev.object.gx},${ev.object.gz})`;
      } else if (ev.t === 'PLAYER_JOIN' && ev.uid !== this.uid) {
        this.addRemotePlayer(ev);
        this.hint = `${ev.nickname || '玩家'} 进入世界`;
      } else if (ev.t === 'PLAYER_LEAVE' && ev.uid !== this.uid) {
        this.removeRemotePlayer(ev.uid);
      } else if (ev.t === 'CHAT' && ev.uid != null && ev.text) {
        this.pushChat(ev.uid, ev.nickname || '', ev.text, ev.ts || Date.now());
      } else if (ev.t === 'TERRAIN_CHANGE' && ev.chunkKey != null) {
        // 矿格被采空：重着色地形 + 移除 3D 矿模型（所有客户端同步）
        this.applyTerrainChange(ev.chunkKey, ev.gx, ev.gz, ev.newType);
      } else if (ev.t === 'OBJECT_REMOVE' && ev.id != null) {
        // P0 拆除：移除网格 + 清缓存（所有客户端同步）
        this.removeObjectMesh(ev.id);
      } else if (ev.t === 'OBJECT_UPDATE' && ev.id != null) {
        // P2 升级 / P1 鱼塘收获：刷新网格（等级缩放 / 生长进度）
        this.updateObjectMesh(ev.id, ev.extJson);
      } else if (ev.t === 'DAY_NIGHT') {
        // 昼夜相位：写入状态 + 计算目标混合系数（0 夜 / 1 昼）
        this.worldTime = {
          frac: ev.frac, hour: ev.hour, minute: ev.minute,
          elevation: ev.elevation, isNight: ev.isNight, phase: ev.phase
        };
        // 混合系数：太阳高度从 -0.25..+0.25 映射到 0..1（地平线附近过渡）
        const e = typeof ev.elevation === 'number' ? ev.elevation : 1;
        this.targetBlend = Math.max(0, Math.min(1, (e + 0.25) / 0.5));
        const hh = String(ev.hour ?? 0).padStart(2, '0');
        const mm = String(ev.minute ?? 0).padStart(2, '0');
        this.timeLabel = `${hh}:${mm}`;
        this.phaseIcon = ev.isNight ? '🌙' : '☀️';
        // 暴露给 E2E 探针
        (window as any).__petWorldTime = this.worldTime;
      }
      this.onlineCount = this.remotePlayers.size + 1;
    } catch (e) { /* 忽略坏帧 */ }
  }

  private onPlayerEvent(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'POSITION' && ev.uid !== this.uid) {
        const p = this.remotePlayers.get(ev.uid);
        if (p) {
          p.position.set(ev.gx + 0.5, (ev.y ?? 0) + 0.3, ev.gz + 0.5);
        }
      }
    } catch (e) { /* ignore */ }
  }

  private onReply(frame: { body: string }): void {
    try {
      const ev = JSON.parse(frame.body);
      if (ev.t === 'POSITION_SNAPSHOT') {
        // 以快照为基线：清空区域态 → 重建远端玩家与对象
        for (const g of this.remotePlayers.values()) this.scene.remove(g);
        this.remotePlayers.clear();
        for (const o of this.objectMeshes.values()) this.scene.remove(o);
        this.objectMeshes.clear();
        this.worldObjects.clear();
        if (Array.isArray(ev.players)) {
          for (const p of ev.players) {
            if (p.uid !== this.uid) this.addRemotePlayer(p);
            else {
              // 🔴 自己的快照：先检查是否在水域，若是则延迟到 animate() 的水域保护处理
              // （animate 每帧跑，比这里更可靠；此处仅记录日志）
              const sgx = Math.floor(p.gx), sgz = Math.floor(p.gz);
              const sc = this.cellChunk(sgx, sgz);
              if (sc) {
                const grid = this.gridCache.get(`${sc.cx}_${sc.cz}`);
                if (grid) {
                  const lx = sgx - sc.cx * CHUNK, lz = sgz - sc.cz * CHUNK;
                  if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) {
                    const sem = grid.semantic[lz * CHUNK + lx];
                    if (sem === 0 || sem === 10) {
                      console.warn('[WATER-SNAPSHOT] 服务端快照把玩家放在水域！等待 animate() 推回', { gx: sgx, gz: sgz, sem });
                    }
                  }
                }
              }
            }
          }
        }
        if (Array.isArray(ev.objects)) {
          for (const o of ev.objects) this.addObject(o);
        }
        this.onlineCount = this.remotePlayers.size + 1;
        if (ev.version && this.config && ev.version !== this.config.version) {
          this.hint = '世界版本已更新，请刷新页面';
        }
      } else if (ev.t === 'BUILD_RESULT') {
        this.hint = ev.code === 0 ? '放置成功' : ('放置失败：' + (ev.msg || '未知错误'));
        if (ev.code === 0) this.advanceOnboardingIf(3); // 新手引导：完成「建造」步自动前进
        this.refreshCoins();
      } else if (ev.t === 'MINE_RESULT') {
        // 采矿结果回执（/app/ws.mine）：刷新 HUD + 提示 + 本地地形变化
        this.handleMineResult(ev);
      } else if (ev.t === 'FISH_RESULT') {
        // 钓鱼结果回执（/app/ws.fish）：刷新 HUD + 提示
        this.handleFishResult(ev);
      }
    } catch (e) { /* ignore */ }
  }

  // ================= 聊天（M3）——已移至 app 层级，此处仅通过 ChatService 推送 =================
  private pushChat(uid: number, nickname: string, text: string, ts: number): void {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    this.chatService.push({ uid, nickname, text, ts, timeText: `${hh}:${mm}` });
  }

  // ================= 天空装饰（星星 + 云朵） =================

  /** 创建星空粒子球：~1800 颗星分布在半径 R 的球壳上，用 ShaderMaterial 控制闪烁 + 昼夜淡入淡出 */
  private createStarField(): void {
    const COUNT = World3dComponent.STAR_COUNT;
    const R = 900; // 星空球半径（远大于视距，跟随相机无需移动）
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);     // 每颗星随机大小
    const phases = new Float32Array(COUNT);     // 闪烁相位（随机偏移）
    const twinkleSpeeds = new Float32Array(COUNT); // 闪烁速度

    for (let i = 0; i < COUNT; i++) {
      // 均匀分布球面（避免极地密集：用 sqrt 校正）
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      // 只在上半球（略过地平线下方）
      const phiTop = Math.min(phi, Math.PI / 2 - 0.05);
      positions[i * 3] = R * Math.sin(phiTop) * Math.cos(theta);
      positions[i * 3 + 1] = Math.max(R * Math.cos(phiTop), 30); // 确保高度 > 0
      positions[i * 3 + 2] = R * Math.sin(phiTop) * Math.sin(theta);
      sizes[i] = 1.5 + Math.random() * 3.5;       // 大小变化
      phases[i] = Math.random() * Math.PI * 2;      // 随机初始相位
      twinkleSpeeds[i] = 0.8 + Math.random() * 2.4; // 闪烁频率
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },        // 由 dayNightBlend 控制（夜=1,昼=0）
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aTwinkleSpeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vBrightness;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          // 闪烁：正弦调制亮度
          vBrightness = 0.5 + 0.5 * sin(uTime * aTwinkleSpeed + aPhase);
          gl_PointSize = aSize * uPixelRatio * (250.0 / -mvPos.z); // 距离衰减
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vBrightness;
        void main() {
          // 圆形星点 + 柔和边缘
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.15, d) * vBrightness * uOpacity;
          // 星心白色 + 微蓝光晕
          vec3 col = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 1.0, 1.0), smoothstep(0.35, 0.0, d));
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.starField = new THREE.Points(geo, this.starMaterial);
    this.starField.renderOrder = -999; // 最先渲染（背景层）
    this.scene.add(this.starField);
  }

  /** 创建程序化云朵：12 朵云由多个球体簇组成，漂浮在天空 Y=120~180 */
  private createClouds(): void {
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = 'clouds';

    // 云朵材质：半透明白色，无深度写入（避免遮挡问题）
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      roughness: 1.0,
      metalness: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < World3dComponent.CLOUD_COUNT; i++) {
      const cloud = this.buildCloudPuff(cloudMat);
      // 散布在场景上方大片区域
      const angle = (i / World3dComponent.CLOUD_COUNT) * Math.PI * 2;
      const radius = 200 + Math.random() * 500;
      cloud.position.set(
        Math.cos(angle) * radius,
        110 + Math.random() * 90,
        Math.sin(angle) * radius
      );
      // 缩放随机化
      const s = 0.7 + Math.random() * 1.0;
      cloud.scale.setScalar(s);
      // 存储漂移参数
      cloud.userData['driftSpeed'] = 0.15 + Math.random() * 0.25;
      cloud.userData['driftAngle'] = angle;
      cloud.userData['driftRadius'] = radius;
      cloud.userData['baseY'] = cloud.position.y;
      cloud.userData['floatPhase'] = Math.random() * Math.PI * 2;
      cloud.userData['floatSpeed'] = 0.08 + Math.random() * 0.12;
      this.cloudGroup.add(cloud);
    }

    this.scene.add(this.cloudGroup);
  }

  /** 构建单朵云：由 4~8 个不同大小的球体组成 */
  private buildCloudPuff(mat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 4); // 4~7 个球体
    for (let j = 0; j < puffs; j++) {
      const r = 10 + Math.random() * 22; // 球体半径 10~32
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      // 相对位置聚集在中心附近
      sphere.position.set(
        (Math.random() - 0.5) * r * 2.5,
        (Math.random() - 0.5) * r * 0.6,
        (Math.random() - 0.5) * r * 2.5
      );
      // 共享几何/材质（dispose 时仅清理 group）
      sphere.userData['shared'] = true;
      group.add(sphere);
    }
    return group;
  }

  /** 更新星空透明度（每帧调用）：根据昼夜混合系数调整星星可见性 */
  private updateStars(time: number): void {
    if (!this.starMaterial) return;
    // 夜晚 (t→0): opacity→1；白天 (t→1): opacity→0
    // 用平滑阶梯函数：t<0.35 全亮，t>0.65 全灭，中间过渡
    const t = this.dayNightBlend;
    let opacity = 0;
    if (t < 0.35) opacity = 1;
    else if (t < 0.55) opacity = 1 - (t - 0.35) / 0.2;
    else opacity = 0;
    this.starMaterial.uniforms['uOpacity'].value = opacity;
    this.starMaterial.uniforms['uTime'].value = time;
  }

  /** 更新云朵漂移（每帧调用）：缓慢绕场景旋转 + 上下浮动 */
  private updateClouds(dt: number, time: number): void {
    if (!this.cloudGroup) return;
    // 昼夜影响云的亮度和颜色
    const t = this.dayNightBlend;
    const nightDarken = 0.55 + 0.45 * t; // 夜间稍暗但不消失
    this.cloudGroup.children.forEach((cloud) => {
      const ud = cloud.userData;
      // 缓慢绕 Y 轴漂移
      ud['driftAngle'] = ud['driftAngle'] + ud['driftSpeed'] * dt * 0.04;
      cloud.position.x = Math.cos(ud['driftAngle']) * ud['driftRadius'];
      cloud.position.z = Math.sin(ud['driftAngle']) * ud['driftRadius'];
      // 正弦浮动
      cloud.position.y = ud['baseY'] + Math.sin(time * ud['floatSpeed'] + ud['floatPhase']) * 4;
      // 云整体明暗随昼夜
      cloud.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material && !(m as any).userData?.shared !== false) {
          (m.material as THREE.MeshStandardMaterial).opacity = 0.82 * nightDarken;
        }
      });
    });
  }

  // ================= 昼夜系统（P1 支柱①） =================
  /** 据相位平滑插值天空色/雾色/光照强度/曝光；太阳随 frac 绕行 */
  private updateDayNight(dt: number): void {
    const speed = Math.min(1, dt / 1.5); // 约 1.5s 过渡
    this.dayNightBlend += (this.targetBlend - this.dayNightBlend) * speed;
    const t = this.dayNightBlend;

    if (this.scene) {
      (this.scene.background as THREE.Color).copy(this.skyNight).lerp(this.skyDay, t);
      if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.fogNight).lerp(this.fogDay, t);
    }
    if (this.sunLight) {
      this.sunLight.intensity = 0.55 + 0.55 * t;   // 夜间 0.55（模拟月光，保证地形清晰可见）
      this.sunLight.color.setRGB(0.62 + 0.38 * t, 0.66 + 0.34 * t, 0.88 + 0.12 * t);
      const frac = this.worldTime ? this.worldTime.frac : 0.5;
      const ang = frac * Math.PI * 2 - Math.PI / 2; // frac=0.5 → 正午(高)
      this.sunLight.position.set(Math.cos(ang) * 150, Math.max(8, Math.sin(ang) * 160), 80);
    }
    if (this.fillLightRef) this.fillLightRef.intensity = 0.35 + 0.14 * t;   // 夜间 0.35
    if (this.hemiLight) this.hemiLight.intensity = 0.60 + 0.30 * t;           // 夜间 0.60（环境光地板，保证夜间可见）
    if (this.renderer) this.renderer.toneMappingExposure = 1.25 + 0.15 * t;   // 夜间 1.25（提亮夜间曝光）
  }

  // ================= 主循环 =================

  private animate(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());
    let __bizErr: any = null;
    try {

    const now = performance.now();
    const dt = this.lastTs ? Math.min((now - this.lastTs) / 1000, 0.05) : 0.016;
    this.lastTs = now;
    // 输入上行（非建造/养鱼模式）：本地不移动，只发输入意图；~30Hz + 按键状态变化立即发
    if (!this.buildMode && !this.fishMode) {
      // 自动导航卡住检测：被障碍挡住 → 重寻路绕开 / 放弃，杜绝无限转圈
      if (this.pathPoints.length || this.moveTarget) {
        this.checkNavigationStuck(now, dt);
      }
      // 优先处理双击目标移动：有 A* 路点队列则逐点跟随，否则单点 moveTarget，否则手动输入
      if (this.pathPoints.length > 0) {
        this.followPath(now);
      } else if (this.moveTarget) {
        this.updateMoveTowardsTarget(now);
      } else {
        this.sendInputIfNeeded(now);
      }
    }

    // 权威姿态：physics-service 快照插值；快照未到前停留出生点
    const st = this.physics.getState(this.uid);
    if (st) {
      this.px = st.gx; this.pz = st.gz; this.prot = st.rot;
      // 🔴🔴🔴 坐标系变换（2026-08-16 彻底修复飞天根因）：
      //   服务端物理引擎运行在旧网格坐标系（地面 y≈-0.2~1）
      //   客户端渲染在 HY3D 视觉坐标系（岛屿表面 y≈4+）
      //   直接用服务端 py → 要么被判定"在地下"反复上推（正反馈），要么追着服务端的跳跃高值飞走
      //   正确做法：算出"离服务端地面的高度"，叠加到 HY3D 视觉地面上
      const serverGround = this.heightAt(st.gx, st.gz);           // 服务端认为的地面
      const visualGround = this.hy3dSurfaceHeightAt(st.gx, st.gz); // 客户端可见的 HY3D 地面
      const vG = (visualGround != null ? visualGround : (serverGround ?? 0)); // 视觉地面优先
      const sG = (serverGround ?? -0.2); // 服务端地面 fallback
      if (st.y < -50 || st.y > 100 || !Number.isFinite(st.y)) {
        // 异常值：直接用视觉地面 + 脚底偏移
        this.py = vG; // 脚底贴地
      } else {
        // 正常值：高度差 = 服务端py - 服务端地面 → 叠加到视觉地面上
        const heightAboveGround = st.y - sG;
        // 钳制：不允许离视觉地面超过 3m（正常跳最高约 2m）
        const clampedHeight = Math.min(Math.max(heightAboveGround, -2), 3.0);
        this.py = vG + clampedHeight;
      }
    }
    // 平滑插值：水平方向纯 lerp（无地面冲突）
    const k = World3dComponent.SMOOTH_FACTOR;
    this.dpx += (this.px - this.dpx) * k;
    this.dpz += (this.pz - this.dpz) * k;
    // rot 用角度最短路径差分
    let dr = this.prot - this.dprot;
    while (dr > Math.PI) dr -= 2 * Math.PI;
    while (dr < -Math.PI) dr += 2 * Math.PI;
    this.dprot += dr * k;

    // 🔴 水域保护（三层检测，任一触发即推回陆地）：
    //   Layer 1: 语义格检测（WATER=0 / RIVER=10）
    //   Layer 2: 高度检测（y < waterLevel → 必在水下/水面，无论语义如何）
    //   Layer 3: 服务端 canEnter 已阻挡 WATER+RIVER，但浮点精度/插值延迟/旧快照可能导致短暂落水
    const pgx = Math.floor(this.dpx);
    const pgz = Math.floor(this.dpz);
    let inWater = false;

    // 🔴🔴🔴 Layer 0（2026-08-16 修复"双击走不过去/WASD 橡皮筋"根因）：
    //   玩家脚下 raycast 命中 HY3D 视觉岛屿表面 → 绝不在水里，直接跳过 Layer 1/2。
    //   旧逻辑用旧网格语义/高度判水：HY3D 世界视觉地面 y≈4+，而旧网格大量格子高度 <0
    //   → 出生点/岛上永久误报"落水"，每 3 秒打断自动导航（清空 pathPoints/moveTarget）
    //   并把人瞬移回去 → 用户看到"双击不移动、按键没效果"。Layer 1/2 仅对岛外海域生效。
    const hy3dGroundHere = this.hy3dSurfaceHeightAt(this.dpx, this.dpz);
    if (hy3dGroundHere == null) {
      // Layer 1: 语义格检测
      const cc = this.cellChunk(pgx, pgz);
      if (cc) {
        const g = this.gridCache.get(`${cc.cx}_${cc.cz}`);
        if (g) {
          const lx = pgx - cc.cx * CHUNK, lz = pgz - cc.cz * CHUNK;
          if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) {
            const sem = g.semantic[lz * CHUNK + lx];
            if (sem === 0 || sem === 10) { inWater = true; } // WATER or RIVER
          }
        }
      }

      // Layer 2: 高度 fallback（语义数据未加载时也能保护）
      if (!inWater) {
        const groundY = this.heightAt(this.dpx, this.dpz);
        const wl = this.config?.waterLevel ?? -5;
        const safeLine = Math.max(wl + 0.5, 0); // 🔴🔴 安全线=海平面以上
        if (groundY != null && groundY < safeLine) { inWater = true; } // 地面低于安全线≈在水里/低洼
      }
    }

    // 推回陆地（带 3 秒冷却锁，防止每帧与服务端快照打架导致抖动）
    if (inWater) {
      const nowMs = Date.now();
      if (nowMs - this._lastWaterPushTs > 3000) {
        this._lastWaterPushTs = nowMs;
        console.warn('[WATER] 玩家落水！推回陆地（单次）', { gx: pgx, gz: pgz, px: this.dpx.toFixed(1), pz: this.dpz.toFixed(1) });
        const land = this.nearestWalkable(pgx, pgz);
        if (land) {
          // 🔴 只设显示位置（dpx/dpz），不覆盖 px/pz（px/pz 由服务端快照驱动，
          //   覆盖后下一帧又被服务端改回 → 死循环抖动）
          const newPx = land.gx + 0.5, newPz = land.gz + 0.5;
          this.dpx = newPx; this.dpz = newPz;
          // 🔴 2026-08-16：Y 优先用 HY3D 视觉地面（旧网格高度比岛面低 4m+ → 瞬移坠崖观感）
          const hyLand = this.hy3dSurfaceHeightAt(newPx, newPz);
          this.dpy = (hyLand != null ? hyLand : (this.heightAt(newPx, newPz) ?? 0)); // 脚底贴地
          // 取消自动导航
          this.pathPoints = []; this.moveTarget = null; this.navGoal = null; this.miniTarget = null;
          // 通知服务端停止移动
          if (this.ws.isConnected) {
            this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
          }
        }
      }
    }

    // 🔴🔴🔴🔴 核弹级防飞天修复（2026-08-16 第三轮）：
    //   不再信任服务端 py / dpy 的任何累积值。
    //   每帧根据 HY3D 地面高度直接计算正确 Y，仅跳跃时允许临时离地。
    //   （hy3dGroundHere 已在本帧上方水域保护处算好，直接复用，避免二次 raycast）
    const gridGround = this.heightAt(this.dpx, this.dpz);
    // 有 HY3D 就用 HY3D（视觉地面），否则用旧网格兜底
    const effectiveGround = (hy3dGroundHere != null) ? hy3dGroundHere : (gridGround ?? 0);
    const FOOT_OFFSET = 0; // 脚底贴地，无偏移
    const GROUND_Y = effectiveGround + FOOT_OFFSET;
    
    // 🔴🔴🔴 跳跃本地抛物线（2026-08-16 修复"最后几帧卡顿"根因）：
    //   旧实现：跳跃窗口内 lerp 追服务端 py → 快照抖动 + 1.2s 窗口到期瞬间从
    //   "追服务端高度"硬切到"落地 lerp" → 落地前几帧视觉突跳/卡顿。
    //   新实现：完全本地抛物线 y = v0*t - ½g*t²（参数与服务端 JUMP_VEL=8.5/GRAVITY=25 一致），
    //   t=0.68s 精确回到地面 → 落地零突跳、丝滑；地面每帧重算，斜坡/移动中跳跃自然贴合。
    const msSinceJump = performance.now() - this._lastJumpTs;
    const jumpDurMs = (2 * World3dComponent.JUMP_VEL / World3dComponent.JUMP_GRAVITY) * 1000; // ≈680ms 滞空
    const inJumpWindow = msSinceJump < jumpDurMs;

    if (inJumpWindow) {
      const jt = msSinceJump / 1000; // 跳跃经过秒数
      const rise = World3dComponent.JUMP_VEL * jt - 0.5 * World3dComponent.JUMP_GRAVITY * jt * jt;
      this.dpy = GROUND_Y + Math.max(0, rise); // 抛物线：0 → 1.44m → 0，单调平滑无突跳
    } else {
      // 🔴🔴 平滑落地（2026-08-16）：抛物线终点恰好=地面，此快速 lerp 仅兜底台阶/地形突变
      const landLerp = Math.min(1.0, dt * 20);
      this.dpy += (GROUND_Y - this.dpy) * landLerp;
    }

    // [Y-DEBUG removed 2026-08-16] 飞天问题已修复，不再需要每帧日志
    // 统一一次性设置玩家位置（不再有第二处覆写）
    this.playerMesh.position.set(this.dpx, this.dpy, this.dpz);
    this.playerMesh.rotation.y = this.dprot;
    // 🔴 每帧轻量调试钩子（playwright 高频采样跳跃弧线用；8 帧刷新的 __worldDebug 在低帧率下看不到 680ms 跳跃）
    (window as any).__dpyNow = this.dpy;

    // 远端玩家：以物理快照刚体为准
    this.updateRemotePlayersFromPhysics();
    this.updateCharAnimations(dt);

    // chunk 流式（节流 ~250ms）
    if (now - this.lastStream > 250) {
      this.lastStream = now;
      this.streamChunks();
      // 🔴🔴 HY3D 岛屿 LOD：只保留玩家周围 100m 内的岛屿实例（性能优化）
      this.updateHy3dIslandLOD();
      // 邻近矿脉扫描（F 键采矿 + 提示用，仅需玩家附近 chunk）
      this.scanNearbyOre();
      // 邻近水域扫描（钓鱼按钮 + 提示用）
      this.scanNearbyWater();
    }
    // 小地图（节流 ~200ms）
    if (now - this.lastMinimap > 200) {
      this.lastMinimap = now;
      this.drawMinimap();
    }
    // 轻量位置心跳（保留：UI/调试/兜底；权威位置以 POSITION_SNAPSHOT 为准）
    if (now - this.lastPosSend > 1000 && this.ws.isConnected) {
      this.lastPosSend = now;
      this.ws.send('/app/ws.position', {
        gx: Math.floor(this.px), gz: Math.floor(this.pz),
        y: this.py, rot: this.prot
      });
    }
    this.posText = `${Math.floor(this.px)}, ${Math.floor(this.pz)}, ${this.py.toFixed(1)}`;

    // 相机
    if (this.buildMode || this.fishMode || this.mineMode || this.removeMode || this.upgradeMode || this.harvestMode) {
      this.controls.target.set(this.dpx, this.dpy, this.dpz);
      this.controls.update();
    } else {
      this.controls.enabled = false;
      this.updateFollowCamera();
    }
    // 昼夜系统：据相位平滑插值天空/雾/灯光/曝光
    this.updateDayNight(dt);
    // 天空装饰：星星闪烁 + 云朵漂移 + 水面波浪
    this.updateStars(now * 0.001);
    this.updateClouds(dt, now * 0.001);
    this.updateWaterPlane(now);
    } catch (err) { __bizErr = err; }
    try {

    this.renderer.render(this.scene, this.camera);

    // 🔴 暴露场景调试数据（含水域安全状态），供 playwright 断言
    try { this.publishWorldDebug(); } catch (e2) { /* 调试钩子失败不影响渲染 */ }
    } catch (e3) { console.error('[animate] 渲染异常（已隔离）', e3); }
    if (__bizErr) console.error('[animate] 单帧业务异常（已隔离，循环继续）', __bizErr);
  }

  private updateFollowCamera(): void {
    const d = this.follow.dist;
    const cp = Math.cos(this.follow.pitch);
    // 🔴 右键查看模式：相机围绕 viewTarget 而非玩家
    const tx = this.viewTarget ? this.viewTarget.x : this.dpx;
    const ty = this.viewTarget ? this.viewTarget.y : this.dpy;
    const tz = this.viewTarget ? this.viewTarget.z : this.dpz;
    const cx = tx + d * cp * Math.sin(this.follow.yaw);
    const cy = ty + d * Math.sin(this.follow.pitch);
    const cz = tz + d * Math.cos(this.follow.yaw);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty + 1.2, tz);
    // 奔跑时视野轻微拉宽（FOV kick），增强速度感（成熟竞品常见手感）
    const targetFov = this.running ? 62 : 55;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.12;
      this.camera.updateProjectionMatrix();
    }
  }

  /** 切换操作帮助面板 */
  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  // ================= 养成循环（P1 支柱③） =================
  /** 开关养成面板，打开时拉取最新图鉴与养成汇总 */
  toggleCult(): void {
    this.showCult = !this.showCult;
    if (this.showCult) {
      this.loadCultivation();
      this.loadCodex();
    }
  }

  /** 养成汇总（等级/经验/能量/积分 + 收益曲线 + 解锁里程碑） */
  private loadCultivation(): void {
    this.api.cultivation().subscribe({
      next: r => { if (r && r.code === 0 && r.data) this.cultivation = r.data; },
      error: () => { /* 忽略 */ }
    });
  }

  /** 图鉴（鱼 + 矿石，标已发现） */
  private loadCodex(): void {
    this.api.codex().subscribe({
      next: r => { if (r && r.code === 0 && r.data) this.codex = r.data; },
      error: () => { /* 忽略 */ }
    });
  }

  // ================= 移动（M2：输入上行 + 服务端物理权威，ADR-W7 候选②） =================

  /**
   * 计算当前按键 → 世界空间方向 (dx,dz,run)，上行 /app/ws.input。
   * 客户端不做任何本地物理求解；physics-service 按 tick 排队消费输入，权威姿态由 POSITION_SNAPSHOT 下发。
   * 节流：按键状态变化立即发；持续按键 ~30Hz；未按任何键 → 发一次 (0,0) 表示停止。
   */
  private sendInputIfNeeded(now: number): void {
    let ix = 0, iz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iz -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    // 触屏摇杆叠加（P0-1）：x→右(+ix) / y→前(+iz)
    ix += this.touchVec.x;
    iz += this.touchVec.y;
    const run = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || this.running;

    // 世界空间方向（相对相机 yaw：W=相机前方、D=相机右方）
    const yaw = this.follow.yaw;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const len = Math.hypot(ix, iz);
    const dx = len > 0 ? (right.x * ix + forward.x * iz) / len : 0;
    const dz = len > 0 ? (right.z * ix + forward.z * iz) / len : 0;

    // 奔跑态空闲超时：双击触发奔跑后，若停止移动超过 0.4s 则自动退出（避免一直跑）
    const moving = len > 0;
    if (this.running && !moving) {
      if (this.runIdleSince === 0) this.runIdleSince = now;
      else if (now - this.runIdleSince > 400) { this.running = false; this.runKey = null; this.runIdleSince = 0; }
    } else {
      this.runIdleSince = 0;
    }

    const keyState = `${ix}_${iz}_${run ? 1 : 0}`;
    const idle = len === 0;
    if (!idle && keyState === this.inputSentKeyState && now - this.lastInputSend < 33) {
      return; // 持续按键节流 ~30Hz
    }
    if (idle && this.inputSentKeyState === 'idle') {
      return; // 已发过停止
    }
    this.inputSentKeyState = idle ? 'idle' : keyState;
    this.lastInputSend = now;
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx, dz, run } });
    }
  }

  /** 自动走向双击目标：计算方向 → 发输入 → 到达后清除目标 */
  private updateMoveTowardsTarget(now: number): void {
    if (!this.moveTarget) return;
    const tx = this.moveTarget.x;
    const tz = this.moveTarget.z;
    const dx = tx - this.dpx;
    const dz = tz - this.dpz;
    const dist = Math.hypot(dx, dz);
    // 到达判定（< 0.8 单位视为到达）
    if (dist < 0.8) {
      this.moveTarget = null;
      this.miniTarget = null;
      this.navGoal = null; // 🔴 同 followPath：漏清会让卡住检测拿旧目标反复重寻路
      this.stuckTimer = 0;
      this.hint = '已到达目标位置';
      // 发停止指令
      if (this.ws.isConnected) {
        this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
      }
      return;
    }
    // 归一化方向
    const ndx = dx / dist;
    const ndz = dz / dist;
    // 🔴 2026-08-16 防"过冲折返"：显示位置(dpx/dpz)滞后服务端 150ms + 服务端着地保速，
    //   全程 run(9/s) 冲刺会跳过 <0.8 到达窗口 → 路点永远吃不掉 → 在目标点来回折返。
    //   近距(<2.2)切步走(4/s)，<1.0 提前发停止让动量滑行进场
    if (dist < 1.0) {
      this.moveTarget = null;
      this.miniTarget = null;
      this.navGoal = null;
      this.stuckTimer = 0;
      this.hint = '已到达目标位置';
      if (this.ws.isConnected) {
        this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
      }
      return;
    }
    const walkSlow = dist < 2.2;
    // 节流 ~30Hz
    if (now - this.lastInputSend < 33 && this.inputSentKeyState === `auto_${ndx.toFixed(2)}_${ndz.toFixed(2)}`) {
      return;
    }
    this.lastInputSend = now;
    this.inputSentKeyState = `auto_${ndx.toFixed(2)}_${ndz.toFixed(2)}`;
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', {
        seq: Math.floor(now),
        move: { dx: ndx, dz: ndz, run: !walkSlow }, // 🔴 近距步走减速，防过冲折返
        targetGx: Math.floor(tx),
        targetGz: Math.floor(tz)
      });
    }
  }

  /** 沿 A* 路点队列行走：抵达队首后出队，队列空则停止 */
  private followPath(now: number): void {
    if (!this.pathPoints.length) {
      this.moveTarget = null;
      return;
    }
    const head = this.pathPoints[0];
    const dist = Math.hypot(head.x - this.dpx, head.z - this.dpz);
    if (dist < 1.2) { // 🔴 0.8→1.2：显示插值滞后会跳过 0.8 窗口，路点吃不掉导致折返震荡
      this.pathPoints.shift();
      if (!this.pathPoints.length) {
        this.moveTarget = null;
        this.miniTarget = null;
        this.navGoal = null; // 🔴 2026-08-16 漏清导致"到达→卡住检测→重寻路→过头→再到达"死循环震荡
        this.stuckTimer = 0;
        if (this.ws.isConnected) {
          this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
        }
        this.hint = '已到达目标位置';
        return;
      }
    }
    this.moveTarget = head;
    this.updateMoveTowardsTarget(now);
  }

  /**
   * 自动导航卡住检测：玩家被障碍（树/矿/建筑）挡住、长时间（>1.4s）几乎不前进时，
   * 利用已加载的障碍网格从当前位置重新 A* 寻路绕开；重寻路仍不可达则放弃并提示，
   * 彻底杜绝「被挡住后持续朝目标推 → 卡墙角无限转圈」。
   */
  private checkNavigationStuck(now: number, dt: number): void {
    const dtNav = this.lastNavNow ? (now - this.lastNavNow) / 1000 : 0;
    this.lastNavNow = now;
    const moved = Math.hypot(this.dpx - this.lastStuckX, this.dpz - this.lastStuckZ);
    if (moved < 0.25) {
      this.stuckTimer += Math.min(dtNav, 0.1);
    } else {
      this.stuckTimer = 0;
      this.navRetries = 0;
      this.lastStuckX = this.dpx;
      this.lastStuckZ = this.dpz;
      return;
    }
    if (this.stuckTimer < 1.4) {
      // 🔴 2026-08-16 到达收尾兜底：最后 1 个路点已贴近(<1.5)但被边界/精度挡住推不进 0.8，
      //   停滞 0.6s 即视为到达收尾——否则 moveTarget 永挂"导航中"，角色在目标点旁无限蹭
      if (this.pathPoints.length === 1 && this.stuckTimer > 0.6) {
        const head = this.pathPoints[0];
        if (Math.hypot(head.x - this.dpx, head.z - this.dpz) < 1.5) {
          this.pathPoints = [];
          this.moveTarget = null;
          this.navGoal = null;
          this.miniTarget = null;
          this.stuckTimer = 0;
          this.hint = '已到达目标位置';
          if (this.ws.isConnected) {
            this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
          }
          return;
        }
      }
      return; // 需持续停滞 1.4s 才判定卡住
    }

    // 先发停止，避免重寻路期间继续朝旧方向推
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', { seq: Math.floor(now), move: { dx: 0, dz: 0, run: false } });
    }
    const goal = this.navGoal;
    if (goal && this.navRetries < 2) {
      this.navRetries++;
      this.stuckTimer = 0;
      this.lastStuckX = this.dpx;
      this.lastStuckZ = this.dpz;
      const repath = this.findPath(Math.floor(this.dpx), Math.floor(this.dpz), Math.floor(goal.x), Math.floor(goal.z));
      if (repath && repath.length) {
        this.pathPoints = repath;
        this.moveTarget = null;
        this.hint = `🔄 重新寻路，已绕过障碍（${repath.length} 路点）`;
        return;
      }
    }
    // 重寻路失败或次数用尽 → 放弃并提示
    this.pathPoints = [];
    this.moveTarget = null;
    this.navGoal = null;
    this.miniTarget = null;
    this.hint = '⚠️ 被障碍物阻挡，无法到达目标';
  }

  /**
   * P2 双击 A* 寻路：基于已加载 chunk 的语义网格，避开水/树/岩/山/矿，
   * 从 (startGx,startGz) 寻路到 (targetGx,targetGz)，返回逐格中心点路点。
   * 无语义网格或不可达时返回 null（调用方回退直线移动）。
   */
  private findPath(startGx: number, startGz: number, targetGx: number, targetGz: number): { x: number; z: number }[] | null {
    // 可达性：起点/终点所在 cell 必须可走（终点不可走则找最近可走邻格）
    const sc = this.cellChunk(startGx, startGz);
    const tc = this.cellChunk(targetGx, targetGz);
    if (!sc || !tc) return null;

    // 目标若不可走，就近找最近可走格
    let tg = { gx: targetGx, gz: targetGz };
    if (!this.isWalkableCell(targetGx, targetGz)) {
      const near = this.nearestWalkable(targetGx, targetGz);
      if (!near) return null;
      tg = near;
    }

    // 取有语义网格覆盖的 chunk 边界（覆盖起终点所在 chunk）
    const minCx = Math.min(sc.cx, tc.cx), maxCx = Math.max(sc.cx, tc.cx);
    const minCz = Math.min(sc.cz, tc.cz), maxCz = Math.max(sc.cz, tc.cz);
    // 若任一关键 chunk 未加载，无法可靠寻路
    const originX = minCx * CHUNK, originZ = minCz * CHUNK;
    const spanX = (maxCx - minCx + 1) * CHUNK, spanZ = (maxCz - minCz + 1) * CHUNK;
    const getSem = (gx: number, gz: number): number | null => {
      const c = this.cellChunk(gx, gz);
      if (!c) return null;
      const grid = this.gridCache.get(`${c.cx}_${c.cz}`);
      if (!grid) return null;
      const lx = gx - c.cx * CHUNK, lz = gz - c.cz * CHUNK;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) return null;
      return grid.semantic[lz * CHUNK + lx];
    };

    const walk = (gx: number, gz: number): boolean => {
      if (!this.onIslandCircle(gx + 0.5, gz + 0.5)) return false; // 🔴 岛外（视觉海/虚空）不可走
      const s = getSem(gx, gz);
      if (s == null) return false;
      // 🔴 2026-08-16 坡地修复：岛内豁免旧网格语义（MOUNTAIN=3 等误判）——HY3D 视觉岛面
      //   平滑可走，旧网格在下方起伏会把坡地判成"山"→ A* 无路可走。岛内只挡水（海岸错配环带）。
      if (s === 0 || s === 10) return false;
      if (this.isObstacle(gx, gz)) return false;       // 树/矿/建筑占位 → 绕行
      return true;
    };

    const key = (gx: number, gz: number) => `${gx},${gz}`;
    const startK = key(startGx, startGz);
    const targetK = key(tg.gx, tg.gz);
    const open = new Map<string, { gx: number; gz: number; f: number }>();
    const came = new Map<string, string>();
    const gScore = new Map<string, number>();
    const h = (gx: number, gz: number) => Math.hypot(gx - tg.gx, gz - tg.gz);
    open.set(startK, { gx: startGx, gz: startGz, f: h(startGx, startGz) });
    gScore.set(startK, 0);
    const closed = new Set<string>();

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    let found = false;
    let guard = 0;
    const maxIter = spanX * spanZ * 8 + 1000;
    while (open.size && guard++ < maxIter) {
      // 取 f 最小
      let curK = '', cur: { gx: number; gz: number; f: number } | null = null;
      let best = Infinity;
      for (const [k, v] of open) {
        if (v.f < best) { best = v.f; curK = k; cur = v; }
      }
      if (!cur) break;
      open.delete(curK);
      if (curK === targetK) { found = true; break; }
      closed.add(curK);
      for (const [dx, dz] of dirs) {
        const ngx = cur.gx + dx, ngz = cur.gz + dz;
        if (ngx < originX || ngz < originZ || ngx >= originX + spanX || ngz >= originZ + spanZ) continue;
        if (!walk(ngx, ngz)) continue;
        // 对角线防穿墙（两侧正交格均须可走）
        if (dx !== 0 && dz !== 0) {
          if (!walk(cur.gx + dx, cur.gz) || !walk(cur.gx, cur.gz + dz)) continue;
        }
        const nk = key(ngx, ngz);
        if (closed.has(nk)) continue;
        const step = (dx !== 0 && dz !== 0) ? 1.4142 : 1;
        const tentative = (gScore.get(curK) ?? 0) + step;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, curK);
          gScore.set(nk, tentative);
          const f = tentative + h(ngx, ngz);
          open.set(nk, { gx: ngx, gz: ngz, f });
        }
      }
    }
    if (!found) return null;
    // 回溯路径
    const path: { x: number; z: number }[] = [];
    let k = targetK;
    while (k) {
      const [gx, gz] = k.split(',').map(Number);
      path.push({ x: gx + 0.5, z: gz + 0.5 });
      if (k === startK) break;
      k = came.get(k) || '';
    }
    path.reverse();
    // 去掉起点（玩家已在），保留后续路点
    if (path.length > 1) path.shift();
    return path;
  }

  /** cell 所属 chunk（含越界判断） */
  private cellChunk(gx: number, gz: number): { cx: number; cz: number } | null {
    const cx = Math.floor(gx / CHUNK);
    const cz = Math.floor(gz / CHUNK);
    if (!this.gridCache.has(`${cx}_${cz}`)) return null;
    return { cx, cz };
  }

  /** 🔴 位置是否在某 HY3D 岛屿覆盖范围内（圆判定，与视觉岛屿同源 islandCenters）
   *  2026-08-16：A* 寻路/可走判定必须叠加此约束——旧网格可在岛屿边缘外判"可走"，
   *  但那里视觉上是海/虚空 → 玩家走过去触发水域推回 → 导航被打断。
   *  🔴 用 1.05r 覆盖：HY3D 视觉岛屿含沙滩/浅滩延伸到 ~1.0r+，0.85r 会把沙滩误判为"岛外"→空气墙
   *  （2026-08-16 用户反馈：沙滩可见但走不过去 → 放宽到 1.05r 覆盖全部视觉陆地） */
  private static readonly ISLAND_WALK_FACTOR = 1.05;
  private onIslandCircle(wx: number, wz: number): boolean {
    for (let i = 0; i < this.islandCenters.length; i++) {
      const c = this.islandCenters[i];
      const rr = c.r * World3dComponent.ISLAND_WALK_FACTOR;
      const dx = wx - c.cx, dz = wz - c.cz;
      if (dx * dx + dz * dz <= rr * rr) return true;
    }
    return false;
  }

  /** 单格是否可走（2026-08-16 坡地修复：岛内豁免旧网格 MOUNTAIN 误判，只挡水+障碍；与 findPath walk() 同口径） */
  private isWalkableCell(gx: number, gz: number): boolean {
    const c = this.cellChunk(gx, gz);
    if (!c) return false;
    const grid = this.gridCache.get(`${c.cx}_${c.cz}`);
    if (!grid) return false;
    const lx = gx - c.cx * CHUNK, lz = gz - c.cz * CHUNK;
    if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK) return false;
    if (!this.onIslandCircle(gx + 0.5, gz + 0.5)) return false; // 🔴 岛外（视觉海/虚空）不可走
    const s = grid.semantic[lz * CHUNK + lx];
    if (s === 0 || s === 10) return false; // 🔴 岛内只挡水（与 walk() 同步放宽坡地语义）
    if (this.isObstacle(gx, gz)) return false; // 树/矿/建筑占位 → 不可走
    return true;
  }

  /** 🔴 启动水域安全：检查当前位置是否在水里，若是则强制传送到陆地（chunk 加载后延迟调用） */
  private forceWaterSafety(): void {
    if (this.disposed) return;
    const pgx = Math.floor(this.dpx);
    const pgz = Math.floor(this.dpz);
    // 🔴🔴🔴 Layer 0（2026-08-16）：站在 HY3D 视觉岛屿上绝不在水里（与 animate 水域保护同修）
    if (this.hy3dSurfaceHeightAt(this.dpx, this.dpz) != null) return;
    let inWater = false;
    // Layer 1: 语义检测
    const cc = this.cellChunk(pgx, pgz);
    if (cc) {
      const g = this.gridCache.get(`${cc.cx}_${cc.cz}`);
      if (g) {
        const lx = pgx - cc.cx * CHUNK, lz = pgz - cc.cz * CHUNK;
        if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) {
          const sem = g.semantic[lz * CHUNK + lx];
          if (sem === 0 || sem === 10) inWater = true;
        }
      }
    }
    // Layer 2: 高度 fallback
    if (!inWater) {
      const groundY = this.heightAt(this.dpx, this.dpz);
      const wl = this.config?.waterLevel ?? -5;
      const safeLine = Math.max(wl + 0.5, 0); // 🔴🔴 安全线=海平面以上
      if (groundY != null && groundY < safeLine) inWater = true;
    }
    if (inWater) {
      console.warn('[WATER-SAFETY] 启动检测到玩家在水中！强制传送回陆地');
      const land = this.nearestWalkable(pgx, pgz);
      if (land) {
        const newPx = land.gx + 0.5, newPz = land.gz + 0.5;
        // 只设显示插值目标，不覆盖服务端权威 px/pz（避免 animate 抖动）
        this.dpx = newPx; this.dpz = newPz;
        // 🔴 2026-08-16：Y 优先 HY3D 视觉地面（旧网格高度低 4m+ → 瞬移坠崖观感）
        const hyLand = this.hy3dSurfaceHeightAt(newPx, newPz);
        this.dpy = (hyLand != null ? hyLand : (this.heightAt(newPx, newPz) ?? 0)) + 0.35;
        // 同步到服务器
        if (this.ws.isConnected) {
          this.ws.send('/app/ws.input', { seq: Date.now(), move: { dx: 0, dz: 0, run: false } });
        }
        this.hint = '🌊 已自动离开水域';
      }
    }
  }

  /** 🔴 暴露场景内所有对象的世界坐标与地形高度，供 playwright 断言"无对象在水中" */
  private publishWorldDebug(): void {
    if (this.disposed) return;
    this._dbgTick++;
    if ((this._dbgTick & 7) !== 0) return; // 每 8 帧刷新一次（降开销）
    const wl = this.config?.waterLevel ?? -5;
    const sample = (x: number, z: number) => {
      const gx = Math.floor(x), gz = Math.floor(z);
      const cc = this.cellChunk(gx, gz);
      let sem = -1;
      if (cc) {
        const g = this.gridCache.get(`${cc.cx}_${cc.cz}`);
        if (g) {
          const lx = gx - cc.cx * CHUNK, lz = gz - cc.cz * CHUNK;
          if (lx >= 0 && lz >= 0 && lx < CHUNK && lz < CHUNK) sem = g.semantic[lz * CHUNK + lx];
        }
      }
      const h = this.heightAt(x, z);
      const safeLine = Math.max(wl + 0.6, 0); // 🔴🔴 安全线=海平面以上(2026-08-15修复)
      const inWater = (sem === 0 || sem === 10) || (h != null && h < safeLine);
      return { sem, h: h ?? null, inWater };
    };
    const trees = this.treeList.map(t => { const s = sample(t.x, t.z); return { x: +t.x.toFixed(2), z: +t.z.toFixed(2), ...s }; });
    const chars = this.charList.map(c => { const s = sample(c.x, c.z); return { x: +c.x.toFixed(2), z: +c.z.toFixed(2), y: +c.y.toFixed(2), ...s }; });
    const animals = this.animalList.map(a => { const s = sample(a.x, a.z); return { x: +a.x.toFixed(2), z: +a.z.toFixed(2), y: +a.y.toFixed(2), ...s }; });
    const ores = this.oreList.map(o => { const s = sample(o.x, o.z); return { x: +o.x.toFixed(2), z: +o.z.toFixed(2), y: +o.y.toFixed(3), type: o.type, ...s }; });
    const ps = sample(this.dpx, this.dpz);
    const player = { x: +this.dpx.toFixed(2), z: +this.dpz.toFixed(2), y: +this.dpy.toFixed(2), ...ps };
    // 🔴🔴 chunk mesh 诊断（2026-08-15：地形消失排查）—— 深挖"mesh 在 scene 里却不渲染"的根因
    const chunkMeshDiag: { key: string; visible: boolean; worldVisible: boolean; verts: number; indexCount: number; drawCount: number; materialVisible: boolean; materialOpacity: number; materialType: string; renderOrder: number; parentIsScene: boolean; sphereR: number; yRange: [number, number] }[] = [];
    let totalChunkVerts = 0, chunkYMin = Infinity, chunkYMax = -Infinity;
    this.chunkMeshes.forEach((m, k) => {
      const geo = m.geometry;
      const pa = geo.getAttribute('position');
      const idx = geo.getIndex();
      let cMin = Infinity, cMax = -Infinity, vc = 0;
      if (pa) {
        vc = pa.count;
        for (let vi = 0; vi < vc; vi++) { const y = pa.getY(vi); if (y < cMin) cMin = y; if (y > cMax) cMax = y; }
        if (cMin < chunkYMin) chunkYMin = cMin;
        if (cMax > chunkYMax) chunkYMax = cMax;
        totalChunkVerts += vc;
      }
      // worldVisible：沿父链检查 visible
      let wv = m.visible;
      let p = m.parent;
      while (p) { if (!p.visible) { wv = false; break; } p = p.parent; }
      const mat = m.material as THREE.Material;
      chunkMeshDiag.push({
        key: k,
        visible: m.visible,
        worldVisible: wv,
        verts: vc,
        indexCount: idx ? idx.count : 0,
        drawCount: geo.drawRange ? geo.drawRange.count : -1,
        materialVisible: mat ? mat.visible : false,
        materialOpacity: mat ? mat.opacity : -1,
        materialType: mat ? mat.type : 'NONE',
        renderOrder: m.renderOrder,
        parentIsScene: m.parent === this.scene,
        sphereR: geo.boundingSphere ? +geo.boundingSphere.radius.toFixed(1) : -1,
        yRange: [+cMin.toFixed(2), +cMax.toFixed(2)]
      });
    });
    
    (window as any).__worldDebug = {
      navfix: 'L0WATER_PARABOLA_20260816', // 🔴 修复标记：水域Layer0+跳跃抛物线（playwright 验证用）
      waterLevel: wl,
      ready: trees.length > 0 || chars.length > 0 || animals.length > 0 || ores.length > 0,
      player,
      trees, chars, animals, ores,
      counts: {
        trees: trees.length, chars: chars.length, animals: animals.length, ores: ores.length,
        treesInWater: trees.filter(t => t.inWater).length,
        charsInWater: chars.filter(c => c.inWater).length,
        animalsInWater: animals.filter(a => a.inWater).length,
        oresInWater: ores.filter(o => o.inWater).length,
        playerInWater: player.inWater ? 1 : 0
      },
      // 🔴🔴🔴 Y轴坐标诊断（2026-08-16 核弹级修复后）
      yCoord: {
        serverPy: this.py,                    // 服务端原始Y
        displayY: this.dpy,                   // 实际渲染Y（核弹修复后=GROUND_Y）
        hy3dGround: this.hy3dSurfaceHeightAt(this.dpx, this.dpz),
        gridGround: this.heightAt(this.dpx, this.dpz),
        effectiveGround: null, // 下面立即填充
        inJumpWindow: (performance.now() - this._lastJumpTs) < (2 * World3dComponent.JUMP_VEL / World3dComponent.JUMP_GRAVITY) * 1000,
        msSinceJump: ((performance.now() - this._lastJumpTs) | 0)
      },
      // 🔴 地形诊断
      terrain: {
        chunkMeshCount: this.chunkMeshes.size,
        gridCacheSize: this.gridCache.size,
        totalChunkVerts,
        chunkGlobalYRange: [Number(chunkYMin.toFixed(2)), Number(chunkYMax.toFixed(2))],
        samples: chunkMeshDiag.slice(0, 8)
      },
      camera: {
        position: { x: +this.camera.position.x.toFixed(1), y: +this.camera.position.y.toFixed(1), z: +this.camera.position.z.toFixed(1) },
        fov: this.camera.fov, near: this.camera.near, far: this.camera.far
      },
      scene: {
        bg: this.scene.background ? ('#' + (this.scene.background as any).color?.getHexString?.() || String(this.scene.background)) : 'none',
        fog: !!this.scene.fog,
        childCount: this.scene.children.length
      },
      hy3dTerrain: {
        loaded: !!this.hy3dTerrainGroup,
        islands: this.hy3dTerrainGroup ? this.hy3dTerrainGroup.children.length : 0,
        centers: this.islandCenters.length,
        childCount: this.scene.children.length
      },
      waterPlane: !!this.waterPlane,
      waterShader: !!(this.waterUniforms),  // true = 着色器水面已激活
      // 🔴 玩家角色诊断（2026-08-16：排查角色不可见）
      playerMesh: (() => {
        const pm = this.playerMesh;
        if (!pm) return { exists: false };
        const box = new THREE.Box3().setFromObject(pm);
        const size = new THREE.Vector3();
        box.getSize(size);
        let wv = pm.visible, p = pm.parent;
        while (p) { if (!p.visible) { wv = false; break; } p = p.parent; }
        return {
          exists: true, visible: pm.visible, worldVisible: wv,
          childCount: pm.children.length,
          position: { x: +pm.position.x.toFixed(2), y: +pm.position.y.toFixed(2), z: +pm.position.z.toFixed(2) },
          bboxSize: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) },
          renderOrder: pm.renderOrder,
          name: pm.name || '(unnamed)',
          children: pm.children.map(c => ({
            type: c.type, visible: c.visible,
            isMesh: c instanceof THREE.Mesh,
            material: (c instanceof THREE.Mesh && c.material) ? { type: c.material.type, visible: c.material.visible, opacity: (c.material as any).opacity } : null
          }))
        };
      })(),
      // 🔴 小地图点击导航诊断（2026-08-16）
      minimap: {
        miniTarget: this.miniTarget ? { x: +this.miniTarget.x.toFixed(1), z: +this.miniTarget.z.toFixed(1) } : null,
        viewTarget: this.viewTarget ? { x: +this.viewTarget.x.toFixed(1), y: +this.viewTarget.y.toFixed(1), z: +this.viewTarget.z.toFixed(1) } : null,
        pathPoints: this.pathPoints.length,
        moveTarget: this.moveTarget ? { x: +this.moveTarget.x.toFixed(1), z: +this.moveTarget.z.toFixed(1) } : null,
        playerDp: { x: +this.dpx.toFixed(1), z: +this.dpz.toFixed(1) }
      }
    };
  }

  /** 从 (gx,gz) 就近找最近可走格（搜索半径内螺旋） */
  private nearestWalkable(gx: number, gz: number): { gx: number; gz: number } | null {
    for (let r = 1; r <= 6; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.isWalkableCell(gx + dx, gz + dz)) return { gx: gx + dx, gz: gz + dz };
        }
      }
    }
    return null;
  }

  /** 标记某格（含半径内邻格）为障碍（树/矿/建筑占位，A* 需绕行） */
  private markObstacle(cx: number, cz: number, gx: number, gz: number, radius = 1): void {
    const key = `${cx}_${cz}`;
    let set = this.obstacleGrid.get(key);
    if (!set) { set = new Set<string>(); this.obstacleGrid.set(key, set); }
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 0.5) continue; // 近似圆
        set.add(`${gx + dx},${gz + dz}`);
      }
    }
  }

  /** 某格是否为障碍（树/矿/建筑） */
  private isObstacle(gx: number, gz: number): boolean {
    const cx = Math.floor(gx / CHUNK), cz = Math.floor(gz / CHUNK);
    const set = this.obstacleGrid.get(`${cx}_${cz}`);
    if (!set) return false;
    return set.has(`${gx},${gz}`);
  }

  /** 远端玩家：以物理快照刚体为准（创建/更新/删除） */
  private updateRemotePlayersFromPhysics(): void {
    const uids = this.physics.knownUids();
    const seen = new Set<number>();
    for (const uid of uids) {
      if (uid === this.uid) continue;
      seen.add(uid);
      if (!this.remotePlayers.has(uid)) {
        this.addRemotePlayer({ uid, gx: 0, gz: 0, y: 0 });
      }
      const st = this.physics.getState(uid);
      const g = this.remotePlayers.get(uid);
      if (g && st) {
        // 🔴 远端玩家也需 HY3D 表面高度修正（2026-08-16 修复穿模）：
        //   physics st.y 基于旧隐藏网格（y≈-0.2），但视觉上 HY3D 岛屿在 y≈4+
        //   不修正 → 下半身埋进草地
        let ry = st.y;
        const hy3dY = this.hy3dSurfaceHeightAt(st.gx, st.gz);
        if (hy3dY != null && hy3dY > ry) {
          ry = hy3dY; // 脚底贴岛屿表面
        }
        g.position.set(st.gx, ry, st.gz);
        g.rotation.y = st.rot;
      }
    }
    for (const [uid, g] of Array.from(this.remotePlayers.entries())) {
      if (!seen.has(uid)) {
        this.scene.remove(g);
        this.remotePlayers.delete(uid);
      }
    }
  }

  // ================= 地形工具（高度场双线性插值，快照间隙/物体贴地用） =================

  private heightAt(gx: number, gz: number): number | undefined {
    const cx = Math.floor(gx / CHUNK);
    const cz = Math.floor(gz / CHUNK);
    const grid = this.gridCache.get(`${cx}_${cz}`);
    if (!grid) return undefined;
    const fx = gx - cx * CHUNK;
    const fz = gz - cz * CHUNK;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const h = grid.height;
    // 跨边界邻居未加载时钳制到本 chunk 边界（邻居到达后自然校正）
    const x1 = Math.min(x0 + 1, CHUNK);
    const z1 = Math.min(z0 + 1, CHUNK);
    const h00 = h[z0 * N + x0];
    const h10 = h[z0 * N + x1];
    const h01 = h[z1 * N + x0];
    const h11 = h[z1 * N + x1];
    const tx = fx - x0;
    const tz = fz - z0;
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  }

  /** 🔴 HY3D 岛屿表面高度估算（2026-08-16 修复玩家被岛屿遮挡）
   *  当旧 gridCache 地形被隐藏后，玩家可能站在不可见的旧地形高度上，
   *  而 HY3D 岛屿实体模型在更高的 Y 位置 → 玩家被完全遮挡。
   *  此方法返回最近岛屿在该位置的近似表面高度，供 animate() 取 max 使用。
   */
  private hy3dSurfaceHeightAt(wx: number, wz: number): number | null {
    // 🔴🔴🔴 2026-08-16 修复：旧版用 box.max.y（含树/建筑等装饰物）导致"地面"虚高10-20m → 玩家飞天
    //   改用 Raycaster 从上方垂直向下投射，找到 HY3D 地形网格的真实表面交点
    if (!this.hy3dTerrainGroup || !this.islandCenters.length) return null;

    // 快速判断：是否在任何岛屿水平范围内
    let nearIsland = false;
    for (let i = 0; i < this.islandCenters.length; i++) {
      const c = this.islandCenters[i];
      const dx = wx - c.cx;
      const dz = wz - c.cz;
      const r = c.r * 1.2; // 稍微放宽判定范围
      if (dx * dx + dz * dz <= r * r) { nearIsland = true; break; }
    }
    if (!nearIsland) return null;

    // 🔴🔴🔴 2026-08-16 性能修复：岛 mesh 三角量大，逐帧 raycast 在低端 GPU/软渲染下
    //   单帧可达数百毫秒 → 帧率趋零（WASD/跳跃/导航全部"假死"）。
    //   坐标按 0.5 单位分桶 + 300ms TTL 缓存（含 miss 缓存），把 raycast 压到个位数/秒。
    const ck = `${Math.round(wx * 2)},${Math.round(wz * 2)}`;
    const now = performance.now();
    const cch = this._hy3dSurfCache.get(ck);
    if (cch && now - cch.ts < 300) return cch.y;

    // Raycaster 向下投射（从 y=200 足够高）
    if (!this._hy3dRaycaster) {
      this._hy3dRaycaster = new THREE.Raycaster();
      this._hy3dRaycaster.ray.direction.set(0, -1, 0);
    }
    this._hy3dRaycaster.ray.origin.set(wx, 200, wz);

    // 只检测 HY3D 地形组的子对象（避免命中玩家自身、矿石等）
    const hits = this._hy3dRaycaster.intersectObjects(this.hy3dTerrainGroup.children, true);
    const y = hits.length > 0 ? hits[0].point.y : null;
    if (this._hy3dSurfCache.size > 4096) this._hy3dSurfCache.clear(); // 防泄漏
    this._hy3dSurfCache.set(ck, { y, ts: now });
    return y; // 没有命中任何地形 → null
  }

  /** 地面 raycast 缓存（0.5 单位分桶 → {y, ts}，含 null miss） */
  private _hy3dSurfCache = new Map<string, { y: number | null; ts: number }>();

  /** Raycaster 实例（复用，避免每帧重建） */
  private _hy3dRaycaster: THREE.Raycaster | null = null;

  // ================= Chunk 流式 =================

  private streamChunks(): void {
    const pcx = Math.floor(this.px / CHUNK);
    const pcz = Math.floor(this.pz / CHUNK);
    const R = this.viewRadius;
    const unloadR = R + 1;

    // 卸载超视距 chunk
    for (const key of Array.from(this.chunkMeshes.keys())) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > unloadR) {
        this.unloadChunk(cx, cz, key);
      }
    }
    // 请求缺失 chunk（并发 ≤8）
    const desired: string[] = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx}_${cz}`;
        if (!this.gridCache.has(key) && !this.inFlight.has(key) && this.chunkMeshes.has(key) === false) {
          desired.push(key);
        }
      }
    }
    let issued = 0;
    for (const key of desired) {
      if (issued >= 8) break;
      const [cx, cz] = key.split('_').map(Number);
      this.inFlight.add(key);
      issued++;
      this.api.chunk(cx, cz).subscribe({
        next: resp => this.applyChunk(resp),
        error: () => this.inFlight.delete(key),
        complete: () => this.inFlight.delete(key)
      });
    }
  }

  private applyChunk(resp: ChunkResp): void {
    if (this.disposed) return;
    const key = `${resp.cx}_${resp.cz}`;
    this.obstacleGrid.delete(key); // 重置该 chunk 障碍（防重复加载叠加）
    // 语义/高度缓存
    this.gridCache.set(key, {
      cx: resp.cx, cz: resp.cz,
      height: Float32Array.from(resp.height),
      semantic: Uint8Array.from(resp.semantic)
    });
    // 网格
    const mesh = this.buildChunkMesh(resp);
    this.chunkMeshes.set(key, mesh);
    this.scene.add(mesh);
    // 树木（TREE 语义 → 3D 树模型）
    this.spawnTrees(resp);
    // M5：尝试在出生区块附近放置男孩/女孩（地形与模型均就绪后落位，仅一次）
    this.tryPlaceCharacters();
    // 矿石（ORE_GOLD/ORE_IRON/ORE_COAL → 3D 矿石模型）
    this.spawnOres(resp);
    // HY3D 野生生物：地形与模型均就绪后随机散布（自带防重入 + 重试）
    this.trySpawnAnimals();
    // 对象
    if (resp.objects) {
      for (const o of resp.objects) this.addObject(o);
    }
  }

  private unloadChunk(cx: number, cz: number, key: string): void {
    const mesh = this.chunkMeshes.get(key);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.chunkMeshes.delete(key);
    }
    this.gridCache.delete(key);
    this.obstacleGrid.delete(key); // 卸载障碍占位
    // 卸载该 chunk 的树模型
    const trees = this.treeMeshes.get(key);
    if (trees) {
      for (const t of trees) {
        this.scene.remove(t);
        if (t.userData['shared']) continue; // 共享 GLB 模板几何/材质，仅移除不 dispose
        t.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
        });
      }
      this.treeMeshes.delete(key);
    }
    // 卸载该 chunk 的矿石模型
    const ores = this.oreMeshes.get(key);
    if (ores) {
      for (const o of ores) {
        this.scene.remove(o);
        o.traverse(obj => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
        });
      }
      this.oreMeshes.delete(key);
    }
    // 卸载该 chunk 内对象网格（重新进入时会随 chunk 重新拉取）
    for (const [id, o] of Array.from(this.objectMeshes.entries())) {
      const obj = this.worldObjects.get(id);
      if (obj && Math.floor(obj.gx / CHUNK) === cx && Math.floor(obj.gz / CHUNK) === cz) {
        this.scene.remove(o);
        this.objectMeshes.delete(id);
      }
    }
  }

  /** 🔴🔴 创建统一着色器水面（2026-08-16 重写）：
   *   - Gerstner 多向波浪（比正弦波真实：尖峰宽谷 + 水平位移）
   *   - 颜色渐变：岸边热带青(#30B4FF) → 远海深蓝(#0A3D62)，与 HY3D 岛屿自带水面融合
   *   - 岸边白沫（距离衰减 + 波峰泡沫）
   *   - 太阳镜面高光（Blinn-Phong）
   *   - 半透明 + 双面渲染
   */
  private createWaterPlane(): void {
    const wl = this.config?.waterLevel ?? -5;
    const size = 3200;
    // 高细分以支持 GPU 顶点波浪位移（128×128 = 16384 顶点，GPU 完全无压力）
    const geo = new THREE.PlaneGeometry(size, size, 128, 128);
    geo.rotateX(-Math.PI / 2);

    // ===== 着色器源码 =====
    const vertexShader = `
      uniform float uTime;
      uniform vec3  uSunDir;
      // Gerstner 波参数：方向(xy归一化)、波长(越小波越密)、陡度(0~1)、振幅
      uniform vec4  uWaveA; // direction.x, direction.y, steepness, wavelength
      uniform vec4  uWaveB;
      uniform vec4  uWaveC;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vFoamFactor;  // 波峰泡沫因子
      varying float vDistToShore; // 到岛屿中心的近似距离

      vec3 gerstner(vec4 wave, vec3 p) {
        float k = 2.0 * 3.14159 / wave.z;           // 波数
        float c = sqrt(9.8 / k);                     // 相速度（深水近似）
        vec2  d = normalize(wave.xy);                // 方向
        float f = k * (dot(d, p.xz) - c * uTime);   // 相位
        float a = wave.w * wave.z * 0.08;            // 振幅 = 陡度 × 波长 × 缩放（原0.15太陡→0.08平缓）
        return vec3(
          d.x * (a * cos(f)),       // x 水平位移
          a * sin(f),                 // y 垂直位移
          d.y * (a * cos(f))         // z 水平位移
        );
      }

      void main() {
        vec3 p = position;

        // 三层 Gerstner 波叠加（不同方向/波长/陡度 → 真实海面）
        vec3 g1 = gerstner(uWaveA, p);
        vec3 g2 = gerstner(uWaveB, p);
        vec3 g3 = gerstner(uWaveC, p);
        p += g1 + g2 * 0.6 + g3 * 0.35;

        // 用位移梯度算法线（有限差分）
        float eps = 0.5;
        vec3 px = position + vec3(eps, 0.0, 0.0);
        vec3 pz = position + vec3(0.0, 0.0, eps);
        px += gerstner(uWaveA, px) + gerstner(uWaveB, px) * 0.6 + gerstner(uWaveC, px) * 0.35;
        pz += gerstner(uWaveA, pz) + gerstner(uWaveB, pz) * 0.6 + gerstner(uWaveC, pz) * 0.35;
        vNormal = normalize(cross(pz - p, px - p));

        vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;

        // 泡沫因子：波峰处 y 位移大 → 白沫多
        vFoamFactor = smoothstep(0.12, 0.55, (g1.y + g2.y + g3.y) / 1.95);

        // 近似到中心距离（用于岸边颜色过渡）
        vDistToShore = length(position.xz) * 0.0018;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3  uSunDir;
      uniform vec3  uCameraPos;
      uniform vec3  uShallowColor;   // 岸边浅水色（与 HY3D 岛屿水面融合）
      uniform vec3  uDeepColor;      // 远海深色
      uniform vec3  uFoamColor;      // 泡沫白
      uniform float uWaterLevel;

      varying vec3  vWorldPos;
      varying vec3  vNormal;
      varying float vFoamFactor;
      varying float vDistToShore;

      void main() {
        vec3 viewDir = normalize(uCameraPos - vWorldPos);
        vec3 normal  = normalize(vNormal);

        // ---- 颜色混合：按距离/深度渐变（近岸青 → 远海蓝）----
        float depthBlend = smoothstep(0.08, 0.55, vDistToShore);
        vec3 waterColor = mix(uShallowColor, uDeepColor, depthBlend);

        // Fresnel 效应（视角越低反射越多）— 柔化参数
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);  // 原3.0→4.0更柔和
        waterColor = mix(waterColor, vec3(0.65, 0.82, 0.95), fresnel * 0.25);  // 原0.35→0.25降低反射强度

        // ---- 太阳高光（Blinn-Phong）---- 柔化高光
        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 128.0);  // 原256→128更分散
        waterColor += vec3(1.0, 0.95, 0.82) * spec * 0.5;  // 原0.85→0.5降低高光强度

        // ---- 岸边泡沫（波峰 + 近岸）---- 减少泡沫量
        float shoreFoam = (1.0 - depthBlend) * 0.25;     // 原0.45→0.25减少基础泡沫
        float peakFoam  = vFoamFactor * 0.30;             // 原0.55→0.30减少波峰泡沫
        float foam = clamp(shoreFoam + peakFoam, 0.0, 1.0);
        foam *= smoothstep(0.0, 0.15, foam);              // 软化边缘
        waterColor = mix(waterColor, uFoamColor, foam * 0.7);

        // ---- 半透明 ----
        float alpha = 0.78 - depthBlend * 0.18;            // 近岸更透明（能看到水下过渡）
        alpha = clamp(alpha, 0.55, 0.90);

        gl_FragColor = vec4(waterColor, alpha);
      }
    `;

    this.waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.35, 0.7).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
      uShallowColor: { value: new THREE.Color(0x30B4FF) },  // 热带青（匹配 HY3D 岛屿水面）
      uDeepColor: { value: new THREE.Color(0x0A3D62) },     // 深海蓝
      uFoamColor: { value: new THREE.Color(0xE8F4FC) },     // 泡沫白
      uWaterLevel: { value: wl },
      // Gerstner 波：方向(x,y), 陡度, 波长
      // 🔴🔴 2026-08-16 优化：原参数频率太快、波太陡
      //   调整策略：增大波长(降低频率) + 降低陡度(更平缓) + 减小时间系数(慢速)
      //   WaveA 主浪：长波长40m（原18）+ 低陡度0.12（原0.25）→ 宽缓涌浪
      //   WaveB 二次浪：波长22m（原10）+ 陡度0.10（原0.20）→ 中等交叉浪
      //   WaveC 涟漪：波长12m（原5.5）+ 陡度0.06（原0.15）→ 细微纹理
      uWaveA: { value: new THREE.Vector4( 1.0,  0.2, 0.12, 40.0) },  // 主浪（宽缓长浪）
      uWaveB: { value: new THREE.Vector4(-0.6,  0.8, 0.10, 22.0) },  // 二次浪（交叉中浪）
      uWaveC: { value: new THREE.Vector4( 0.3, -1.0, 0.06, 12.0) },  // 涟漪（细微纹理）
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.waterUniforms,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.waterPlane = new THREE.Mesh(geo, mat);
    this.waterPlane.position.y = wl - 0.08;  // 微低于水位线避免 z-fighting
    this.waterPlane.name = 'ocean_surface_shader';
    this.waterPlane.renderOrder = -999;
    this.scene.add(this.waterPlane);
  }

  /** 更新水面着色器 uniform（时间 + 相机位置），波浪由 GPU Gerstner 算法驱动 */
  private updateWaterPlane(now: number): void {
    if (!this.waterPlane || !this.waterUniforms) return;
    (this.waterUniforms['uTime'] as { value: number }).value = now * 0.00025;  // 🔴 波浪时间（原0.0008太快→0.00025平缓）
    (this.waterUniforms['uCameraPos'] as { value: THREE.Vector3 }).value.copy(this.camera.position);
  }

  private buildChunkMesh(resp: ChunkResp): THREE.Mesh {
    const h = resp.height;
    const sem = resp.semantic;
    const waterLevel = this.config?.waterLevel ?? -5;
    const positions = new Float32Array(N * N * 3);
    const colors = new Float32Array(N * N * 3);
    // 计算本 chunk 高度范围，用于归一化高度变化着色
    let hMin = Infinity, hMax = -Infinity;
    for (let i = 0; i < h.length; i++) { if (h[i] < hMin) hMin = h[i]; if (h[i] > hMax) hMax = h[i]; }
    const hRange = Math.max(hMax - hMin, 1); // 防除零
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const i = lz * N + lx;
        positions[i * 3] = resp.cx * CHUNK + lx;
        positions[i * 3 + 2] = resp.cz * CHUNK + lz;
        // M3 修复：WATER 语义格（0）的 Y 钳制到海平面
        // RIVER（10）：略高于水面形成可见河道，颜色深蓝区别于海洋亮青
        const cell = sem[Math.min(lz, CHUNK - 1) * CHUNK + Math.min(lx, CHUNK - 1)];
        let cellY = (cell === 0) ? waterLevel : h[i];
        if (cell === 10) { cellY = Math.min(cellY, waterLevel + 0.3); } // 河道微高出水面，可见
        // 🔴🔴 NaN/Infinity 防护：服务端高度数据异常时钳制到 waterLevel，避免黑色三角洞
        if (!Number.isFinite(cellY)) { cellY = waterLevel; }
        positions[i * 3 + 1] = cellY;
        const c = CELL_COLORS[cell] ?? CELL_COLORS[2];
        // M5 高度变化着色：谷暗峰亮（±12% 亮度），增加地形层次感
        const hNorm = (h[i] - hMin) / hRange;       // 0~1
        const hBright = 0.88 + hNorm * 0.24;         // 0.88~1.12
        let finalBright = hBright;
        if (cell === 10) {
          // 河流格：流动波光效果（随位置变化模拟水纹）
          finalBright = 0.92 + 0.12 * Math.sin((lx * 5.1 + lz * 8.3) * 0.7);
        }
        colors[i * 3] = (((c >> 16) & 255) / 255) * finalBright;
        colors[i * 3 + 1] = (((c >> 8) & 255) / 255) * finalBright;
        colors[i * 3 + 2] = ((c & 255) / 255) * finalBright;
      }
    }

    // 🔴🔴 水岸线平滑：对水陆边界顶点做一次邻域平均，消除锯齿阶梯
    // 仅对 WATER(0)/RIVER(10) 语义格及其陆地邻居做平滑
    this.smoothWaterEdges(positions, sem, waterLevel);

    // 🔴🔴 水体三角形过滤：纯水域三角（3顶点都在语义0格内）不生成 → 消除蓝色碎片根因
    // 混合三角（水+陆边界）保留 → 维持海岸线轮廓。水面由独立 waterPlane 渲染。
    const isWaterCell = (vx: number, vz: number): boolean => {
      const cx = Math.min(Math.max(vx, 0), CHUNK - 1);
      const cz = Math.min(Math.max(vz, 0), CHUNK - 1);
      return sem[cz * CHUNK + cx] === 0;
    };

    const indices: number[] = [];
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const a = lz * N + lx;
        const b = a + 1;
        const cIdx = (lz + 1) * N + lx;
        const d = cIdx + 1;

        // 三角形 1: (a, cIdx, b) — 跳过纯水域三角
        if (this.isValidTriangle(positions, a, cIdx, b, waterLevel)) {
          if (!(isWaterCell(lx, lz) && isWaterCell(lx, lz + 1) && isWaterCell(lx + 1, lz))) {
            indices.push(a, cIdx, b);
          }
        }
        // 三角形 2: (cIdx, d, b) — 跳过纯水域三角
        if (this.isValidTriangle(positions, cIdx, d, b, waterLevel)) {
          if (!(isWaterCell(lx, lz + 1) && isWaterCell(lx + 1, lz + 1) && isWaterCell(lx + 1, lz))) {
            indices.push(cIdx, d, b);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `chunk_${resp.cx}_${resp.cz}`;
    mesh.frustumCulled = false;
    // 🔴🔴 隐藏旧程序化网格的视觉渲染：HY3D 岛屿层已替代地形视觉
    // chunk 网格仍保留在场景中供 heightAt()/物理查询，但不再渲染
    mesh.visible = false;
    return mesh;
  }

  /** 严格三角形有效性检查：过滤退化/异常三角形（修复黑色三角洞根因） */
  private isValidTriangle(pos: Float32Array, i1: number, i2: number, i3: number, wl: number): boolean {
    const x1 = pos[i1 * 3], y1 = pos[i1 * 3 + 1], z1 = pos[i1 * 3 + 2];
    const x2 = pos[i2 * 3], y2 = pos[i2 * 3 + 1], z2 = pos[i2 * 3 + 2];
    const x3 = pos[i3 * 3], y3 = pos[i3 * 3 + 1], z3 = pos[i3 * 3 + 2];

    // 1. 每个顶点必须是有限数
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(z1)) return false;
    if (!Number.isFinite(x2) || !Number.isFinite(y2) || !Number.isFinite(z2)) return false;
    if (!Number.isFinite(x3) || !Number.isFinite(y3) || !Number.isFinite(z3)) return false;

    // 2. Y 值跨度不能极端（正常地形 Y 范围约 -10~30，跨度 < 50）
    const yMax = Math.max(y1, y2, y3);
    const yMin = Math.min(y1, y2, y3);
    if (yMax - yMin > 50) return false;

    // 3. 边长不能过大（相邻顶点间距应 < 20 单位）
    const d12 = (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2) + (z1-z2)*(z1-z2);
    const d23 = (x2-x3)*(x2-x3) + (y2-y3)*(y2-y3) + (z2-z3)*(z2-z3);
    const d31 = (x3-x1)*(x3-x1) + (y3-y1)*(y3-y1) + (z3-z1)*(z3-z1);
    const maxEdgeSq = 20 * 20 * 4; // 允许对角线长度
    if (d12 > maxEdgeSq || d23 > maxEdgeSq || d31 > maxEdgeSq) return false;

    // 4. 面积不能接近零（叉积检测共线/退化）
    const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1;
    const vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
    const crossX = uy * vz - uz * vy;
    const crossY = uz * ux - ux * vz;
    const crossZ = ux * vy - uy * ux;
    const area2 = crossX * crossX + crossY * crossY + crossZ * crossZ;
    if (area2 < 0.001) return false; // 面积 ≈ 0

    return true;
  }

  /** 水岸线平滑：对水陆边界顶点做邻域平均，减少锯齿 */
  private smoothWaterEdges(positions: Float32Array, sem: number[], waterLevel: number): void {
    // 创建语义快查（N×N）：标记每个顶点是否水域
    const isWater = new Uint8Array(N * N);
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = sem[lz * CHUNK + lx];
        if (cell === 0 || cell === 10) {
          isWater[lz * N + lx] = 1;
          isWater[(lz + 1) * N + lx] = 1;     // 边界行也标记
          isWater[lz * N + (lx + 1)] = 1;       // 边界列也标记
        }
      }
    }
    // 对水陆边界上的陆地顶点：如果相邻有水域顶点，则将 Y 向 waterLevel 平滑
    const smoothed = new Set<number>();
    for (let lz = 1; lz < N - 1; lz++) {
      for (let lx = 1; lx < N - 1; lx++) {
        const i = lz * N + lx;
        const y = positions[i * 3 + 1];
        // 只处理陆地顶点（高于水面）且靠近水域的
        if (y <= waterLevel + 0.5) continue;
        // 检查 4-邻域是否有水域
        let hasWaterNeighbor = false;
        let waterCount = 0;
        const nIdx = [
          (lz - 1) * N + lx, (lz + 1) * N + lx,
          lz * N + (lx - 1), lz * N + (lx + 1)
        ];
        for (const ni of nIdx) {
          if (positions[ni * 3 + 1] <= waterLevel + 0.8) {
            hasWaterNeighbor = true;
            waterCount++;
          }
        }
        if (hasWaterNeighbor && !smoothed.has(i)) {
          smoothed.add(i);
          // 将该顶点 Y 向 waterLevel 拉近 30%（温和过渡，不破坏地形）
          const blend = 0.30 * (waterCount / 4); // 邻域水域越多，平滑越强
          positions[i * 3 + 1] = y + (waterLevel - y) * blend;
        }
      }
    }
  }

  // ================= 树木渲染（TREE 语义 → 3D 树） =================

  /** 按 chunk 语义中的 TREE 格生成 3D 树模型（树干 + 树冠），带确定性随机旋转/缩放 */
  /** HY3D 动物散布：7 只模型全部就绪 + 地形就绪后，随机撒到已加载的陆地 chunk（仅一次） */
  private trySpawnAnimals(): void {
    if (this.animalsSpawned || this.disposed) return;
    if (Object.keys(this.animalModels).length < 7) return;   // 等 7 只全部就绪
    if (this.gridCache.size === 0) { setTimeout(() => this.trySpawnAnimals(), 600); return; }
    this.spawnAnimals();
  }

  private spawnAnimals(): void {
    this.animalsSpawned = true;
    if (!this.wildlifeGroup) {
      this.wildlifeGroup = new THREE.Group();
      this.scene.add(this.wildlifeGroup);
    }
    const waterLevel = this.config?.waterLevel ?? -5;
    const order = ['cat', 'dog', 'chicken', 'duck', 'cow', 'sheep', 'fish'];
    for (const key of order) {
      const tpl = this.animalModels[key];
      if (!tpl) continue;
      let placed = false;
      for (let tries = 0; tries < 30 && !placed; tries++) {
        const keys = Array.from(this.gridCache.keys());
        const k = keys[Math.floor(Math.random() * keys.length)];
        const grid = this.gridCache.get(k)!;
        const lx = Math.floor(Math.random() * CHUNK);
        const lz = Math.floor(Math.random() * CHUNK);
        const sem = grid.semantic[lz * CHUNK + lx];
        const gx = grid.cx * CHUNK + lx + 0.5;
        const gz = grid.cz * CHUNK + lz + 0.5;
        if (key === 'fish') {
          if (sem !== 0 && sem !== 10) continue;            // 鱼只落水
          const inst = tpl.clone(true);
          inst.position.set(gx, waterLevel + 0.15, gz);
          inst.rotation.y = Math.random() * Math.PI * 2;
          this.wildlifeGroup.add(inst);
          placed = true;
        } else {
          if (sem === 0 || sem === 10) continue;            // 陆地动物避开水
          const rawY = grid.height[lz * N + lx];
          const y = (rawY != null && !isNaN(rawY)) ? rawY : (this.heightAt(gx, gz) ?? 0);
          // 🔴🔴 水域防护（2026-08-15 修复）：陆地动物必须在海平面以上
          const safeY = Math.max(waterLevel + 0.6, 0);
          if (y < safeY) continue;
          const inst = tpl.clone(true);
          inst.position.set(gx, y, gz);
          inst.rotation.y = Math.random() * Math.PI * 2;
          this.wildlifeGroup.add(inst);
          this.animalList.push({ x: gx, y, z: gz });
          placed = true;
        }
      }
    }
    console.log('[world3d] 7 只动物已随机散布到地图');
  }

  private spawnTrees(resp: ChunkResp): void {
    const key = `${resp.cx}_${resp.cz}`;
    const trees: THREE.Group[] = [];
    const waterLevel = this.config?.waterLevel ?? -5;
    const h = resp.height;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = resp.semantic[lz * CHUNK + lx];
        if (cell !== 4) continue; // 4 = TREE
        const gx = resp.cx * CHUNK + lx;
        const gz = resp.cz * CHUNK + lz;
        // 🔴🔴 岛屿范围防护（2026-08-16 修复）：旧数学网格在开放水域（岛外）会伪标 TREE 语义
        // 必须限制树只生成在岛屿半径内，否则树会漂浮在水面上
        if (!this.onIslandCircle(gx + 0.5, gz + 0.5)) continue;
        // 直接从高度数组取值（避免 heightAt 插值/缓存未命中返回 undefined → y=0 漂浮）
        const rawY = h[lz * N + lx];
        // 🔴 用插值地表高度判定（与调试探针一致）：水边插值后树基会低于水面
        const surf = this.heightAt(gx + 0.5, gz + 0.5);
        const y = (surf != null && !isNaN(surf)) ? surf : ((rawY != null && !isNaN(rawY)) ? rawY : (waterLevel + 0.5));
        // 🔴🔴 水域防护（2026-08-15 截图验证修复）：树根必须在海平面(0)以上
        // 之前用 waterLevel+0.6(-4.4) 太宽 → 负高度格(-3~-0.3)全漏过 → 树站在水里
        const safeY = Math.max(waterLevel + 0.6, 0); // 安全线 = 海平面以上
        if (y < safeY) continue; // 跳过水下/水边低洼格
        // 🔴🔴🔴 HY3D 地形存在性检查（2026-08-16 终极修复）：
        //   旧网格 height>=0 不代表真正有陆地（旧网格与HY3D视觉地形不一致）
        //   hy3dSurfaceHeightAt 做 raycast：null=该位置无HY3D地形=水面→不放树
        const hy3dY = this.hy3dSurfaceHeightAt(gx + 0.5, gz + 0.5);
        if (hy3dY === null) continue;
        const finalY = y;
        const tree = this.makeTree();
        tree.position.set(gx + 0.5, finalY, gz + 0.5);
        tree.rotation.y = (((gx * 13 + gz * 7) % 360) * Math.PI) / 180;
        const s = 0.85 + (((gx * 31 + gz * 17) % 30) / 100);
        tree.scale.setScalar(s);
        this.scene.add(tree);
        trees.push(tree);
        this.treeList.push({ x: gx + 0.5, z: gz + 0.5 });
        this.markObstacle(resp.cx, resp.cz, gx, gz, 1); // TREE 占位 → 寻路避障
      }
    }
    this.treeMeshes.set(key, trees);
  }

  /** 单棵低模树（M5：优先用 HY3D 真实树 GLB，未加载完成回退到程序化树） */
  private makeTree(): THREE.Group {
    if (this.treeModel) {
      const t = this.treeModel.clone(true);
      t.userData['shared'] = true; // 共享模板几何/材质，卸载时仅移除不 dispose
      return t;
    }
    const g = new THREE.Group();
    // 树干（略粗，带锥度）
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.2, 0.85, 7),
      new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.95 })
    );
    trunk.position.y = 0.42;
    // 三层递减圆锥树冠（松树风格），每层颜色略有变化
    const layers = [
      { r: 0.85, h: 1.4, y: 1.35, c: 0x2D8B2E },  // 底层大
      { r: 0.65, h: 1.1, y: 2.05, c: 0x349A35 },  // 中层
      { r: 0.45, h: 0.8,  y: 2.6, c: 0x3CAA3D },   // 顶层小
    ];
    for (const l of layers) {
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(l.r, l.h, 8),
        new THREE.MeshStandardMaterial({ color: l.c, roughness: 0.85 })
      );
      foliage.position.y = l.y;
      g.add(foliage);
    }
    g.add(trunk);
    return g;
  }

  // ================= HY3D 地图地形（实例化为 22 岛视觉层） =================

  /** 复算 22 岛中心 + 半径（与后端 TerrainService.buildIslands 确定性一致）
   *  用 BigInt 精确复刻 Java long 位运算，避免前端浮点/移位差异导致岛屿错位 */
  private computeIslandCenters(): void {
    const seedText = this.config?.seed || 'dudu2019';
    const MASK = 0xFFFFFFFFFFFFFFFFn;
    let base = 1125899906842597n;
    for (let i = 0; i < seedText.length; i++) {
      base = (31n * base + BigInt(seedText.charCodeAt(i))) & MASK;
    }
    const SALT_ISLAND = 0x1B873593n;
    const scatterHash = (gx: number, gz: number, salt: bigint): number => {
      let h = (base ^ salt) & MASK;
      h = (h * 6364136223846793005n + BigInt(gx) * 0x9E3779B97F4A7C15n) & MASK;
      h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
      h = (h ^ (h >> 16n)) & MASK;
      h = (h * 0x94D049BB133111EBn) & MASK;
      h = h ^ (h >> 31n);
      // Java: gz 为 int，gz<<32 因 int 移位掩码(0x1F) ≡ gz；long 提升后 XOR
      h = (h + ((BigInt(gz) * 0x9E3779B97F4A7C15n) ^ BigInt(gz))) & MASK;
      h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
      h = h ^ (h >> 16n);
      const low32 = h & 0xFFFFFFFFn;
      return Number(low32) / 4294967296.0;
    };
    const ISLAND_COUNT = 22, SPREAD = 2600, BASE_R = 115, R_VAR = 75;
    this.islandCenters = [];
    for (let i = 0; i < ISLAND_COUNT; i++) {
      const hx = scatterHash(i * 3 + 1, 777, SALT_ISLAND);
      const hz = scatterHash(i * 3 + 2, 888, SALT_ISLAND);
      const hr = scatterHash(i * 3 + 3, 999, SALT_ISLAND);
      this.islandCenters.push({
        cx: (hx - 0.5) * SPREAD,
        cz: (hz - 0.5) * SPREAD,
        r: BASE_R + hr * R_VAR,
      });
    }
  }

  /** 加载 HY3D 岛屿变体模板（4 个变体 GLB），不立即实例化
   *  实例化由 updateHy3dIslandLOD() 按玩家距离动态管理（100m 内加载，130m 外卸载）
   *  保留程序化网格用于物理/碰撞/采矿/钓鱼逻辑；HY3D 仅作视觉覆盖 */
  private loadHy3dTerrain(): void {
    if (this._hy3dLoaded) return;
    this.computeIslandCenters();
    const variantPaths = [
      'assets/3d_build/terrain-hy3d/hy3_island_draco.glb',
      'assets/3d_build/terrain-hy3d/hy3_island_lake_draco.glb',
      'assets/3d_build/terrain-hy3d/hy3_island_peninsula_draco.glb',
      'assets/3d_build/terrain-hy3d/hy3_island_mountain_draco.glb',
    ];
    Promise.all(variantPaths.map(p => this.assets.loadModel(p)))
      .then((templates: (THREE.Group | null)[]) => {
        const valid = templates.filter((t): t is THREE.Group => !!t);
        if (valid.length === 0 || this.disposed) return;
        // 预计算每个模板的水平半径与高度范围
        this._hy3dMeta = valid.map(tpl => {
          const box = new THREE.Box3().setFromObject(tpl);
          const sx = box.max.x - box.min.x;
          const sz = box.max.z - box.min.z;
          const sy = box.max.y - box.min.y;
          return { radius: Math.max(sx, sz) / 2, baseY: box.min.y, height: sy };
        });
        this._hy3dTemplates = valid;
        this._hy3dLoaded = true;
        // 创建空 Group（后续动态添加岛屿实例）
        const group = new THREE.Group();
        group.name = 'hy3d_terrain';
        this.hy3dTerrainGroup = group;
        this.scene.add(group);
        // 立即执行一次 LOD 初始化（玩家出生位置附近的岛屿）
        this.updateHy3dIslandLOD();
        const dbg = (window as any).__worldDebug || ((window as any).__worldDebug = {});
        dbg.hy3dIslands = this.islandCenters.length;
        dbg.hy3dVariants = valid.length;
        dbg.hy3dLOD = 'radius=' + this.ISLAND_LOD_RADIUS + 'm';
      })
      .catch(err => console.warn('[hy3d-terrain] 加载失败', err));
  }

  /** 🔴🔴 动态岛屿 LOD：根据玩家位置增删岛屿实例（100m 内显示，130m 外隐藏）
   *  在 animate() 中以 ~500ms 节流调用，避免每帧开销 */
  private updateHy3dIslandLOD(): void {
    if (!this._hy3dLoaded || !this.hy3dTerrainGroup || !this.islandCenters.length) return;
    const px = this.dpx, pz = this.dpz;
    const loadR2 = this.ISLAND_LOD_RADIUS * this.ISLAND_LOD_RADIUS;
    const unloadR2 = this.ISLAND_UNLOAD_BUFFER * this.ISLAND_UNLOAD_BUFFER;

    for (let i = 0; i < this.islandCenters.length; i++) {
      const c = this.islandCenters[i];
      const dx = c.cx - px, dz = c.cz - pz;
      const dist2 = dx * dx + dz * dz;
      const isActive = this._activeIslands.has(i);

      if (dist2 <= loadR2 && !isActive) {
        // 进入加载范围 → 实例化并添加到场景
        const idx = i % this._hy3dTemplates.length;
        const tpl = this._hy3dTemplates[idx];
        const m = this._hy3dMeta[idx];
        const inst = tpl.clone(true);
        const horizScale = (c.r * 1.1) / m.radius;
        const vertScale = horizScale * 0.35;
        inst.scale.set(horizScale, vertScale, horizScale);
        const groundH = this.heightAt(c.cx, c.cz) ?? 0;
        inst.position.set(c.cx, groundH - m.baseY * vertScale, c.cz);
        inst.rotation.y = (i * 2.39996) % (Math.PI * 2);
        inst.traverse(o => { o.userData['shared'] = true; });
        inst.userData['islandIdx'] = i; // 标记索引，方便后续查找移除
        // 🔴🔴 隐藏 HY3D 岛屿模型自带的水面 mesh（避免与着色器水面双层叠加 + 颜色冲突）
        this.hideHy3dWaterMeshes(inst);
        this.hy3dTerrainGroup.add(inst);
        this._activeIslands.add(i);
      } else if (dist2 > unloadR2 && isActive) {
        // 超出卸载缓冲 → 从场景移除
        const children = this.hy3dTerrainGroup.children;
        for (let j = children.length - 1; j >= 0; j--) {
          if ((children[j] as any).userData['islandIdx'] === i) {
            this.hy3dTerrainGroup.remove(children[j]);
            break;
          }
        }
        this._activeIslands.delete(i);
      }
    }
  }

  /** 🔴 隐藏 HY3D 岛屿 GLB 模型自带的水面 mesh（避免与着色器水面双层叠加 + 颜色冲突）
   *  检测策略（按优先级）：
   *  1. mesh 名称含 water/ocean/sea/lake/river/oceano/mar/agua
   *  2. 材料高透明(>0.35) + 蓝色主色(B通道最高)
   *  3. 大平面几何(顶点数>6 且 AABB 扁平 ratio<0.08)
   */
  private hideHy3dWaterMeshes(inst: THREE.Group): void {
    let hidden = 0;
    inst.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const name = (o.name || '').toLowerCase();
      // 策略 1：名称匹配
      if (/water|ocean|sea|lake|river|oceano|mar|agua|sui/.test(name)) {
        o.visible = false; hidden++; return;
      }
      // 策略 2：材料特征
      const mat = o.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      if (mat && 'opacity' in mat && mat.opacity > 0.35) {
        const c = new THREE.Color();
        if ('color' in mat && mat.color) c.copy(mat.color as THREE.Color);
        // 蓝色判定：B 通道最大且饱和度够
        const maxCh = Math.max(c.r, c.g, c.b);
        if (c.b === maxCh && c.b > 0.25 && (c.b - Math.min(c.r, c.g)) > 0.1) {
          o.visible = false; hidden++; return;
        }
      }
      // 策略 3：大扁平平面（排除角色/树等立体模型）
      const geo = o.geometry;
      if (geo && !geo.index && geo.attributes.position) {
        const pos = geo.attributes.position;
        if (pos.count > 9) { // 至少 3 个三角以上
          const bb = new THREE.Box3().setFromBufferAttribute(pos);
          const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
          const maxDim = Math.max(sx, sy, sz);
          if (maxDim > 0 && sy / maxDim < 0.08) {
            o.visible = false; hidden++;
          }
        }
      }
    });
    if (hidden > 0) console.log(`[water] 隐藏 HY3D 岛屿自带水面 mesh ${hidden} 个`);
  }

  // ================= M5 角色/树 GLB 模板（HY3D 生成） =================

  /** 预加载三个低模 GLB 模板（男孩/女孩/树），归一化到统一高度后缓存复用 */
  private preloadModels(): void {
    const base = 'assets/models/';
    const norm = (g: THREE.Group | null, h: number) => (g ? this.normalizeModel(g, h) : null);
    // 注意：boy/girl 不再经过 buildRiggedModel 骨骼拆分（拆分导致模型破损变形），
    // 直接用原始 GLB 归一化，保留完整外观和材质/贴图
    this.assets.loadModel(base + 'tree.glb').then(g => {
      this.treeModel = norm(g, 5.0); // 🔴 2026-08-16 修复：原 3.2 太矮显"扁"，提高到 5.0 让树有正常比例
      if (!this.treeModel) console.warn('[world3d] 树模型加载失败，使用程序化树回退');
      else this.tryPlaceCharacters(); // 树就绪后尝试补放角色（若角色已就绪）
    });
    this.assets.loadModel(base + 'boy.glb').then(g => {
      this.boyModel = norm(g, 2.0);
      this.tryPlaceCharacters();
    });
    this.assets.loadModel(base + 'girl.glb').then(g => {
      this.girlModel = norm(g, 2.0);
      this.tryPlaceCharacters();
    });
    // HY3D 7 只动物（draco 压缩）：归一化到合理高度后缓存，供 spawnAnimals 随机散布
    const wildList: { key: string; file: string; h: number }[] = [
      { key: 'cat',     file: 'animals/hy3_cat_draco.glb',     h: 1.4 },
      { key: 'dog',     file: 'animals/hy3_dog_draco.glb',     h: 1.7 },
      { key: 'chicken', file: 'animals/hy3_chicken_draco.glb', h: 1.1 },
      { key: 'duck',    file: 'animals/hy3_duck_draco.glb',    h: 1.1 },
      { key: 'cow',     file: 'animals/hy3_cow_draco.glb',     h: 2.6 },
      { key: 'sheep',   file: 'animals/hy3_sheep_draco.glb',   h: 1.8 },
      { key: 'fish',    file: 'animals/hy3_fish_draco.glb',    h: 0.8 },
    ];
    for (const w of wildList) {
      this.assets.loadModel(base + w.file).then(g => {
        const m = norm(g, w.h);
        if (m) { this.animalModels[w.key] = m; this.trySpawnAnimals(); }
        else console.warn('[world3d] 动物模型加载失败: ' + w.key);
      }).catch(() => console.warn('[world3d] 动物模型加载异常: ' + w.key));
    }
    // 🔴🔴 HY3D 矿产模型（draco 压缩）：替代程序化几何体矿石
    this.assets.loadModel('assets/3d_build/ores-hy3d/hy3d_ore_small_draco.glb').then(g => {
      this.oreModel = g ? this.normalizeModel(g, 0.5) : null; // 矿产高度 ~0.5m（小）
      if (this.oreModel) console.log('[world3d] HY3D 矿产模型已加载（替代程序化几何体）');
      else console.warn('[world3d] HY3D 矿产模型加载失败，回退程序化几何体');
    }).catch(() => console.warn('[world3d] HY3D 矿产模型加载异常'));
  }

  /** 归一化模型：缩放到目标高度，并把底部对齐到局部 y=0（外层 Group 包裹，便于按实例设置世界坐标） */
  private normalizeModel(obj: THREE.Object3D, targetH: number): THREE.Group {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = targetH / Math.max(size.y, 1e-3);
    obj.scale.multiplyScalar(s);
    const box2 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box2.min.y; // 底部贴地（内层局部坐标）
    const outer = new THREE.Group();
    outer.add(obj);
    return outer;
  }

  /**
   * M7 刚性骨骼绑定：将无骨骼 GLB 模型按预计算的 rig 配置拆分为骨骼层级。
   * 原理：rig JSON（gen_rig.py 产出）记录了每根骨骼拥有的三角形索引和 pivot 点。
   * 运行时按 tris 拆分子几何体，每根骨骼的顶点偏移到 pivot 局部空间，
   * 创建 bone Object3D(pivot) 作为父节点 → 旋转 bone 即绕 pivot 刚性旋转该肢体。
   */
  private buildRiggedModel(sceneMesh: THREE.Mesh, rig: any): THREE.Group {
    const geo = sceneMesh.geometry;
    const posAttr = geo.attributes['position'];
    const nrmAttr = geo.attributes['normal'] || null;
    const idxAttr = geo.index || null;
    const nVerts = posAttr.count;

    // 辅助：获取三角形三个顶点的全局索引
    const getTri = (i: number): [number, number, number] => {
      if (idxAttr) { return [idxAttr.getX(i * 3), idxAttr.getX(i * 3 + 1), idxAttr.getX(i * 3 + 2)]; }
      return [i * 3, i * 3 + 1, i * 3 + 2];
    };

    interface BoneEntry { boneObj: THREE.Object3D; mesh: THREE.Mesh; pivot: number[]; parentName: string | null; }
    const bones: Record<string, BoneEntry> = {};

    for (const bone of rig.bones) {
      const vmap: Record<number, number> = {};
      const lpos: number[] = [];
      const lnrm: number[] = [];
      const localTris: number[] = [];
      let li = 0;

      for (const ti of bone.tris) {
        const [v0, v1, v2] = getTri(ti);
        for (const gv of [v0, v1, v2]) {
          if (!(gv in vmap)) {
            vmap[gv] = li++;
            const px = posAttr.getX(gv), py = posAttr.getY(gv), pz = posAttr.getZ(gv);
            // 偏移到 pivot 局部空间（静止时 world 位置 = pivot + localPos = 原始坐标）
            lpos.push(px - bone.pivot[0], py - bone.pivot[1], pz - bone.pivot[2]);
            if (nrmAttr) { lnrm.push(nrmAttr.getX(gv), nrmAttr.getY(gv), nrmAttr.getZ(gv)); }
          }
        }
        localTris.push(vmap[v0], vmap[v1], vmap[v2]);
      }

      // 构建子 BufferGeometry
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
      if (lnrm.length) { sgeo.setAttribute('normal', new THREE.Float32BufferAttribute(lnrm, 3)); }
      sgeo.setIndex(localTris);
      sgeo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.05, color: 0xdddddd });
      // 复用原始材质颜色（若有）
      if (sceneMesh.material && (sceneMesh.material as THREE.MeshStandardMaterial).color) {
        (mat as THREE.MeshStandardMaterial).color = ((sceneMesh.material as THREE.MeshStandardMaterial).color).clone();
      }
      const mesh = new THREE.Mesh(sgeo, mat);

      bones[bone.name] = { boneObj: new THREE.Object3D(), mesh, pivot: bone.pivot, parentName: bone.parent };
    }

    // 创建骨骼 Object3D 并建立父子层级
    const rootGroup = new THREE.Group();
    for (const b of rig.bones) {
      const entry = bones[b.name];
      entry.boneObj.position.set(entry.pivot[0], entry.pivot[1], entry.pivot[2]);
      entry.boneObj.name = b.name;
      entry.boneObj.add(entry.mesh);  // 网格作为子节点（局部坐标已在 pivot 空间）
    }
    for (const b of rig.bones) {
      const entry = bones[b.name];
      if (entry.parentName && bones[entry.parentName]) {
        bones[entry.parentName].boneObj.add(entry.boneObj);
      } else {
        rootGroup.add(entry.boneObj);
      }
    }

    return rootGroup;
  }

  /** 在出生区块附近草地放置男孩/女孩（仅放一次；模型与地形均就绪后才落位） */
  private tryPlaceCharacters(): void {
    if (this.decorPlaced) return;
    if (!this.boyModel || !this.girlModel) return;
    // 需等出生 chunk 地形数据加载（heightAt 才有值）
    if (!this.gridCache.has(`${Math.floor(this.px / CHUNK)}_${Math.floor(this.pz / CHUNK)}`)) return;
    const spots = this.findGrassNear(this.px, this.pz, 2);
    if (spots.length < 2) return; // 找不到两处草地则暂不放置
    this.decorPlaced = true;
    const models = [this.boyModel, this.girlModel];
    const boneNames = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
    spots.forEach((sp, i) => {
      let y = this.heightAt(sp.gx, sp.gz);
      if (y === undefined) return;
      // 🔴🔴 NPC 也需 HY3D 表面高度修正（2026-08-16 修复穿模）：
      //   heightAt 返回旧隐藏网格高度（y≈-0.2），但视觉上 HY3D 岛屿在 y≈4+
      //   不修正 → boy/girl 模型下半身埋进草地
      const hy3dY = this.hy3dSurfaceHeightAt(sp.gx, sp.gz);
      if (hy3dY != null && hy3dY > y) y = hy3dY;
      // 🔴🔴 水域防护（2026-08-15 修复）：NPC 必须在海平面以上
      const safeY = Math.max((this.config?.waterLevel ?? -5) + 0.6, 0);
      if (y < safeY) return;
      const inst = models[i].clone(true);
      inst.position.set(sp.gx, y, sp.gz);
      inst.rotation.y = (i * 1.7) % (Math.PI * 2);
      inst.userData['shared'] = true;
      this.scene.add(inst);
      this.charList.push({ x: sp.gx, y, z: sp.gz });
      // M7：收集骨骼引用（驱动四肢独立运动）
      const bones: Record<string, THREE.Object3D> = {};
      inst.traverse(o => { if (o.name && boneNames.includes(o.name)) bones[o.name] = o; });
      this.charAnims.push({ group: inst, cx: sp.gx, cz: sp.gz, baseY: y, phase: i * 1.3, radius: 4 + i * 1.6, bones });
    });
  }

  /** 以 (cx0,cz0) 为中心、半径 8 内扫描 semantic===2（草地）的格子，返回前 count 个 */
  private findGrassNear(cx0: number, cz0: number, count: number): { gx: number; gz: number }[] {
    const res: { gx: number; gz: number }[] = [];
    const grid = this.gridCache.get(`${Math.floor(cx0 / CHUNK)}_${Math.floor(cz0 / CHUNK)}`);
    if (!grid) return res;
    const baseX = Math.floor(cx0), baseZ = Math.floor(cz0);
    for (let r = 0; r <= 8 && res.length < count; r++) {
      for (let dz = -r; dz <= r && res.length < count; dz++) {
        for (let dx = -r; dx <= r && res.length < count; dx++) {
          const gx = baseX + dx, gz = baseZ + dz;
          const lx = gx - Math.floor(gx / CHUNK) * CHUNK;
          const lz = gz - Math.floor(gz / CHUNK) * CHUNK;
          if (grid.semantic[lz * CHUNK + lx] === 2) res.push({ gx, gz });
        }
      }
    }
    return res;
  }

  /**
   * M7 骨骼驱动角色动作：模型本身无骨骼（skins:0/animations:0），
   * 加载时已由 buildRiggedModel 按 rig 配置拆分为 6 根刚性骨骼（头/躯干/左臂/右臂/左腿/右腿）。
   * 这里 root 组负责整体位置与朝向（巡逻/面向），各骨骼 Object3D 绕自身 pivot 旋转，
   * 实现手和脚独立摆动：待机点头/轻摆、走跑四肢交替前后摆、弯腰绕髋部前倾。
   * root 的 -lean/-pitch 已下放给躯干骨骼，避免整体俯仰。
   */
  private updateCharAnimations(dt: number): void {
    this.animClock += dt;
    // 演示状态循环
    this.animStateTimer += dt;
    const dur = World3dComponent.ANIM_STATE_DUR[this.animStateIdx];
    if (this.animStateTimer >= dur) {
      this.animStateTimer = 0;
      this.animStateIdx = (this.animStateIdx + 1) % World3dComponent.ANIM_STATES.length;
    }
    const state = World3dComponent.ANIM_STATES[this.animStateIdx];
    // 调试快照（仅 ?debug=1 时写入，供自动化验证读取角色动作状态与变换）
    const dbgOn = (window as any).__charAnimDebugEnabled || (() => { try { return sessionStorage.getItem('__charAnimDebug') === '1'; } catch { return false; } })();
    if (dbgOn) {
      (window as any).__charAnimDebug = {
        state, clock: +this.animClock.toFixed(2),
        chars: this.charAnims.map(c => ({
          x: +c.group.position.x.toFixed(3), y: +c.group.position.y.toFixed(3), z: +c.group.position.z.toFixed(3),
          rx: +c.group.rotation.x.toFixed(3), ry: +c.group.rotation.y.toFixed(3), rz: +c.group.rotation.z.toFixed(3),
          // M7：记录各骨骼旋转，便于验证"手脚分开动"（根组只管位置/朝向）
          bones: c.bones ? Object.fromEntries(
            Object.entries(c.bones).map(([k, o]) => [k, {
              rx: +o.rotation.x.toFixed(3), ry: +o.rotation.y.toFixed(3), rz: +o.rotation.z.toFixed(3)
            }])
          ) : null
        }))
      };
    }

    for (const c of this.charAnims) {
      const g = c.group;
      const t = this.animClock + c.phase; // 角色间相位错开，避免完全同步
      const B = c.bones || {};
      const tor = B['torso'], hed = B['head'];
      const al = B['armL'], ar = B['armR'], ll = B['legL'], lr = B['legR'];
      if (state === 'idle') {
        // 待机：呼吸般轻微上下起伏；骨骼：头微点头 + 手臂轻摆 + 躯干归零
        const bob = Math.sin(t * 1.6) * 0.04;
        g.position.set(c.cx, c.baseY + bob, c.cz);
        g.rotation.set(0, g.rotation.y, 0);
        if (tor) tor.rotation.set(0, 0, 0);
        if (hed) hed.rotation.set(Math.sin(t * 1.6) * 0.06, 0, Math.sin(t * 0.9) * 0.03);
        if (al) al.rotation.set(0, 0, Math.sin(t * 0.8) * 0.04);
        if (ar) ar.rotation.set(0, 0, -Math.sin(t * 0.8) * 0.04);
        if (ll) ll.rotation.set(0, 0, 0);
        if (lr) lr.rotation.set(0, 0, 0);
      } else if (state === 'walk' || state === 'run') {
        const isRun = state === 'run';
        const speed = isRun ? 1.7 : 0.9;   // 巡逻角速度
        const freq = isRun ? 3.0 : 2.0;    // 步频
        const amp = isRun ? 0.16 : 0.09;   // 颠簸幅度
        const lean = isRun ? 0.30 : 0.14;  // 前倾程度（由躯干骨骼承担）
        const ang = t * speed;
        const nx = c.cx + Math.cos(ang) * c.radius;
        const nz = c.cz + Math.sin(ang) * c.radius;
        let gy = this.heightAt(nx, nz) ?? c.baseY;
        // NPC 巡逻也需 HY3D 表面高度修正（防止巡逻到旧网格低洼处穿模）
        const hy3dWalkY = this.hy3dSurfaceHeightAt(nx, nz);
        if (hy3dWalkY != null && hy3dWalkY > gy) gy = hy3dWalkY;
        const bob = Math.sin(t * freq) * amp;          // 迈步上下
        g.position.set(nx, gy + bob, nz);
        // 朝向运动切线方向（root 仅负责朝向，lean 交给躯干骨骼）
        const dx = -Math.sin(ang) * c.radius;
        const dz = Math.cos(ang) * c.radius;
        g.rotation.set(0, Math.atan2(dx, dz), 0);
        // 骨骼驱动：四肢交替摆动（手和脚分开动）
        const s = Math.sin(t * freq);
        if (tor) tor.rotation.set(lean, 0, 0);
        if (hed) hed.rotation.set(0, 0, 0);
        if (al) al.rotation.set(s * 0.50, 0, 0);   // 左臂前摆
        if (ar) ar.rotation.set(-s * 0.50, 0, 0);  // 右臂后摆（反向）
        if (ll) ll.rotation.set(-s * 0.38, 0, 0);  // 左腿后摆（与左臂反相）
        if (lr) lr.rotation.set(s * 0.38, 0, 0);   // 右腿前摆
      } else if (state === 'bend') {
        // 弯腰：整体下沉 + 躯干骨骼绕髋部大幅前倾（手和脚跟随躯干）
        const drop = 0.55;
        const pitch = 1.0;
        const bob = Math.sin(t * 1.4) * 0.03;
        g.position.set(c.cx, c.baseY - drop + bob, c.cz);
        g.rotation.set(0, g.rotation.y, 0);
        if (tor) tor.rotation.set(pitch, 0, 0);
        if (hed) hed.rotation.set(0, 0, 0);
        if (al) al.rotation.set(0.3, 0, 0);   // 手臂随躯干前倾自然下垂向前
        if (ar) ar.rotation.set(0.3, 0, 0);
        if (ll) ll.rotation.set(-pitch * 0.25, 0, 0);
        if (lr) lr.rotation.set(-pitch * 0.25, 0, 0);
      }
    }
  }

  // ================= 矿石渲染（ORE_* 语义 → 3D 矿石模型） =================

  /** 按 chunk 语义中的 ORE_* 格生成 3D 矿石模型（露出地面的岩石/晶体）
   *  🔴🔴 2026-08-15 修复：1202 个矿石太多导致视觉上"悬空云"
   *  三重削减：① 概率稀疏(8%) ② 高度上限(Y≤12) ③ 每chunk上限(6个)
   */
  private spawnOres(resp: ChunkResp): void {
    const key = `${resp.cx}_${resp.cz}`;
    const ores: THREE.Group[] = [];
    const waterLevel = this.config?.waterLevel ?? -5;
    const h = resp.height;
    let chunkOreCount = 0;
    const MAX_ORES_PER_CHUNK = 6; // 每个 chunk 最多 6 个矿石（之前是几十个）
    const ORE_SPAWN_CHANCE = 0.08; // 8% 概率实际生成 3D 模型（稀疏化）
    const MAX_ORE_Y = 12; // 不在太高的悬崖上放矿

    // 确定性伪随机（基于坐标，同位置每次结果一致）
    const seededRandom = (x: number, z: number) => {
      const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
      return n - Math.floor(n);
    };

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = resp.semantic[lz * CHUNK + lx];
        let oreType: 'gold' | 'iron' | 'coal' | null = null;
        if (cell === 6) oreType = 'coal';      // ORE_COAL
        else if (cell === 7) oreType = 'iron';   // ORE_IRON
        else if (cell === 8) oreType = 'gold';   // ORE_GOLD
        if (!oreType) continue;
        
        // 🔴 稀疏化：只有 8% 的矿点真正生成 3D 模型
        const gx = resp.cx * CHUNK + lx;
        const gz = resp.cz * CHUNK + lz;
        if (seededRandom(gx, gz) > ORE_SPAWN_CHANCE) continue;
        
        // 🔴 每 chunk 上限
        if (chunkOreCount >= MAX_ORES_PER_CHUNK) continue;

        // 直接从高度数组取值
        const rawY = h[lz * N + lx];
        let y = (rawY != null && !isNaN(rawY)) ? rawY : (this.heightAt(gx + 0.5, gz + 0.5) ?? (waterLevel + 1.0));

        // 🔴🔴 矿石贴地：和玩家一样，有 HY3D 表面就强制用（不再判断 > gridY）
        const hy3dOreY = this.hy3dSurfaceHeightAt(gx + 0.5, gz + 0.5);
        if (hy3dOreY != null) y = hy3dOreY; // HY3D 优先，和玩家一致
        
        // 🔴🔴 水域防护 + 高度上限
        if (y < 0 || y > MAX_ORE_Y) continue; // 跳过水下和过高矿点
        
        const ore = this.makeOre(oreType);
        ore.position.set(gx + 0.5, y, gz + 0.5);
        ore.rotation.y = (((gx * 7 + gz * 13) % 360) * Math.PI) / 180;
        const s = 0.8 + (((gx * 23 + gz * 31) % 20) / 100);
        ore.scale.setScalar(s);
        this.scene.add(ore);
        ores.push(ore);
        this.oreList.push({ x: gx + 0.5, y, z: gz + 0.5, type: oreType });
        this.markObstacle(resp.cx, resp.cz, gx, gz, 1);
        chunkOreCount++;
      }
    }
    this.oreMeshes.set(key, ores);
  }

  /** 单个矿石模型：优先使用 HY3D GLB 模型，回退程序化几何体
   *  🔴🔴 2026-08-16 重构：集成 hy3d_ore_small_draco.glb（贴图+PBR材质）
   */
  private makeOre(type: 'gold' | 'iron' | 'coal'): THREE.Group {
    // 🔴 优先使用 HY3D 矿产模型（clone 实例，按类型染色）
    if (this.oreModel) {
      const inst = this.oreModel.clone();
      // 按矿石类型调整材质色调（保留 PBR roughness/metalness）
      const typeTint: Record<string, number> = { gold: 0xFFD700, iron: 0x708090, coal: 0x3a3a3a };
      inst.traverse(o => {
        const mesh = o as THREE.Mesh;
        if ((mesh as any)?.isMesh && mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.setHex(typeTint[type] ?? 0x888888);
          // 金矿额外发光
          if (type === 'gold') { mat.emissive.setHex(0x443300); mat.emissiveIntensity = 0.4; }
        }
      });
      return inst;
    }

    // 🔴 回退：程序化几何体（HY3D 模型加载失败时）
    const g = new THREE.Group();
    if (type === 'gold') {
      // 金矿：金黄色八面体晶体（双锥组合）
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35, 0),
        new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.3, metalness: 0.8, emissive: 0x554400 })
      );
      crystal.position.y = 0.4;
      crystal.scale.set(1, 1.5, 1); // 拉高成晶体状
      g.add(crystal);
      // 底座小岩石
      const base = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.25, 0),
        new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.95 })
      );
      base.position.y = 0.12;
      g.add(base);
    } else if (type === 'iron') {
      // 铁矿：深灰色不规则岩石块
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.7, metalness: 0.4 })
      );
      rock.position.y = 0.3;
      rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
      g.add(rock);
      // 小晶体点缀
      for (let i = 0; i < 2; i++) {
        const bit = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.1, 0),
          new THREE.MeshStandardMaterial({ color: 0xA0A0B0, roughness: 0.4, metalness: 0.6 })
        );
        const a = (i / 2) * Math.PI * 2;
        bit.position.set(Math.cos(a) * 0.25, 0.35 + i * 0.12, Math.sin(a) * 0.25);
        g.add(bit);
      }
    } else {
      // 煤矿：黑色多面体堆
      for (let i = 0; i < 3; i++) {
        const coal = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0),
          new THREE.MeshStandardMaterial({ color: 0x2C2C2C, roughness: 0.9, metalness: 0.1 })
        );
        const a = (i / 3) * Math.PI * 2;
        coal.position.set(
          Math.cos(a) * 0.15,
          0.1 + i * 0.15,
          Math.sin(a) * 0.15
        );
        coal.rotation.set(Math.random(), Math.random(), Math.random());
        g.add(coal);
      }
    }
    return g;
  }

  // ================= 世界对象渲染 =================

  private addObject(o: WorldObjectResp): void {
    if (this.worldObjects.has(o.id)) return;
    this.worldObjects.set(o.id, o);
    const y = this.heightAt(o.gx + 0.5, o.gz + 0.5);
    const groundY = y === undefined ? 0 : y;
    const g = new THREE.Group();
    (g as any).__isObjGroup = true;
    if (o.type === 'fish_pond') {
      // 鱼塘：蓝色扁圆柱 + 水面
      const pond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.5, 20),
        new THREE.MeshStandardMaterial({ color: 0x4CC9F0, transparent: true, opacity: 0.85 })
      );
      pond.position.y = 0.25;
      g.add(pond);
      // P1 养殖循环：生长进度环（灰=未成熟，金=成熟可收获），随 OBJECT_UPDATE 刷新
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.08, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x9a9a92 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.55;
      ring.name = 'growthRing';
      g.add(ring);
    } else {
      // 建筑：木屋方块 + 屋顶
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.3, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xC98A4B })
      );
      wall.position.y = 0.65;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.3, 0.7, 4),
        new THREE.MeshStandardMaterial({ color: 0xE86A4B })
      );
      roof.position.y = 1.7;
      roof.rotation.y = Math.PI / 4;
      g.add(wall, roof);
      // P2 建筑升级：按等级缩放（Lv1→1.0，Lv2→1.18，Lv3→1.36）
      const lvl = this.objectLevel(o);
      g.userData['level'] = lvl;
      const s = 1 + (lvl - 1) * 0.18;
      g.scale.set(s, s, s);
      this.markObstacle(Math.floor(o.gx / CHUNK), Math.floor(o.gz / CHUNK), o.gx, o.gz, 1); // 建筑占位 → 寻路避障
    }
    g.position.set(o.gx + 0.5, groundY, o.gz + 0.5);
    this.scene.add(g);
    this.objectMeshes.set(o.id, g);
    // 初始化鱼塘生长进度
    if (o.type === 'fish_pond') {
      this.refreshPondGrowth(g, o.extJson);
    }
  }

  /** 从 object 的 extJson 解析建筑等级（默认 1） */
  private objectLevel(o: WorldObjectResp): number {
    const ext = o.extJson as any;
    if (ext && ext.level != null) {
      const lv = Number(ext.level);
      if (!isNaN(lv) && lv >= 1) return lv;
    }
    return 1;
  }

  /** 刷新鱼塘生长进度环（P1）：依据 plantedAt/cycleMs 计算成熟度 → 环色 + 提示 */
  private refreshPondGrowth(group: THREE.Object3D, extJson: any): void {
    const ring = group.getObjectByName('growthRing') as THREE.Mesh | undefined;
    if (!ring) return;
    const ext = (extJson && typeof extJson === 'object') ? extJson : {};
    const plantedAt = typeof ext.plantedAt === 'number' ? ext.plantedAt : 0;
    const cycleMs = typeof ext.cycleMs === 'number' ? ext.cycleMs : 60000;
    const elapsed = plantedAt ? Date.now() - plantedAt : 0;
    const progress = cycleMs > 0 ? Math.min(1, Math.max(0, elapsed / cycleMs)) : 0;
    const ready = progress >= 1;
    const mat = ring.material as THREE.MeshStandardMaterial;
    mat.color.set(ready ? 0xFFD700 : 0x9a9a92);
    const s = 0.4 + progress * 0.8;
    ring.scale.set(s, s, 1);
  }

  /** 移除对象网格（OBJECT_REMOVE 同步 / 本地拆除结果用） */
  private removeObjectMesh(id: number): void {
    const g = this.objectMeshes.get(id);
    if (g) {
      this.scene.remove(g);
      g.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
      });
      this.objectMeshes.delete(id);
    }
    this.worldObjects.delete(id);
  }

  /** 刷新对象网格（OBJECT_UPDATE：升级等级缩放 / 鱼塘收获后进度重置） */
  private updateObjectMesh(id: number, extJson: any): void {
    const g = this.objectMeshes.get(id);
    const o = this.worldObjects.get(id);
    if (!g || !o) return;
    if (typeof extJson === 'object' && extJson != null) {
      o.extJson = extJson;
      if (o.type === 'fish_pond') {
        this.refreshPondGrowth(g, extJson);
      } else {
        const lvl = (extJson.level != null) ? Number(extJson.level) : (g.userData['level'] || 1);
        g.userData['level'] = lvl;
        const s = 1 + (lvl - 1) * 0.18;
        g.scale.set(s, s, s);
      }
    }
  }


  // ================= 远端玩家 =================

  private addRemotePlayer(p: any): void {
    if (this.remotePlayers.has(p.uid)) return;
    const colors = [0x66BB6A, 0x42A5F5, 0xAB47BC, 0xFF7043];
    const color = colors[this.remotePlayers.size % colors.length];
    const g = new THREE.Group();
    // three 0.128 无 CapsuleGeometry，用 圆柱+球 组合
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.6, 10),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 0.62;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshStandardMaterial({ color })
    );
    head.position.y = 1.32;
    g.add(body, head);
    // 🔴 远端玩家初始位置也需 HY3D 修正（2026-08-16 修复穿模）
    let initY = (p.y ?? 0) + 0.3;
    const hy3dInitY = this.hy3dSurfaceHeightAt((p.gx ?? 0) + 0.5, (p.gz ?? 0) + 0.5);
    if (hy3dInitY != null && hy3dInitY > initY) initY = hy3dInitY; // 脚底贴地
    g.position.set((p.gx ?? 0) + 0.5, initY, (p.gz ?? 0) + 0.5);
    this.scene.add(g);
    this.remotePlayers.set(p.uid, g);
  }

  private removeRemotePlayer(uid: number): void {
    const g = this.remotePlayers.get(uid);
    if (g) {
      this.scene.remove(g);
      this.remotePlayers.delete(uid);
    }
  }

  // ================= 交互：建造 / 养鱼 =================

  enterBuild(): void {
    this.buildMode = true;
    this.fishMode = false;
    this.mineMode = false;
    this.controls.enabled = true;
    this.hint = '建造模式：点击地面放置木屋（100 金币），点击「跟随」退出';
  }

  enterFish(): void {
    this.fishMode = true;
    this.buildMode = false;
    this.mineMode = false;
    this.controls.enabled = true;
    this.hint = '养鱼模式：点击蓝色水面放置鱼塘，点击「跟随」退出';
  }

  enterMine(): void {
    this.mineMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '采矿模式：点击矿石开采（4 能量/次，需靠近矿脉 ≤3.5），点击「跟随」退出';
  }

  /** 拆除模式（P0）：点击自己放置的建筑/鱼塘即可拆除（不退还金币） */
  enterRemove(): void {
    this.removeMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '拆除模式：点击你的建筑/鱼塘拆除，点击「跟随」退出';
  }

  /** 升级模式（P2）：点击自己放置的建筑升级（扣升级费，最高 Lv3） */
  enterUpgrade(): void {
    this.upgradeMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '升级模式：点击你的建筑升级（Lv1→Lv2→Lv3），点击「跟随」退出';
  }

  /** 收获模式（P1）：点击成熟的鱼塘收获（发放金币并进入下一轮养殖） */
  enterHarvest(): void {
    this.harvestMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.forageMode = false;
    this.controls.enabled = true;
    this.hint = '收获模式：点击金色光环的成熟鱼塘收获，点击「跟随」退出';
  }

  /** 采集模式：点击树木格砍树得木材 / 摘野果（写入背包） */
  enterForage(): void {
    this.forageMode = true;
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.controls.enabled = true;
    this.hint = '采集模式：点击树木（🌳）砍树得木材、摘野果，点击「跟随」退出';
  }

  exitInteract(): void {
    this.buildMode = false;
    this.fishMode = false;
    this.mineMode = false;
    this.removeMode = false;
    this.upgradeMode = false;
    this.harvestMode = false;
    this.forageMode = false;
    this.controls.enabled = false;
    this.hint = '已回到跟随视角，WASD 移动';
  }

  toggleSell(): void {
    this.sellOpen = !this.sellOpen;
  }

  /** 售卖单个背包矿石（整组）换积分 */
  sellItem(it: InventoryItem): void {
    if (it.qty <= 0) return;
    this.api.sellMining([{ type: it.type, qty: it.qty }]).subscribe({
      next: r => {
        if (r.code === 0 && r.data) {
          this.coins = r.data.coins ?? this.coins;
          this.state.state.coins = this.coins;
          this.showToast(`💰 售卖获得 ${r.data.earnedCoins} 积分`);
        } else {
          this.showToast('售卖失败：' + (r.msg || '未知错误'));
        }
        this.loadMiningProfile(); // 权威刷新背包/能量
      },
      error: () => this.showToast('售卖请求失败')
    });
  }

  /** 拉取采矿档案（能量/等级/经验/背包），权威刷新 HUD */
  private loadMiningProfile(): void {
    this.api.miningProfile().subscribe({
      next: p => {
        if (this.disposed) return;
        this.energy = p.energy;
        this.maxEnergy = p.maxEnergy || 100;
        this.level = p.level;
        this.exp = p.exp;
        this.expToNext = p.expToNext;
        this.inventory = p.inventory || [];
        this.miningReady = true;
      },
      error: () => { this.miningReady = true; } // 仍显示 HUD，能量默认 0
    });
  }

  /** 发送采矿意图（/app/ws.mine），服务端校验矿脉/邻近/能量 */
  private doMine(gx: number, gz: number): void {
    if (!this.ws.isConnected) {
      this.hint = '尚未连接，无法采矿';
      return;
    }
    this.ws.send('/app/ws.mine', { gx, gz });
    this.hint = `⛏️ 采矿中 @(${gx},${gz})...`;
  }

  /** 发送钓鱼意图（/app/ws.fish），服务端校验临水/能量 */
  private doFishCatch(): void {
    if (!this.ws.isConnected) {
      this.hint = '尚未连接，无法钓鱼';
      return;
    }
    if (!this.nearWater) {
      this.hint = '需要站在水边才能钓鱼';
      return;
    }
    this.ws.send('/app/ws.fish', { gx: Math.floor(this.px), gz: Math.floor(this.pz) });
    this.hint = '🎣 钓鱼中...';
  }

  /** 处理 MINE_RESULT 回执：刷新 HUD + 提示 + 本地地形变化 */
  private handleMineResult(ev: any): void {
    if (ev.code === 0 && ev.data) {
      const d = ev.data as MineResult;
      this.showToast(`⛏️ 采到 ${this.oreName(d.oreType)} +${d.expGained}EXP（背包 ×${d.itemQty}）`);
      this.hint = `采矿成功：${this.oreName(d.oreType)}`;
      this.advanceOnboardingIf(1); // 新手引导：完成「采矿」步自动前进
      // 本地立即重着色 + 移除矿模型（与 TERRAIN_CHANGE 广播一致，去重安全）
      this.applyTerrainChange(`${Math.floor(d.gx / CHUNK)}_${Math.floor(d.gz / CHUNK)}`, d.gx, d.gz, d.newType);
    } else {
      this.showToast('❌ ' + (ev.msg || '采矿失败'));
      this.hint = '采矿失败：' + (ev.msg || '未知错误');
    }
    this.loadMiningProfile(); // 权威刷新能量/经验/背包
  }

  /** 处理 FISH_RESULT 回执：刷新 HUD + 提示（钓鱼不改变地形） */
  private handleFishResult(ev: any): void {
    if (ev.code === 0 && ev.data) {
      const d = ev.data;
      const name = d.fishName || d.fishType || '鱼';
      this.showToast(`🎣 钓到 ${name} +${d.expGained}EXP（背包 ×${d.itemQty}）`);
      this.hint = `钓鱼成功：${name}`;
      this.advanceOnboardingIf(2); // 新手引导：完成「钓鱼」步自动前进
    } else {
      this.showToast('❌ ' + (ev.msg || '钓鱼失败'));
      this.hint = '钓鱼失败：' + (ev.msg || '未知错误');
    }
    this.loadMiningProfile(); // 权威刷新能量/经验/背包
  }

  /** 矿格变化：重着色地形顶点 + 移除对应 3D 矿模型（所有客户端通用） */
  private applyTerrainChange(chunkKey: string, gx: number, gz: number, newType: string): void {
    const mesh = this.chunkMeshes.get(chunkKey);
    if (mesh) {
      const [cx, cz] = chunkKey.split('_').map(Number);
      const lx = gx - cx * CHUNK;
      const lz = gz - cz * CHUNK;
      const code = newType === 'empty' ? 9 : (Number(newType) || 2);
      const col = new THREE.Color(CELL_COLORS[code] ?? CELL_COLORS[2]);
      const geo = mesh.geometry as THREE.BufferGeometry;
      const colors = geo.getAttribute('color') as THREE.BufferAttribute;
      const xs = [lx, Math.min(lx + 1, N - 1)];
      const zs = [lz, Math.min(lz + 1, N - 1)];
      for (const x of xs) for (const z of zs) {
        colors.setXYZ(z * N + x, col.r, col.g, col.b);
      }
      colors.needsUpdate = true;
    }
    // 移除该矿 3D 模型（按世界坐标匹配）
    const ores = this.oreMeshes.get(chunkKey);
    if (ores) {
      for (let i = ores.length - 1; i >= 0; i--) {
        const g = ores[i];
        if (Math.abs(g.position.x - (gx + 0.5)) < 0.01 && Math.abs(g.position.z - (gz + 0.5)) < 0.01) {
          this.scene.remove(g);
          g.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            const mat = m.material as THREE.Material | THREE.Material[];
            if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
          });
          ores.splice(i, 1);
          break;
        }
      }
    }
  }

  /** 扫描玩家附近 chunk 的矿脉，供 F 键采矿与提示 */
  private scanNearbyOre(): void {
    const R = 3.5;
    const pcx = Math.floor(this.dpx / CHUNK);
    const pcz = Math.floor(this.dpz / CHUNK);
    let best: { gx: number; gz: number; d: number } | null = null;
    for (const [key, grid] of this.gridCache) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cz - pcz) > 1) continue; // 仅邻近 chunk
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const cell = grid.semantic[lz * CHUNK + lx];
          if (cell !== 6 && cell !== 7 && cell !== 8) continue; // ORE_*
          const gx = cx * CHUNK + lx;
          const gz = cz * CHUNK + lz;
          const d = Math.hypot(this.dpx - gx, this.dpz - gz);
          if (d <= R && (!best || d < best.d)) best = { gx, gz, d };
        }
      }
    }
    this.nearestOre = best ? { gx: best.gx, gz: best.gz } : null;
    if (best && !this.mineMode && !this.nearWater) {
      this.hint = `附近有矿脉（${Math.round(best.d)} 格内），按 F 开采`;
    } else if (!best && this.hint.indexOf('附近有矿脉') === 0) {
      this.hint = 'WASD 移动 · 空格跳跃 · 双击 W/A/S/D 奔跑 · 双击地面跑过去 · 左键拖拽转视角 · H 键帮助';
    }
  }

  /** 扫描玩家附近 chunk 的水域（WATER/RIVER），供钓鱼按钮与提示 */
  private scanNearbyWater(): void {
    const R = 4;
    const pcx = Math.floor(this.dpx / CHUNK);
    const pcz = Math.floor(this.dpz / CHUNK);
    let best: { gx: number; gz: number; d: number } | null = null;
    for (const [key, grid] of this.gridCache) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cz - pcz) > 1) continue; // 仅邻近 chunk
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const cell = grid.semantic[lz * CHUNK + lx];
          if (cell !== 0 && cell !== 10) continue; // WATER / RIVER
          const gx = cx * CHUNK + lx;
          const gz = cz * CHUNK + lz;
          const d = Math.hypot(this.dpx - gx, this.dpz - gz);
          if (d <= R && (!best || d < best.d)) best = { gx, gz, d };
        }
      }
    }
    this.nearestWater = best ? { gx: best.gx, gz: best.gz } : null;
    this.nearWater = best != null;
    if (best && !this.fishMode && !this.mineMode && !this.nearestOre) {
      this.hint = `附近有水（${Math.round(best.d)} 格内），按 G 或点「钓鱼」`;
    }
  }

  /** P1-小地图：绘制玩家/资源/其他玩家（节流调用） */
  private drawMinimap(): void {
    const cv = this.minimapRef?.nativeElement as HTMLCanvasElement | undefined;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const span = 110; // 半幅世界单位
    const scale = W / (span * 2);
    const toX = (wx: number) => W / 2 + (wx - this.dpx) * scale;
    const toY = (wz: number) => H / 2 + (wz - this.dpz) * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,20,30,.55)';
    ctx.fillRect(0, 0, W, H);
    // 资源标记（玩家邻近 chunk）
    const pcx = Math.floor(this.dpx / CHUNK), pcz = Math.floor(this.dpz / CHUNK);
    for (const [key, grid] of this.gridCache) {
      const [cx, cz] = key.split('_').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cz - pcz) > 1) continue;
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const cell = grid.semantic[lz * CHUNK + lx];
          let color: string | null = null;
          if (cell === 0 || cell === 10) color = '#3aa0d8';       // water / river
          else if (cell === 6 || cell === 7 || cell === 8) color = '#ffb347'; // ore
          if (!color) continue;
          const gx = cx * CHUNK + lx, gz = cz * CHUNK + lz;
          const x = toX(gx + 0.5), y = toY(gz + 0.5);
          if (x < 0 || x > W || y < 0 || y > H) continue;
          ctx.fillStyle = color;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    }
    // 其他在线玩家
    ctx.fillStyle = '#ff6b6b';
    for (const g of this.remotePlayers.values()) {
      const x = toX(g.position.x), y = toY(g.position.z);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // 玩家 + 朝向箭头
    const px = W / 2, py = H / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.dprot);
    ctx.fillStyle = '#6cff9e';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 小地图点击目标标记（红色十字圆）
    if (this.miniTarget) {
      const tx = toX(this.miniTarget.x), ty = toY(this.miniTarget.z);
      if (tx >= 0 && tx <= W && ty >= 0 && ty <= H) {
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - 8, ty); ctx.lineTo(tx + 8, ty);
        ctx.moveTo(tx, ty - 8); ctx.lineTo(tx, ty + 8);
        ctx.stroke();
      }
    }
    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  /** 顶部居中提示（自动消失） */
  private showToast(text: string): void {
    this.miningToast = { text, ts: Date.now() };
    setTimeout(() => {
      if (this.miningToast && Date.now() - this.miningToast.ts >= 1800) {
        this.miningToast = null;
      }
    }, 1800);
  }

  /** 矿石类型中文名 */
  private oreName(code: string): string {
    if (code === 'ore_coal') return '煤矿';
    if (code === 'ore_iron') return '铁矿';
    if (code === 'ore_gold') return '金矿';
    return code;
  }

  private onCanvasClick(x: number, y: number): void {
    if (!this.buildMode && !this.fishMode && !this.removeMode && !this.upgradeMode && !this.harvestMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);

    // 拆除 / 升级 / 收获：射线命中已有对象（建筑/鱼塘）
    if (this.removeMode || this.upgradeMode || this.harvestMode) {
      const objHits = this.raycaster.intersectObjects(Array.from(this.objectMeshes.values()), true);
      const group = objHits.length ? this.findObjectGroup(objHits[0].object) : null;
      if (group) {
        const gx = Math.floor(group.position.x);
        const gz = Math.floor(group.position.z);
        if (this.removeMode) {
          this.api.remove(gx, gz).subscribe({
            next: r => {
              this.hint = r.code === 0 ? '拆除成功！' : '拆除失败：' + r.msg;
              if (r.code === 0 && r.data) this.removeObjectMesh(r.data.id);
            },
            error: () => { this.hint = '拆除请求失败'; }
          });
        } else if (this.upgradeMode) {
          this.api.upgrade(gx, gz).subscribe({
            next: r => {
              this.hint = r.code === 0 ? '升级成功！' : '升级失败：' + r.msg;
              if (r.code === 0 && r.data) this.updateObjectMesh(r.data.id, r.data.extJson);
              this.refreshCoins();
            },
            error: () => { this.hint = '升级请求失败'; }
          });
        } else if (this.harvestMode) {
          this.api.harvest(gx, gz).subscribe({
            next: r => {
              if (r.code === 0 && r.data) {
                if (r.data.ready) {
                  this.hint = `收获成功！获得 ${r.data.reward} 金币`;
                  this.showToast(`🎣 收获 +${r.data.reward} 金币，鱼已入背包`);
                  this.loadMiningProfile(); // 刷新背包列表（鱼已写入 world_inventory）
                  if (r.data && this.worldObjects) {
                    // 通过 OBJECT_UPDATE 已刷新；兜底：本地刷新对应鱼塘
                  }
                } else {
                  this.hint = `鱼塘未成熟，还需 ${Math.ceil(r.data.remainingMs / 1000)} 秒`;
                }
                this.refreshCoins();
              } else {
                this.hint = '收获失败：' + (r.msg || '未知错误');
              }
            },
            error: () => { this.hint = '收获请求失败'; }
          });
        }
      } else {
        this.hint = '请点击你的建筑/鱼塘进行操作';
      }
      return;
    }

    const meshes = Array.from(this.chunkMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    const gx = Math.floor(hits[0].point.x);
    const gz = Math.floor(hits[0].point.z);
    if (this.buildMode) {
      this.api.build(gx, gz, 'wood_house').subscribe({
        next: r => {
          this.hint = r.code === 0 ? '放置成功！' : '放置失败：' + r.msg;
          this.refreshCoins();
        },
        error: e => { this.hint = '放置请求失败'; }
      });
    } else if (this.mineMode) {
      this.doMine(gx, gz);
    } else if (this.fishMode) {
      this.api.fish(gx, gz, 'goldfish').subscribe({
        next: r => {
          this.hint = r.code === 0 ? '鱼塘已建！' : '养鱼失败：' + r.msg;
          this.refreshCoins();
        },
        error: () => { this.hint = '养鱼请求失败'; }
      });
    } else if (this.forageMode) {
      this.api.forage(gx, gz).subscribe({
        next: r => {
          if (r.code === 0 && r.data) {
            const extra = r.data.berry ? ` 野果 +${r.data.berry}` : '';
            this.hint = `采集成功！木材 +${r.data.wood}${extra}`;
            this.showToast(`🌳 木材 +${r.data.wood}${extra}`);
            this.loadMiningProfile(); // 刷新背包列表
          } else {
            this.hint = '采集失败：' + (r.msg || '这里没有可采集的树木');
          }
        },
        error: () => { this.hint = '采集请求失败'; }
      });
    }
  }

  /** 从射线命中的子网格向上回溯到 objectMeshes 中的对象组 */
  private findObjectGroup(obj: THREE.Object3D): THREE.Group | null {
    let node: THREE.Object3D | null = obj;
    while (node) {
      if (this.objectMeshes && (node as any).__isObjGroup) return node as THREE.Group;
      node = node.parent;
    }
    return null;
  }

  private refreshCoins(): void {
    // 服务端权威扣款后刷新（本地 state.coins 由 home 逻辑维护，此处仅展示；M1 简单处理）
    this.auth.getMe().subscribe({
      next: r => {
        if (r.code === 0 && r.data) {
          this.coins = (r.data as any).coins ?? this.coins;
          this.state.state.coins = this.coins;
        }
      },
      error: () => { /* ignore */ }
    });
  }

  // ================= 事件处理 =================

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || this.buildMode || this.fishMode || this.mineMode) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.follow.yaw -= dx * 0.005;
    this.follow.pitch = Math.max(0.1, Math.min(1.35, this.follow.pitch + dy * 0.005));
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.dragging = false;
    const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (dist < 6) {
      this.onCanvasClick(e.clientX, e.clientY);
    }
  };

  /** 双击地面：射线检测地形交点 → A* 寻路（绕开水/树/岩）→ 逐点行走（P2） */
  private onDoubleClick = (e: MouseEvent): void => {
    // 建造/养鱼/拆除/升级/收获模式下双击不触发移动（避免冲突）
    if (this.buildMode || this.fishMode || this.removeMode || this.upgradeMode || this.harvestMode) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const meshes = Array.from(this.chunkMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes, false);
    // 🔴🔴 HY3D 视觉世界优先（2026-08-16）：旧网格 chunk 在 HY3D 岛下方（y≈0 vs 岛面 y≈4+），
    //   只打旧网格会让"点哪"和"走到哪"因相机俯角偏差数米；先打可见的 HY3D 岛面，命中且更近则优先。
    let point: THREE.Vector3 | null = hits.length ? hits[0].point : null;
    if (this.hy3dTerrainGroup) {
      const hy3dHits = this.raycaster.intersectObjects(this.hy3dTerrainGroup.children, true);
      if (hy3dHits.length && (!point || hy3dHits[0].distance < hits[0].distance)) {
        point = hy3dHits[0].point;
      }
    }
    if (!point) return;
    const targetGx = Math.floor(point.x);
    const targetGz = Math.floor(point.z);
    // 清空旧目标/路径
    this.moveTarget = null;
    // 记录最终导航目标（供卡住时重寻路）
    this.navGoal = { x: point.x, z: point.z };
    this.navRetries = 0;
    this.stuckTimer = 0;
    this.lastStuckX = this.dpx;
    this.lastStuckZ = this.dpz;
    const startGx = Math.floor(this.dpx);
    const startGz = Math.floor(this.dpz);
    // A* 寻路（基于语义网格避障）
    const path = this.findPath(startGx, startGz, targetGx, targetGz);
    if (path && path.length > 0) {
      this.pathPoints = path;
      this.hint = `🧭 寻路 ${path.length} 个路点 → (${targetGx}, ${targetGz})`;
      this.sendMoveTarget();
    } else {
      // 无语义网格或不可达：回退直线移动（但目标若在水域则找最近陆地）
      let fx = point.x, fz = point.z;
      if (!this.isWalkableCell(targetGx, targetGz)) {
        const land = this.nearestWalkable(targetGx, targetGz);
        if (land) { fx = land.gx + 0.5; fz = land.gz + 0.5; }
        else { this.hint = '⚠️ 目标在水域/障碍中，无法到达'; return; }
      }
      this.moveTarget = { x: fx, z: fz };
      this.hint = `📍 移动目标: (${Math.floor(fx)}, ${Math.floor(fz)})（直线）`;
      this.sendMoveTarget();
    }
  };

  /** 小地图点击：左键走过去 / 右键查看大地图位置（相机飞过去） */
  onMinimapClick(e: PointerEvent): void {
    // 阻止右键菜单
    if (e.button === 2) { e.preventDefault(); }
    // 交互模式下不响应（避免与建造/钓鱼/采矿/拆除/升级/收获冲突）
    if (this.buildMode || this.fishMode || this.mineMode || this.removeMode || this.upgradeMode || this.harvestMode) {
      this.hint = '当前模式不可用，退出后点击小地图操作';
      return;
    }
    const cv = this.minimapRef?.nativeElement as HTMLCanvasElement | undefined;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / rect.width * cv.width;
    const ly = (e.clientY - rect.top) / rect.height * cv.height;
    const W = cv.width, H = cv.height;
    const span = 110;
    const scale = W / (span * 2);
    const wx = this.dpx + (lx - W / 2) / scale;
    const wz = this.dpz + (ly - H / 2) / scale;

    if (e.button === 2) {
      // ===== 右键：查看大地图位置（相机飞到该位置上方） =====
      const hy3dY = this.hy3dSurfaceHeightAt(wx, wz);
      const vy = (hy3dY ?? this.heightAt(wx, wz) ?? 0) + 0.5;
      this.viewTarget = { x: wx, y: vy, z: wz };
      this.miniTarget = { x: wx, z: wz }; // 也画红圈标记
      this.hint = `🔭 查看位置: (${Math.floor(wx)}, ${Math.floor(wz)})`;
      // 1.5s 后自动取消查看模式（回到跟随玩家）
      setTimeout(() => { if (this.viewTarget) { this.viewTarget = null; this.miniTarget = null; } }, 1500);
      return;
    }

    // ===== 左键：移动角色到目标点（原有逻辑） =====
    this.moveTarget = null;
    this.miniTarget = { x: wx, z: wz };
    this.navGoal = { x: wx, z: wz };
    this.navRetries = 0;
    this.stuckTimer = 0;
    this.lastStuckX = this.dpx;
    this.lastStuckZ = this.dpz;
    const startGx = Math.floor(this.dpx);
    const startGz = Math.floor(this.dpz);
    const targetGx = Math.floor(wx);
    const targetGz = Math.floor(wz);
    const path = this.findPath(startGx, startGz, targetGx, targetGz);
    if (path && path.length > 0) {
      this.pathPoints = path;
      this.hint = `🧭 小地图导航 ${path.length} 路点 → (${targetGx}, ${targetGz})`;
      this.sendMoveTarget();
    } else {
      // 直线移动直达点击点（用户主动点击；真实落水时由水域保护推回，无需旧网格硬拒绝）
      this.moveTarget = { x: wx, z: wz };
      this.hint = `📍 移动目标: (${Math.floor(wx)}, ${Math.floor(wz)})（直线）`;
      this.sendMoveTarget();
    }
  }

  /** 发送移动目标到服务端（双击地图 → 跑过去） */
  private sendMoveTarget(): void {
    if (!this.moveTarget || !this.ws.isConnected) return;
    const t = this.moveTarget;
    this.ws.send('/app/ws.input', {
      seq: Math.floor(performance.now()),
      move: { dx: 0, dz: 0, run: true },
      targetGx: Math.floor(t.x),
      targetGz: Math.floor(t.z)
    });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.follow.dist = Math.max(8, Math.min(80, this.follow.dist + e.deltaY * 0.03));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    const code = e.code ?? '';
    // H 键开关操作帮助面板（成熟竞品标配：不必逐个试功能）
    if (code === 'KeyH') {
      this.showHelp = !this.showHelp;
      return;
    }
    // 双击方向键触发奔跑（忽略系统按住自动重复 e.repeat）
    if (!e.repeat && this.isMoveKey(code)) {
      const now = performance.now();
      if (code === this.lastTapCode && now - this.lastTapTime < 320) {
        this.running = true;
        this.runKey = code;
      }
      this.lastTapCode = code;
      this.lastTapTime = now;
    }
    // 按 WASD/方向键时取消双击自动移动（手动优先）
    if ((code.startsWith('Key') || code.startsWith('Arrow')) && (this.moveTarget || this.pathPoints.length)) {
      this.moveTarget = null;
      this.pathPoints = [];
      this.navGoal = null;
      this.miniTarget = null;
      this.hint = '已取消自动移动，WASD 手动控制';
    }
    // 空格跳跃（非建造/养鱼/采矿模式，且不在输入框中）
    if (code === 'Space' && !this.buildMode && !this.fishMode && !this.mineMode) {
      e.preventDefault();
      this.sendJump();
    }
    // F 键采矿（跟随/采矿模式均可，自动开采最近矿脉）
    if (code === 'KeyF' && this.nearestOre) {
      e.preventDefault();
      this.doMine(this.nearestOre.gx, this.nearestOre.gz);
    }
    // G 键钓鱼（靠近水边，自动钓最近水域）
    if (code === 'KeyG' && this.nearWater && !this.fishMode) {
      e.preventDefault();
      this.doFishCatch();
    }
  };

  /** 是否为移动方向键（WASD / 方向键） */
  private isMoveKey(code: string): boolean {
    return code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
      code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight';
  }

  /** 发送跳跃意图到服务端（带上当前 WASD 方向 → 跳起向前）
   *  🔴🔴 2026-08-16 修复：加冷却 + 离地高度上限，防止连按空格飞天
   */
  private sendJump(): void {
    if (!this.ws.isConnected) return;
    // 🔴 跳跃冷却：防止连按空格叠加跳跃力
    const now = performance.now();
    if (now - this._lastJumpTs < World3dComponent.JUMP_COOLDOWN_MS) return;
    // 🔴 离地太高时不允许再跳（防止空中无限连跳）
    let groundY = this.heightAt(this.dpx, this.dpz);
    const hy3dY = this.hy3dSurfaceHeightAt(this.dpx, this.dpz);
    if (hy3dY != null) groundY = hy3dY; // 🔴 强制优先HY3D
    const baseY = groundY ?? this.py;
    if (this.dpy > baseY + World3dComponent.MAX_ABOVE_GROUND) return;

    this._lastJumpTs = now;
    console.log('[JUMP] sendJump 已触发', { dpy: +this.dpy.toFixed(2), baseY: +baseY.toFixed(2) }); // 🔴 调试：验证跳跃链路
    // 取当前按键方向（与 sendInputIfNeeded 同算法），让 W+空格 = 跳起向前
    let ix = 0, iz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iz -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    // 触屏摇杆叠加（P0-1）
    ix += this.touchVec.x;
    iz += this.touchVec.y;
    const yaw = this.follow.yaw;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const len = Math.hypot(ix, iz);
    const dx = len > 0 ? (right.x * ix + forward.x * iz) / len : 0;
    const dz = len > 0 ? (right.z * ix + forward.z * iz) / len : 0;
    const run = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || this.running;
    this.ws.send('/app/ws.input', {
      seq: Math.floor(performance.now()),
      move: { dx, dz, run },
      action: 'jump'
    });
    this.hint = '⬆️ 跳跃！';
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
    // 奔跑退出由「静止超时」统一处理（见 sendInputIfNeeded），不在 keyup 立即清除，
    // 否则双击 W（第二次 tap 的 keyup）会立刻取消奔跑，导致双击跑失效。
  };

  private onResize = (): void => {
    const mount = this.mountRef.nativeElement as HTMLElement;
    const W = mount.clientWidth || 900;
    const H = mount.clientHeight || 520;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    // 仅更新绘图缓冲区，不覆盖 canvas 的 width:100%/height:100% CSS
    this.renderer.setSize(W, H, false);
  };

  // ================= 触屏控制（P0-1） =================
  onJoyStart = (e: PointerEvent): void => {
    this.joystickId = e.pointerId;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.joyBase = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.onJoyMove(e);
  };
  onJoyMove = (e: PointerEvent): void => {
    if (this.joystickId !== e.pointerId) return;
    const max = 50;
    let dx = e.clientX - this.joyBase.x;
    let dy = e.clientY - this.joyBase.y;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    this.joyKnob = { x: dx, y: dy };
    this.touchVec = { x: dx / max, y: -dy / max }; // 屏幕 y 向下为正，推向"上"=前进
    // 手动优先：取消双击自动移动
    if (this.moveTarget || this.pathPoints.length) { this.moveTarget = null; this.pathPoints = []; }
  };
  onJoyEnd = (e: PointerEvent): void => {
    if (this.joystickId !== e.pointerId) return;
    this.joystickId = null;
    this.joyKnob = { x: 0, y: 0 };
    this.touchVec = { x: 0, y: 0 };
    // 发一次停止指令，避免残影移动
    if (this.ws.isConnected) {
      this.ws.send('/app/ws.input', { seq: Math.floor(performance.now()), move: { dx: 0, dz: 0, run: false } });
    }
  };
  onTouchJump = (): void => {
    if (!this.buildMode && !this.fishMode && !this.mineMode) this.sendJump();
  };
  onTouchRun = (): void => {
    this.running = !this.running;
    if (this.running) { this.runKey = null; this.runIdleSince = 0; }
    this.hint = this.running ? '🏃 奔跑已开启' : '🚶 行走';
  };

  // ================= 上下文动作按钮（P1-引导） =================
  /** 上下文「挖矿」按钮：开采最近矿脉 */
  onCtxMine = (): void => {
    if (this.nearestOre) this.doMine(this.nearestOre.gx, this.nearestOre.gz);
  };
  /** 上下文「钓鱼」按钮：钓最近水域 */
  onCtxFish = (): void => {
    if (!this.fishMode) this.doFishCatch();
  };
}

