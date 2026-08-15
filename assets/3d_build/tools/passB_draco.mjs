#!/usr/bin/env node
// passB_draco.mjs — 读 passA 产出的 _tex.glb，meshopt 减面 + Draco 几何压缩 → 写 lifecycle/（不引入 sharp）
// 使用 gltf-transform v4 的 draco() transform API
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, simplify, weld, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as draco3d from 'draco3dgltf';
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
const SIMPLIFY_RATIO = 0.01;
const SIMPLIFY_ERROR = 0.02;

mkdirSync(DST, { recursive: true });

const encoderModule = await draco3d.createEncoderModule();
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({ 'draco3d.encoder': encoderModule });
await MeshoptSimplifier.ready;

for (const [srcBase, dstBase] of Object.entries(MAP)) {
  const src = join(SRC, `${srcBase}_tex.glb`);
  const dst = join(DST, `${dstBase}.glb`);
  const before = statSync(src).size;
  console.log(`\n[${dstBase}] before ${(before / 1024 / 1024).toFixed(1)}MB`);
  try {
    const doc = await io.read(src);
    await doc.transform(weld({ tolerance: 0.001 }));
    await doc.transform(dedup());
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }));
    await doc.transform(prune({ keepAttributes: false }));
    await doc.transform(draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeGeneric: 8,
    }));
    await io.write(dst, doc);
    const after = statSync(dst).size;
    console.log(`  → ${(after / 1024).toFixed(0)}KB ${after < 500 * 1024 ? '✅ <500K' : '⚠️ >500K'} (${(after / before * 100).toFixed(1)}%)`);
  } catch (e) {
    console.error('  ERROR:', e.message);
    console.error('  ', e.stack?.split('\n').slice(0, 4).join('\n'));
  }
}
console.log('PASS B DONE');
