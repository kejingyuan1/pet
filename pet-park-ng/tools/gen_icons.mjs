// 生成 13 个 2D 像素风格背包图标（SVG，透明背景，crispEdges）
// 输出到 public/assets/icons/<code>.svg
// 运行：node tools/gen_icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/assets/icons');
mkdirSync(OUT, { recursive: true });

const GRID = 16; // 16x16 像素画布

// ---- 像素画布 ----
class Canvas {
  constructor(size = GRID) {
    this.size = size;
    this.px = Array.from({ length: size }, () => Array(size).fill(null));
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.px[y][x] = c;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // 椭圆填充
  ellipse(cx, cy, rx, ry, c) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  // 仅在非透明时覆盖（用于高光/描边叠层）
  overlayEllipse(cx, cy, rx, ry, c) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && this.px[y][x]) this.set(x, y, c);
      }
    }
  }
  // 描边：把透明但邻近非透明像素的格子填成描边色
  outline(c) {
    const snap = this.px.map(r => r.slice());
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (snap[y][x]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size && snap[ny][nx]) { near = true; break; }
          }
        if (near) this.px[y][x] = c;
      }
    }
  }
  toSVG() {
    const rects = [];
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const c = this.px[y][x];
        if (c) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
      }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.size}" height="${this.size}" ` +
      `viewBox="0 0 ${this.size} ${this.size}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`;
  }
}

// ---- 调色板 ----
const C = {
  trans: null,
  ink: '#1c1c24',     // 描边/眼睛
  rockD: '#3a3a44',
  rockM: '#5a5a66',
  rockL: '#7c7c88',
  iron: '#9aa0aa',
  ironHi: '#cdd2da',
  ironSh: '#5b6068',
  gold: '#FFD23F',
  goldD: '#E0A017',
  goldHi: '#FFF1A8',
  fishL: '#cfe0ec',
  fishB: '#9fb7c9',
  fishD: '#6f8aa0',
  orange: '#FF8C1A',
  orangeL: '#FFB45A',
  orangeD: '#D9700F',
  koiW: '#FFFFFF',
  koiR: '#FF5A36',
  dragG: '#F2C14E',
  dragR: '#C0392B',
  wood: '#8B5A2B',
  woodL: '#B07A43',
  woodD: '#5E3A1C',
  berry: '#E63946',
  berryD: '#B71C2B',
  leaf: '#2A9D3F',
  leafD: '#1E7A2E',
  eggC: '#FFF4E0',
  eggCs: '#E8D9BE',
  duck: '#CFEADF',
  duckS: '#A8D8C0',
  goose: '#F0E6D2',
  gooseSp: '#B98A5E',
  milk: '#FFFFFF',
  milkB: '#4CC9F0',
  milkD: '#2E9FCB',
};

// ---- 各物品绘制 ----
function oreCoal() {
  const c = new Canvas();
  c.ellipse(8, 9, 5.2, 4.4, C.rockM);
  c.overlayEllipse(7, 8, 3.4, 2.8, C.rockD);
  c.overlayEllipse(9.5, 8.5, 1.8, 1.6, C.rockL);
  // 煤晶高光（青）
  c.set(6, 7, '#3b4a55'); c.set(10, 10, '#3b4a55'); c.set(9, 11, '#4a5b66');
  c.outline(C.ink);
  return c;
}
function oreIron() {
  const c = new Canvas();
  c.ellipse(8, 9, 5.2, 4.4, C.iron);
  c.overlayEllipse(7, 8, 3.2, 2.6, C.ironSh);
  c.overlayEllipse(9.5, 8.2, 2.0, 1.7, C.ironHi);
  // 锈点
  c.set(6, 10, C.orangeD); c.set(11, 9, C.orangeD);
  c.outline(C.ink);
  return c;
}
function oreGold() {
  const c = new Canvas();
  c.ellipse(8, 9, 5.2, 4.4, C.rockM);
  c.overlayEllipse(7, 8, 3.2, 2.6, C.rockD);
  // 金块
  c.ellipse(7.5, 9, 2.0, 1.7, C.gold);
  c.overlayEllipse(7, 8.4, 1.1, 0.9, C.goldHi);
  c.set(10, 9, C.gold); c.set(10, 10, C.goldD);
  c.outline(C.ink);
  return c;
}
function fishBody(cx, cy, body, belly, dark, eyeX) {
  const c = new Canvas();
  // 身体
  c.ellipse(cx, cy, 4.6, 2.6, body);
  // 腹部高光
  c.overlayEllipse(cx, cy + 0.8, 3.6, 1.4, belly);
  // 尾鳍
  for (let y = -2; y <= 2; y++) c.set(cx + 5, cy + y, (Math.abs(y) <= 1 ? body : dark));
  c.set(cx + 6, cy, dark); c.set(cx + 6, cy - 1, dark); c.set(cx + 6, cy + 1, dark);
  // 背鳍
  c.set(cx - 1, cy - 3, dark); c.set(cx, cy - 3, dark); c.set(cx + 1, cy - 3, dark);
  // 眼睛
  c.set(eyeX, cy - 1, C.ink);
  c.outline(C.ink);
  return c;
}
function minnow() { return fishBody(7, 8, C.fishB, C.fishL, C.fishD, 5); }
function goldfish() { return fishBody(7, 8, C.orange, C.orangeL, C.orangeD, 5); }
function koi() {
  const c = fishBody(7, 8, C.koiW, '#F3F3F3', '#dddddd', 5);
  // 红斑
  c.set(6, 7, C.koiR); c.set(7, 7, C.koiR); c.set(6, 8, C.koiR);
  c.set(4, 8, C.koiR);
  return c;
}
function dragon() {
  const c = fishBody(7, 8, C.dragG, '#F8E0A0', C.dragR, 5);
  // 龙纹红
  c.set(6, 7, C.dragR); c.set(8, 8, C.dragR); c.set(9, 9, C.dragR);
  return c;
}
function wood() {
  const c = new Canvas();
  // 原木横截面
  c.ellipse(8, 8, 5.2, 5.0, C.wood);
  c.ellipse(8, 8, 3.6, 3.4, C.woodL);
  c.ellipse(8, 8, 1.8, 1.7, C.woodD);
  // 年轮线
  c.overlayEllipse(8, 8, 4.6, 4.4, C.woodD);
  // 把年轮线只保留边缘：重画内圈
  c.ellipse(8, 8, 4.0, 3.8, C.wood);
  c.ellipse(8, 8, 2.6, 2.4, C.woodL);
  c.ellipse(8, 8, 1.2, 1.1, C.woodD);
  c.outline(C.woodD);
  return c;
}
function berry() {
  const c = new Canvas();
  // 三颗浆果
  c.ellipse(6, 9, 2.2, 2.2, C.berry);
  c.ellipse(10, 9, 2.2, 2.2, C.berry);
  c.ellipse(8, 11, 2.2, 2.0, C.berry);
  c.overlayEllipse(5.4, 8.2, 0.9, 0.9, '#ff8a93'); // 高光
  c.overlayEllipse(9.4, 8.2, 0.9, 0.9, '#ff8a93');
  c.overlayEllipse(7.6, 10.4, 0.9, 0.8, '#ff8a93');
  // 叶子/茎
  c.rect(7, 4, 2, 3, C.leaf);
  c.set(8, 3, C.leaf); c.set(6, 5, C.leafD); c.set(10, 5, C.leafD);
  c.outline(C.berryD);
  return c;
}
function egg(base, shadow, speckle) {
  const c = new Canvas();
  c.ellipse(8, 9, 3.2, 4.2, base);
  c.overlayEllipse(8, 11.5, 2.4, 1.8, shadow); // 底部阴影
  // 高光
  c.overlayEllipse(6.6, 6.5, 1.0, 1.3, '#ffffff');
  if (speckle) { c.set(7, 8, speckle); c.set(9, 10, speckle); c.set(8, 11, speckle); c.set(10, 7, speckle); }
  c.outline(C.ink);
  return c;
}
function eggChicken() { return egg(C.eggC, C.eggCs, null); }
function eggDuck() { return egg(C.duck, C.duckS, '#7FB8A0'); }
function eggGoose() { return egg(C.goose, '#E2D2B6', C.gooseSp); }
function milk() {
  const c = new Canvas();
  // 牛奶纸盒
  c.rect(5, 4, 6, 9, C.milk);
  c.rect(5, 4, 6, 2, C.milkB); // 顶部蓝条
  c.rect(5, 4, 6, 1, C.milkD);
  // 盒口斜折
  c.set(5, 4, C.milkD); c.set(10, 4, C.milkD);
  c.set(6, 3, C.milk); c.set(9, 3, C.milk); c.set(7, 2, C.milk); c.set(8, 2, C.milk);
  // 高光
  c.rect(6, 7, 1, 5, '#EAF6FB');
  c.outline(C.milkD);
  return c;
}

const ICONS = {
  ore_coal: oreCoal,
  ore_iron: oreIron,
  ore_gold: oreGold,
  minnow: minnow,
  goldfish: goldfish,
  koi: koi,
  dragon: dragon,
  wood: wood,
  berry: berry,
  egg_chicken: eggChicken,
  egg_duck: eggDuck,
  egg_goose: eggGoose,
  milk: milk,
};

for (const [code, fn] of Object.entries(ICONS)) {
  const svg = fn().toSVG();
  writeFileSync(resolve(OUT, `${code}.svg`), svg, 'utf8');
  console.log('wrote', code + '.svg');
}
console.log('TOTAL', Object.keys(ICONS).length);
