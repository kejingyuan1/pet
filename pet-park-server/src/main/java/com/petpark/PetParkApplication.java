package com.petpark;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 宠物乐园后端服务入口
 */
@SpringBootApplication
@MapperScan("com.petpark.mapper")
public class PetParkApplication {
    public static void main(String[] args) {
        SpringApplication.run(PetParkApplication.class, args);
    }
}
