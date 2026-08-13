#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""混元 3D 官方 API 提交/查询/下载 —— 农场四动物：鸡/鸭/牛/羊
接口: https://api.ai3d.cloud.tencent.com/v1/ai3d/submit|query
鉴权: Authorization: sk-xxx
"""
import json
import sys
import os
import time
import urllib.request

API_KEY = "sk-hCJjBNmjtH9e2f5ssuyp8mKnNXFfOu1NKqYySILdG1MlU43T"
BASE = "https://api.ai3d.cloud.tencent.com/v1/ai3d"

# 风格对齐现有猫狗鱼（半写实皮克斯风），鸭子按用户硬性配色
ANIMALS = {
    "chicken": "半写实皮克斯风格的小公鸡，圆润可爱，3D卡通角色模型，红色鸡冠，黄色尖喙，橙红色身体羽毛，黑色尾羽，两条黄色细腿站立",
    "duck": "半写实皮克斯风格的白色鸭子，圆润可爱，3D卡通角色模型，通体白色羽毛身体，头顶有一撮黑色羽毛，黄色扁平嘴巴，黄色脚掌，两条黄色短腿站立",
    "cow": "半写实皮克斯风格的奶牛，圆润可爱，3D卡通角色模型，白色身体带黑色斑块，小黄色牛角，粉色大鼻子，黑色眼睛，四条腿站立",
    "sheep": "半写实皮克斯风格的绵羊，圆润可爱，3D卡通角色模型，蓬松的白色卷毛身体，黑色脸和黑色四蹄，两只小耳朵，四条腿站立",
}
JOB_FILE = "tools/_oapi_farm_jobs.json"


def call(path, payload, timeout=120):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Authorization": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def submit(name):
    print(f"[提交] {name} ...", flush=True)
    try:
        resp = call("/submit", {"Prompt": ANIMALS[name]})
        jid = resp.get("Response", {}).get("JobId")
        if not jid:
            print(f"  ✗ 无 JobId: {json.dumps(resp, ensure_ascii=False)[:300]}")
            return None
        print(f"  ✓ JobId: {jid}")
        return jid
    except Exception as e:
        print(f"  ✗ 失败: {e}")
        return None


def query(jid):
    return call("/query", {"JobId": jid}).get("Response", {})


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "submit"
    if mode == "submit":
        jobs = {}
        for name in ANIMALS:
            jid = submit(name)
            if jid:
                jobs[name] = jid
            time.sleep(1)
        with open(JOB_FILE, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)
        print(f"\n已保存 {len(jobs)} 个任务到 {JOB_FILE}")
        print(json.dumps(jobs, ensure_ascii=False))
    elif mode == "status":
        with open(JOB_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
        for name, jid in jobs.items():
            try:
                r = query(jid)
                files = r.get("ResultFile3Ds", [])
                print(f"{name} ({jid}): {r.get('Status','?')} files={len(files)}")
                for fl in files:
                    print(f"    {fl.get('Type','?')}: {fl.get('Url','')[:100]}")
            except Exception as e:
                print(f"{name}: 查询失败 {e}")
    elif mode == "wait":
        # 阻塞轮询直到全部 DONE 或超时（默认 20 分钟）
        timeout_min = int(sys.argv[2]) if len(sys.argv) > 2 else 20
        with open(JOB_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
        deadline = time.time() + timeout_min * 60
        while time.time() < deadline:
            all_done = True
            for name, jid in jobs.items():
                r = query(jid)
                st = r.get("Status")
                if st != "DONE":
                    all_done = False
                print(f"  {name}: {st}", flush=True)
            if all_done:
                print("全部完成 ✓")
                break
            time.sleep(20)
        else:
            print("⚠ 超时，仍有任务未完成")
    elif mode == "download":
        with open(JOB_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
        for name, jid in jobs.items():
            r = query(jid)
            if r.get("Status") != "DONE":
                print(f"{name}: 未完成 ({r.get('Status')})，跳过")
                continue
            glb = None
            for fobj in r.get("ResultFile3Ds", []):
                if fobj.get("Type") == "GLB":
                    glb = fobj.get("Url")
                    break
            if not glb:
                print(f"{name}: 无 GLB 文件")
                continue
            out = f"hy3_{name}.glb"
            try:
                urllib.request.urlretrieve(glb, out)
                print(f"{name}: 下载完成 {out} ({os.path.getsize(out)} bytes)")
            except Exception as e:
                print(f"{name}: 下载失败 {e}")


if __name__ == "__main__":
    main()
