package com.petpark.world.service;

import com.petpark.world.geo.SemanticGrid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.stereotype.Service;

/**
 * 物理服务门面（2026-08-12 重构）
 *
 * 历史上委托 Node Rapier WASM physics-service（独立进程，18080/18081）。
 * M2 内嵌后改为 Spring Boot 进程内 @Scheduled 60Hz tick 物理模拟（WorldPhysicsService）。
 *
 * 保留本类以不破坏 @Autowired 引用：WorldWsController / WorldSessionListener / WorldObjectService。
 * 所有方法委托给 WorldPhysicsService；不 spawn Node，不开 HTTP 控制面，不连 WS 数据面。
 */
@Slf4j
@Service
public class PhysicsGatewayService {

    private final WorldPhysicsService worldPhysics;
    private final RegionBroker broker;

    public PhysicsGatewayService(WorldPhysicsService worldPhysics, RegionBroker broker) {
        this.worldPhysics = worldPhysics;
        this.broker = broker;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        log.info("[physics-J] 内嵌物理引擎已启动（替代原 Node physics-service）");
    }

    public void sendInput(long uid, double dx, double dz, boolean run) {
        worldPhysics.enqueueInput(uid, dx, dz, run, false);
    }

    /** 带动作的输入（jump 跳跃） */
    public void sendInput(long uid, double dx, double dz, boolean run, String action) {
        boolean jump = "jump".equals(action);
        worldPhysics.enqueueInput(uid, dx, dz, run, jump);
    }

    public void onPlayerJoin(long uid, double gx, double gz, double y) {
        // 找 broker 中此 uid 的 sessionId（用于写回 broadcast 位置）
        String sid = null;
        for (java.util.Map.Entry<String, RegionBroker.PlayerInfo> e : broker.getPlayers().entrySet()) {
            if (e.getValue().uid == uid) { sid = e.getKey(); break; }
        }
        worldPhysics.addPlayer(uid, sid, gx, gz, y);
    }

    public void onPlayerLeave(long uid) {
        worldPhysics.removePlayer(uid);
    }

    public void notifyObjectPlaced(long id, int gx, int gz, String type, double baseY) {
        // M2 简化：世界对象（建筑/鱼塘）暂时不需要服务端 collider，
        // 前端 chunk mesh + 高度场足以处理玩家与地形的交互。
        // 未来如需碰撞可在此补 addBox/Cylinder collider 到 WorldPhysicsService。
    }

    public void ensureTerrainAround(int cx, int cz, int radius) {
        // 历史：loadInitialWorld 时给 Node physics 推 chunks（建 TriMesh collider）。
        // 现状：WorldPhysicsService 每次 tick 直接调 terrain.heightAt/semanticAt 实时查询，
        // 不需要预推送 chunks，方法 no-op 保留接口兼容。
    }
}
