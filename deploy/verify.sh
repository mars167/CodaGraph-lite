#!/bin/bash
#
# CodaGraph-lite 部署验证脚本
# 检查系统要求、环境配置、服务状态和数据库连接
#
# 使用方法:
#   bash deploy/verify.sh [--verbose]
#

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${INSTALL_DIR:-/opt/codagraph-lite}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 验证结果统计
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNED_CHECKS=0

# 详细模式
VERBOSE=false

# ============================================
# 辅助函数
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNED_CHECKS++))
}

check() {
    ((TOTAL_CHECKS++))
}

# ============================================
# 系统要求检查
# ============================================

check_node_version() {
    check
    log_info "检查 Node.js 版本..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        return 1
    fi

    local version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$version" -lt 18 ]; then
        log_error "Node.js 版本过低: $(node --version)，需要 18+"
        return 1
    fi

    log_success "Node.js 版本: $(node --version) (要求: 18+)"

    if [ "$VERBOSE" = true ]; then
        echo "  - 路径: $(which node)"
        echo "  - npm: $(npm --version)"
    fi
}

check_python_version() {
    check
    log_info "检查 Python 版本..."

    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 未安装"
        return 1
    fi

    local version=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2 | tr '.' '')
    local min_version=311

    if [ "$version" -lt "$min_version" ]; then
        log_error "Python 版本过低: $(python3 --version)，需要 3.11+"
        return 1
    fi

    log_success "Python 版本: $(python3 --version) (要求: 3.11+)"
}

check_system_memory() {
    check
    log_info "检查系统内存..."

    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local swap_mem=$(free -m | awk '/^Swap:/ {print $2}')

    if [ "$total_mem" -lt 1024 ]; then
        log_warning "系统内存较低: ${total_mem}MB (建议: 1024MB+)"
    else
        log_success "系统内存: ${total_mem}MB (要求: 1024MB+)"
    fi

    if [ "$swap_mem" -lt 2048 ]; then
        log_warning "Swap 空间较低: ${swap_mem}MB (2u2g 建议配置 2048MB)"
    else
        log_success "Swap 空间: ${swap_mem}MB"
    fi

    if [ "$VERBOSE" = true ]; then
        echo "  - 可用内存: $(free -m | awk '/^Mem:/ {print $7}')MB"
    fi
}

check_disk_space() {
    check
    log_info "检查磁盘空间..."

    local disk_usage=$(df -h "$PROJECT_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    local available=$(df -h "$PROJECT_DIR" | awk 'NR==2 {print $4}')

    if [ "$disk_usage" -gt 90 ]; then
        log_error "磁盘空间不足: 使用率 ${disk_usage}%，可用 $available"
        return 1
    elif [ "$disk_usage" -gt 80 ]; then
        log_warning "磁盘空间紧张: 使用率 ${disk_usage}%，可用 $available"
    else
        log_success "磁盘空间充足: 使用率 ${disk_usage}%，可用 $available"
    fi
}

# ============================================
# 环境配置检查
# ============================================

check_env_file() {
    check
    log_info "检查环境配置文件..."

    if [ ! -f "$INSTALL_DIR/.env" ]; then
        log_error ".env 文件不存在: $INSTALL_DIR/.env"
        return 1
    fi

    log_success ".env 文件存在"

    # 加载环境变量用于检查
    source "$INSTALL_DIR/.env"
}

check_2u2g_configuration() {
    check
    log_info "检查 2u2g 优化配置..."

    local errors=()

    if [ "${WORKER_COUNT:-}" != "1" ]; then
        errors+=("WORKER_COUNT 必须为 1（当前: ${WORKER_COUNT:-未设置}）")
    fi

    if [ "${ENABLE_CONCURRENT_JOBS:-}" != "false" ]; then
        errors+=("ENABLE_CONCURRENT_JOBS 必须为 false（当前: ${ENABLE_CONCURRENT_JOBS:-未设置}）")
    fi

    if [ "${NODE_OPTIONS:-}" != *"--max-old-space-size=200"* ]; then
        errors+=("NODE_OPTIONS 应包含 --max-old-space-size=200")
    fi

    if [ "${SQLITE_CACHE_SIZE:--2000}" != "-2000" ]; then
        errors+=("SQLITE_CACHE_SIZE 应为 -2000（当前: ${SQLITE_CACHE_SIZE}）")
    fi

    if [ -n "$errors" ]; then
        log_error "2u2g 配置不符合要求："
        for error in "${errors[@]}"; do
            echo "  ✗ $error"
        done
        return 1
    fi

    log_success "2u2g 配置正确"
    log_info "  - WORKER_COUNT: ${WORKER_COUNT}"
    log_info "  - ENABLE_CONCURRENT_JOBS: ${ENABLE_CONCURRENT_JOBS}"
    log_info "  - NODE_OPTIONS: ${NODE_OPTIONS}"
    log_info "  - SQLITE_CACHE_SIZE: ${SQLITE_CACHE_SIZE}"
}

check_required_env_vars() {
    check
    log_info "检查必需的环境变量..."

    local required_vars=(
        "ADMIN_USERNAME"
        "ADMIN_PASSWORD"
        "SESSION_SECRET"
        "BACKEND_PORT"
        "FRONTEND_PORT"
    )

    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ -n "$missing_vars" ]; then
        log_error "缺少必需的环境变量："
        for var in "${missing_vars[@]}"; do
            echo "  ✗ $var"
        done
        return 1
    fi

    log_success "所有必需的环境变量已设置"

    # 检查默认密码
    if [ "$ADMIN_PASSWORD" == "changeme" ] || [ "$SESSION_SECRET" == "changeme_to_secure_random_string" ]; then
        log_warning "使用默认密码/密钥，生产环境请修改！"
    fi
}

check_ports_availability() {
    check
    log_info "检查端口可用性..."

    local errors=()

    if lsof -Pi :${FRONTEND_PORT:-3000} -sTCP:LISTEN -t >/dev/null 2>&1; then
        errors+=("前端端口 ${FRONTEND_PORT:-3000} 已被占用")
    fi

    if lsof -Pi :${BACKEND_PORT:-7900} -sTCP:LISTEN -t >/dev/null 2>&1; then
        errors+=("后端端口 ${BACKEND_PORT:-7900} 已被占用")
    fi

    if [ -n "$errors" ]; then
        log_error "端口冲突："
        for error in "${errors[@]}"; do
            echo "  ✗ $error"
        done
        return 1
    fi

    log_success "端口可用: ${FRONTEND_PORT:-3000} (前端), ${BACKEND_PORT:-7900} (后端)"
}

# ============================================
# 服务状态检查
# ============================================

check_systemd_services() {
    check
    log_info "检查 systemd 服务状态..."

    if [ ! -f "/etc/systemd/system/codagraph-lite-backend.service" ]; then
        log_warning "未检测到 systemd 服务配置"
        return 0
    fi

    local backend_status=$(systemctl is-active codagraph-lite-backend 2>/dev/null || echo "inactive")
    local frontend_status=$(systemctl is-active codagraph-lite-frontend 2>/dev/null || echo "inactive")

    if [ "$backend_status" == "active" ]; then
        log_success "后端服务: 运行中"
    else
        log_error "后端服务: $backend_status"
    fi

    if [ "$frontend_status" == "active" ]; then
        log_success "前端服务: 运行中"
    else
        log_warning "前端服务: $frontend_status"
    fi
}

check_pm2_services() {
    check
    log_info "检查 PM2 服务状态..."

    if ! command -v pm2 &> /dev/null; then
        log_info "PM2 未安装"
        return 0
    fi

    if ! pm2 list | grep -q "codagraph-lite"; then
        log_warning "未检测到 PM2 进程"
        return 0
    fi

    local status_output=$(pm2 jlist)
    if echo "$status_output" | grep -q '"status":"online"'; then
        log_success "PM2 进程运行正常"
        if [ "$VERBOSE" = true ]; then
            pm2 list --nostream
        fi
    else
        log_error "PM2 进程状态异常"
        pm2 list
    fi
}

# ============================================
# 数据库检查
# ============================================

check_database() {
    check
    log_info "检查数据库..."

    local db_path="${DATABASE_PATH:-$INSTALL_DIR/data/codagraph-lite.db}"

    if [ ! -f "$db_path" ]; then
        log_warning "数据库文件不存在（首次启动时正常）: $db_path"
        return 0
    fi

    if [ ! -r "$db_path" ]; then
        log_error "数据库文件不可读: $db_path"
        return 1
    fi

    # 检查数据库文件大小
    local db_size=$(du -h "$db_path" | cut -f1)
    log_success "数据库文件存在: $db_path ($db_size)"

    # 检查数据库完整性（使用 sqlite3）
    if command -v sqlite3 &> /dev/null; then
        local integrity_check=$(sqlite3 "$db_path" "PRAGMA integrity_check;" 2>&1)
        if [ "$integrity_check" != "ok" ]; then
            log_error "数据库完整性检查失败: $integrity_check"
            return 1
        fi
        log_success "数据库完整性检查通过"

        # 显示表信息
        if [ "$VERBOSE" = true ]; then
            echo "  - 数据库表:"
            sqlite3 "$db_path" ".tables" | while read table; do
                echo "    • $table"
            done
        fi
    fi
}

# ============================================
# API 健康检查
# ============================================

check_api_health() {
    check
    log_info "检查 API 健康状态..."

    local backend_url="http://localhost:${BACKEND_PORT:-7900}/api/health"
    local frontend_url="http://localhost:${FRONTEND_PORT:-3000}"

    # 检查后端 API
    if command -v curl &> /dev/null; then
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$backend_url" 2>/dev/null || echo "000")

        if [ "$http_code" == "200" ]; then
            log_success "后端 API 健康检查: HTTP $http_code"
        else
            log_error "后端 API 健康检查失败: HTTP $http_code"
        fi

        # 检查前端（可选）
        local frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "$frontend_url" 2>/dev/null || echo "000")
        if [ "$frontend_code" == "200" ]; then
            log_success "前端服务健康检查: HTTP $frontend_code"
        else
            log_warning "前端服务健康检查: HTTP $frontend_code"
        fi
    else
        log_warning "curl 不可用，跳过 API 健康检查"
    fi
}

# ============================================
# 主程序
# ============================================

print_summary() {
    echo
    echo "============================================"
    echo "  验证摘要"
    echo "============================================"
    echo -e "  总检查数: ${BLUE}$TOTAL_CHECKS${NC}"
    echo -e "  通过: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "  警告: ${YELLOW}$WARNED_CHECKS${NC}"
    echo -e "  失败: ${RED}$FAILED_CHECKS${NC}"
    echo "============================================"

    if [ "$FAILED_CHECKS" -eq 0 ]; then
        log_success "所有关键检查通过！"
        return 0
    else
        log_error "存在 $FAILED_CHECKS 个失败检查，请修复后重试"
        return 1
    fi
}

main() {
    echo "============================================"
    echo "  CodaGraph-lite 部署验证"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --verbose|-v)
                VERBOSE=true
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  bash deploy/verify.sh [--verbose]"
                echo
                echo "选项:"
                echo "  --verbose, -v  显示详细输出"
                echo "  --help, -h     显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 如果安装目录存在，加载环境变量
    if [ -f "$INSTALL_DIR/.env" ]; then
        source "$INSTALL_DIR/.env"
    fi

    # 执行检查
    check_node_version
    check_python_version
    check_system_memory
    check_disk_space
    check_env_file
    check_2u2g_configuration
    check_required_env_vars
    check_ports_availability
    check_systemd_services
    check_pm2_services
    check_database
    check_api_health

    # 打印摘要
    print_summary
}

# 运行主程序
main "$@"
