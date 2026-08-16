import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const input = process.argv[2];
const output = process.argv[3];

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

console.log('Reading', input, '...');
const doc = await io.read(input);

console.log('Compressing + resizing textures to 1024...');
await doc.transform(
  textureCompress({ resize: [1024, 1024], targetFormat: 'png', quality: 85 })
);

console.log('Applying Draco compression...');
await doc.transform(draco());

await io.write(output, doc);
console.log('Wrote', output);
