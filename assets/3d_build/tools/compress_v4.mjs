#!/usr/bin/env node
// compress_v4.mjs — 剔ICC + meshopt减面 + sharp缩纹理
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const NAMES = ['hy3_chicken_baby','hy3_duck_baby','hy3_goose_baby','hy3_cow_calf','hy3_sheep_lamb'];
const TEX_SIZE = 256;
const io = new NodeIO();

// 剔除 PNG 的 iCCP/cICc 色彩配置文件 chunk（libvips 不支持某些值）
function stripIccPng(buf) {
  // PNG signature: 8 bytes
  if (buf[0] !== 0x89 || buf.slice(1,4).toString() !== 'PNG') return buf;
  
  const out = [buf.slice(0, 8)]; // signature
  let pos = 8;
  let stripped = false;
  
  while (pos < buf.length) {
    if (pos + 8 > buf.length) break;
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos+4, pos+8).toString('ascii');
    const data = buf.slice(pos+8, pos+8+len);
    const crc = buf.slice(pos+8+len, pos+12+len);
    
    if (type === 'iCCP' || type === 'cICc') {
      stripped = true;
      // 跳过此 chunk（不复制到输出）
    } else {
      out.push(Buffer.from([len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]));
      out.push(Buffer.from(type, 'ascii'));
      out.push(data);
      out.push(crc);
    }
    
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  
  return Buffer.concat(stripped ? out : [buf]);
}

await MeshoptSimplifier.ready;

for (const name of NAMES) {
  const src = join(SRC, `${name}.glb`);
  const dst = join(SRC, `${name}_draco.glb`);
  const before = statSync(src).size;
  console.log(`\n${name} (${(before/1024/1024).toFixed(1)}MB)`);
  
  try {
    const doc = await io.read(src);
    
    const texs = doc.getRoot().listTextures();
    for (const tex of texs) {
      const img = tex.getImage();
      if (!img) continue;
      
      const origSize = img.length / 1024;
      // 剔除 ICC → sharp 缩放
      const clean = stripIccPng(img);
      const resized = await sharp(clean)
        .resize(TEX_SIZE, TEX_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
      tex.setImage(resized);
      console.log(`  tex: ${origSize|0}KB → ${resized.length/1024|0}KB`);
    }
    
    await doc.transform(weld({ tolerance: 0.001 }));
    await doc.transform(dedup());
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.02 }));
    await doc.transform(prune({ keepAttributes: false }));
    
    await io.write(dst, doc);
    const after = statSync(dst).size;
    console.log(`  TOTAL: ${(after/1024).toFixed(0)}KB ${after < 500*1024 ? '✅<500K' : '⚠️>500K'}`);
  } catch(e) {
    console.error('  ERR:', e.message?.slice(0,200));
  }
}
