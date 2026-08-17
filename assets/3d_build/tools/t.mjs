import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
const io = new NodeIO();
const doc = await io.read('C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/assets/3d_build/animals-source/hy3_chicken_baby.glb');
for (const tex of doc.getRoot().listTextures()) {
  const img = tex.getImage();
  console.log('mime', tex.getMimeType(), 'len', img.length);
  try {
    const r = await sharp(img).resize(256,256,{fit:'contain',background:{r:255,g:255,b:255,alpha:1}}).toColourspace('srgb').png().toBuffer();
    console.log('OK', r.length);
  } catch(e) { console.log('FAIL', e.message); }
}
