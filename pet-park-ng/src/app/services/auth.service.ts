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

  register(username: string, password: string, nickname?: string): Observable<{ code: number; msg: string; data: UserInfo }> {
    return this.http.post<{ code: number; msg: string; data: UserInfo }>('/api/auth/register',
      { username, password, nickname: nickname || username });
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
        userId: data.userId, username: data.username, nickname: data.nickname
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
}
