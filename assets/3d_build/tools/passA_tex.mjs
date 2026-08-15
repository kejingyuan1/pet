#!/usr/bin/env node
// passA_tex.mjs — 仅用 sharp 把 4096² 纹理缩到 256²（独立进程，避免 draco/meshopt 干扰 libvips 色彩空间）
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { statSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source';
const NAMES = ['hy3_chicken_baby','hy3_duck_baby','hy3_goose_baby','hy3_cow_calf','hy3_sheep_lamb'];
const TEX_SIZE = 256;
const io = new NodeIO();

for (const name of NAMES) {
  const src = join(SRC, `${name}.glb`);
  const dst = join(SRC, `${name}_tex.glb`);
  const before = statSync(src).size;
  console.log(`\n[${name}] before ${(before / 1024 / 1024).toFixed(1)}MB`);
  const doc = await io.read(src);
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    const r = await sharp(img)
      .resize(TEX_SIZE, TEX_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toColourspace('srgb')
      .png()
      .toBuffer();
    tex.setImage(r);
    console.log(`  tex ${(img.length / 1024 / 1024).toFixed(1)}MB → ${(r.length / 1024).toFixed(0)}KB`);
  }
  await io.write(dst, doc);
  const after = statSync(dst).size;
  console.log(`  → ${(after / 1024 / 1024).toFixed(1)}MB (tex-resized, no draco)`);
}
console.log('PASS A DONE');
