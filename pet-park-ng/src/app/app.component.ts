import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from './services/state.service';
import { AuthService } from './services/auth.service';
import { Scene3dComponent } from './components/scene3d/scene3d.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, Scene3dComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  mod = 'home';
  mods = ['home', 'farm', 'pond', 'ranch', 'study', 'data'];

  // 登录表单
  loginUser = '';
  loginPass = '';
  // 注册表单（额外字段）
  regNickname = '';
  regPass2 = '';
  regInvite = '';
  loginMode: 'login' | 'register' = 'login';
  showLogin = false;
  loginBusy = false;
  loginMsg = '';

  // 账号设置（用户管理）
  showProfile = false;
  profileMsg = '';
  newNickname = '';
  newUsername = '';
  passMsg = '';
  oldPass = '';
  newPass = '';

  // 今日待办
  todayList: Array<{ icon: string; text: string; btn: string; action: () => void }> = [];

  constructor(public state: StateService, public auth: AuthService) {}

  get coins(): number { return this.state.state.coins; }
  get pet(): any { return this.state.state.pet; }
  get isNight(): boolean { return this.state.isNight(); }

  /** 存档大小（KB）——模板里不能直接用全局 JSON，封装成方法 */
  stateSize(): string {
    try { return (JSON.stringify(this.state.state).length / 1024).toFixed(1); }
    catch (e) { return '0.0'; }
  }

  // ================= 模块切换 =================
  switchMod(m: string): void { this.mod = m; this.renderToday(); }

  // ================= 时钟 =================
  clockText(): string {
    const d = this.state.state.gameDays;
    const h = Math.floor(this.state.gameHour());
    const mm = Math.floor((this.state.gameHour() % 1) * 60);
    return '第' + (Math.floor(d) + 1) + '天 ' + (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm + (this.isNight ? ' 夜晚' : ' 白天');
  }
  renderClock(): void {
    const el = document.getElementById('clockNum');
    if (el) el.textContent = this.clockText();
  }

  // ================= 今日待办 =================
  renderToday(): void {
    const s = this.state.state;
    const items: Array<{ icon: string; text: string; btn: string; action: () => void }> = [];
    // 逾期/今天任务
    const p = s.pet;
    if (p.sick) items.push({ icon: '✚', text: p.name + '感冒了，需要喂药！', btn: '喂药(20)', action: () => { this.state.buyMedicine(); this.renderToday(); } });
    if (p.satiety < 30) items.push({ icon: '♥', text: p.name + '肚子饿了，快喂点吃的！', btn: '喂食', action: () => { if (this.mod !== 'home') this.switchMod('home'); } });
    if (p.mood < 30) items.push({ icon: '☺', text: p.name + '心情不好，陪它玩会儿！', btn: '陪玩', action: () => { this.state.playWithPet(); this.renderToday(); } });
    for (const f of s.farm.plots) {
      if (f.crop && f.grownDays >= (this.state.catByCode(f.crop)?.grow_days ?? 0)) {
        items.push({ icon: '🌱', text: '菜地的' + (this.state.catByCode(f.crop)?.name ?? '') + '成熟了！', btn: '去收获', action: () => this.switchMod('farm') });
        break;
      }
    }
    for (const fi of s.pond.fish) {
      if (fi.type && fi.grownDays >= (this.state.catByCode(fi.type)?.grow_days ?? 0)) {
        items.push({ icon: '🐟', text: '鱼塘的' + (this.state.catByCode(fi.type)?.name ?? '') + '长大了！', btn: '去捞鱼', action: () => this.switchMod('pond') });
        break;
      }
    }
    for (const a of s.ranch.stalls) {
      if (a.type && a.productReady) {
        items.push({ icon: '🐔', text: '牧场有' + (this.state.catByCode(a.type)?.product ?? '产出') + '可收！', btn: '去牧场', action: () => this.switchMod('ranch') });
        break;
      }
    }
    if (items.length === 0) items.push({ icon: '✓', text: '今天都处理完啦，轻松一下～', btn: '', action: () => {} });
    this.todayList = items.slice(0, 5);
  }

  // ================= 出门/回家 =================
  togglePetOut(): void { this.state.togglePetOut(); }
  get outBtnText(): string {
    const p = this.state.state.pet;
    return p.sick ? '生病中…' : (p.out ? '叫回家' : '出门玩');
  }

  // ================= 天气显示 =================
  weatherIcon(): string {
    if (this.state.state.weather === 'rain') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#2FA8D8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5a3.5 3.5 0 0 1 .5 6.97"/><path d="M8 16l-1.5 3M12 17l-1.5 3M16 16l-1.5 3" stroke="#4CC9F0" stroke-width="1.8"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="#F07C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5" fill="#FFD166" stroke="#F0A500" stroke-width="1.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M17 7l1.4-1.4M5.6 18.4L7 17"/></svg>';
  }
  weatherTip(): void {
    // 与单文件版一致：天气是自动变化的提示（用 toast，但 Angular 版可临时用 alert 兜底）
    try {
      // 简易 toast：动态插入一个 toast 节点
      const t = document.createElement('div');
      t.textContent = '天气是自动变化的，会随机下雨/放晴～';
      t.style.cssText = 'position:fixed;left:50%;top:80px;transform:translateX(-50%);background:rgba(60,40,20,.92);color:#fff;padding:10px 18px;border-radius:12px;font-size:.9rem;font-weight:700;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3)';
      document.body.appendChild(t);
      setTimeout(() => { t.remove(); }, 1800);
    } catch (e) { /* ignore */ }
  }

  // ================= 全屏 =================
  isFs = false;
  toggleFullscreen(): void {
    const el: any = document.documentElement;
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit = (document as any).exitFullscreen || (document as any).webkitExitFullscreen || (document as any).mozCancelFullScreen || (document as any).msExitFullscreen;
      if (exit) exit.call(document);
    }
  }
  private fsHandler = () => { this.isFs = !!document.fullscreenElement; };

  ngOnInit(): void {
    this.state.init();
    setInterval(() => { this.renderClock(); this.renderToday(); }, 2000);
    this.renderClock();
    this.renderToday();
    document.addEventListener('fullscreenchange', this.fsHandler);
    document.addEventListener('webkitfullscreenchange', this.fsHandler);
  }

  ngOnDestroy(): void {
    this.state.destroy();
    document.removeEventListener('fullscreenchange', this.fsHandler);
    document.removeEventListener('webkitfullscreenchange', this.fsHandler);
  }

  // ================= 登录 =================
  openLogin(): void { this.showLogin = true; this.loginMsg = ''; }
  closeLogin(): void { this.showLogin = false; }
  switchLoginMode(m: 'login' | 'register'): void { this.loginMode = m; this.loginMsg = ''; }
  doLogin(): void {
    if (!this.loginUser || !this.loginPass) { this.loginMsg = '请输入用户名和密码'; return; }
    this.loginBusy = true; this.loginMsg = '';
    this.auth.login(this.loginUser, this.loginPass).subscribe({
      next: res => {
        this.loginBusy = false;
        if (res.code === 0) { this.auth.onAuthSuccess(res.data); this.showLogin = false; this.state.syncFromServer(); }
        else this.loginMsg = res.msg || '登录失败';
      },
      error: () => { this.loginBusy = false; this.loginMsg = '无法连接服务器'; }
    });
  }
  doRegister(): void {
    // 前端校验（后端也会再校验一遍）
    if (!this.loginUser || !this.loginPass) { this.loginMsg = '请输入用户名和密码'; return; }
    if (!this.regNickname || !this.regNickname.trim()) { this.loginMsg = '请输入昵称'; return; }
    if (this.loginPass.length < 6) { this.loginMsg = '密码至少 6 位'; return; }
    if (!/[A-Za-z]/.test(this.loginPass) || !/\d/.test(this.loginPass)) { this.loginMsg = '密码必须同时包含数字和字母'; return; }
    if (this.loginPass !== this.regPass2) { this.loginMsg = '两次输入的密码不一致'; return; }
    if (!this.regInvite || !this.regInvite.trim()) { this.loginMsg = '请输入邀请码'; return; }
    this.loginBusy = true; this.loginMsg = '';
    this.auth.register(this.loginUser, this.loginPass, this.regNickname.trim(), this.regPass2, this.regInvite.trim()).subscribe({
      next: res => {
        this.loginBusy = false;
        if (res.code === 0) { this.auth.onAuthSuccess(res.data); this.showLogin = false; this.state.syncFromServer(); }
        else this.loginMsg = res.msg || '注册失败';
      },
      error: () => { this.loginBusy = false; this.loginMsg = '无法连接服务器'; }
    });
  }

  // ================= 账号设置（用户管理） =================
  /** 打开账号面板：预填当前资料 + 刷新服务端最新信息 */
  openProfile(): void {
    this.showProfile = true;
    this.profileMsg = '';
    this.passMsg = '';
    this.newNickname = this.auth.user?.nickname || '';
    this.newUsername = this.auth.user?.username || '';
    this.oldPass = '';
    this.newPass = '';
    // 拉取服务端最新用户信息（改过名后刷新显示）
    this.auth.getMe().subscribe({
      next: res => {
        if (res.code === 0 && res.data) {
          this.auth.user = res.data;
          this.newNickname = res.data.nickname || '';
          this.newUsername = res.data.username || '';
          try {
            localStorage.setItem(this.auth['USER_KEY'], JSON.stringify({
              userId: res.data.userId, username: res.data.username, nickname: res.data.nickname
            }));
          } catch (e) { /* ignore */ }
        }
      },
      error: () => { /* 静默：失败保留本地显示 */ }
    });
  }
  closeProfile(): void { this.showProfile = false; }

  /** 保存昵称 */
  doUpdateNickname(): void {
    if (!this.newNickname || !this.newNickname.trim()) { this.profileMsg = '昵称不能为空'; return; }
    this.auth.updateProfile(undefined, this.newNickname.trim()).subscribe({
      next: res => {
        if (res.code === 0) {
          this.auth.user = res.data;
          try {
            localStorage.setItem(this.auth['USER_KEY'], JSON.stringify({
              userId: res.data.userId, username: res.data.username, nickname: res.data.nickname
            }));
          } catch (e) { /* ignore */ }
          this.profileMsg = '✅ 昵称已更新';
        } else this.profileMsg = res.msg || '保存失败';
      },
      error: () => { this.profileMsg = '无法连接服务器'; }
    });
  }

  /** 保存用户名 */
  doUpdateUsername(): void {
    if (!this.newUsername || !this.newUsername.trim()) { this.profileMsg = '用户名不能为空'; return; }
    this.auth.updateProfile(this.newUsername.trim()).subscribe({
      next: res => {
        if (res.code === 0) {
          this.auth.user = res.data;
          try {
            localStorage.setItem(this.auth['USER_KEY'], JSON.stringify({
              userId: res.data.userId, username: res.data.username, nickname: res.data.nickname
            }));
          } catch (e) { /* ignore */ }
          this.profileMsg = '✅ 用户名已更新';
        } else this.profileMsg = res.msg || '保存失败';
      },
      error: () => { this.profileMsg = '无法连接服务器'; }
    });
  }

  /** 修改密码 */
  doUpdatePassword(): void {
    if (!this.oldPass || !this.newPass) { this.passMsg = '请填写旧密码和新密码'; return; }
    if (this.newPass.length < 6) { this.passMsg = '新密码至少 6 位'; return; }
    this.auth.updatePassword(this.oldPass, this.newPass).subscribe({
      next: res => {
        if (res.code === 0) { this.passMsg = '✅ 密码已修改'; this.oldPass = ''; this.newPass = ''; }
        else this.passMsg = res.msg || '修改失败';
      },
      error: () => { this.passMsg = '无法连接服务器'; }
    });
  }

  logout(): void {
    this.auth.logout();
    this.showProfile = false;
    this.showLogin = false;
  }

  // ================= 学习（委托给 StateService） =================
  get studySubjects() { return this.state.studySubjects(); }
  get studySession() { return this.state.studySession; }
  get studySubjectIdx() { return this.state.studySubjectIdx; }
  get studyEarned() { return this.state.studyTodayEarned(); }
  get studyLimit() { return 30; }
  studySubjIcon(subj: any): string {
    const map: Record<string, string> = { en: '📖', math: '🔢', hz: '🀄', cy: '🏮', th: '🧩' };
    return map[subj.icon] || '📚';
  }
  studyGroupIcon(gid: string): string {
    const map: Record<string, string> = {
      animals: '🐾', fruits: '🍎', colors: '🎨', numbers: '🔢',
      add10: '➕', sub10: '➖', fill10: '✏️', basic: '🀄', antonym: '↔️',
      animal: '🐘', common: '🏮', logic: '🧠', series: '🔍'
    };
    return map[gid] || '📘';
  }
  studyCurrentSubj(): any { return this.studySubjects[this.studySubjectIdx] || { name: '', groups: [] }; }
  studyCurrentGroup(): any {
    const s = this.studySession;
    if (!s) return { name: '', items: [] };
    return this.studySubjects[s.subjIdx].groups[s.groupIdx];
  }
  studyCurrentItem(): any {
    const s = this.studySession;
    if (!s) return null;
    return this.studySubjects[s.subjIdx].groups[s.groupIdx].items[s.itemIdx];
  }
  wordIconSvg(name: string): string {
    const svgs: Record<string, string> = {
      wordCat: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="42" rx="20" ry="18" fill="#FF9E4A"/><path d="M16 30 L8 14 L24 24 Z" fill="#FF8F6B"/><path d="M48 30 L56 14 L40 24 Z" fill="#FF8F6B"/><circle cx="26" cy="40" r="4.2" fill="#2B2118"/><circle cx="38" cy="40" r="4.2" fill="#2B2118"/><path d="M28 47 q4 3 8 0" stroke="#2B2118" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M23 49 q-5 7-9 5 M41 49 q5 7 9 5" stroke="#2B2118" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      wordDog: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="44" rx="21" ry="18" fill="#C98A4B"/><path d="M16 34 q-8-10-2-20 q10 4 10 14 Z" fill="#B87A3A"/><path d="M48 34 q8-10 2-20 q-10 4-10 14 Z" fill="#B87A3A"/><circle cx="26" cy="42" r="4.2" fill="#2B2118"/><circle cx="38" cy="42" r="4.2" fill="#2B2118"/><ellipse cx="32" cy="49" rx="6" ry="4" fill="#5A3B2A"/></svg>',
      wordBird: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="36" rx="17" ry="14" fill="#4CC9F0"/><circle cx="32" cy="20" r="9" fill="#4CC9F0"/><path d="M41 22 l8 -5 l-2 8 Z" fill="#F07C00"/><circle cx="35" cy="18" r="1.6" fill="#2B2118"/><path d="M32 26 l3 3 l-3 2 l-3 -2 Z" fill="#F07C00"/><path d="M18 36 l-8 4 l8 1 Z" fill="#F07C00"/></svg>',
      wordFish: '<svg viewBox="0 0 64 64"><ellipse cx="30" cy="34" rx="20" ry="13" fill="#4CC9F0"/><path d="M48 34 l12 -8 v16 Z" fill="#2FA8D8"/><circle cx="22" cy="32" r="2.5" fill="#2B2118"/><path d="M20 40 q4 3 8 0" stroke="#2B2118" stroke-width="1.5" fill="none"/></svg>',
      wordRabbit: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="42" rx="18" ry="17" fill="#F5E6D3"/><ellipse cx="20" cy="22" rx="5" ry="13" fill="#F5E6D3"/><ellipse cx="44" cy="22" rx="5" ry="13" fill="#F5E6D3"/><circle cx="26" cy="40" r="3.5" fill="#2B2118"/><circle cx="38" cy="40" r="3.5" fill="#2B2118"/><path d="M28 47 q4 3 8 0" stroke="#2B2118" stroke-width="2" fill="none"/></svg>',
      wordApple: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="20" fill="#E63946"/><path d="M32 16 q-3-12 3-15 q3 10 0 15" stroke="#58B368" stroke-width="3" fill="none"/><path d="M32 20 q-10-6-16-2 q6 14 16 6" fill="#FF8F9E" opacity=".6"/></svg>',
      wordBanana: '<svg viewBox="0 0 64 64"><path d="M14 52 q8-30 36-34 q-4 28-30 34 Z" fill="#FFD166"/><path d="M14 52 q8-30 36-34" stroke="#C98A4B" stroke-width="3" fill="none"/><path d="M50 18 q2-6 6-8" stroke="#58B368" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
      wordGrape: '<svg viewBox="0 0 64 64"><circle cx="24" cy="26" r="8" fill="#9B5DE5"/><circle cx="40" cy="26" r="8" fill="#9B5DE5"/><circle cx="16" cy="40" r="8" fill="#7A3CC8"/><circle cx="32" cy="40" r="8" fill="#9B5DE5"/><circle cx="48" cy="40" r="8" fill="#7A3CC8"/><circle cx="24" cy="52" r="7" fill="#7A3CC8"/><circle cx="40" cy="52" r="7" fill="#9B5DE5"/><path d="M32 10 q-2-6 2-8" stroke="#58B368" stroke-width="2.5" fill="none"/></svg>',
      wordOrange: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="21" fill="#F07C00"/><circle cx="26" cy="28" r="3" fill="#FFB35C"/><path d="M32 15 q-2-6 1-9" stroke="#58B368" stroke-width="3" fill="none"/><path d="M22 34 q-8-2-10-8" stroke="#58B368" stroke-width="3" fill="none"/></svg>',
      wordWatermelon: '<svg viewBox="0 0 64 64"><path d="M10 30 a22 22 0 0 1 44 0 Z" fill="#06D6A0"/><path d="M32 30 a8 8 0 0 1 0 14 a8 8 0 0 1 0 -14" fill="#FF6B9D"/><path d="M24 22 l4 6 M32 20 l2 7 M40 22 l-4 6" stroke="#7CCE8B" stroke-width="2" stroke-linecap="round"/></svg>',
      wordRed: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#E63946"/><circle cx="26" cy="26" r="5" fill="#FF8F9E"/></svg>',
      wordBlue: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#4CC9F0"/><circle cx="26" cy="26" r="5" fill="#B8E9F8"/></svg>',
      wordGreen: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#06D6A0"/><circle cx="26" cy="26" r="5" fill="#A8F0D8"/></svg>',
      wordYellow: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#FFD166"/><circle cx="26" cy="26" r="5" fill="#FFE9A8"/></svg>',
      wordPink: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#FF6B9D"/><circle cx="26" cy="26" r="5" fill="#FFB8D0"/></svg>',
      wordOne: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#FF8F6B"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#fff">1</text></svg>',
      wordTwo: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#4CC9F0"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#fff">2</text></svg>',
      wordThree: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#06D6A0"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#fff">3</text></svg>',
      wordFour: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#FFD166"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#9C6A00">4</text></svg>',
      wordFive: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#9B5DE5"/><text x="32" y="40" font-size="22" font-weight="900" text-anchor="middle" fill="#fff">5</text></svg>'
    };
    return svgs[name] || '';
  }

  // ================= 备份 =================
  exportData(): void { this.state.exportData(); }
  onImportFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files[0]) this.state.importData(input.files[0]);
  }
}
