/* QA 验证：REST build 扣款是否生效（决定性实验） */
const BASE = 'http://127.0.0.1:8080';
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:'worldtest4996', password:'abc123'}) }).then(r=>r.json());
const token = login.data.token;
const me0 = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then(r=>r.json());
console.log('[before] coins=' + me0.data.coins);

// 找可放置 cell（chunk 0_1 平坦 grass）
const chunk = await fetch(BASE + '/api/world/chunk?cx=0&cz=1').then(r=>r.json()).then(d=>d.data);
const h = chunk.height;
const occ = new Set((chunk.objects||[]).map(o=>o.gx+'_'+o.gz));
let target = null;
for (let lz=0; lz<63 && !target; lz++) for (let lx=0; lx<63 && !target; lx++) {
  const gx=lx, gz=64+lz;
  if (occ.has(gx+'_'+gz)) continue;
  const s = chunk.semantic[lz*64+lx];
  const slope = Math.max(Math.abs(h[lz*65+lx]-h[lz*65+lx+1]), Math.abs(h[lz*65+lx]-h[(lz+1)*65+lx]));
  if (s===2 && slope<0.2) target = {gx, gz};
}
console.log('[target] ' + JSON.stringify(target));
const r = await fetch(BASE + '/api/world/build', { method: 'POST', headers: {'Content-Type':'application/json', Authorization:'Bearer '+token}, body: JSON.stringify({gx:target.gx, gz:target.gz, objectType:'wood_house'}) }).then(x=>x.json());
console.log('[build] code=' + r.code + ' msg=' + r.msg + (r.data ? ' id=' + r.data.id : ''));

const me1 = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then(r=>r.json());
console.log('[after] coins=' + me1.data.coins);
console.log('扣款结果: ' + (me1.data.coins === me0.data.coins - 100 ? 'PASS 扣了100' : (me1.data.coins === me0.data.coins ? 'FAIL 未扣款' : '异常变化 ' + me0.data.coins + '->' + me1.data.coins)));
