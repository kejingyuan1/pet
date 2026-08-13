#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HY3D 模型绑骨+蒙皮+压缩 V2（Web 友好版 <500KB）
改进：
1. K-means 聚类在脚底 XZ 平面找腿中心 → 紧半径绑定，不拉扯身体
2. trimesh 网格减面：27万→~5000 顶点（Web 友好）
3. 纹理缩放：原尺寸→256px PNG（大幅压缩）
4. 输出 GLB 目标 <500KB

用法: python gen_skel_v2.py <in.glb> <out.glb> <quad|fish>
"""
import sys, struct, json, io, os
import numpy as np
import trimesh
from PIL import Image
from skimage.measure import marching_cubes


# ============================================================
# 1. 加载 + 减面 + 纹理压缩
# ============================================================
def load_and_compress(in_path, target_verts=5000, tex_size=256):
    """用 trimesh 加载 GLB，减面到目标顶点数，缩放纹理，返回处理后的 mesh + 压缩后的纹理 bytes"""
    print(f'[1] 加载 {in_path} ...')
    scene = trimesh.load(in_path, force='mesh', skip_materials=False)
    mesh = scene.geometry[list(scene.geometry.keys())[0]] if isinstance(scene, trimesh.Scene) else scene

    nv_orig = len(mesh.vertices)
    print(f'    原始: {nv_orig} 顶点, {len(mesh.faces)} 面')

    # ★ 关键：在减面前提取纹理（simplify 会丢失材质！）
    tex_img = None
    if hasattr(mesh.visual, 'material') and hasattr(mesh.visual.material, 'baseColorTexture'):
        tex_img = mesh.visual.material.baseColorTexture
        if tex_img is not None:
            orig_size = tex_img.size
            print(f'    原始纹理: {orig_size[0]}x{orig_size[1]}')

    # ★ 快速网格简化（保留原始形状特征！fast_simplification 专业库）
    if target_verts > 0 and nv_orig > target_verts * 1.5:
        import fast_simplification as fs
        pos_in = np.ascontiguousarray(mesh.vertices, dtype=np.float32)
        faces_in = np.ascontiguousarray(mesh.faces, dtype=np.uint32)
        print(f'[2] 网格简化: {nv_orig} → ~{target_verts} 顶点 ...')
        pos_out, faces_out = fs.simplify(pos_in, faces_in, target_count=target_verts)
        mesh = trimesh.Trimesh(vertices=pos_out, faces=faces_out)
        print(f'    简化后: {len(mesh.vertices)} 顶点, {len(mesh.faces)} 面')
    else:
        print(f'[2] 顶点数已足够({nv_orig})，跳过简化')

    # 压缩纹理（使用减面前提取的原始纹理）
    tex_bytes = None
    if tex_img is not None:
        orig_size = tex_img.size
        if max(orig_size) > tex_size:
            tex_img = tex_img.resize((tex_size, tex_size), Image.LANCZOS)
            print(f'[3] 纹理: {orig_size[0]}x{orig_size[1]} → {tex_size}x{tex_size}')
        else:
            print(f'[3] 纹理: {orig_size[0]}x{orig_size[1]} (无需压缩)')
        buf = io.BytesIO()
        tex_img.save(buf, format='PNG', optimize=True)
        tex_bytes = buf.getvalue()
        print(f'    纹理大小: {len(tex_bytes)/1024:.0f} KB')
    else:
        print('[3] 无 baseColorTexture')

    return mesh, tex_bytes


def mesh_to_gltf_arrays(mesh):
    """从 trimesh Mesh 提取 pos/nrm/uv/indices numpy 数组"""
    pos = np.ascontiguousarray(mesh.vertices, dtype=np.float32)
    nrm = np.ascontiguousarray(mesh.vertex_normals, dtype=np.float32) if mesh.vertex_normals is not None else np.zeros_like(pos)
    # 体素重网格没有 UV → 生成简单平面投影
    if hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None and len(mesh.visual.uv) == len(pos):
        uv = np.ascontiguousarray(mesh.visual.uv, dtype=np.float32)
    else:
        # 简单 XY 平面映射（0-1 范围）
        x_range = pos[:, 0].max() - pos[:, 0].min() or 1.0
        y_range = pos[:, 1].max() - pos[:, 1].min() or 1.0
        uv = np.ascontiguousarray(np.column_stack([
            (pos[:, 0] - pos[:, 0].min()) / x_range,
            (pos[:, 1] - pos[:, 1].min()) / y_range,
        ]), dtype=np.float32)
    if len(mesh.faces) > 0:
        idx = np.ascontiguousarray(mesh.faces, dtype=np.uint32).flatten()
    else:
        idx = np.arange(len(pos), dtype=np.uint32)
    return pos, nrm, uv, idx


# ============================================================
# 2. 智能 K-means 腿部分割（四足）
# ============================================================
def kmeans_legs(pos, n_clusters=4, leg_bottom_frac=0.18, leg_radius=0.05):
    """
    在模型底部区域用 K-means 找腿中心，紧半径绑定。
    返回: joints(list), role(list), jidx(nv,4)uint8, wt(nv,4)float
    """
    y_min, y_max = pos[:, 1].min(), pos[:, 1].max()
    height = y_max - y_min
    # 只取最底部 18% 的顶点做聚类（纯脚底/爪子）
    bottom_mask = pos[:, 1] < y_min + height * leg_bottom_frac
    bottom_pts = pos[bottom_mask]

    if len(bottom_pts) < n_clusters * 30:
        print(f'  ! 底部顶点过少({len(bottom_pts)})，退化为简单分割')
        return simple_leg_split(pos)

    # K-means 在 XZ 平面聚类
    from scipy.cluster.vq import kmeans2
    xz = bottom_pts[:, [0, 2]]
    centroids, labels = kmeans2(xz, n_clusters, minit='points', iter=20)

    # 按 Z 排序确定前后（Z 小=前，Z 大=后），按 X 确定左右
    cz_order = np.argsort(centroids[:, 1])  # Z 排序
    front_idx = cz_order[:2]
    back_idx = cz_order[2:]

    def assign_lr(idxs):
        c_front = centroids[idxs]
        if c_front[0, 0] < c_front[1, 0]:
            fl, fr = idxs[0], idxs[1]
        else:
            fl, fr = idxs[1], idxs[0]
        return int(fl), int(fr)

    fl, fr = assign_lr(front_idx)
    bl, br = assign_lr(back_idx)

    leg_centers = {
        'leg_fl': centroids[fl],
        'leg_fr': centroids[fr],
        'leg_bl': centroids[bl],
        'leg_br': centroids[br],
    }

    # 计算全局尺度用于半径
    x_span = pos[:, 0].max() - pos[:, 0].min()
    z_span = pos[:, 2].max() - pos[:, 2].min()
    scale = max(x_span, z_span)
    r_leg = scale * leg_radius  # 腿部绑定半径

    nv = len(pos)
    jidx = np.zeros((nv, 4), dtype=np.uint8)
    wt = np.zeros((nv, 4), dtype=np.float32)
    wt[:, 0] = 1.0  # 默认全部 root

    joints = []
    role = ['root']

    # root pivot：身体中心
    body_mask = pos[:, 1] >= y_min + height * 0.28
    body_cx = pos[body_mask, 0].mean() if body_mask.any() else 0
    body_cz = pos[body_mask, 2].mean() if body_mask.any() else 0
    root_y = y_min + height * 0.35
    joints.append(np.array([body_cx, root_y, body_cz], dtype=np.float32))

    # 每条腿：只绑距离腿中心 < r_leg 的顶点
    for name, center in leg_centers.items():
        dist = np.sqrt((pos[:, 0] - center[0])**2 + (pos[:, 2] - center[1])**2)
        # 同时要求 Y 在合理范围（脚底到腿根，更紧）
        leg_y_lo = y_min
        leg_y_hi = y_min + height * 0.30  # 只绑底部 30% 高度内的顶点
        leg_mask = (dist < r_leg) & (pos[:, 1] >= leg_y_lo) & (pos[:, 1] < leg_y_hi)

        if leg_mask.sum() < 30:
            print(f'  ! {name}: 绑定顶点过少({leg_mask.sum()})，跳过')
            continue

        # 髋部 pivot：该腿最高 Y 点附近
        hip_y = pos[leg_mask, 1].max()
        hip_x = pos[leg_mask, 0].mean()
        hip_z = pos[leg_mask, 2].mean()

        bone_i = len(joints)
        joints.append(np.array([hip_x, hip_y, hip_z], dtype=np.float32))
        role.append(name)

        jidx[leg_mask] = [bone_i, 0, 0, 0]
        wt[leg_mask] = [1.0, 0.0, 0.0, 0.0]

        print(f'  {name}: 中心=({center[0]:.2f},{center[1]:.2f}), '
              f'髋=({hip_x:.2f},{hip_y:.2f},{hip_z:.2f}), '
              f'绑定={leg_mask.sum()} 顶点, 半径={r_leg:.3f}')

    print(f'  root@({body_cx:.2f},{root_y:.2f},{body_cz:.2f}), 总骨骼={len(joints)}')
    return joints, role, jidx, wt


def simple_leg_split(pos):
    """降级方案：简单按 X/Z 四象限分腿"""
    y_min, y_max = pos[:, 1].min(), pos[:, 1].max()
    h = y_max - y_min
    leg_top = y_min + h * 0.30
    leg_mask = pos[:, 1] < leg_top
    med_x = np.median(pos[leg_mask, 0])
    med_z = np.median(pos[leg_mask, 2])

    quads = [
        ('leg_fl', leg_mask & (pos[:, 0] < med_x) & (pos[:, 2] < med_z)),
        ('leg_fr', leg_mask & (pos[:, 0] >= med_x) & (pos[:, 2] < med_z)),
        ('leg_bl', leg_mask & (pos[:, 0] < med_x) & (pos[:, 2] >= med_z)),
        ('leg_br', leg_mask & (pos[:, 0] >= med_x) & (pos[:, 2] >= med_z)),
    ]

    body_mask = ~leg_mask
    body_cx = pos[body_mask, 0].mean()
    body_cz = pos[body_mask, 2].mean()
    joints = [np.array([body_cx, leg_top, body_cz], dtype=np.float32)]
    role = ['root']
    jidx = np.zeros((len(pos), 4), dtype=np.uint8)
    wt = np.zeros((len(pos), 4), dtype=np.float32)
    wt[:, 0] = 1.0

    for name, mask in quads:
        if mask.sum() < 30:
            continue
        hx, hy, hz = pos[mask, 0].mean(), pos[mask, 1].max(), pos[mask, 2].mean()
        bi = len(joints)
        joints.append(np.array([hx, hy, hz], dtype=np.float32))
        role.append(name)
        jidx[mask] = [bi, 0, 0, 0]
        wt[mask] = [1.0, 0.0, 0, 0]

    return joints, role, jidx, wt


# ============================================================
# 3. 鱼骨骼
# ============================================================
def fish_bones(pos):
    """鱼：root(身体) + tail(尾摆) + dorsal(背鳍微动)"""
    y_min, y_max = pos[:, 1].min(), pos[:, 1].max()
    x_min, x_max = pos[:, 0].min(), pos[:, 0].max()
    z_min, z_max = pos[:, 2].min(), pos[:, 2].max()
    len_axis = 'z' if (z_max - z_min) > (x_max - x_min) else 'x'
    if len_axis == 'z':
        head, tail = min(z_min, z_max, key=abs), max(z_min, z_max, key=abs)
        coord = pos[:, 2]
    else:
        head, tail = min(x_min, x_max, key=abs), max(x_min, x_max, key=abs)
        coord = pos[:, 0]
    span = abs(tail - head)

    tail_base = tail - np.sign(tail - head) * span * 0.18
    tail_mask = (coord - tail_base) * np.sign(tail - head) > 0
    body_mask = ~tail_mask

    body_cx = pos[body_mask, 0].mean()
    body_cz = pos[body_mask, 2].mean()
    mid_y = (y_min + y_max) / 2

    # 背鳍
    dorsal_mask = body_mask & (pos[:, 1] > y_min + (y_max-y_min)*0.72) & \
                  (np.sqrt((pos[:,0]-body_cx)**2+(pos[:,2]-body_cz)**2) < span*0.12)

    nv = len(pos)
    jidx = np.zeros((nv, 4), dtype=np.uint8)
    wt = np.zeros((nv, 4), dtype=np.float32)
    wt[:, 0] = 1.0

    joints = [np.array([body_cx, mid_y, body_cz], dtype=np.float32)]
    role = ['root']

    def add(name, mask, hip, mx=80000):
        if mask.sum() < 100 or mask.sum() > mx:
            print(f'  ! {name}: {mask.sum()} 顶点，跳过')
            return
        bi = len(joints)
        joints.append(np.array(hip, dtype=np.float32))
        role.append(name)
        jidx[mask] = [bi, 0, 0, 0]
        wt[mask] = [1.0, 0, 0, 0]
        print(f'  {name}: {mask.sum()} 顶点')

    add('tail', tail_mask, [body_cx, mid_y, tail_base], mx=80000)
    add('dorsal', dorsal_mask, [body_cx, y_max*0.9, body_cz], mx=12000)
    print(f'  鱼 体长轴={len_axis}, 骨骼={len(joints)}')
    return joints, role, jidx, wt


# ============================================================
# 4. 组装 GLB（精简版：无 animation channel，由 JS 驱动）
# ============================================================
def build_glb(pos, nrm, uv, idx, joints, role, jidx, wt, tex_bytes=None, out_path='out.glb'):
    nv = len(pos)
    n_joints = len(joints)

    # IBM
    ibm = np.zeros((n_joints, 4, 4), dtype=np.float32)
    for i, jp in enumerate(joints):
        ibm[i] = np.eye(4, dtype=np.float32)
        ibm[i][:3, 3] = -jp

    # buffer 数据（POSITION 必须保持 float32！只有 NORM/UV 可用 float16）
    chunks = [
        np.ascontiguousarray(pos, dtype=np.float32).tobytes(),   # VEC3 float32 (glTF 要求)
        np.ascontiguousarray(nrm, dtype=np.float16).tobytes(),   # VEC3 float16
        np.ascontiguousarray(uv, dtype=np.float16).tobytes(),    # VEC2 float16
        np.ascontiguousarray(idx, dtype=np.uint16).tobytes(),  # uint16 节省空间（<65535 顶点）
        np.ascontiguousarray(jidx, dtype=np.uint8).tobytes(),
        np.ascontiguousarray(wt, dtype=np.float32).tobytes(),
        np.ascontiguousarray(ibm, dtype=np.float32).tobytes(),
    ]
    if tex_bytes:
        chunks.append(tex_bytes)

    bin_parts, offsets, cur = [], [], 0
    for b in chunks:
        pad = (-cur) % 4
        if pad:
            bin_parts.append(b'\x00'*pad); cur += pad
        offsets.append(cur)
        bin_parts.append(b); cur += len(b)
    bin_all = b''.join(bin_parts)

    # accessors
    accs = [
        {"bufferView": 0, "componentType": 5126, "count": nv, "type": "VEC3", "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()},
        {"bufferView": 1, "componentType": 5123, "count": nv, "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": nv, "type": "VEC2"},
        {"bufferView": 3, "componentType": 5125, "count": len(idx)//3, "type": "SCALAR"},
        {"bufferView": 4, "componentType": 5121, "count": nv, "type": "VEC4"},
        {"bufferView": 5, "componentType": 5126, "count": nv, "type": "VEC4"},
        {"bufferView": 6, "componentType": 5126, "count": n_joints, "type": "MAT4"},
    ]
    has_tex = tex_bytes is not None
    bvs = []
    for i in range(7):
        bvs.append({"buffer": 0, "byteOffset": offsets[i], "byteLength": len(chunks[i])})
    if has_tex:
        bvs.append({"buffer": 0, "byteOffset": offsets[7], "byteLength": len(tex_bytes)})

    # primitive attributes
    attrs = {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2, "JOINTS_0": 4, "WEIGHTS_0": 5}

    # nodes — 正确层级，无循环引用
    skinned_node_idx = n_joints + 1  # world=0, root=1, bones=2..n_joints, mesh=n_joints+1
    nodes = [{"name": "world", "children": [1]}]
    nodes.append({"name": "root", "translation": joints[0].tolist(), "children": []})
    for i in range(1, n_joints):
        nodes.append({"name": role[i], "translation": joints[i].tolist(), "children": []})
    nodes.append({"name": "skinned_mesh", "mesh": 0, "skin": 0})
    nodes[1]["children"] = list(range(2, n_joints + 1)) + [skinned_node_idx]

    skin_joints = list(range(1, n_joints + 1))

    materials = []
    images = []
    textures = []
    samplers = []
    if has_tex:
        images.append({"bufferView": 7, "mimeType": "image/png"})
        textures.append({"source": 0, "sampler": 0})
        samplers.append({})
        materials.append({
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.9,
            },
            "alphaMode": "OPAQUE",
        })

    gltf = {
        "asset": {"version": "2.0", "generator": "gen_skel_v2"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": [{
            "name": "animal",
            "primitives": [{"attributes": attrs, "indices": 3, "mode": 4, "material": 0 if has_tex else None}],
        }],
        "skins": [{"joints": skin_joints, "skeleton": 1, "inverseBindMatrices": 6}],
        "buffers": [{"byteLength": len(bin_all)}],
        "bufferViews": bvs,
        "accessors": accs,
    }
    if has_tex:
        gltf["materials"] = materials
        gltf["images"] = images
        gltf["textures"] = textures
        gltf["samplers"] = samplers

    json_str = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    pad = (-len(json_str)) % 4
    json_str += b' ' * pad
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(json_str) + 8 + len(bin_all))
    glb += struct.pack('<II', len(json_str), 0x4E4F534A) + json_str
    glb += struct.pack('<II', len(bin_all), 0x004E4942) + bin_all
    with open(out_path, 'wb') as f:
        f.write(glb)
    sz_kb = os.path.getsize(out_path) / 1024
    print(f'[OK] {out_path}  顶点={nv}, 骨骼={n_joints}, 文件={sz_kb:.0f}KB')
    return out_path


# ============================================================
# Main
# ============================================================
def main():
    if len(sys.argv) < 4:
        print('用法: python gen_skel_v2.py <in.glb> <out.glb> <quad|fish>')
        sys.exit(1)
    in_path, out_path, mode = sys.argv[1], sys.argv[2], sys.argv[3]

    # Step 1-3: 加载、减面、压缩纹理
    mesh, tex_bytes = load_and_compress(in_path, target_verts=5000, tex_size=128)
    pos, nrm, uv, idx = mesh_to_gltf_arrays(mesh)

    # Step 4: 骨骼+权重
    if mode == 'quad':
        joints, role, jidx, wt = kmeans_legs(pos)
    elif mode == 'fish':
        joints, role, jidx, wt = fish_bones(pos)
    else:
        print(f'未知模式: {mode}'); sys.exit(1)

    # Step 5: 组装输出
    build_glb(pos, nrm, uv, idx, joints, role, jidx, wt, tex_bytes, out_path)


if __name__ == '__main__':
    main()
