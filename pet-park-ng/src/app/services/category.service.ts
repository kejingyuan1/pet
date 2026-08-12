import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Category } from '../models';

/** 统一类目服务：/api/categories 只读，启动时拉取覆盖本地（运营可配） */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  categories: Category[] = [];

  constructor(private http: HttpClient) {}

  load(): Observable<{ code: number; msg: string; data: Category[] }> {
    return this.http.get<{ code: number; msg: string; data: Category[] }>('/api/categories');
  }

  catByCode(code: string | null | undefined): Category | null {
    if (!code) return null;
    return this.categories.find(c => c.code === code) || null;
  }

  catsByType(type: string): Category[] {
    return this.categories.filter(c => c.type === type);
  }
}
