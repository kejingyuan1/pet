#!/usr/bin/env node
// quick_compress.mjs — 快速压缩：meshopt减面 + 纹理缩小
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, dedup, prune } from '@gltf-transform/functions';
import { statSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const NAMES = ['hy3_chicken_baby','hy3_duck_baby','hy3_goose_baby','hy3_cow_calf','hy3_sheep_lamb'];
const io = new NodeIO();

// 预加载 meshopt
const { MeshoptSimplifier } = await import('meshoptimizer');
await MeshoptSimplifier.ready;
console.log('MeshoptSimplifier ready');

for (const name of NAMES) {
  const src = join(SRC, `${name}.glb`);
  const dst = join(SRC, `${name}_draco.glb`);
  const before = statSync(src).size;
  console.log(`\n${name} (${(before/1024/1024).toFixed(1)}MB)`);
  
  try {
    const doc = await io.read(src);
    
    // 1. Weld + Dedup
    await doc.transform(weld({ tolerance: 0.001 }));
    await doc.transform(dedup());
    
    // 2. Meshopt Simplify（ aggressively reduce: 280K → ~5K triangles）
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.03 }));
    
    // 3. Prune
    await doc.transform(prune({ keepAttributes: false }));
    
    await io.write(dst, doc);
    const after = statSync(dst).size;
    console.log(`  → ${(after/1024).toFixed(0)}KB ${after < 500*1024 ? '✅' : '⚠️'}`);
  } catch(e) {
    console.error('  ERR:', e.message.slice(0,150));
  }
}
