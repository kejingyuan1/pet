// RANCH-FISH-DB-001 后端端点 + 持久化验证
// 流程：注册测试用户 → GET /api/ranch/animals(空) → POST /api/ranch/buy(fish) → GET(含fish)
//       → 重复购买(应拒 1001001) → 校验 DB 落库（每次 GET 都从 DB 读）
const BASE = 'http://127.0.0.1:8080';
const U = 'rt' + (Date.now() % 1000000);
const P = 'Test1234';

function auth(token) { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }; }

const log = (...a) => console.log(...a);

async function j(res) {
  const txt = await res.text();
  try { return { status: res.status, body: JSON.parse(txt) }; }
  catch { return { status: res.status, body: txt }; }
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; log('  ✅', name); }
  else { fail++; log('  ❌', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const run = async () => {
  log('=== 1) 注册测试用户', U, '===');
  let r = await j(await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: U, nickname: '牧场测试', password: P, confirmPassword: P,
      inviteCode: 'dudu2019', education: 'PRIMARY_1', gender: 'M' })
  }));
  log('  register status=', r.status, 'code=', r.body?.code);
  check('注册成功(200)', r.status === 200 && r.body?.code === 0, r.body);
  const token = r.body?.data?.token;
  const uid = r.body?.data?.userId;
  check('返回 JWT token', typeof token === 'string' && token.length > 10, token?.slice(0, 12));
  check('返回 userId', typeof uid === 'number', uid);
  if (!token) { log('ABORT: 无 token'); return; }

  log('=== 2) GET /api/ranch/animals（应空）===');
  r = await j(await fetch(BASE + '/api/ranch/animals', { headers: auth(token) }));
  log('  status=', r.status, 'data=', JSON.stringify(r.body?.data));
  check('初始已拥有为空数组', r.status === 200 && Array.isArray(r.body?.data) && r.body.data.length === 0, r.body);

  log('=== 3) POST /api/ranch/buy {code:fish}（应成功）===');
  r = await j(await fetch(BASE + '/api/ranch/buy', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ code: 'fish' })
  }));
  log('  status=', r.status, 'code=', r.body?.code, 'data=', JSON.stringify(r.body?.data));
  check('购买成功 ok=true', r.status === 200 && r.body?.code === 0 && r.body?.data?.ok === true, r.body);
  check('返回已拥有全集含 fish', Array.isArray(r.body?.data?.owned) && r.body.data.owned.includes('fish'), r.body?.data);

  log('=== 4) GET /api/ranch/animals（应含 fish，证明落库）===');
  r = await j(await fetch(BASE + '/api/ranch/animals', { headers: auth(token) }));
  log('  status=', r.status, 'data=', JSON.stringify(r.body?.data));
  check('DB 已持久化 fish', r.status === 200 && Array.isArray(r.body?.data) && r.body.data.includes('fish'), r.body);

  log('=== 5) 重复购买 fish（应拒 1001001）===');
  r = await j(await fetch(BASE + '/api/ranch/buy', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ code: 'fish' })
  }));
  log('  status=', r.status, 'code=', r.body?.code, 'data=', JSON.stringify(r.body?.data));
  check('重复购买被拒(1001001)', r.status === 200 && r.body?.code === 1001001 && r.body?.data?.ok === false, r.body);

  log('=== 6) 购买不存在的动物 code（应参数错误）===');
  r = await j(await fetch(BASE + '/api/ranch/buy', {
    method: 'POST', headers: auth(token), body: JSON.stringify({ code: 'dragon' })
  }));
  log('  status=', r.status, 'code=', r.body?.code);
  check('非法 code 被拒', r.status === 200 && r.body?.code !== 0, r.body);

  // 记录用户供"重启后"二次验证
  const fs = await import('node:fs');
  fs.writeFileSync('D:/pet/tools/ranch_test_user.json', JSON.stringify({ username: U, password: P, userId: uid }));
  log('--- 已保存测试用户', U, 'uid=', uid, '---');

  log(`\n汇总: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
};
run().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
