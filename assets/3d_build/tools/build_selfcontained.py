# -*- coding: utf-8 -*-
"""把 three+addons+GLB 全部内联，生成零网络依赖的单文件 demo_selfcontained.html"""
import base64

def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode('ascii')

three = b64('vendor/three/build/three.module.min.js')
oc = b64('vendor/three/jsm/controls/OrbitControls.js')
bgu_src = open('vendor/three/jsm/utils/BufferGeometryUtils.js', 'r', encoding='utf-8').read()
bgu = b64(None) if False else base64.b64encode(bgu_src.encode('utf-8')).decode('ascii')
gltf_src = open('vendor/three/jsm/loaders/GLTFLoader.js', 'r', encoding='utf-8').read()
# 把相对 import 改成 importmap 里映射的绝对说明符
gltf_src = gltf_src.replace("from '../utils/BufferGeometryUtils.js'", "from 'three/addons/utils/BufferGeometryUtils.js'")
gltf = base64.b64encode(gltf_src.encode('utf-8')).decode('ascii')

cat = 'data:model/gltf-binary;base64,' + b64('hy3_cat_embed.glb')
dog = 'data:model/gltf-binary;base64,' + b64('hy3_dog_embed.glb')
fish = 'data:model/gltf-binary;base64,' + b64('hy3_fish_embed.glb')

tpl = open('demo_template.html', 'r', encoding='utf-8').read()
out = (tpl
    .replace('__THREE__', three)
    .replace('__BGU__', bgu)
    .replace('__OC__', oc)
    .replace('__GLTF__', gltf)
    .replace('__CAT__', cat)
    .replace('__DOG__', dog)
    .replace('__FISH__', fish))

with open('demo_selfcontained.html', 'w', encoding='utf-8') as f:
    f.write(out)

import os
sz = os.path.getsize('demo_selfcontained.html')
print('WROTE demo_selfcontained.html:', round(sz/1e6, 2), 'MB')
print('three b64 KB:', round(len(three)/1024), 'gltf b64 KB:', round(len(gltf)/1024))
print('cat b64 KB:', round(len(cat)/1024), 'dog:', round(len(dog)/1024), 'fish:', round(len(fish)/1024))
# 占位符残留检查
for ph in ['__THREE__','__BGU__','__OC__','__GLTF__','__CAT__','__DOG__','__FISH__']:
    assert ph not in out, 'LEFTOVER ' + ph
print('NO LEFTOVER PLACEHOLDERS OK')
