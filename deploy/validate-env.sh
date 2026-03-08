#!/bin/bash
#
# CodaGraph-lite 环境变量验证脚本
# 检查 .env 文件的完整性和 2u2g 特定配置的有效性
#
# 使用方法:
#   bash deploy/validate-env.sh [--strict] [--fix]
#

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env"

# 验证选项
STRICT_MODE=false
AUTO_FIX=false

# 错误和警告计数
ERROR_COUNT=0
WARNING_COUNT=0

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 存储验证结果
declare -A REQUIRED_VARS
declare -A OPTIONAL_VARS

# ============================================
# 辅助函数
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERROR_COUNT++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    ((WARNING_COUNT++))
}

log_fix() {
    echo -e "${GREEN}[FIX]${NC} $1"
}

load_env_file() {
    log_info "加载环境变量文件..."

    if [ ! -f "$ENV_FILE" ]; then
        log_error ".env 文件不存在: $ENV_FILE"

        if [ "$AUTO_FIX" = true ]; then
            if [ -f "${PROJECT_DIR}/.env.example" ]; then
                cp "${PROJECT_DIR}/.env.example" "$ENV_FILE"
                log_fix "已从 .env.example 创建 .env 文件"
                log_warning "请编辑 .env 文件并配置正确的值"
            fi
        fi
        return 1
    fi

    log_success ".env 文件已加载"
    return 0
}

# ============================================
# 环境变量定义
# ============================================

init_variable_definitions() {
    # 必需变量
    REQUIRED_VARS[ADMIN_USERNAME]="管理员用户名，用于登录"
    REQUIRED_VARS[ADMIN_PASSWORD]="管理员密码，请使用强密码"
    REQUIRED_VARS[SESSION_SECRET]="会话密钥，用于签名 session，建议使用随机字符串"
    REQUIRED_VARS[SESSION_TIMEOUT]="会话超时时间（秒），默认 86400（24小时）"

    # 服务器配置
    REQUIRED_VARS[FRONTEND_PORT]="前端服务端口，默认 3000"
    REQUIRED_VARS[BACKEND_PORT]="后端服务端口，默认 7900"
    REQUIRED_VARS[NODE_OPTIONS]="Node.js 选项，2u2g 必须包含 --max-old-space-size=200"

    # 数据库配置
    REQUIRED_VARS[DATABASE_PATH]="SQLite 数据库文件路径"
    REQUIRED_VARS[SQLITE_CACHE_SIZE]="SQLite 缓存大小，2u2g 必须为 -2000"

    # 任务队列配置（2u2g 关键）
    REQUIRED_VARS[WORKER_COUNT]="工作进程数，2u2g 必须为 1"
    REQUIRED_VARS[ENABLE_CONCURRENT_JOBS]="启用并发任务，2u2g 必须为 false"

    # Webhook 配置
    REQUIRED_VARS[WEBHOOK_SECRET]="Webhook 密钥，用于验证请求签名"

    # 日志配置
    REQUIRED_VARS[LOG_LEVEL]="日志级别（debug, info, warn, error）"
    REQUIRED_VARS[LOG_PATH]="日志文件路径"

    # 可选变量
    OPTIONAL_VARS[GITHUB_CLIENT_ID]="GitHub OAuth 客户端 ID"
    OPTIONAL_VARS[GITHUB_CLIENT_SECRET]="GitHub OAuth 客户端密钥"
    OPTIONAL_VARS[GITEE_CLIENT_ID]="Gitee OAuth 客户端 ID"
    OPTIONAL_VARS[GITEE_CLIENT_SECRET]="Gitee OAuth 客户端密钥"
    OPTIONAL_VARS[GITLAB_CLIENT_ID]="GitLab OAuth 客户端 ID"
    OPTIONAL_VARS[GITLAB_CLIENT_SECRET]="GitLab OAuth 客户端密钥"

    OPTIONAL_VARS[LLM_PROVIDER]="LLM 提供商（openai, anthropic, deepseek 等）"
    OPTIONAL_VARS[LLM_API_KEY]="LLM API 密钥"
    OPTIONAL_VARS[LLM_MODEL]="LLM 模型名称"

    OPTIONAL_VARS[CODE_CONTEXT_ENGINE_ROOT]="Code Context Engine runtime 根目录"
    OPTIONAL_VARS[CODE_CONTEXT_ENGINE_MAX_MEMORY]="Code Context Engine runtime 内存预算，建议为 512m"

    OPTIONAL_VARS[PYTHON_MEMORY_LIMIT]="Python 内存限制，2u2g 建议为 300m"

    OPTIONAL_VARS[MEMORY_WARNING_THRESHOLD]="内存警告阈值（百分比），默认 80"
    OPTIONAL_VARS[MEMORY_CRITICAL_THRESHOLD]="内存严重阈值（百分比），默认 95"

    OPTIONAL_VARS[CORS_ORIGINS]="CORS 允许的源"
    OPTIONAL_VARS[ENABLE_HTTPS]="启用 HTTPS"
}

# ============================================
# 验证函数
# ============================================

check_required_vars() {
    log_info "检查必需的环境变量..."
    echo

    local missing_vars=()

    for var in "${!REQUIRED_VARS[@]}"; do
        if ! grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
            missing_vars+=("$var")
            log_error "缺少必需变量: $var"
            echo "  → ${REQUIRED_VARS[$var]}"
        else
            local value=$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2)
            # 检查空值
            if [ -z "$value" ] || [ "$value" == '""' ]; then
                missing_vars+=("$var")
                log_error "变量值为空: $var"
            else
                log_success "$var 已设置"
            fi
        fi
    done

    echo

    if [ ${#missing_vars[@]} -gt 0 ]; then
        return 1
    fi
    return 0
}

check_2u2g_critical_config() {
    log_info "检查 2u2g 关键配置..."
    echo

    local critical_errors=()

    # 读取配置值
    local worker_count=$(grep "^WORKER_COUNT=" "$ENV_FILE" | cut -d'=' -f2)
    local enable_concurrent=$(grep "^ENABLE_CONCURRENT_JOBS=" "$ENV_FILE" | cut -d'=' -f2)
    local node_options=$(grep "^NODE_OPTIONS=" "$ENV_FILE" | cut -d'=' -f2)
    local sqlite_cache=$(grep "^SQLITE_CACHE_SIZE=" "$ENV_FILE" | cut -d'=' -f2)
    local python_memory=$(grep "^PYTHON_MEMORY_LIMIT=" "$ENV_FILE" | cut -d'=' -f2)
    local code_context_runtime_memory=$(grep "^CODE_CONTEXT_ENGINE_MAX_MEMORY=" "$ENV_FILE" | cut -d'=' -f2)

    # 检查 WORKER_COUNT
    if [ "$worker_count" != "1" ]; then
        critical_errors+=("WORKER_COUNT 必须为 1（当前: $worker_count）")
        log_error "WORKER_COUNT 必须为 1（当前: $worker_count）"

        if [ "$AUTO_FIX" = true ]; then
            sed -i.bak "s/^WORKER_COUNT=.*/WORKER_COUNT=1/" "$ENV_FILE"
            log_fix "已修复 WORKER_COUNT=1"
        fi
    else
        log_success "WORKER_COUNT=1 ✓"
    fi

    # 检查 ENABLE_CONCURRENT_JOBS
    if [ "$enable_concurrent" != "false" ]; then
        critical_errors+=("ENABLE_CONCURRENT_JOBS 必须为 false（当前: $enable_concurrent）")
        log_error "ENABLE_CONCURRENT_JOBS 必须为 false（当前: $enable_concurrent）"

        if [ "$AUTO_FIX" = true ]; then
            sed -i.bak "s/^ENABLE_CONCURRENT_JOBS=.*/ENABLE_CONCURRENT_JOBS=false/" "$ENV_FILE"
            log_fix "已修复 ENABLE_CONCURRENT_JOBS=false"
        fi
    else
        log_success "ENABLE_CONCURRENT_JOBS=false ✓"
    fi

    # 检查 NODE_OPTIONS
    if [[ "$node_options" != *"--max-old-space-size=200"* ]]; then
        critical_errors+=("NODE_OPTIONS 必须包含 --max-old-space-size=200")
        log_error "NODE_OPTIONS 必须包含 --max-old-space-size=200（当前: $node_options）"

        if [ "$AUTO_FIX" = true ]; then
            sed -i.bak "s/^NODE_OPTIONS=.*/NODE_OPTIONS=--max-old-space-size=200/" "$ENV_FILE"
            log_fix "已修复 NODE_OPTIONS"
        fi
    else
        log_success "NODE_OPTIONS 包含 --max-old-space-size=200 ✓"
    fi

    # 检查 SQLITE_CACHE_SIZE
    if [ "$sqlite_cache" != "-2000" ]; then
        critical_errors+=("SQLITE_CACHE_SIZE 必须为 -2000（当前: $sqlite_cache）")
        log_error "SQLITE_CACHE_SIZE 必须为 -2000（当前: $sqlite_cache）"

        if [ "$AUTO_FIX" = true ]; then
            sed -i.bak "s/^SQLITE_CACHE_SIZE=.*/SQLITE_CACHE_SIZE=-2000/" "$ENV_FILE"
            log_fix "已修复 SQLITE_CACHE_SIZE"
        fi
    else
        log_success "SQLITE_CACHE_SIZE=-2000 ✓"
    fi

    # 检查内存限制建议
    if [ -n "$python_memory" ] && [ "$python_memory" != "300m" ]; then
        log_warning "PYTHON_MEMORY_LIMIT 建议 300m（当前: $python_memory）"
    fi

    if [ -n "$code_context_runtime_memory" ] && [ "$code_context_runtime_memory" != "512m" ]; then
        log_warning "CODE_CONTEXT_ENGINE_MAX_MEMORY 建议 512m（当前: $code_context_runtime_memory）"
    fi

    echo

    if [ ${#critical_errors[@]} -gt 0 ]; then
        log_error "发现 ${#critical_errors[@]} 个 2u2g 配置错误，可能导致内存问题"
        return 1
    fi

    log_success "2u2g 配置正确 ✓"
    return 0
}

check_security_defaults() {
    log_info "检查安全配置..."
    echo

    local warnings=()

    # 检查默认密码
    local admin_password=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2)
    local session_secret=$(grep "^SESSION_SECRET=" "$ENV_FILE" | cut -d'=' -f2)
    local webhook_secret=$(grep "^WEBHOOK_SECRET=" "$ENV_FILE" | cut -d'=' -f2)

    if [ "$admin_password" == "changeme" ]; then
        warnings+=("ADMIN_PASSWORD 使用默认值 'changeme'")
        log_warning "ADMIN_PASSWORD 使用默认值，存在安全风险"
    fi

    if [ "$session_secret" == "changeme_to_secure_random_string" ]; then
        warnings+=("SESSION_SECRET 使用默认值")
        log_warning "SESSION_SECRET 使用默认值，存在安全风险"
    fi

    if [ "$webhook_secret" == "changeme_to_random_webhook_secret" ]; then
        warnings+=("WEBHOOK_SECRET 使用默认值")
        log_warning "WEBHOOK_SECRET 使用默认值，存在安全风险"
    fi

    # 检查 HTTPS
    local enable_https=$(grep "^ENABLE_HTTPS=" "$ENV_FILE" | cut -d'=' -f2)
    if [ "$enable_https" == "false" ]; then
        warnings+=("HTTPS 未启用")
        log_warning "HTTPS 未启用，生产环境建议启用"
    fi

    echo

    if [ ${#warnings[@]} -gt 0 ]; then
        log_warning "发现 ${#warnings[@]} 个安全警告"
        return 1
    fi

    log_success "安全配置检查通过"
    return 0
}

check_port_configuration() {
    log_info "检查端口配置..."
    echo

    local frontend_port=$(grep "^FRONTEND_PORT=" "$ENV_FILE" | cut -d'=' -f2)
    local backend_port=$(grep "^BACKEND_PORT=" "$ENV_FILE" | cut -d'=' -f2)

    # 检查端口范围
    if [ "$frontend_port" -lt 1024 ] || [ "$frontend_port" -gt 65535 ]; then
        log_error "FRONTEND_PORT 无效: $frontend_port"
        return 1
    fi

    if [ "$backend_port" -lt 1024 ] || [ "$backend_port" -gt 65535 ]; then
        log_error "BACKEND_PORT 无效: $backend_port"
        return 1
    fi

    log_success "端口配置有效: 前端 $frontend_port, 后端 $backend_port"
    return 0
}

check_path_configuration() {
    log_info "检查路径配置..."
    echo

    local errors=()

    # 读取路径配置
    local database_path=$(grep "^DATABASE_PATH=" "$ENV_FILE" | cut -d'=' -f2)
    local log_path=$(grep "^LOG_PATH=" "$ENV_FILE" | cut -d'=' -f2)
    local backup_path=$(grep "^BACKUP_PATH=" "$ENV_FILE" | cut -d'=' -f2)
    local workspace_root=$(grep "^WORKSPACE_ROOT=" "$ENV_FILE" | cut -d'=' -f2)

    # 检查数据库路径
    if [[ "$database_path" != /* ]]; then
        errors+=("DATABASE_PATH 应使用绝对路径")
        log_error "DATABASE_PATH 应使用绝对路径: $database_path"
    else
        log_success "DATABASE_PATH: $database_path"
    fi

    # 检查日志路径
    if [[ "$log_path" != /* ]]; then
        errors+=("LOG_PATH 应使用绝对路径")
        log_error "LOG_PATH 应使用绝对路径: $log_path"
    else
        log_success "LOG_PATH: $log_path"
    fi

    # 检查工作空间路径
    if [[ "$workspace_root" != /* ]]; then
        errors+=("WORKSPACE_ROOT 应使用绝对路径")
        log_error "WORKSPACE_ROOT 应使用绝对路径: $workspace_root"
    else
        log_success "WORKSPACE_ROOT: $workspace_root"
    fi

    echo

    if [ ${#errors[@]} -gt 0 ]; then
        return 1
    fi

    return 0
}

# ============================================
# 主程序
# ============================================

print_summary() {
    echo
    echo "============================================"
    echo "  验证摘要"
    echo "============================================"
    echo -e "  错误: ${RED}$ERROR_COUNT${NC}"
    echo -e "  警告: ${YELLOW}$WARNING_COUNT${NC}"
    echo "============================================"
    echo

    if [ $ERROR_COUNT -eq 0 ] && [ $WARNING_COUNT -eq 0 ]; then
        log_success "所有检查通过！环境配置正确。"
        return 0
    elif [ $ERROR_COUNT -eq 0 ]; then
        log_info "配置基本正确，存在一些警告。"
        return 0
    else
        log_error "存在 $ERROR_COUNT 个错误，请修复后重试。"
        return 1
    fi
}

main() {
    echo "============================================"
    echo "  CodaGraph-lite 环境变量验证"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --strict)
                STRICT_MODE=true
                ;;
            --fix)
                AUTO_FIX=true
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  bash deploy/validate-env.sh [--strict] [--fix]"
                echo
                echo "选项:"
                echo "  --strict    启用严格模式，将警告视为错误"
                echo "  --fix       自动修复可自动修复的配置错误"
                echo "  --help, -h  显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 加载环境变量定义
    init_variable_definitions

    # 执行检查
    load_env_file || return 1

    # 如果严格模式或自动修复，跳过确认
    if [ "$STRICT_MODE" = false ] && [ "$AUTO_FIX" = false ]; then
        echo
    fi

    check_required_vars || true
    check_2u2g_critical_config || true
    check_security_defaults || true
    check_port_configuration || true
    check_path_configuration || true

    # 打印摘要
    print_summary

    # 退出码
    if [ $ERROR_COUNT -gt 0 ]; then
        exit 1
    elif [ "$STRICT_MODE" = true ] && [ $WARNING_COUNT -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# 运行主程序
main "$@"
