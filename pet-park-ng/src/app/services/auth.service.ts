import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserInfo } from '../models';

/** 认证服务：注册/登录/token 管理（代理：/api → 后端，前端不暴露后端地址） */
@Injectable({ providedIn: 'root' })
export class AuthService {
  token = '';
  user: UserInfo | null = null;
  private readonly TOKEN_KEY = 'pp_token';
  private readonly USER_KEY = 'pp_user';

  constructor(private http: HttpClient) {
    try {
      this.token = localStorage.getItem(this.TOKEN_KEY) || '';
      const ui = localStorage.getItem(this.USER_KEY);
      if (ui) this.user = JSON.parse(ui);
    } catch (e) { /* ignore */ }
  }

  get isLoggedIn(): boolean { return !!this.token; }

  register(username: string, password: string, nickname: string, confirmPassword: string, inviteCode: string, education: string, gender: string): Observable<{ code: number; msg: string; data: UserInfo }> {
    return this.http.post<{ code: number; msg: string; data: UserInfo }>('/api/auth/register',
      { username, password, nickname, confirmPassword, inviteCode, education, gender });
  }

  login(username: string, password: string): Observable<{ code: number; msg: string; data: UserInfo }> {
    return this.http.post<{ code: number; msg: string; data: UserInfo }>('/api/auth/login',
      { username, password });
  }

  /** 登录/注册成功后保存凭证 */
  onAuthSuccess(data: UserInfo): void {
    this.token = data.token || '';
    this.user = data;
    try {
      localStorage.setItem(this.TOKEN_KEY, this.token);
      localStorage.setItem(this.USER_KEY, JSON.stringify({
        userId: data.userId, username: data.username, nickname: data.nickname, role: data.role ?? 'user', coins: data.coins ?? 0, education: data.education ?? 'PRIMARY_1', gender: data.gender ?? 'M'
      }));
    } catch (e) { /* ignore */ }
  }

  logout(): void {
    this.token = '';
    this.user = null;
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (e) { /* ignore */ }
  }

  /** 给 HttpClient 注入 Bearer token 的 headers */
  authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token });
  }

  /** 获取当前登录用户最新信息 */
  getMe(): Observable<{ code: number; msg: string; data: UserInfo }> {
    return this.http.get<{ code: number; msg: string; data: UserInfo }>('/api/auth/me', { headers: this.authHeaders() });
  }

  /** 修改资料：用户名 / 昵称（只传要改的） */
  updateProfile(username?: string, nickname?: string, education?: string): Observable<{ code: number; msg: string; data: UserInfo }> {
    const body: any = {};
    if (username !== undefined) body.username = username;
    if (nickname !== undefined) body.nickname = nickname;
    if (education !== undefined) body.education = education;
    return this.http.put<{ code: number; msg: string; data: UserInfo }>('/api/auth/profile', body, { headers: this.authHeaders() });
  }

  /** 修改密码：校验旧密码后设置新密码 */
  updatePassword(oldPassword: string, newPassword: string): Observable<{ code: number; msg: string; data: any }> {
    return this.http.put<{ code: number; msg: string; data: any }>('/api/auth/password',
      { oldPassword, newPassword }, { headers: this.authHeaders() });
  }

  // ================= 管理员：用户管理 =================

  /** 用户列表（仅管理员） */
  adminListUsers(): Observable<{ code: number; msg: string; data: any[] }> {
    return this.http.get<{ code: number; msg: string; data: any[] }>('/api/admin/users', { headers: this.authHeaders() });
  }

  /** 编辑用户（仅管理员） */
  adminUpdateUser(id: number, body: any): Observable<{ code: number; msg: string; data: any }> {
    return this.http.put<{ code: number; msg: string; data: any }>('/api/admin/users/' + id, body, { headers: this.authHeaders() });
  }

  /** 删除用户（仅管理员） */
  adminDeleteUser(id: number): Observable<{ code: number; msg: string; data: any }> {
    return this.http.delete<{ code: number; msg: string; data: any }>('/api/admin/users/' + id, { headers: this.authHeaders() });
  }

  // ================= 学习：错题本 =================

  /** 错题列表 */
  studyFailures(): Observable<{ code: number; msg: string; data: any[] }> {
    return this.http.get<{ code: number; msg: string; data: any[] }>('/api/study/failures', { headers: this.authHeaders() });
  }

  /** 标记已掌握 */
  studyMarkMastered(failureId: number): Observable<{ code: number; msg: string; data: any }> {
    return this.http.post<{ code: number; msg: string; data: any }>('/api/study/failures/' + failureId + '/mastered', {}, { headers: this.authHeaders() });
  }

  /** 删除错题 */
  studyDeleteFailure(failureId: number): Observable<{ code: number; msg: string; data: any }> {
    return this.http.delete<{ code: number; msg: string; data: any }>('/api/study/failures/' + failureId, { headers: this.authHeaders() });
  }
}
