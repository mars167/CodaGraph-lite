#!/bin/bash
#
# CodaGraph-lite 一键部署脚本
# 用于 GitHub Actions 自动部署
#
set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite 部署脚本"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 检测部署环境
    local deploy_env="${DEPLOY_ENV:-development}"

    # 环境配置映射
    case "$deploy_env" in
        dev)
            FRONTEND_PORT=3000
            BACKEND_PORT=7900
            DEPLOY_HOST="${DEV_DEPLOY_HOST:-localhost}"
            echo "部署环境: 开发"
            ;;
        staging)
            FRONTEND_PORT=3000
            BACKEND_PORT=7900
            DEPLOY_HOST="${STAGING_DEPLOY_HOST:-staging.codagraph-lite.com}"
            echo "部署环境: 预发布"
            ;;
        prod)
            FRONTEND_PORT=3000
            BACKEND_PORT=7900
            DEPLOY_HOST="${PROD_DEPLOY_HOST:-codagraph-lite.com}"
            echo "部署环境: 生产"
            ;;
        *)
            log_error "无效的部署环境: $deploy_env"
            echo "用法: $0 <dev|staging|prod>"
            exit 1
            ;;
    esac

    log_info "部署目标: $DEPLOY_HOST"
    log_info "前端端口: $FRONTEND_PORT"
    log_info "后端端口: $BACKEND_PORT"

    # 安装依赖
    log_info "安装 Node.js 依赖..."
    npm install --production

    log_info "安装 Python 依赖..."
    cd context-agent && pip install -e . && cd ..

    # 构建前端
    log_info "构建前端应用..."
    cd web && npm run build && cd ..

    # 构建后端
    log_info "构建后端服务..."
    cd server && npm run build && cd ..

    # 数据库迁移（如果需要）
    if [ -n "$RUN_MIGRATIONS" ]; then
        log_info "运行数据库迁移..."
        node server/dist/database/migrate.js
    fi

    # 部署验证
    log_info "运行部署验证..."
    bash deploy/verify.sh --verbose

    # 2u2g 配置验证
    log_info "验证 2u2g 配置..."
    bash deploy/validate-env.sh --strict

    # 停止旧服务
    log_info "停止旧服务..."
    systemctl stop codagraph-lite-frontend || true
    systemctl stop codagraph-lite-backend || true

    # 部署新文件
    log_info "部署应用文件..."
    # rsync -av --delete server/dist --delete web/.next /opt/codagraph-lite/
    systemctl daemon-reload
    systemctl restart codagraph-lite-backend
    systemctl restart codagraph-lite-frontend

    # 健康检查
    log_info "健康检查..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        ((attempt++))
        sleep 2

        # 检查前端
        if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
            log_success "前端健康检查通过"
            break
        fi

        # 检查后端
        if curl -sf http://localhost:7900/api/health >/dev/null 2>&1; then
            log_success "后端健康检查通过"
            break
        fi

        if [ $attempt -ge $max_attempts ]; then
            log_error "健康检查超时"
            exit 1
        fi
    done

    log_success "部署完成！"
    echo
    log_info "访问前端: http://$DEPLOY_HOST:$FRONTEND_PORT"
    log_info "访问后端: http://$DEPLOY_HOST:$BACKEND_PORT"

    # 系统信息
    echo
    log_info "系统信息:"
    echo "  主机: $(hostname)"
    echo "  系统: $(uname -s) $(uname -r)"
    echo "  内存: $(free -h | awk '/^Mem:/ {print $2}')"
    echo "  Swap: $(free -h | awk '/^Swap:/ {print $3}')"
    echo
    echo "服务状态:"
    echo "  前端: $(systemctl is-active codagraph-lite-frontend 2>/dev/null && echo "运行中" || echo "已停止")"
    echo "  后端: $(systemctl is-active codagraph-lite-backend 2>/dev/null && echo "运行中" || echo "已停止")"
    echo
    log_info "服务日志:"
    echo "  前端: journalctl -u codagraph-lite-frontend -n 50"
    echo "  后端: journalctl -u codagraph-lite-backend -n 50"
}

# 信号处理
trap 'log_info "收到中断信号，正在清理..."; exit 130' INT TERM

# 显示最终状态
echo
echo "============================================"
echo "  部署完成"
echo "============================================"

exit 0
}

# 执行主程序
main "$@"
