package com.petpark.world.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 昼夜系统（P1 支柱①）——服务端时间相位权威。
 *
 * 设计：
 *  - 一个完整游戏日 = cycleMs（默认 1200000ms = 20 分钟，可在 application.yml 调 {@code petpark.world.day-cycle-ms}）。
 *  - frac ∈ [0,1)：0 = 00:00 午夜，0.5 = 12:00 正午。
 *  - sunElevation = sin(2π·frac − π/2)：正午 +1、午夜 −1；isNight = elevation < −0.1（太阳没入地平线）。
 *  - 每 5s 通过 /topic/world 广播 DAY_NIGHT（全量 single-room 可见）；join 时立即私发当前相位，避免新客户端等待。
 *  - 前端据 frac/elevation 平滑插值天空色、雾色、光照强度、曝光、太阳位置，呈现昼夜过渡。
 */
@Slf4j
@Service
public class WorldTimeService {

    @Value("${petpark.world.day-cycle-ms:1200000}")
    private long cycleMs;

    private final RegionBroker broker;

    public WorldTimeService(RegionBroker broker) {
        this.broker = broker;
    }

    /** 计算当前相位（供广播 + join 私发复用） */
    public Map<String, Object> currentPhase() {
        long now = System.currentTimeMillis();
        double frac = ((double) (now % cycleMs)) / cycleMs;
        if (frac < 0) frac += 1.0;

        // 游戏内时钟：frac → 0..24h
        double hourFloat = frac * 24.0;
        int hour = (int) Math.floor(hourFloat);
        int minute = (int) Math.floor((hourFloat - hour) * 60.0);

        // 太阳高度：-1(午夜) .. +1(正午)
        double elevation = Math.sin(2.0 * Math.PI * frac - Math.PI / 2.0);
        boolean isNight = elevation < -0.1;
        String phaseName = phaseName(frac);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("t", "DAY_NIGHT");
        m.put("frac", frac);
        m.put("hour", hour);
        m.put("minute", minute);
        m.put("elevation", elevation);
        m.put("isNight", isNight);
        m.put("phase", phaseName);
        m.put("cycleMs", cycleMs);
        return m;
    }

    /** 中文阶段名（供 HUD 显示） */
    private static String phaseName(double frac) {
        if (frac < 0.02 || frac > 0.98) return "午夜";
        if (frac < 0.22) return "深夜";
        if (frac < 0.28) return "黎明";
        if (frac < 0.46) return "清晨";
        if (frac < 0.54) return "正午";
        if (frac < 0.72) return "午后";
        if (frac < 0.78) return "黄昏";
        if (frac < 0.84) return "日落";
        return "夜晚";
    }

    /** 周期广播：每 5s 把当前相位推给全世界 */
    @Scheduled(fixedDelay = 5000)
    public void broadcast() {
        try {
            broker.broadcastWorld(currentPhase());
        } catch (Exception e) {
            log.warn("[world-time] 广播失败 {}", e.getMessage());
        }
    }
}
