/**
 * PhysicsWorld —— Rapier 确定性物理世界封装（ADR-W7 候选② 核心）
 *
 * 确定性纪律（硬约束）：
 *  - 单线程：本进程只有一个主循环（见 index.js），不存在并行 step；
 *  - 固定步进：固定 1/60s（FIXED_DT），world.timestep 恒定；
 *  - 固定输入序：每个玩家输入进入 FIFO 队列（上限 INPUT_BUFFER_CAP），每 tick 最多消费 1 条，
 *    同 tick 到达的输入顺序 = 到达顺序 → 同输入序列在同引擎版本下产出同快照（bit-level）。
 *
 * 角色控制器：Rapier KinematicCharacterController（capsule：半径 playerRadius、高 playerHeight），
 * 服务端求解 贴地 / 阻挡 / 滑步，与地形碰撞体 + 静态物体碰撞体交互。
 * 地形：chunk 级 TriMesh 碰撞体（由 Spring Boot 下发同源 height 场构建）。
 *
 * API 落地说明（@dimforge/rapier3d-deterministic-compat@0.20.0，以 d.ts 为准）：
 *  - ColliderDesc.heightfield 在 0.20.0 deterministic 构建中创建即 panic → 用等价 TriMesh 兜底
 *    （每 cell 2 三角，与 heightfield 几何等价、同样确定性；升级 rapier 后应回归换回 heightfield）。
 *  - computeColliderMovement(...) 返回 void；结果取 controller.computedMovement() / computedGrounded()。
 *  - 快照：World.takeSnapshot() 原生存在；恢复用 SerializationPipeline.deserializeAll(data)
 *    （本 build 无 World.restoreSnapshot，二者同源二进制）。
 */
'use strict';

const RAPIER = require('@dimforge/rapier3d-deterministic-compat');

/** 固定步进 1/60s（与设计 02 §8 physics-fixed-dt-ms 一致） */
const FIXED_DT = 1 / 60;

/** 默认物理参数（Spring Boot 可经 /load_world 覆盖） */
const DEFAULTS = {
  gravityY: -9.81,
  playerRadius: 0.4,
  playerHeight: 1.8,
  walkSpeed: 4.0,
  runSpeed: 7.0,
  snapToGround: 0.5,
  maxSlopeAngle: (35 * Math.PI) / 180,   // 可爬最大坡度（弧度）
  inputBufferCap: 8,
  maxPlayers: 128,
};

class PhysicsWorld {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.tick = 0;
    this.seedText = 'dudu2019';
    this.version = 1;
    this.world = null;

    this.terrainChunks = new Map();
    this.objects = new Map();
    this.players = new Map();
    this.bodyBudget = 128;
  }

  initWorld({ gravityY, seed, version, bodyBudget } = {}) {
    const g = gravityY != null ? gravityY : this.cfg.gravityY;
    this.seedText = seed || this.seedText;
    this.version = version != null ? version : this.version;
    if (bodyBudget != null) this.bodyBudget = bodyBudget;
    this.world = new RAPIER.World({ x: 0, y: g, z: 0 });
    this.world.timestep = FIXED_DT;
    this.tick = 0;
    this.terrainChunks.clear();
    this.objects.clear();
    this.players.clear();
  }

  addTerrainChunk(chunkKey, cx, cz, heights, nrows = 65, ncols = 65) {
    if (!this.world) throw new Error('world 未初始化，先 /load_world');
    if (this.terrainChunks.has(chunkKey)) this.removeTerrainChunk(chunkKey);

    const vertices = new Float32Array(nrows * ncols * 3);
    for (let row = 0; row < nrows; row++) {
      for (let col = 0; col < ncols; col++) {
        const i = row * ncols + col;
        vertices[i * 3] = col;
        vertices[i * 3 + 1] = heights[i];
        vertices[i * 3 + 2] = row;
      }
    }
    const indices = new Uint32Array((nrows - 1) * (ncols - 1) * 6);
    let k = 0;
    for (let row = 0; row < nrows - 1; row++) {
      for (let col = 0; col < ncols - 1; col++) {
        const a = row * ncols + col;
        const b = a + 1;
        const c = (row + 1) * ncols + col;
        const d = c + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = c;
        indices[k++] = b; indices[k++] = d; indices[k++] = c;
      }
    }
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setTranslation(cx * (ncols - 1), 0, cz * (nrows - 1))
      .setFriction(1.0);
    const collider = this.world.createCollider(desc);
    this.terrainChunks.set(chunkKey, { collider, cx, cz });
    return { bodyCount: this.bodyCount() };
  }

  removeTerrainChunk(chunkKey) {
    const entry = this.terrainChunks.get(chunkKey);
    if (!entry) return false;
    this.world.removeCollider(entry.collider);
    this.terrainChunks.delete(chunkKey);
    return true;
  }

  addObjectCollider(o) {
    if (!this.world) throw new Error('world 未初始化，先 /load_world');
    const id = String(o.id);
    if (this.objects.has(id)) this.removeObjectCollider(id);
    const he = o.halfExtents || { hx: 0.8, hy: 0.8, hz: 0.8 };
    const desc = RAPIER.ColliderDesc.cuboid(he.hx, he.hy, he.hz)
      .setTranslation(o.gx + 0.5, (o.baseY || 0) + he.hy, o.gz + 0.5)
      .setFriction(1.0);
    const collider = this.world.createCollider(desc);
    this.objects.set(id, { collider, type: o.type || 'object', gx: o.gx, gz: o.gz });
    return { bodyCount: this.bodyCount() };
  }

  removeObjectCollider(id) {
    const entry = this.objects.get(String(id));
    if (!entry) return false;
    this.world.removeCollider(entry.collider);
    this.objects.delete(String(id));
    return true;
  }

  addPlayer(uid, gx, gz, y) {
    if (!this.world) throw new Error('world 未初始化，先 /load_world');
    if (this.players.size >= this.bodyBudget) throw new Error('physics-max-bodies 预算已满');
    if (this.players.has(uid)) this.removePlayer(uid);
    const r = this.cfg.playerRadius;
    const h = this.cfg.playerHeight;
    const gy = y != null ? y : 0;
    const centerY = gy + h / 2;

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(gx + 0.5, centerY, gz + 0.5);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(h / 2 - r, r).setFriction(0.5);
    const collider = this.world.createCollider(colliderDesc, body);

    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(this.cfg.maxSlopeAngle);
    controller.enableSnapToGround(this.cfg.snapToGround);
    controller.enableAutostep(0.3, 0.1, false);

    this.players.set(uid, {
      uid,
      body,
      collider,
      controller,
      inputQueue: [],
      lastInput: { dx: 0, dz: 0, run: false },
      gx: gx + 0.5, gz: gz + 0.5, y: centerY, rot: 0,
      vx: 0, vz: 0,
    });
    return { uid, gx: gx + 0.5, gz: gz + 0.5, y: centerY };
  }

  removePlayer(uid) {
    const p = this.players.get(uid);
    if (!p) return false;
    this.world.removeRigidBody(p.body);
    this.players.delete(uid);
    return true;
  }

  enqueueInput(uid, input) {
    const p = this.players.get(uid);
    if (!p) return false;
    p.inputQueue.push({
      dx: clampNum(input.dx, -1, 1) || 0,
      dz: clampNum(input.dz, -1, 1) || 0,
      run: !!input.run,
    });
    if (p.inputQueue.length > this.cfg.inputBufferCap) p.inputQueue.shift();
    return true;
  }

  step() {
    if (!this.world) return this.tick;
    this.tick++;
    for (const p of this.players.values()) {
      if (p.inputQueue.length > 0) p.lastInput = p.inputQueue.shift();
      const { dx, dz, run } = p.lastInput;
      const speed = run ? this.cfg.runSpeed : this.cfg.walkSpeed;
      const len = Math.hypot(dx, dz);
      const dirX = len > 0 ? (dx / len) * speed : 0;
      const dirZ = len > 0 ? (dz / len) * speed : 0;

      const desired = { x: dirX * FIXED_DT, y: 0, z: dirZ * FIXED_DT };

      p.controller.computeColliderMovement(p.collider, desired, undefined, undefined, undefined);
      const mv = p.controller.computedMovement();
      const grounded = p.controller.computedGrounded();

      const prev = p.body.translation();
      let nx = prev.x + mv.x;
      let ny = prev.y + mv.y;
      let nz = prev.z + mv.z;

      if (!grounded) {
        ny += 0.5 * this.cfg.gravityY * FIXED_DT * FIXED_DT;
      }
      p.body.setTranslation({ x: nx, y: ny, z: nz });

      if (len > 0) p.rot = Math.atan2(dirX, dirZ);
      const t = p.body.translation();
      p.gx = t.x; p.y = t.y; p.gz = t.z;
      p.vx = mv.x / FIXED_DT; p.vz = mv.z / FIXED_DT;
    }
    this.world.step();
    return this.tick;
  }

  snapshotBodies() {
    const bodies = [];
    for (const p of this.players.values()) {
      bodies.push({
        uid: p.uid,
        gx: round2(p.gx), gz: round2(p.gz), y: round2(p.y), rot: round2(p.rot),
        vx: round3(p.vx), vz: round3(p.vz),
      });
    }
    return bodies;
  }

  takeSnapshot() {
    if (!this.world) throw new Error('world 未初始化');
    return this.world.takeSnapshot();
  }

  /**
   * 从二进制快照恢复世界（SerializationPipeline.deserializeAll）。
   * 恢复不要求当前 world 已初始化（deserializeAll 会从字节重建全新 World）；
   * handle 全部变化 → 清空内部 map，调用方（Spring Boot）随后需重新 addPlayer / addTerrainChunk / addObjectCollider 重建索引。
   */
  restoreSnapshot(bytes) {
    const pipeline = new RAPIER.SerializationPipeline();
    const restoredWorld = pipeline.deserializeAll(new Uint8Array(bytes));
    restoredWorld.timestep = FIXED_DT;
    this.world = restoredWorld;
    this.terrainChunks.clear();
    this.objects.clear();
    this.players.clear();
    return { restored: true, tick: this.tick, bodies: this.bodyCount() };
  }

  bodyCount() {
    return this.world ? this.world.bodies.len() : 0;
  }

  info() {
    return {
      tick: this.tick,
      seed: this.seedText,
      version: this.version,
      players: this.players.size,
      terrainChunks: this.terrainChunks.size,
      objects: this.objects.size,
      bodies: this.bodyCount(),
      fixedDt: FIXED_DT,
    };
  }
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

module.exports = { PhysicsWorld, FIXED_DT };
