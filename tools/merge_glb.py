#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_glb.py — 把多 mesh / 多 primitive 的 GLB 合并成「单一网格」GLB。

用途（背景见 docs/rigging-plan.md）：
    HY3D 生成的 boy/girl 由 ~190 个独立碎片（多 mesh / 多 primitive）组成，
    直接丢给 auto-rigger（Mixamo / AccuRig / Cinevva）容易绑定失败或权重错。
    先合并成单一连续网格，可显著提高自动绑定的成功率与权重质量。

用法：
    python merge_glb.py input.glb [output.glb]
    若不指定 output，默认在同目录生成 input.merged.glb

合并范围：仅几何（POSITION / NORMAL / TEXCOORD_0 / indices）。
材质沿用第 1 个 primitive 的 material（auto-rigger 只关心几何，材质不影响绑定）。
indices 统一升级为 UNSIGNED_INT（合并后顶点数可能 > 65535）。

依赖：仅标准库（struct / json / sys / os），无需第三方包。
"""
import struct
import json
import sys
import os

COMP = {
    5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2),
    5125: ('I', 4), 5126: ('f', 4),
}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack('<III', data[:12])
    assert magic == 0x46546C67, 'not a glb file: ' + path
    off = 12
    chunks = []
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        off += 8
        chunks.append((ctype, data[off:off + clen]))
        off += clen
    return json.loads(chunks[0][1].decode('utf-8')), chunks[1][1]


def read_accessor(gltf, binchunk, idx):
    """返回 list：SCALAR 为标量列表，VECn 为长度为 n 的子列表。"""
    acc = gltf['accessors'][idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    fmt, size = COMP[acc['componentType']]
    ncomp = NCOMP[acc['type']]
    start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    stride = bv.get('byteStride', size * ncomp)
    out = []
    for i in range(count):
        o = start + i * stride
        vals = list(struct.unpack('<' + fmt * ncomp, binchunk[o:o + size * ncomp]))
        out.append(vals if ncomp > 1 else vals[0])
    return out


def write_glb(gltf, binchunk, path):
    if len(binchunk) % 4 != 0:
        binchunk += b'\x00' * (4 - len(binchunk) % 4)
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(js) % 4 != 0:
        js += b' '
    with open(path, 'wb') as f:
        total = 12 + 8 + len(js) + 8 + len(binchunk)
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(binchunk), 0x004E4942))
        f.write(binchunk)


def merge(input_path, output_path):
    gltf, binchunk = read_glb(input_path)

    # 判断所有 primitive 是否一致带有 NORMAL / TEXCOORD_0（避免维度不一致）
    prims = [(m, p) for m in gltf.get('meshes', []) for p in m.get('primitives', [])]
    has_nrm = all('NORMAL' in p['attributes'] for _, p in prims)
    has_uv = all('TEXCOORD_0' in p['attributes'] for _, p in prims)

    all_pos, all_nrm, all_uv, all_idx = [], [], [], []
    vtx_offset = 0
    material_ref = None
    for _, p in prims:
        attr = p['attributes']
        pos = read_accessor(gltf, binchunk, attr['POSITION'])
        nrm = read_accessor(gltf, binchunk, attr['NORMAL']) if (has_nrm and 'NORMAL' in attr) else None
        uv = read_accessor(gltf, binchunk, attr['TEXCOORD_0']) if (has_uv and 'TEXCOORD_0' in attr) else None
        idx = read_accessor(gltf, binchunk, p['indices']) if 'indices' in p else list(range(len(pos)))
        base = vtx_offset
        all_pos.extend(pos)
        if nrm is not None:
            all_nrm.extend(nrm)
        if uv is not None:
            all_uv.extend(uv)
        all_idx.extend([i + base for i in idx])
        vtx_offset += len(pos)
        if material_ref is None:
            material_ref = p.get('material')

    # 重新拼二进制 + 构造 accessors / bufferViews
    def to_float_bytes(arr, ncomp):
        buf = bytearray()
        for v in arr:
            if ncomp == 1:
                buf += struct.pack('<f', v)
            else:
                buf += struct.pack('<' + 'f' * ncomp, *v)
        return bytes(buf)

    def to_uint_bytes(arr):
        return b''.join(struct.pack('<I', i) for i in arr)

    binbuf = bytearray()
    bv_list, acc_list = [], []

    def push(data, comp_type, ntype, count):
        if len(data) % 4 != 0:
            data += b'\x00' * (4 - len(data) % 4)
        off = len(binbuf)
        binbuf.extend(data)
        bv_list.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        acc_list.append({
            'bufferView': len(bv_list) - 1,
            'componentType': comp_type,
            'count': count,
            'type': ntype,
        })
        return len(acc_list) - 1

    pos_acc = push(to_float_bytes(all_pos, 3), 5126, 'VEC3', len(all_pos))
    nrm_acc = push(to_float_bytes(all_nrm, 3), 5126, 'VEC3', len(all_nrm)) if all_nrm else None
    uv_acc = push(to_float_bytes(all_uv, 2), 5126, 'VEC2', len(all_uv)) if all_uv else None
    idx_acc = push(to_uint_bytes(all_idx), 5125, 'SCALAR', len(all_idx))

    attributes = {'POSITION': pos_acc}
    if nrm_acc is not None:
        attributes['NORMAL'] = nrm_acc
    if uv_acc is not None:
        attributes['TEXCOORD_0'] = uv_acc
    primitive = {'attributes': attributes, 'indices': idx_acc}
    if material_ref is not None:
        primitive['material'] = material_ref

    new_mesh = {'primitives': [primitive]}

    # 把所有 node 引用的 mesh 统一指向新 mesh（index 0）
    for node in gltf.get('nodes', []):
        if 'mesh' in node:
            node['mesh'] = 0

    gltf['meshes'] = [new_mesh]
    gltf['accessors'] = acc_list
    gltf['bufferViews'] = bv_list
    gltf['buffers'] = [{'byteLength': len(binbuf)}]
    gltf.pop('skins', None)
    gltf.pop('animations', None)

    write_glb(gltf, bytes(binbuf), output_path)

    print('[merge_glb] 输入: %s' % input_path)
    print('[merge_glb] 原始 primitive 数: %d' % len(prims))
    print('[merge_glb] 合并后: 1 mesh / 1 primitive')
    print('[merge_glb] 顶点数: %d  三角形数: %d' % (len(all_pos), len(all_idx) // 3))
    print('[merge_glb] 含 NORMAL: %s  含 TEXCOORD_0: %s' % (nrm_acc is not None, uv_acc is not None))
    print('[merge_glb] 已写出: %s' % output_path)


def main():
    if len(sys.argv) < 2:
        print('用法: python merge_glb.py input.glb [output.glb]')
        sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else (os.path.splitext(inp)[0] + '.merged.glb')
    merge(inp, out)


if __name__ == '__main__':
    main()
