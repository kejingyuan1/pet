# ============================================================
# 宠物乐园前端 Dockerfile（多阶段构建）
# 阶段1：Node 22 构建 Angular 生产包
# 阶段2：Nginx 托管 + /api 反向代理到后端
# ============================================================

# ---- 阶段1：构建 ----
FROM node:22-alpine AS build
WORKDIR /app

# 用国内镜像加速（构建层缓存）
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
# 生产构建（含 public/assets 资源 → dist/pet-park-ng/browser/）
RUN npm run build -- --configuration production

# ---- 阶段2：运行 ----
FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html

# 时区
ENV TZ=Asia/Shanghai

# 拷贝构建产物
COPY --from=build /app/dist/pet-park-ng/browser/ .

# 自定义 nginx 配置（含 /api 反代）
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
