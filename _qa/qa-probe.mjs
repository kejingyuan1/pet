/* QA：探测后端状态与 coins */
const BASE = 'http://127.0.0.1:8080';
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:'worldtest4996', password:'abc123'}) }).then(r=>r.json());
  if (login.code !== 0) { console.log('LOGIN_FAIL ' + login.msg); process.exit(1); }
  const token = login.data.token;
  const me = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then(r=>r.json());
  console.log('LOGIN_OK coins=' + me.data.coins + ' uid=' + me.data.userId);
  const chunk = await fetch(BASE + '/api/world/chunk?cx=0&cz=0').then(r=>r.json());
  console.log('CHUNK_OK code=' + chunk.code + ' heightLen=' + chunk.data.height.length + ' semanticLen=' + chunk.data.semantic.length);
} catch (e) {
  console.log('PROBE_ERROR ' + e.message);
  process.exit(2);
}
