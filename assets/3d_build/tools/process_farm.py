#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""农场四动物 下游处理：贴图压缩(128px) + Draco 几何压缩
依赖：tools/resize_textures.py, gltf-pipeline (node)
用法: python tools/process_farm.py
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = r"C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node.exe"
WS = r"C:/Users/WIN11/.workbuddy/binaries/node/workspace"
ANIMALS = ["chicken", "duck", "cow", "sheep"]
PY = r"C:/Users/WIN11/.workbuddy/binaries/python/envs/default/Scripts/python.exe"


def main():
    for a in ANIMALS:
        src = os.path.join(ROOT, f"hy3_{a}.glb")
        tex = os.path.join(ROOT, f"hy3_{a}_tex.glb")
        draco = os.path.join(ROOT, f"hy3_{a}_draco.glb")
        if not os.path.exists(src):
            print(f"[跳过] {a}: 源文件缺失 {src}")
            continue
        # 1) 贴图压缩 128px
        print(f"\n=== {a}: 贴图压缩 ===", flush=True)
        r1 = subprocess.run(
            [PY, os.path.join(ROOT, "tools", "resize_textures.py"), src, tex, "--max", "128"],
            cwd=ROOT, capture_output=True, text=True)
        print(r1.stdout[-400:] if r1.stdout else "", r1.stderr[-300:] if r1.stderr else "")
        # 2) Draco 几何压缩
        print(f"=== {a}: Draco 压缩 ===", flush=True)
        r2 = subprocess.run(
            [NODE, os.path.join(WS, "node_modules", "gltf-pipeline", "bin", "gltf-pipeline.js"),
             "-i", tex, "-o", draco, "-d"],
            cwd=ROOT, capture_output=True, text=True)
        print(r2.stdout[-400:] if r2.stdout else "", r2.stderr[-300:] if r2.stderr else "")
        if os.path.exists(draco):
            print(f"  ✓ {a} draco: {os.path.getsize(draco)/1024/1024:.2f} MB")
        else:
            print(f"  ✗ {a} draco 失败")


if __name__ == "__main__":
    main()
