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
  mods = ['home', 'farm', 'pond', 'ranch', 'study'];  // 联网版：删掉 data（云端存档，不再需要本地导入导出 Tab）

  // 登录表单
  loginUser = '';
  loginPass = '';
  // 注册表单（额外字段）
  regNickname = '';
  regPass2 = '';
  regInvite = '';
  regEducation = 'PRIMARY_1';
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

  // 管理员：用户管理
  adminUsers: any[] = [];
  showUserAdmin = false;
  adminMsg = '';
  editUser: any = null;
  editForm = { username: '', nickname: '', role: 'user', coins: 0, password: '', education: 'PRIMARY_1' };

  // 今日待办
  todayList: Array<{ icon: string; text: string; btn: string; action: () => void }> = [];

  constructor(public state: StateService, public auth: AuthService) {}

  /** 积分：读游戏实时值（登录成功时已用后端权威 users.coins 初始化） */
  get coins(): number { return this.state.state.coins ?? 0; }
  get pet(): any { return this.state.state.pet; }
  get isNight(): boolean { return this.state.isNight(); }

  /** 存档大小（KB）——模板里不能直接用全局 JSON，封装成方法 */
  stateSize(): string {
    try { return (JSON.stringify(this.state.state).length / 1024).toFixed(1); }
    catch (e) { return '0.0'; }
  }

  // ================= 模块切换 =================
  switchMod(m: string): void { this.mod = m; this.renderToday(); }

  // ================= 时钟 + 日期 + 天气 =================
  /** 顶栏时钟：年月日 + 星期 + 实时天气（联网缓存 30 分钟） */
  weather = '晴';                        // 当前天气（默认"晴"）
  private weatherTimer: any = null;

  clockText(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const weeks = ['日', '一', '二', '三', '四', '五', '六'];
    return `${yyyy}-${mm}-${dd} 周${weeks[d.getDay()]} ${this.weather}`;
  }

  /** 拉取实时天气（武汉坐标），缓存 30 分钟；失败兜底保留上次值 */
  fetchWeather(): void {
    const cached = localStorage.getItem('pp_weather_cache');
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (Date.now() - obj.t < 30 * 60 * 1000) { this.weather = obj.w; return; }
      } catch (e) { /* ignore */ }
    }
    fetch('https://api.open-meteo.com/v1/forecast?latitude=30.59&longitude=114.31&current_weather=true')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const code = d?.current_weather?.weathercode ?? 0;
        const map: Record<number, string> = {
          0: '晴', 1: '晴', 2: '多云', 3: '阴', 45: '雾', 48: '雾',
          51: '小雨', 53: '小雨', 55: '小雨', 61: '雨', 63: '雨', 65: '大雨',
          71: '雪', 73: '雪', 75: '大雪',
          80: '阵雨', 81: '阵雨', 82: '阵雨',
          95: '雷雨', 96: '雷雨', 99: '雷雨'
        };
        this.weather = map[code] || '晴';
        try { localStorage.setItem('pp_weather_cache', JSON.stringify({ t: Date.now(), w: this.weather })); } catch (e) { /* ignore */ }
      })
      .catch(() => { /* 失败保留上次缓存或默认'晴' */ });
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
    this.fetchWeather();                                   // 拉取实时天气
    this.weatherTimer = setInterval(() => { this.fetchWeather(); }, 30 * 60 * 1000);  // 每 30 分钟刷一次
    setInterval(() => { this.renderClock(); this.renderToday(); }, 2000);
    this.renderClock();
    this.renderToday();
    document.addEventListener('fullscreenchange', this.fsHandler);
    document.addEventListener('webkitfullscreenchange', this.fsHandler);
  }

  ngOnDestroy(): void {
    this.state.destroy();
    if (this.weatherTimer) { clearInterval(this.weatherTimer); this.weatherTimer = null; }
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
        if (res.code === 0) {
          this.auth.onAuthSuccess(res.data); this.showLogin = false; this.applyBackendCoins(res.data.coins); this.state.syncFromServer();
          this.state.loadQuestions(res.data.education);  // 登录后按用户学历加载题库
        }
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
    if (!this.regEducation) { this.loginMsg = '请选择学历'; return; }
    this.loginBusy = true; this.loginMsg = '';
    this.auth.register(this.loginUser, this.loginPass, this.regNickname.trim(), this.regPass2, this.regInvite.trim(), this.regEducation).subscribe({
      next: res => {
        this.loginBusy = false;
        if (res.code === 0) {
          this.auth.onAuthSuccess(res.data); this.showLogin = false; this.applyBackendCoins(res.data.coins); this.state.syncFromServer();
          this.state.loadQuestions(res.data.education);  // 注册后按用户学历加载题库
        }
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
          this.applyBackendCoins(res.data.coins);   // 同步后端权威积分
          this.newNickname = res.data.nickname || '';
          this.newUsername = res.data.username || '';
          try {
            localStorage.setItem(this.auth['USER_KEY'], JSON.stringify({
              userId: res.data.userId, username: res.data.username, nickname: res.data.nickname, coins: res.data.coins ?? 0, education: res.data.education ?? 'PRIMARY_1'
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
    this.showUserAdmin = false;
  }

  /** 用后端权威积分（users.coins）初始化游戏内积分，防止继承前端默认值 */
  applyBackendCoins(coins: number | undefined): void {
    this.state.state.coins = coins ?? 0;
  }

  // ================= 管理员：用户管理 =================
  get isAdmin(): boolean { return this.auth.user?.role === 'admin'; }

  /** 打开用户管理页并拉取列表 */
  openUserAdmin(): void {
    this.showUserAdmin = true;
    this.adminMsg = '';
    this.loadUsers();
  }
  closeUserAdmin(): void { this.showUserAdmin = false; }

  loadUsers(): void {
    this.auth.adminListUsers().subscribe({
      next: res => { if (res.code === 0) { this.adminUsers = res.data || []; } else { this.adminMsg = res.msg || '加载失败'; } },
      error: () => { this.adminMsg = '无法连接服务器'; }
    });
  }

  /** 打开编辑弹窗 */
  openEditUser(u: any): void {
    this.editUser = u;
    this.editForm = { username: u.username || '', nickname: u.nickname || '', role: u.role || 'user', coins: u.coins ?? 0, password: '', education: u.education || 'PRIMARY_1' };
  }
  closeEditUser(): void { this.editUser = null; }

  /** 保存编辑 */
  saveEditUser(): void {
    if (!this.editUser) return;
    const body: any = {};
    if (this.editForm.username !== this.editUser.username) body.username = this.editForm.username.trim();
    if (this.editForm.nickname !== (this.editUser.nickname || '')) body.nickname = this.editForm.nickname.trim();
    if (this.editForm.role !== this.editUser.role) body.role = this.editForm.role;
    if (this.editForm.coins !== (this.editUser.coins ?? 0)) body.coins = this.editForm.coins;
    if (this.editForm.password) body.password = this.editForm.password;
    if (this.editForm.education !== (this.editUser.education || 'PRIMARY_1')) body.education = this.editForm.education;
    if (!Object.keys(body).length) { this.editUser = null; return; }
    this.auth.adminUpdateUser(this.editUser.userId, body).subscribe({
      next: res => {
        if (res.code === 0) {
          this.editUser = null;
          this.loadUsers();
          // 若改的是自己，同步本地用户信息
          if (this.auth.user && this.auth.user.userId === res.data.userId) {
            this.auth.user.username = res.data.username;
            this.auth.user.nickname = res.data.nickname;
            this.auth.user.role = res.data.role;
            this.auth.user.coins = res.data.coins;
            try {
              localStorage.setItem(this.auth['USER_KEY'], JSON.stringify({
                userId: res.data.userId, username: res.data.username, nickname: res.data.nickname,
                role: res.data.role, coins: res.data.coins
              }));
            } catch (e) { /* ignore */ }
          }
        } else this.adminMsg = res.msg || '保存失败';
      },
      error: () => { this.adminMsg = '无法连接服务器'; }
    });
  }

  /** 删除用户 */
  deleteUser(u: any): void {
    if (!confirm('确定删除用户「' + (u.nickname || u.username) + '」？其游戏存档将一并删除，不可恢复！')) return;
    this.auth.adminDeleteUser(u.userId).subscribe({
      next: res => {
        if (res.code === 0) { this.loadUsers(); }
        else this.adminMsg = res.msg || '删除失败';
      },
      error: () => { this.adminMsg = '无法连接服务器'; }
    });
  }

  // ================= 学习（委托给 StateService） =================
  get studySubjects() { return this.state.studySubjects(); }
  get studySession() { return this.state.studySession; }
  /** 当前考试学历（空=默认用户学历） */
  studyEducation = '';
  /** 学历枚举（用于下拉选项） */
  readonly educationOptions = [
    { v: 'PRIMARY_1',    l: '小学一年级' }, { v: 'PRIMARY_2',    l: '小学二年级' },
    { v: 'PRIMARY_3',    l: '小学三年级' }, { v: 'PRIMARY_4',    l: '小学四年级' },
    { v: 'PRIMARY_5',    l: '小学五年级' }, { v: 'PRIMARY_6',    l: '小学六年级' },
    { v: 'JUNIOR_1',     l: '初中一年级' }, { v: 'JUNIOR_2',     l: '初中二年级' }, { v: 'JUNIOR_3',     l: '初中三年级' },
    { v: 'SENIOR_1',     l: '高中一年级' }, { v: 'SENIOR_2',     l: '高中二年级' }, { v: 'SENIOR_3',     l: '高中三年级' },
    { v: 'UNIVERSITY_1', l: '大学一年级' }, { v: 'UNIVERSITY_2', l: '大学二年级' },
    { v: 'UNIVERSITY_3', l: '大学三年级' }, { v: 'UNIVERSITY_4', l: '大学四年级' }
  ];
  /** 当前显示学历：用户手动选择 > 用户学历 > PRIMARY_1 */
  get studyEducationDisplay(): string {
    return this.studyEducation || (this.auth.user?.education ?? 'PRIMARY_1');
  }
  /** 下拉可选范围：用户学历及以下 */
  get studyEduOptions() {
    const all = this.educationOptions;
    const myRank = all.findIndex(x => x.v === (this.auth.user?.education ?? 'PRIMARY_1'));
    return myRank < 0 ? all : all.slice(0, myRank + 1);
  }
  /** 切换学历：重新拉题库（后端按 education <= 给值 过滤） */
  onStudyEduChange(edu: string): void {
    this.studyEducation = edu;
    this.state.loadQuestions(edu);
  }
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

  // ================= 读题（语音朗读） =================
  isSpeaking = false;
  /** 朗读当前题目：题干 + 选项（选择题）；★ 答完才附带答案 */
  readAloud(): void {
    const it = this.studyCurrentItem();
    if (!it) return;
    const parts: string[] = [];
    if (it.q) parts.push(String(it.q));
    if (it.en) parts.push(String(it.en));
    if (it.cn) parts.push(String(it.cn));
    if (Array.isArray(it.opts) && it.opts.length) {
      parts.push('选项：' + it.opts.join('，'));
    }
    // ★ 答案只在答完之后才读（用户选择后才知道）
    const s = this.studySession;
    if (s && s.answered && it.a) {
      parts.push('答案：' + String(it.a));
    }
    this.speakText(parts.join('。'));
  }
  /** 朗读指定文本（Web Speech API，中文语音优先） */
  private speakText(text: string): void {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.95;
      const voices = synth.getVoices();
      const zh = voices.find(v => /zh|Chinese/i.test(v.lang));
      if (zh) u.voice = zh;
      u.onstart = () => { this.isSpeaking = true; };
      u.onend = u.onerror = () => { this.isSpeaking = false; };
      synth.speak(u);
    } catch (e) { /* 浏览器不支持时静默 */ }
  }
  /** 停止朗读 */
  stopRead(): void {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    this.isSpeaking = false;
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
}
