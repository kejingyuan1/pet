#!/usr/bin/env node
// compress_v3.mjs — meshopt减面 + sharp缩纹理(4096→256) + prune
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const NAMES = ['hy3_chicken_baby','hy3_duck_baby','hy3_goose_baby','hy3_cow_calf','hy3_sheep_lamb'];
const TARGET_TEX_SIZE = 256;
const io = new NodeIO();

await MeshoptSimplifier.ready;

for (const name of NAMES) {
  const src = join(SRC, `${name}.glb`);
  const dst = join(SRC, `${name}_draco.glb`);
  const before = statSync(src).size;
  console.log(`\n${name} (${(before/1024/1024).toFixed(1)}MB)`);
  
  try {
    const doc = await io.read(src);
    
    // 1. 缩小纹理（4096→256，这是体积大头）
    const texs = doc.getRoot().listTextures();
    for (const tex of texs) {
      const img = tex.getImage();
      if (!img) continue;
      console.log(`  tex: ${img.byteLength/1024|0}KB ${tex.getSize()?.[0]}x${tex.getSize()?.[1]}`);
      
      // 用 sharp 缩小（raw 模式绕过 libvips 色彩空间问题）
      const meta = await sharp(img).metadata();
      console.log(`    format=${meta.format} channels=${meta.channels} space=${meta.space}(${meta.space??'null'}) hasAlpha=${meta.hasAlpha} depth=${meta.depth}`);
      
      // 方法：先转 JPEG（丢弃色彩配置文件），再缩放，再转 PNG
      let resized;
      try {
        // 尝试直接 resize（大部分图片OK）
        resized = await sharp(img)
          .resize(TARGET_TEX_SIZE, TARGET_TEX_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
          .png()
          .toBuffer();
      } catch (e) {
        // 如果色彩空间报错，先转 raw buffer 重编码
        console.log(`    sharp direct failed (${e.message.slice(0,60)}), trying re-encode...`);
        const { width, height, data } = await sharp(img)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        resized = await sharp(data, { raw: { width, height, channels: 4 } })
          .resize(TARGET_TEX_SIZE, TARGET_TEX_SIZE, { fit: 'contain' })
          .png()
          .toBuffer();
      }
      tex.setImage(resized);
      console.log(`  →   ${resized.length/1024|0}KB`);
    }
    
    // 2. Weld + Dedup
    await doc.transform(weld({ tolerance: 0.001 }));
    await doc.transform(dedup());
    
    // 3. Meshopt Simplify（280K → ~5K）
    await doc.transform({ simplify: { simplifier: MeshoptSimplifier, ratio: 0.02 } });
    
    // 4. Prune
    await doc.transform(prune({ keepAttributes: false }));
    
    await io.write(dst, doc);
    const after = statSync(dst).size;
    const ok = after < 500 * 1024;
    console.log(`  TOTAL: ${(after/1024).toFixed(0)}KB ${ok ? '✅<500K' : '⚠️>500K'}`);
  } catch(e) {
    console.error('  ERR:', e.message.slice(0,200));
  }
}
