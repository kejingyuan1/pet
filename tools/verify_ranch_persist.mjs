// RANCH-FISH-DB-001 重启持久化验证：登录同一用户 → GET /api/ranch/animals 应仍含 fish（DB 落库，非内存）
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8080';
const u = JSON.parse(readFileSync('D:/pet/tools/ranch_test_user.json', 'utf8'));
console.log('登录用户', u.username, 'uid=', u.userId);

const r = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: u.username, password: u.password })
});
const body = await r.json();
console.log('login status=', r.status, 'code=', body?.code);
if (body?.code !== 0) { console.log('❌ 登录失败'); process.exit(1); }
const token = body.data.token;

const a = await fetch(BASE + '/api/ranch/animals', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
});
const ab = await a.json();
console.log('GET /api/ranch/animals =>', JSON.stringify(ab?.data));
if (a.status === 200 && Array.isArray(ab?.data) && ab.data.includes('fish')) {
  console.log('✅ 重启后 fish 仍在（持久化有效，非内存）');
  process.exit(0);
} else {
  console.log('❌ 重启后丢失 fish');
  process.exit(1);
}
