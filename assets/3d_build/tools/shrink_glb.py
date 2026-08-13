# -*- coding: utf-8 -*-
"""把纹理压缩后的 HY3 GLB 几何做 quadric 简化（保留 UV/法线），检测星爆退化面。"""
import sys, json, math
import numpy as np
import trimesh

SRC = sys.argv[1] if len(sys.argv) > 1 else 'hy3_cat_tex.glb'
TARGET_FACES = int(sys.argv[2]) if len(sys.argv) > 2 else 24000
OUT = sys.argv[3] if len(sys.argv) > 3 else 'hy3_cat_shrink.glb'

def face_area_stats(mesh):
    a = mesh.area_faces
    return float(a.min()), float(a.max()), float(a.mean())

def edges(mesh):
    # 用于检测星爆：最长边 / 中位边长
    e = mesh.edges_unique_length
    return float(e.max()), float(np.median(e))

scene = trimesh.load(SRC)
meshes = scene.geometry.values() if hasattr(scene, 'geometry') else [scene]
print('geometry count:', len(list(meshes)))

parts = []
for i, m in enumerate(meshes):
    if not hasattr(m, 'vertices'):
        continue
    nv0, nf0 = len(m.vertices), len(m.faces)
    amin0, amax0, amean0 = face_area_stats(m)
    emax0, emed0 = edges(m)
    # 简化
    m2 = m.simplify_quadric_decimation(face_count=TARGET_FACES)
    nv1, nf1 = len(m2.vertices), len(m2.faces)
    amin1, amax1, amean1 = face_area_stats(m2)
    emax1, emed1 = edges(m2)
    starburst = (amax1 / (amin1 + 1e-12) > 1000) or (emax1 / (emed1 + 1e-12) > 50)
    print(f'part{i}: verts {nv0}->{nv1} faces {nf0}->{nf1} '
          f'areaRatio(max/min) {amax0/amin0:.1f}->{amax1/amin1:.1f} '
          f'edgeRatio(max/med) {emax0/emed0:.1f}->{emax1/emed1:.1f} STARBURST={starburst}')
    parts.append(m2)

combined = trimesh.util.concatenate(parts)
combined.export(OUT)
import os
print('OUT SIZE MB:', round(os.path.getsize(OUT)/1e6, 2), '->', OUT)
