#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 HY3D 生成的 GLB 压缩到几百 KB：保留低模几何，将内嵌贴图重采样到 512 并重新编码。"""
import struct, json, sys
from PIL import Image

def load_glb(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF', 'not glb'
    ver = struct.unpack('<I', data[4:8])[0]
    # 解析两个 chunk
    off = 12
    json_bytes = None
    bin_bytes = None
    while off < len(data):
        length = struct.unpack('<I', data[off:off+4])[0]
        ctype = data[off+4:off+8]
        cdata = data[off+8:off+8+length]
        if ctype == b'JSON':
            json_bytes = cdata
        elif ctype == b'BIN\x00':
            bin_bytes = cdata
        off += 8 + length
    return data, json.loads(json_bytes.decode('utf-8')), bin_bytes, ver

def save_glb(path, gltf, bin_bytes):
    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    # 4 字节对齐 JSON（chunk 数据需 4 对齐）
    while len(json_bytes) % 4 != 0:
        json_bytes += b' '
    while len(bin_bytes) % 4 != 0:
        bin_bytes += b'\x00'
    out = b'glTF'
    out += struct.pack('<I', 2)  # version
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    out += struct.pack('<I', total)
    out += struct.pack('<II', len(json_bytes), 0x4E4F534A)  # JSON chunk
    out += json_bytes
    out += struct.pack('<II', len(bin_bytes), 0x004E4942)   # BIN chunk
    out += bin_bytes
    open(path, 'wb').write(out)

def shrink(in_path, out_path, max_side=512, jpeg_quality=85):
    raw, gltf, bin_bytes, ver = load_glb(in_path)
    # 定位 image 的 bufferView
    imgs = gltf.get('images', [])
    if not imgs:
        print(f'  [跳过] {in_path} 无贴图')
        return
    img = imgs[0]
    bv_idx = img['bufferView']
    bv = gltf['bufferViews'][bv_idx]
    bv_off = bv.get('byteOffset', 0)
    bv_len = bv['byteLength']
    tex = bin_bytes[bv_off:bv_off+bv_len]
    # 解码贴图
    im = Image.open(__import__('io').BytesIO(tex))
    im = im.convert('RGBA')
    w, h = im.size
    scale = max_side / max(w, h)
    nw, nh = max(1, int(w*scale)), max(1, int(h*scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    # 判断是否有透明像素（决定是否保留 alpha）
    has_alpha = False
    if im.mode == 'RGBA':
        alpha = im.split()[3]
        if alpha.getextrema()[0] < 255:
            has_alpha = True
    # 材质 alphaMode（默认 OPAQUE）
    alpha_mode = None
    for m in gltf.get('materials', []):
        alpha_mode = m.get('alphaMode')
        break
    if has_alpha and alpha_mode in ('MASK', 'BLEND'):
        new_bytes = __import__('io').BytesIO()
        im.save(new_bytes, format='PNG', optimize=True)
        new_bytes = new_bytes.getvalue()
        img['mimeType'] = 'image/png'
    else:
        rgb = im.convert('RGB')
        new_bytes = __import__('io').BytesIO()
        rgb.save(new_bytes, format='JPEG', quality=jpeg_quality, optimize=True)
        new_bytes = new_bytes.getvalue()
        img['mimeType'] = 'image/jpeg'
    # 重建 BIN：所有 bufferView 按顺序 4 字节对齐拼接，image 那个替换为 new_bytes
    new_bin = bytearray()
    offset_map = {}
    for i, b in enumerate(gltf['bufferViews']):
        if i == bv_idx:
            seg = new_bytes
        else:
            o = b.get('byteOffset', 0)
            seg = bin_bytes[o:o+b['byteLength']]
        # 4 字节对齐
        while len(new_bin) % 4 != 0:
            new_bin.append(0)
        offset_map[i] = (len(new_bin), len(seg))
        new_bin += seg
    # 写回 bufferViews
    for i, b in enumerate(gltf['bufferViews']):
        b['byteOffset'] = offset_map[i][0]
        b['byteLength'] = offset_map[i][1]
    gltf['buffers'][0]['byteLength'] = len(new_bin)
    # 剥离 Three 0.128 GLTFLoader 支持不全的扩展（KHR_materials_specular），避免兼容性告警/材质异常
    if 'extensionsUsed' in gltf:
        gltf['extensionsUsed'] = [e for e in gltf['extensionsUsed'] if e != 'KHR_materials_specular']
        if not gltf['extensionsUsed']:
            del gltf['extensionsUsed']
    for m in gltf.get('materials', []):
        if m.get('extensions', {}).get('KHR_materials_specular'):
            del m['extensions']['KHR_materials_specular']
            if not m['extensions']:
                del m['extensions']
    save_glb(out_path, gltf, bytes(new_bin))
    import os
    print(f'  {in_path} ({w}x{h}->{nw}x{nh}) 贴图 {len(tex)//1024}KB -> {len(new_bytes)//1024}KB | 输出 {out_path} ({os.path.getsize(out_path)//1024}KB)')

if __name__ == '__main__':
    for f in sys.argv[1:]:
        out = f[:-4] + '_s.glb'
        print('处理', f)
        shrink(f, out)
