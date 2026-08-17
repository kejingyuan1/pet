#!/usr/bin/env node
// compress_babies.mjs — Draco 压缩幼崽 GLB 到 <500K
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, quantize, textureCompress } from '@gltf-transform/functions';
import * as draco3d from 'draco3dgltf';
import { statSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const NAMES = ['hy3_chicken_baby','hy3_duck_baby','hy3_goose_baby','hy3_cow_calf','hy3_sheep_lamb'];

// 预加载 Draco Encoder Module（全局复用，避免每文件重复加载 WASM）
let encoderModule = null;
async function getEncoder() {
  if (!encoderModule) {
    console.log('Loading Draco encoder WASM...');
    encoderModule = await draco3d.createEncoderModule();
    console.log('Draco encoder loaded.');
  }
  return encoderModule;
}

const io = new NodeIO();

for (const name of NAMES) {
  const srcPath = join(SRC, `${name}.glb`);
  const dstPath = join(SRC, `${name}_draco.glb`);
  const before = statSync(srcPath).size;
  console.log(`\n${name} (${(before/1024/1024).toFixed(1)}MB)`);
  
  try {
    const doc = await io.read(srcPath);
    
    // 1. Weld + Dedup + Quantize
    await doc.transform(weld({ tolerance: 0.0001 }));
    await doc.transform(dedup());
    await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
    
    // 2. 纹理压缩（缩小尺寸+WebP编码）
    try {
      await doc.transform(textureCompress({ encoder: 'webp', quality: [0.7, 0.65], maxSize: 512 }));
    } catch(e) { console.log('  textureCompress skipped:', e.message.slice(0,80)); }
    
    // 3. Draco Mesh Compression（核心压缩）
    const encMod = await getEncoder();
    const dracoExt = doc.createExtension(KHRDracoMeshCompression);
    dracoExt.setRequired(true);
    dracoExt.setOptions({
      encoder: encMod,
      method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
      quantizePositionBits: 14,
      quantizeNormalBits: 10,
      quantizeTexcoordBits: 12,
      quantizeColorBits: 8,
      quantizeGenericBits: 8,
    });
    
    // 4. 清理未使用资源
    await doc.transform(prune({ keepAttributes: false, keepLeaves: false }));
    
    await io.write(dstPath, doc);
    const after = statSync(dstPath).size;
    const ok = after < 500 * 1024;
    console.log(`  → ${(after/1024).toFixed(0)}KB (${(after/before*100).toFixed(1)}%) ${ok ? '✅<500K' : '⚠️>500K'}`);
  } catch(e) {
    console.error('  ERROR:', e.message);
    console.error('  ', e.stack?.split('\n')?.[1]);
  }
}
