#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HY3D 模型绑骨+蒙皮（保留 PBR 颜色）通用版
支持模式:
  quad  : 四足动物（猫/狗）—— root + 4 条腿骨，腿从髋部摆动
  fish  : 鱼 —— root(身体) + 尾鳍骨(摇摆) + 背鳍/胸鳍骨
  duck  : 兼容旧版两足（root + 2 腿）

关键: 保留原 GLB 的 baseColorTexture/PBR 颜色；关节节点带 translation(=joint_pos)；
      IBM = translate(-joint_pos) 保证 bind pose 不形变；mesh 节点带 skin:0。
"""
import sys
import struct
import json
import numpy as np


# ---------- 低层 GLB 读写 ----------
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


# ---------- 关节/权重计算 ----------
def build_quad(pos, leg_top_frac=0.40, radial_frac=0.45):
    """四足：root + 4 腿骨。返回 joints(list of (name,pos)), jidx(nv,4)uint8, wt(nv,4)float"""
    y_min, y_max = pos[:, 1].min(), pos[:, 1].max()
    height = y_max - y_min
    leg_top = y_min + height * leg_top_frac

    leg_mask = pos[:, 1] < leg_top
    body_mask = ~leg_mask
    leg_pts = pos[leg_mask]
    # 腿区域 XZ 质心与最大水平半径
    cx, cz = leg_pts[:, 0].mean(), leg_pts[:, 2].mean()
    horiz = np.sqrt((leg_pts[:, 0] - cx) ** 2 + (leg_pts[:, 2] - cz) ** 2)
    R = horiz.max()
    # 真正的"腿" = 远离中心轴的腿区域顶点；中心轴附近的肚子绑给 root
    is_leg = leg_mask & (np.sqrt((pos[:, 0] - cx) ** 2 + (pos[:, 2] - cz) ** 2) > radial_frac * R)

    # 4 象限（按腿区域 XZ 中位数切分）
    med_x = np.median(leg_pts[:, 0])
    med_z = np.median(leg_pts[:, 2])
    quads = [
        ("leg_fl", (pos[:, 0] < med_x) & (pos[:, 2] < med_z)),   # 前左
        ("leg_fr", (pos[:, 0] >= med_x) & (pos[:, 2] < med_z)),  # 前右
        ("leg_bl", (pos[:, 0] < med_x) & (pos[:, 2] >= med_z)),  # 后左
        ("leg_br", (pos[:, 0] >= med_x) & (pos[:, 2] >= med_z)),  # 后右
    ]

    joints = [np.array([cx, 0.0, cz], dtype=np.float32)]  # root(临时 y，后设)
    role = ["root"]
    jidx = np.zeros((len(pos), 4), dtype=np.uint8)
    wt = np.zeros((len(pos), 4), dtype=np.float32)
    wt[:, 0] = 1.0  # 默认全部绑 root

    for name, mask in quads:
        m = mask & is_leg
        if m.sum() < 50:
            print(f"  ! 象限 {name} 腿顶点过少({m.sum()})，跳过")
            continue
        # 髋部 pivot：该腿 XZ 质心 + 该腿最高 Y（腿根）
        hx, hz = pos[m, 0].mean(), pos[m, 2].mean()
        hy = pos[m, 1].max()
        bone_i = len(joints)
        joints.append(np.array([hx, hy, hz], dtype=np.float32))
        role.append(name)
        jidx[m] = [bone_i, 0, 0, 0]
        wt[m] = [1.0, 0.0, 0.0, 0.0]

    # root pivot 设在身体区域 XZ 质心、腿根高度
    body_cx, body_cz = pos[body_mask, 0].mean(), pos[body_mask, 2].mean()
    joints[0] = np.array([body_cx, leg_top, body_cz], dtype=np.float32)
    print(f"  腿区域顶点={leg_mask.sum()}, 真腿顶点={is_leg.sum()}, leg_top={leg_top:.3f}")
    print(f"  root@({body_cx:.3f},{leg_top:.3f},{body_cz:.3f}), 骨骼数(含root)={len(joints)}")
    return joints, role, jidx, wt


def build_fish(pos):
    """鱼：root(身体) + 尾鳍骨(摇摆) + 背鳍 + 2 胸鳍。返回 joints/role/jidx/wt"""
    y_min, y_max = pos[:, 1].min(), pos[:, 1].max()
    x_min, x_max = pos[:, 0].min(), pos[:, 0].max()
    z_min, z_max = pos[:, 2].min(), pos[:, 2].max()
    # 体长方向：X 或 Z 谁更长
    len_axis = 'z' if (z_max - z_min) > (x_max - x_min) else 'x'
    if len_axis == 'z':
        head = z_min if abs(z_min) > abs(z_max) else z_max  # 头端
        tail = z_max if head == z_min else z_min
        coord = pos[:, 2]
    else:
        head = x_min if abs(x_min) > abs(x_max) else x_max
        tail = x_max if head == x_min else x_min
        coord = pos[:, 0]
    span = abs(tail - head)
    # 尾鳍：长度方向最末端 18% 的细区域
    tail_base = tail - np.sign(tail - head) * span * 0.18
    tail_mask = (coord - tail_base) * np.sign(tail - head) > 0
    # 身体其余
    body_mask = ~tail_mask
    # 背鳍：身体上半、XZ 接近中轴（薄脊）
    body_cx = pos[body_mask, 0].mean()
    body_cz = pos[body_mask, 2].mean()
    dorsal_mask = body_mask & (pos[:, 1] > y_min + (y_max - y_min) * 0.72) & \
                  (np.sqrt((pos[:, 0] - body_cx) ** 2 + (pos[:, 2] - body_cz) ** 2) < span * 0.12)
    # 胸鳍：仅取身体前中段最外侧的"鳍壳"（|X| 接近极值），避免抓到侧身主体
    x_max_abs = max(abs(x_min), abs(x_max))
    # 沿体长方向"距头距离"（head→tail 递增）
    if len_axis == 'z':
        fwd = (pos[:, 2] - head)
    else:
        fwd = (pos[:, 0] - head)
    body_span_excl_tail = (abs(tail_base - head))
    front = (fwd < 0.45 * body_span_excl_tail)        # 前 45% 体段
    mid_y = (pos[:, 1] > y_min + (y_max - y_min) * 0.30) & \
            (pos[:, 1] < y_min + (y_max - y_min) * 0.60)
    pec_mask = body_mask & ~dorsal_mask & front & mid_y & \
               (np.abs(pos[:, 0]) > 0.80 * x_max_abs)

    joints = [np.array([body_cx, (y_min + y_max) / 2, body_cz], dtype=np.float32)]
    role = ["root"]
    jidx = np.zeros((len(pos), 4), dtype=np.uint8)
    wt = np.zeros((len(pos), 4), dtype=np.float32)
    wt[:, 0] = 1.0

    def add(name, mask, hip, max_count=8000):
        nonlocal jidx, wt
        m = mask
        if m.sum() < 100 or m.sum() > max_count:
            print(f"  ! {name} 顶点数={m.sum()}（不在[100,{max_count}]），跳过")
            return
        bone_i = len(joints)
        joints.append(np.array(hip, dtype=np.float32))
        role.append(name)
        jidx[m] = [bone_i, 0, 0, 0]
        wt[m] = [1.0, 0.0, 0.0, 0.0]

    # 尾鳍 pivot 在尾根，绑定整条尾（允许较大，后身整体摆动=游动）
    add("tail", tail_mask, [body_cx, (y_min + y_max) / 2, tail_base], max_count=80000)
    # 背鳍 pivot 在背脊中部
    add("dorsal", dorsal_mask, [body_cx, y_max * 0.9, body_cz], max_count=12000)
    # 胸鳍：左右各一（仅最外侧鳍壳）
    pec_mask = pec_mask & (np.abs(pos[:, 0]) > 0.70 * x_max_abs)
    pec_l = pec_mask & (pos[:, 0] < body_cx)
    pec_r = pec_mask & (pos[:, 0] >= body_cx)
    add("pec_l", pec_l, [pos[pec_l, 0].mean() if pec_l.any() else body_cx,
                         (y_min + y_max) / 2, pos[pec_l, 2].mean() if pec_l.any() else body_cz], max_count=6000)
    add("pec_r", pec_r, [pos[pec_r, 0].mean() if pec_r.any() else body_cx,
                         (y_min + y_max) / 2, pos[pec_r, 2].mean() if pec_r.any() else body_cz], max_count=6000)
    print(f"  鱼 体长轴={len_axis}, 尾顶点={tail_mask.sum()}, 背鳍={dorsal_mask.sum()}, 胸鳍={pec_mask.sum()}")
    return joints, role, jidx, wt


# ---------- 组装 GLB ----------
def assemble(j, bin_data, pos, nrm, uv, idx, joints, role, jidx, wt, out_path):
    nv = len(pos)
    n_joints = len(joints)

    # 原 image bytes（保留 PBR）
    orig_images = j.get('images', [])
    orig_textures = j.get('textures', [])
    orig_samplers = j.get('samplers', [])
    orig_materials = j.get('materials', [])
    image_bytes_list = []
    for img in orig_images:
        bv_idx = img.get('bufferView')
        if bv_idx is None:
            image_bytes_list.append(b'')
            continue
        bv = j['bufferViews'][bv_idx]
        image_bytes_list.append(bin_data[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])

    # IBM
    ibm = np.zeros((n_joints, 4, 4), dtype=np.float32)
    for i, jp in enumerate(joints):
        ibm[i] = np.eye(4, dtype=np.float32)
        ibm[i][:3, 3] = -jp

    # buffers
    pos_b = np.ascontiguousarray(pos, dtype=np.float32).tobytes()
    nrm_b = np.ascontiguousarray(nrm, dtype=np.float32).tobytes()
    uv_b = np.ascontiguousarray(uv, dtype=np.float32).tobytes()
    idx_b = np.ascontiguousarray(idx, dtype=np.uint32).tobytes()
    jt_b = np.ascontiguousarray(jidx, dtype=np.uint8).tobytes()
    wt_b = np.ascontiguousarray(wt, dtype=np.float32).tobytes()
    ibm_b = np.ascontiguousarray(ibm, dtype=np.float32).tobytes()

    chunks = [pos_b, nrm_b, uv_b, idx_b, jt_b, wt_b, ibm_b]
    for img_b in image_bytes_list:
        chunks.append(img_b)

    bin_parts, offsets, cur = [], [], 0
    for b in chunks:
        pad = (-cur) % 4
        if pad:
            bin_parts.append(b'\x00' * pad); cur += pad
        offsets.append(cur)
        bin_parts.append(b); cur += len(b)
    bin_all = b''.join(bin_parts)

    # accessors（保留原 0-3 几何）
    new_accs = list(j['accessors'])
    new_accs.append({"bufferView": 4, "componentType": 5121, "count": nv, "type": "VEC4"})
    new_accs.append({"bufferView": 5, "componentType": 5126, "count": nv, "type": "VEC4"})
    new_accs.append({"bufferView": 6, "componentType": 5126, "count": n_joints, "type": "MAT4"})

    # bufferViews：跳过原 image 的 bufferView，追加新的
    orig_bv = j['bufferViews']
    skip = {img['bufferView'] for img in orig_images if img.get('bufferView') is not None}
    new_bvs = [bv for i, bv in enumerate(orig_bv) if i not in skip]
    new_bvs.append({"buffer": 0, "byteOffset": offsets[4], "byteLength": len(jt_b)})
    new_bvs.append({"buffer": 0, "byteOffset": offsets[5], "byteLength": len(wt_b)})
    new_bvs.append({"buffer": 0, "byteOffset": offsets[6], "byteLength": len(ibm_b)})

    image_bv_indices = []
    for i, img_b in enumerate(image_bytes_list):
        bv_idx = len(new_bvs)
        new_bvs.append({"buffer": 0, "byteOffset": offsets[7 + i], "byteLength": len(img_b)})
        image_bv_indices.append(bv_idx)

    prim = j['meshes'][0]['primitives'][0]
    attrs = dict(prim['attributes'])
    attrs['JOINTS_0'] = 4
    attrs['WEIGHTS_0'] = 5

    # 节点：world(0) -> root(1) -> [各腿/鳍骨(2..n_joints), skinned_mesh(n_joints+1)]
    nodes = [{"name": "world", "children": [1]}]
    nodes.append({"name": "root", "translation": joints[0].tolist(), "children": []})
    for i in range(1, n_joints):
        nodes.append({"name": role[i], "translation": joints[i].tolist(), "children": []})
    skinned_idx = n_joints + 1
    nodes.append({"name": "skinned_mesh", "mesh": 0, "skin": 0})
    # root 的子节点 = 所有非 root 骨骼(2..n_joints) + skinned_mesh（不可包含 root 自身，否则循环）
    nodes[1]["children"] = list(range(2, n_joints + 1)) + [skinned_idx]

    skin_joints = list(range(1, n_joints + 1))  # root(1) + 所有腿/鳍节点(2..n_joints)
    skins = [{"joints": skin_joints, "skeleton": 1, "inverseBindMatrices": 6}]

    new_mesh = [{
        "name": "animal",
        "primitives": [{
            "attributes": attrs,
            "indices": prim['indices'],
            "mode": 4,
            "material": prim.get('material', 0),
        }],
    }]

    new_images = []
    for i, img in enumerate(orig_images):
        ni = dict(img)
        if image_bv_indices[i] is not None and img.get('bufferView') is not None:
            ni['bufferView'] = image_bv_indices[i]
        new_images.append(ni)

    gltf = {
        "asset": j['asset'],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": new_mesh,
        "skins": skins,
        "buffers": [{"byteLength": len(bin_all)}],
        "bufferViews": new_bvs,
        "accessors": new_accs,
        "materials": orig_materials,
        "images": new_images,
        "textures": orig_textures,
        "samplers": orig_samplers,
    }
    json_str = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    pad = (-len(json_str)) % 4
    json_str += b' ' * pad
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(json_str) + 8 + len(bin_all))
    glb += struct.pack('<II', len(json_str), 0x4E4F534A) + json_str
    glb += struct.pack('<II', len(bin_all), 0x004E4942) + bin_all
    with open(out_path, 'wb') as f:
        f.write(glb)
    print(f'[OK] 绑骨 → {out_path}  顶点={nv}, 骨骼={n_joints}, images={len(orig_images)}')


def main(in_path, out_path, mode):
    j, bin_data = read_glb(in_path)
    prim = j['meshes'][0]['primitives'][0]
    attrs = prim['attributes']
    pos = get_acc_array(j, bin_data, attrs['POSITION'])
    nrm = get_acc_array(j, bin_data, attrs['NORMAL'])
    uv = get_acc_array(j, bin_data, attrs['TEXCOORD_0'])
    idx = get_acc_array(j, bin_data, prim['indices'])
    print(f'原 {in_path}: {len(pos)} 顶点, material={j.get("materials",[{}])[0].get("name","none")}')

    if mode == 'quad':
        joints, role, jidx, wt = build_quad(pos)
    elif mode == 'fish':
        joints, role, jidx, wt = build_fish(pos)
    else:
        raise ValueError(f"未知模式 {mode}")
    assemble(j, bin_data, pos, nrm, uv, idx, joints, role, jidx, wt, out_path)


if __name__ == '__main__':
    # 用法: python gen_skel_general.py <in.glb> <out.glb> <quad|fish>
    main(sys.argv[1], sys.argv[2], sys.argv[3])
