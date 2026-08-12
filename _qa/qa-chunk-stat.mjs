/* QA 独立验证：抽查多个 chunk 统计 9 种语义出现情况（只读） */
const names = ['water','sand','grass','mountain','tree','rock','ore_coal','ore_iron','ore_gold'];
const chunks = [[0,0],[1,0],[0,1],[-1,0],[2,2],[-2,-1],[5,-3]];
let overall = new Array(9).fill(0);
let perChunk = [];
for (const [cx,cz] of chunks) {
  const r = await fetch(`http://127.0.0.1:8080/api/world/chunk?cx=${cx}&cz=${cz}`).then(x=>x.json());
  if (r.code !== 0) { console.log(`chunk(${cx},${cz}) 返回异常 code=${r.code}`); continue; }
  const s = r.data.semantic;
  const cnt = new Array(9).fill(0);
  for (const v of s) cnt[v]++;
  for (let i=0;i<9;i++) overall[i]+=cnt[i];
  perChunk.push(`(${cx},${cz}) ` + names.map((n,i)=>`${n}:${cnt[i]}`).join(' '));
}
console.log('--- per chunk ---');
perChunk.forEach(l=>console.log(l));
console.log('--- overall (9 semantics) ---');
names.forEach((n,i)=>console.log(`${n}=${overall[i]}${overall[i]>0?' 出现':' 缺失'}`));
const missing = names.filter((n,i)=>overall[i]===0);
console.log(missing.length===0 ? 'RESULT: 9 种语义全部出现 OK' : 'RESULT: 缺失语义 = '+missing.join(','));
