#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查 GLB 几何结构：包围盒、顶点数、各高度层 XZ  occupancy 网格，辅助判断腿/鳍位置"""
import sys
import struct
import json
import numpy as np


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    off = 12
    clen, _ = struct.unpack('<II', data[off:off+8])
    j = json.loads(data[off+8:off+8+clen])
    off += 8 + clen
    blen, _ = struct.unpack('<II', data[off:off+8])
    bin_data = data[off+8:off+8+blen]
    return j, bin_data


def get_acc_array(j, bin_data, ai):
    a = j['accessors'][ai]
    bv = j['bufferViews'][a['bufferView']]
    dt = {5126: np.float32, 5125: np.uint32, 5121: np.uint8, 5123: np.uint16}[a['componentType']]
    nbytes = bv['byteLength']
    offset = bv.get('byteOffset', 0)
    arr = np.frombuffer(bin_data, dtype=dt, count=nbytes // np.dtype(dt).itemsize, offset=offset)
    dims = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    if dims > 1:
        arr = arr.reshape(a['count'], dims)
    else:
        arr = arr[:a['count']]
    return arr.copy()


def inspect(path):
    j, bin_data = read_glb(path)
    prim = j['meshes'][0]['primitives'][0]
    pos = get_acc_array(j, bin_data, prim['attributes']['POSITION'])
    print(f"=== {path} ===")
    print(f"顶点数: {len(pos)}")
    print(f"包围盒 X:[{pos[:,0].min():.3f},{pos[:,0].max():.3f}] "
          f"Y:[{pos[:,1].min():.3f},{pos[:,1].max():.3f}] "
          f"Z:[{pos[:,2].min():.3f},{pos[:,2].max():.3f}]")
    # 各层 occupancy：把 XZ 平面按 6x6 网格统计顶点密度，分层显示
    x_edges = np.linspace(pos[:,0].min(), pos[:,0].max(), 7)
    z_edges = np.linspace(pos[:,2].min(), pos[:,2].max(), 7)
    layers = {
        "底(y<30%)": pos[:,1] < pos[:,1].min() + (pos[:,1].max()-pos[:,1].min())*0.30,
        "中(30-70%)": (pos[:,1] >= pos[:,1].min() + (pos[:,1].max()-pos[:,1].min())*0.30) &
                     (pos[:,1] < pos[:,1].min() + (pos[:,1].max()-pos[:,1].min())*0.70),
        "顶(y>70%)": pos[:,1] > pos[:,1].min() + (pos[:,1].max()-pos[:,1].min())*0.70,
    }
    for name, mask in layers.items():
        sub = pos[mask]
        grid = np.zeros((6,6), dtype=int)
        if len(sub):
            ix = np.clip(np.digitize(sub[:,0], x_edges)-1, 0, 5)
            iz = np.clip(np.digitize(sub[:,2], z_edges)-1, 0, 5)
            for a,b in zip(ix, iz):
                grid[a,b] += 1
        print(f"\n[{name}] 顶点数={len(sub)}  XZ密度网格(行=Z,列=X):")
        for r in range(6):
            row = " ".join(f"{grid[r,c]:4d}" for c in range(6))
            print("  " + row)
    print(f"\nmaterials={len(j.get('materials',[]))}, images={len(j.get('images',[]))}, "
          f"has_skin={'skins' in j}, has_anim={'animations' in j}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        inspect(p)
