/* QA 独立验证：原子放置错误码 2003/2006/2004 + 事务回滚（只读测试，不修复） */
const BASE = 'http://127.0.0.1:8080';

async function post(path, body, token) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  return { http: r.status, ...j };
}
async function get(path) {
  const r = await fetch(BASE + path);
  return r.json();
}

// 1. 登录 worldtest4996（coins=290）
const login = await post('/api/auth/login', { username: 'worldtest4996', password: 'abc123' });
const token = login.data.token;
console.log('[login] code=' + login.code + ' uid=' + login.data.userId + ' token取到=' + !!token);

// 2. 注册新用户（coins 应为 0）用于 2006
const uname = 'qa_' + Date.now().toString().slice(-8);
const reg = await post('/api/auth/register', {
  username: uname, nickname: 'QA验证', password: 'abc123', confirmPassword: 'abc123',
  inviteCode: 'dudu2019', education: 'PRIMARY_1'
});
console.log('[register] ' + uname + ' code=' + reg.code + ' uid=' + (reg.data && reg.data.userId) + ' (token=' + !!reg.data + ')');

// 3. 遍历多个 chunk 找 buildable grass cell 与 非水面 cell（排除已占用）
const SEARCH_CHUNKS = [[0,0],[0,1],[-1,0],[1,0],[2,0]];
let grassCell = null, nonWaterCell = null;
for (const [cx,cz] of SEARCH_CHUNKS) {
  const chunk = await get(`/api/world/chunk?cx=${cx}&cz=${cz}`);
  if (chunk.code !== 0) continue;
  const s = chunk.data.semantic, h = chunk.data.height;
  const occupied = new Set((chunk.data.objects || []).map(o => o.gx + '_' + o.gz));
  const baseX = cx * 64, baseZ = cz * 64; // 世界格坐标 = chunk内偏移 + chunk原点
  for (let lz = 0; lz < 63 && (!grassCell || !nonWaterCell); lz++) {
    for (let lx = 0; lx < 63 && (!grassCell || !nonWaterCell); lx++) {
      const gx = baseX + lx, gz = baseZ + lz;
      const key = gx + '_' + gz;
      if (occupied.has(key)) continue;
      const sem = s[lz * 64 + lx];
      const slope = Math.max(Math.abs(h[lz * 65 + lx] - h[lz * 65 + lx + 1]), Math.abs(h[lz * 65 + lx] - h[(lz + 1) * 65 + lx]));
      if (sem === 2 && slope < 0.2 && !grassCell) grassCell = { gx, gz };
      if (sem === 2 && !nonWaterCell) nonWaterCell = { gx, gz };
    }
  }
}
console.log('[cell] grassCell=' + JSON.stringify(grassCell) + ' nonWaterCell=' + JSON.stringify(nonWaterCell));

const results = [];
function check(name, got, want) {
  const pass = got === want;
  results.push({ name, pass, got, want });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + ' → got=' + got + ' want=' + want);
}

// 4. 2003：同一 cell 放两次（用已占用的 (0,61)）
const r2003 = await post('/api/world/build', { gx: 0, gz: 61, objectType: 'wood_house' }, token);
check('2003 同 cell 二次放置', r2003.code, 2003);

// 5. 2006：coins 不足放置（新用户 coins=0 放 wood_house 100）
const r2006 = await post('/api/world/build', { gx: grassCell.gx, gz: grassCell.gz, objectType: 'wood_house' }, reg.data.token);
check('2006 coins不足放置', r2006.code, 2006);

// 5b. 事务回滚验证：2006 后该 cell 不应落库
const cx0 = Math.floor(grassCell.gx / 64), cz0 = Math.floor(grassCell.gz / 64);
const objsAfter = await get(`/api/world/objects?cx=${cx0}&cz=${cz0}`);
const leaked = objsAfter.data.some(o => o.gx === grassCell.gx && o.gz === grassCell.gz);
check('2006 事务回滚（cell 未落库）', leaked, false);
console.log('[info] 2006 后 chunk(' + cx0 + ',' + cz0 + ') objects=' + objsAfter.data.length);

// 6. 2004：非水面放鱼（grass cell）
const r2004 = await post('/api/world/fish', { gx: nonWaterCell.gx, gz: nonWaterCell.gz, fishType: 'goldfish' }, token);
check('2004 非水面养鱼', r2004.code, 2004);

const failed = results.filter(r => !r.pass);
console.log('\n=== 原子放置汇总 === ' + (results.length - failed.length) + '/' + results.length + ' 通过');
failed.forEach(r => console.log('FAIL: ' + r.name));
process.exit(failed.length ? 1 : 0);
