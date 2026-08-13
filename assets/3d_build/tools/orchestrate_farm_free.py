#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""免费通道编排：保持 ≤2 并发提交鸡鸭牛羊，完成即下载 GLB
依赖: buddy-cloud.py + tempToken（通过 --token-stdin 传入）
"""
import subprocess, sys, os, json, time, urllib.request

SCRIPT = r"C:/Users/WIN11/.workbuddy/plugins/cache/workbuddy-builtin/skill-buddy-multimodal-generation/0.1.0/scripts/buddy-cloud.py"
PY = r"C:/Users/WIN11/.workbuddy/binaries/python/versions/3.13.12/python.exe"
TOKEN = "tk_XPaSc5LtCRtn34hhZAYmDHySAsDPlXbl"

ANIMALS = {
    "chicken": "半写实皮克斯风格的小公鸡，圆润可爱，3D卡通角色模型，红色鸡冠，黄色尖喙，橙红色身体羽毛，黑色尾羽，两条黄色细腿站立",
    "duck": "半写实皮克斯风格的白色鸭子，圆润可爱，3D卡通角色模型，通体白色羽毛身体，头顶有一撮黑色羽毛，黄色扁平嘴巴，黄色脚掌，两条黄色短腿站立",
    "cow": "半写实皮克斯风格的奶牛，圆润可爱，3D卡通角色模型，白色身体带黑色斑块，小黄色牛角，粉色大鼻子，黑色眼睛，四条腿站立",
    "sheep": "半写实皮克斯风格的绵羊，圆润可爱，3D卡通角色模型，蓬松的白色卷毛身体，黑色脸和黑色四蹄，两只小耳朵，四条腿站立",
}
# 已提交的（鸡鸭），待补交（牛羊）
PENDING = ["cow", "sheep"]
JOB_FILE = "tools/_free_farm_jobs.json"
MAX_CONCUR = 2


def run(args):
    r = subprocess.run([PY, SCRIPT] + args, input=TOKEN, capture_output=True, text=True, timeout=180)
    out = r.stdout.strip()
    try:
        return json.loads(out)
    except Exception:
        return {"_raw": out, "_err": r.stderr.strip()[-300:]}


def submit(name):
    d = run(["3d", ANIMALS[name], "--no-poll", "--token-stdin"])
    jid = d.get("job_id")
    print(f"  [提交] {name}: {jid or d.get('_raw','?')[:120]}", flush=True)
    return jid


def status(jid):
    return run(["status", jid, "--type", "3d", "--token-stdin"])


def download(name, jid):
    d = status(jid)
    rf = (d.get("raw_result") or {}).get("ResultFile3Ds") or []
    glb = None
    for f in rf:
        if f.get("Type") == "GLB":
            glb = f.get("Url")
            break
    if not glb and rf:
        glb = rf[0].get("Url")
    if not glb:
        print(f"  [下载] {name}: 无 GLB URL {str(d)[:200]}", flush=True)
        return False
    out = f"hy3_{name}.glb"
    try:
        urllib.request.urlretrieve(glb, out)
        print(f"  [下载] {name}: {out} ({os.path.getsize(out)} bytes)", flush=True)
        return True
    except Exception as e:
        print(f"  [下载] {name}: 失败 {e}", flush=True)
        return False


def main():
    # 载入已提交的
    try:
        jobs = json.load(open(JOB_FILE, encoding="utf-8"))
    except Exception:
        jobs = {}
    done = set()

    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        running = {n: j for n, j in jobs.items() if n not in done}
        # 查询运行中任务
        for name, jid in list(running.items()):
            d = status(jid)
            st = d.get("status") or (d.get("raw_result") or {}).get("Status")
            if st == "DONE":
                print(f"  [完成] {name}", flush=True)
                if download(name, jid):
                    done.add(name)
                else:
                    # 下载失败，重试一次后标记完成以避免卡死
                    done.add(name)
            elif st in ("FAIL",):
                print(f"  [失败] {name}: {d.get('_raw','')[:150]}", flush=True)
                done.add(name)
            else:
                print(f"  {name}: {st}", flush=True)

        # 补交待办（保持并发 ≤ MAX_CONCUR）
        running_cnt = len([n for n in jobs if n not in done])
        while PENDING and running_cnt < MAX_CONCUR:
            name = PENDING.pop(0)
            jid = submit(name)
            if jid:
                jobs[name] = jid
                json.dump(jobs, open(JOB_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
                running_cnt += 1
            else:
                # 并发限制，放回队尾稍后重试
                PENDING.append(name)
                break
            time.sleep(2)

        if len(done) >= len(ANIMALS):
            print("全部完成 ✓", flush=True)
            break
        time.sleep(20)

    # 最终汇总
    print("\n=== 结果 ===")
    for name in ANIMALS:
        p = f"hy3_{name}.glb"
        print(f"  {name}: {'✓ '+str(os.path.getsize(p))+' bytes' if os.path.exists(p) else '✗ 缺失'}")


if __name__ == "__main__":
    main()
