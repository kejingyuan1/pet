/* QA 验证：WS build 扣款是否生效（对照实验，先查 coins 再 WS build 再查） */
const BASE = 'http://127.0.0.1:8080';
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:'worldtest4996', password:'abc123'}) }).then(r=>r.json());
const token = login.data.token;
async function coinsNow() {
  return (await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then(r=>r.json())).data.coins;
}
console.log('[before] coins=' + await coinsNow());

// 找可放置 cell（chunk 0_1）
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

const ws = new WebSocket('ws://127.0.0.1:8080/ws?token='+encodeURIComponent(token), 'v12.stomp');
let buf=''; const subs={}; let seq=0; let buildResult=null;
function send(cmd,hdrs,body){let f=cmd+'\n';for(const[k,v]of Object.entries(hdrs))f+=k+':'+v+'\n';f+='\n'+(body||'')+'\0';ws.send(f);}
function sub(dest,cb){const id='t'+(++seq);subs[id]=cb;send('SUBSCRIBE',{id,destination:dest});}
function onFrame(text){
  const lines=text.split('\n'); const cmd=lines.shift().trim(); const hdrs={};
  while(lines.length&&lines[0].trim()!==''){const p=lines.shift().split(':');hdrs[p[0]]=p.slice(1).join(':');}
  const body=lines.join('\n');
  if(cmd==='CONNECTED'){
    sub('/user/queue/reply',b=>{const ev=JSON.parse(b); if(ev.t==='BUILD_RESULT'){buildResult=ev; console.log('[reply] BUILD_RESULT code='+ev.code+' msg='+ev.msg+(ev.object?' id='+ev.object.id:''));}});
    setTimeout(()=>send('SEND',{destination:'/app/ws.join'},JSON.stringify({chunkKey:'0_1',gx:3,gz:3})),200);
    setTimeout(()=>send('SEND',{destination:'/app/ws.build'},JSON.stringify({gx:target.gx,gz:target.gz,objectType:'wood_house'})),800);
    setTimeout(async ()=>{
      const after = await coinsNow();
      console.log('[after]  coins=' + after);
      const before = 190; // 上次 REST 后 coins=190
      console.log('WS 扣款: ' + (after === before - 100 ? 'PASS 扣了100' : (after === before ? 'FAIL 未扣款（WS bug）' : '异常 ' + before + '->' + after)));
      process.exit(after === before - 100 ? 0 : 1);
    }, 2200);
  } else if(cmd==='MESSAGE'){const cb=subs[hdrs['subscription']]; if(cb)cb(body);}
}
ws.onopen=()=>send('CONNECT',{'accept-version':'1.2',host:'petpark','heart-beat':'0,0'});
ws.onmessage=ev=>{buf+=ev.data;let i;while((i=buf.indexOf('\0'))>=0){const f=buf.slice(0,i);buf=buf.slice(i+1);onFrame(f);}};
ws.onerror=e=>{console.log('ws error',e.message||e);process.exit(3);};
