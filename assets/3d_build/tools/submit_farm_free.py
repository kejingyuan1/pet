#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""免费通道（每日5次）提交农场四动物 3D 生成
使用 buddy-cloud.py + JWT（每日5次免费额度）
"""
import subprocess, sys, os, json, time

SCRIPT = r"C:/Users/WIN11/.workbuddy/plugins/cache/workbuddy-builtin/skill-buddy-multimodal-generation/0.1.0/scripts/buddy-cloud.py"
PY = r"C:/Users/WIN11/.workbuddy/binaries/python/versions/3.13.12/python.exe"
TOKEN = "tk_XPaSc5LtCRtn34hhZAYmDHySAsDPlXbl"

# 风格对齐现有猫狗鱼，鸭子按用户硬性配色
ANIMALS = {
    "chicken": "半写实皮克斯风格的小公鸡，圆润可爱，3D卡通角色模型，红色鸡冠，黄色尖喙，橙红色身体羽毛，黑色尾羽，两条黄色细腿站立",
    "duck": "半写实皮克斯风格的白色鸭子，圆润可爱，3D卡通角色模型，通体白色羽毛身体，头顶有一撮黑色羽毛，黄色扁平嘴巴，黄色脚掌，两条黄色短腿站立",
    "cow": "半写实皮克斯风格的奶牛，圆润可爱，3D卡通角色模型，白色身体带黑色斑块，小黄色牛角，粉色大鼻子，黑色眼睛，四条腿站立",
    "sheep": "半写实皮克斯风格的绵羊，圆润可爱，3D卡通角色模型，蓬松的白色卷毛身体，黑色脸和黑色四蹄，两只小耳朵，四条腿站立",
}
JOB_FILE = "tools/_free_farm_jobs.json"


def submit(name, prompt):
    print(f"[提交] {name} ...", flush=True)
    r = subprocess.run(
        [PY, SCRIPT, "3d", prompt, "--no-poll", "--token-stdin"],
        input=TOKEN, capture_output=True, text=True, timeout=180,
    )
    out = r.stdout.strip()
    err = r.stderr.strip()
    print("  stdout:", out[:300], flush=True)
    if err:
        print("  stderr:", err[-300:], flush=True)
    # 解析 job_id
    jid = None
    for ln in out.splitlines():
        if '"job_id"' in ln:
            try:
                jid = ln.split('"job_id":')[1].strip().strip('",')
            except Exception:
                pass
            if jid:
                break
    # 也尝试直接 JSON
    if not jid:
        try:
            jid = json.loads(out).get("job_id")
        except Exception:
            pass
    return jid


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "submit"
    if mode == "submit":
        jobs = {}
        for name, prompt in ANIMALS.items():
            jid = submit(name, prompt)
            if jid:
                jobs[name] = jid
                print(f"  ✓ {name}: {jid}", flush=True)
            else:
                print(f"  ✗ {name}: 未获得 job_id", flush=True)
            time.sleep(2)
        with open(JOB_FILE, "w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)
        print(f"\n已保存 {len(jobs)} 个任务到 {JOB_FILE}")
    elif mode == "status":
        with open(JOB_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
        for name, jid in jobs.items():
            r = subprocess.run(
                [PY, SCRIPT, "status", jid, "--type", "3d", "--token-stdin"],
                input=TOKEN, capture_output=True, text=True, timeout=120)
            print(f"{name}: {r.stdout.strip()[:200]}")
    elif mode == "download":
        import urllib.request
        with open(JOB_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
        for name, jid in jobs.items():
            r = subprocess.run(
                [PY, SCRIPT, "status", jid, "--type", "3d", "--token-stdin"],
                input=TOKEN, capture_output=True, text=True, timeout=120)
            out = r.stdout.strip()
            try:
                d = json.loads(out)
            except Exception:
                print(f"{name}: 状态解析失败 {out[:150]}"); continue
            url = d.get("result_url") or d.get("raw_result", {}).get("ResultUrl")
            if not url:
                print(f"{name}: 无结果URL {out[:200]}"); continue
            try:
                urllib.request.urlretrieve(url, f"hy3_{name}.glb")
                print(f"{name}: 下载 hy3_{name}.glb ({os.path.getsize(f'hy3_{name}.glb')} bytes)")
            except Exception as e:
                print(f"{name}: 下载失败 {e}")


if __name__ == "__main__":
    main()
