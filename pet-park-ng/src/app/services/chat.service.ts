import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ChatMessage {
  uid: number;
  nickname: string;
  text: string;
  ts: number;
  timeText: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  /** 聊天消息列表（app 层级面板消费） */
  messages$ = new BehaviorSubject<ChatMessage[]>([]);

  /** 追加一条消息 */
  push(msg: ChatMessage): void {
    const list = [...this.messages$.value, msg];
    if (list.length > 100) list.shift();
    this.messages$.next(list);
  }

  /** 清空 */
  clear(): void {
    this.messages$.next([]);
  }
}
