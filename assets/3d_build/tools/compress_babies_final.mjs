#!/usr/bin/env node
// compress_babies_final.mjs
// 目标：把 HY3D 幼崽 GLB 压到 <500K，且保留贴图（眼睛在贴图里）。
// 策略：
//   1. sharp 把 4096² 纹理缩到 256²（主导体积的那 11MB 纹理 → ~150KB）
//   2. meshopt 减面（500k → 30k tris，形状足够）
//   3. Draco 几何压缩（游戏 DRACOLoader 已配置，必须 draco）
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { simplify, weld, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { statSync, mkdirSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const DST = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/lifecycle';
const MAP = {
  'hy3_chicken_baby': 'lifecycle_chicken_baby',
  'hy3_duck_baby':    'lifecycle_duck_baby',
  'hy3_goose_baby':   'lifecycle_goose_baby',
  'hy3_cow_calf':     'lifecycle_cow_calf',
  'hy3_sheep_lamb':   'lifecycle_sheep_lamb',
};
const TEX_SIZE = 256;
const SIMPLIFY_RATIO = 0.06;

mkdirSync(DST, { recursive: true });
const io = new NodeIO();
await MeshoptSimplifier.ready;
const encoderModule = await draco3d.createEncoderModule();

function stripIccPng(buf) {
  if (buf[0] !== 0x89 || buf.slice(1, 4).toString() !== 'PNG') return buf;
  const out = [buf.slice(0, 8)];
  let pos = 8, stripped = false;
  while (pos < buf.length) {
    if (pos + 8 > buf.length) break;
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    const crc = buf.slice(pos + 8 + len, pos + 12 + len);
    if (type === 'iCCP' || type === 'cICc') stripped = true;
    else {
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

for (const [srcBase, dstBase] of Object.entries(MAP)) {
  const src = join(SRC, `${srcBase}.glb`);
  const dst = join(DST, `${dstBase}.glb`);
  const before = statSync(src).size;
  console.log(`\n[${srcBase}] before ${(before / 1024 / 1024).toFixed(1)}MB`);
  try {
    const doc = await io.read(src);

    // 1. 纹理缩小（strip ICC → sharp resize）
    for (const tex of doc.getRoot().listTextures()) {
      const img = tex.getImage();
      if (!img) continue;
      const resized = await sharp(img)
        .resize(TEX_SIZE, TEX_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toColourspace('srgb')
        .png()
        .toBuffer();
      tex.setImage(resized);
      console.log(`  tex ${(img.length / 1024 / 1024).toFixed(1)}MB → ${(resized.length / 1024).toFixed(0)}KB`);
    }

    // 2. 减面
    await doc.transform(weld({ tolerance: 0.001 }));
    await doc.transform(dedup());
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO }));
    await doc.transform(prune({ keepAttributes: false }));

    // 3. Draco
    const dracoExt = doc.createExtension(KHRDracoMeshCompression).setRequired(true);
    dracoExt.setOptions({
      encoder: encoderModule,
      method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
      quantizePositionBits: 14,
      quantizeNormalBits: 10,
      quantizeTexcoordBits: 12,
      quantizeColorBits: 8,
      quantizeGenericBits: 8,
    });

    await io.write(dst, doc);
    const after = statSync(dst).size;
    console.log(`  → ${(after / 1024).toFixed(0)}KB ${after < 500 * 1024 ? '✅ <500K' : '⚠️ >500K'} (${(after / before * 100).toFixed(1)}%)`);
  } catch (e) {
    console.error('  ERROR:', e.message);
    console.error('  ', e.stack?.split('\n').slice(0, 4).join('\n'));
  }
}
console.log('\nDONE');
