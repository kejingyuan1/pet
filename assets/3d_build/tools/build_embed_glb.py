# -*- coding: utf-8 -*-
"""压小 HY3 纹理 GLB 几何并保留 PBR 贴图，输出可内联的小 GLB。
用法: build_embed_glb.py <src.glb> <out.glb> [face_count]
"""
import sys, os, io, json
import numpy as np
import trimesh
from PIL import Image
import pygltflib

SRC = sys.argv[1]
OUT = sys.argv[2]
FC = int(sys.argv[3]) if len(sys.argv) > 3 else 20000

# 1) 从原 GLB 提取 128px 贴图字节（直接解析 GLB 二进制块）
g = pygltflib.GLTF2().load(SRC)
img = g.images[0]
bv = g.bufferViews[img.bufferView]
raw = open(SRC, 'rb').read()
# GLB: 12 字节头 + 若干 chunk(长度4+类型4+数据)
off = 12
bin_chunk = None
while off + 8 <= len(raw):
    clen = int.from_bytes(raw[off:off+4], 'little')
    ctype = raw[off+4:off+8]
    cdata = raw[off+8:off+8+clen]
    if ctype == b'BIN\x00':
        bin_chunk = cdata
        break
    off += 8 + clen
png_bytes = bin_chunk[bv.byteOffset:bv.byteOffset + bv.byteLength]

# 2) trimesh 几何简化
scene = trimesh.load(SRC)
m = list(scene.geometry.values())[0]
P0 = np.array(m.vertices, dtype=np.float32)
UV0 = np.array(m.visual.uv, dtype=np.float32) if m.visual.uv is not None else None
m2 = m.simplify_quadric_decimation(face_count=FC)
_ = m2.vertex_normals  # 强制计算法线
P1 = np.array(m2.vertices, dtype=np.float32)
F1 = np.array(m2.faces, dtype=np.uint32)

# 3) 最近邻把原始 UV 补回（简化顶点≈原始顶点子集/微移）
from scipy.spatial import cKDTree
if UV0 is not None:
    tree = cKDTree(P0)
    _, idx = tree.query(P1, k=1)
    UV1 = UV0[idx].astype(np.float32)
else:
    UV1 = np.zeros((len(P1), 2), np.float32)

# 4) 用 trimesh TextureVisuals 重新导出（内嵌贴图）
img_pil = Image.open(io.BytesIO(png_bytes)).convert('RGBA')
m2.visual = trimesh.visual.TextureVisuals(uv=UV1, image=img_pil)
m2.export(OUT)

# 5) 校验
g2 = pygltflib.GLTF2().load(OUT)
has_tex = bool(g2.images) and bool(g2.materials) and g2.materials[0].pbrMetallicRoughness.baseColorTexture is not None
print(f'{os.path.basename(OUT)}: {round(os.path.getsize(OUT)/1e6,3)}MB verts={len(P1)} faces={len(F1)} tex_preserved={has_tex}')
