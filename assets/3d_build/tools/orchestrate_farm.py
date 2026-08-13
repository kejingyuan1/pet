#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""编排：等 chicken/duck/cow 任一个完成 → 补交 sheep → 全部完成后下载"""
import json, time, os, urllib.request, sys
sys.path.insert(0, os.path.dirname(__file__))
import submit_farm_animals as S

JOB_FILE = S.JOB_FILE

def main():
    with open(JOB_FILE, encoding="utf-8") as f:
        jobs = json.load(f)

    sheep_submitted = False
    deadline = time.time() + 25 * 60
    while time.time() < deadline:
        # 查现有任务状态
        all_done = True
        for name, jid in list(jobs.items()):
            r = S.query(jid)
            st = r.get("Status")
            if st != "DONE":
                all_done = False
            print(f"  {name}: {st}", flush=True)

        # 若 sheep 还没提交且当前进行中任务 < 3，补交
        if not sheep_submitted and "sheep" not in jobs:
            running = sum(1 for n, j in jobs.items() if S.query(j).get("Status") == "RUN")
            if running < 3:
                jid = S.submit("sheep")
                if jid:
                    jobs["sheep"] = jid
                    sheep_submitted = True
                    with open(JOB_FILE, "w", encoding="utf-8") as f:
                        json.dump(jobs, f, ensure_ascii=False, indent=2)
                    print("  ✓ 已补交 sheep", flush=True)

        if all_done and sheep_submitted:
            print("全部完成 ✓", flush=True)
            break
        time.sleep(25)
    else:
        print("⚠ 超时", flush=True)

    # 下载全部
    for name, jid in jobs.items():
        r = S.query(jid)
        if r.get("Status") != "DONE":
            print(f"{name}: 未完成，跳过")
            continue
        glb = None
        for fobj in r.get("ResultFile3Ds", []):
            if fobj.get("Type") == "GLB":
                glb = fobj.get("Url"); break
        if not glb:
            print(f"{name}: 无 GLB"); continue
        out = f"hy3_{name}.glb"
        try:
            urllib.request.urlretrieve(glb, out)
            print(f"{name}: 下载 {out} ({os.path.getsize(out)} bytes)")
        except Exception as e:
            print(f"{name}: 下载失败 {e}")

if __name__ == "__main__":
    main()
