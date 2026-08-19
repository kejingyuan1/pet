package com.petpark;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * 宠物乐园后端服务入口
 */
@SpringBootApplication
@EnableScheduling
@MapperScan({"com.petpark.mapper", "com.petpark.world.mapper", "com.petpark.ranch.mapper"})
public class PetParkApplication {
    public static void main(String[] args) {
        SpringApplication.run(PetParkApplication.class, args);
    }

    /**
     * 默认 @Scheduled 调度器（供 persistSnapshot / regenExpiredOres / WorldTimeService /
     * broadcastSnapshot 等普通定时任务使用）。poolSize=4 让多个周期任务互不饿死。
     * 命名为 taskScheduler，消除多 TaskScheduler Bean 歧义，确保 @Scheduled 正常注册。
     */
    @Bean
    public ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(4);
        s.setThreadNamePrefix("sched-");
        s.setDaemon(true);
        s.initialize();
        return s;
    }

    /**
     * 物理 tick 专用调度器（独立单线程，与 persistSnapshot / regenExpiredOres /
     * WorldTimeService / RegionBroker 等 @Scheduled 任务完全隔离）。
     * 默认 @EnableScheduling 只提供 1 个共享线程，60Hz 物理循环会被 DB 写类定时任务
     * 饿死（实测移动速度被 dt 上限钳到 ~0.9 u/s，仅正常的 1/4）。专用线程保证物理恒定 60Hz。
     */
    @Bean
    public ThreadPoolTaskScheduler physicsTaskScheduler() {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(1);
        s.setThreadNamePrefix("physics-");
        s.setDaemon(true);
        s.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());
        s.initialize();
        return s;
    }
}
