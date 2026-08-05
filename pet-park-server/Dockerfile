# ============================================================
# 宠物乐园后端 Dockerfile（多阶段构建）
# 阶段1：Maven 打包 fat jar（含 60 题完整题库）
# 阶段2：JRE 17 运行
# ============================================================

# ---- 阶段1：构建 ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# 先拷 pom.xml 拉依赖（利用 Docker 层缓存）
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# 拷源码 + schema.sql 一起打包
COPY src ./src
RUN mvn package -DskipTests -B

# ---- 阶段2：运行 ----
FROM eclipse-temurin:17-jre
WORKDIR /app

# 时区（与 MySQL/前端保持一致）
ENV TZ=Asia/Shanghai

# 从构建阶段拷贝 jar
COPY --from=build /build/target/pet-park-server-1.0.0.jar app.jar

# 环境变量（compose 会覆盖，这里给默认值）
ENV DB_HOST=localhost \
    DB_PORT=3306 \
    DB_NAME=pet_park \
    DB_USER=root \
    DB_PASSWORD=123456 \
    JWT_SECRET=pet-park-secret-key-please-change-me-0123456789abcdef \
    SERVER_PORT=8080

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
