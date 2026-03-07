#!/bin/bash
#
# CodaGraph-lite 备份脚本
# 支持 SQLite 数据库和配置文件的备份
#
# 使用方法:
#   bash deploy/backup.sh [--full] [--output=PATH]
#

set -e  # 遇到错误立即退出

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${INSTALL_DIR:-/opt/codagraph-lite}"

DATA_DIR="${INSTALL_DIR}/data"
BACKUP_DIR="${BACKUP_PATH:-$INSTALL_DIR/backups}"
LOG_DIR="${INSTALL_DIR}/logs"

# 当前时间戳
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="codagraph-lite-backup-${TIMESTAMP}"

# 备份选项
FULL_BACKUP=false
OUTPUT_PATH=""

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================
# 辅助函数
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "创建备份目录: $BACKUP_DIR"
    fi
}

backup_database() {
    log_info "备份数据库..."

    local db_file="$DATA_DIR/codagraph-lite.db"

    if [ ! -f "$db_file" ]; then
        log_warning "数据库文件不存在: $db_file"
        return 0
    fi

    # 使用 SQLite 的 VACUUM 命令优化数据库
    if command -v sqlite3 &> /dev/null; then
        log_info "优化数据库..."
        sqlite3 "$db_file" "VACUUM;"
    fi

    # 复制数据库文件
    local backup_file="${BACKUP_DIR}/database-${TIMESTAMP}.db"
    cp "$db_file" "$backup_file"

    local db_size=$(du -h "$backup_file" | cut -f1)
    log_success "数据库已备份: $backup_file ($db_size)"
}

backup_config() {
    log_info "备份配置文件..."

    local config_backup_dir="${BACKUP_DIR}/config-${TIMESTAMP}"
    mkdir -p "$config_backup_dir"

    # 复制 .env 文件（移除敏感信息）
    if [ -f "$INSTALL_DIR/.env" ]; then
        sed -e 's/=.*/=***REDACTED***/' "$INSTALL_DIR/.env" > "${config_backup_dir}/.env"
        # 同时备份原始的 .env（加密建议）
        cp "$INSTALL_DIR/.env" "${config_backup_dir}/.env.original"
        log_success "配置文件已备份"
    else
        log_warning ".env 文件不存在"
    fi

    # 复制其他配置文件
    if [ -f "$INSTALL_DIR/package.json" ]; then
        cp "$INSTALL_DIR/package.json" "${config_backup_dir}/"
    fi

    if [ -f "$INSTALL_DIR/server/package.json" ]; then
        cp "$INSTALL_DIR/server/package.json" "${config_backup_dir}/"
    fi

    if [ -f "$INSTALL_DIR/web/package.json" ]; then
        cp "$INSTALL_DIR/web/package.json" "${config_backup_dir}/"
    fi
}

backup_logs() {
    if [ "$FULL_BACKUP" = false ]; then
        return
    fi

    log_info "备份日志文件..."

    if [ -d "$LOG_DIR" ] && [ "$(ls -A $LOG_DIR)" ]; then
        local logs_backup="${BACKUP_DIR}/logs-${TIMESTAMP}.tar.gz"
        tar -czf "$logs_backup" -C "$LOG_DIR" . 2>/dev/null || true

        if [ -f "$logs_backup" ]; then
            local log_size=$(du -h "$logs_backup" | cut -f1)
            log_success "日志已备份: $logs_backup ($log_size)"
        fi
    else
        log_info "日志目录为空"
    fi
}

backup_workspace() {
    if [ "$FULL_BACKUP" = false ]; then
        return
    fi

    log_info "备份工作空间..."

    local workspace="${WORKSPACE_ROOT:-/tmp/repos}"
    if [ -d "$workspace" ] && [ "$(ls -A $workspace)" ]; then
        local workspace_backup="${BACKUP_DIR}/workspace-${TIMESTAMP}.tar.gz"
        tar -czf "$workspace_backup" -C "$(dirname "$workspace")" "$(basename "$workspace")" 2>/dev/null || true

        if [ -f "$workspace_backup" ]; then
            local ws_size=$(du -h "$workspace_backup" | cut -f1)
            log_success "工作空间已备份: $workspace_backup ($ws_size)"
        fi
    else
        log_info "工作空间为空"
    fi
}

create_full_backup() {
    log_info "创建完整备份包..."

    local full_backup_file="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

    # 创建临时目录
    local temp_dir=$(mktemp -d)
    mkdir -p "${temp_dir}/backup"

    # 复制所有需要备份的文件
    cp -r "$DATA_DIR" "${temp_dir}/backup/" 2>/dev/null || true
    cp "$INSTALL_DIR/.env" "${temp_dir}/backup/" 2>/dev/null || true

    # 创建备份信息文件
    cat > "${temp_dir}/backup/BACKUP_INFO.txt" <<EOF
CodaGraph-lite 备份信息
========================

备份时间: $(date)
备份类型: 完整备份
版本: 1.0.0
主机名: $(hostname)
操作系统: $(uname -s) $(uname -r)

包含内容:
- 数据库文件
- 配置文件
- 日志文件 (如果完整备份)
- 工作空间 (如果完整备份)

注意:
- 恢复前请停止所有服务
- .env 文件包含敏感信息，请妥善保管
- 建议将备份文件存储到远程位置
EOF

    # 创建压缩包
    tar -czf "$full_backup_file" -C "$temp_dir/backup" .

    # 清理临时目录
    rm -rf "$temp_dir"

    if [ -f "$full_backup_file" ]; then
        local backup_size=$(du -h "$full_backup_file" | cut -f1)
        log_success "完整备份已创建: $full_backup_file ($backup_size)"
        echo "$full_backup_file"
    else
        log_error "创建完整备份失败"
        exit 1
    fi
}

cleanup_old_backups() {
    log_info "清理旧备份..."

    # 保留最近 30 天的备份
    local retention_days=30
    local cutoff_date=$(date -d "$retention_days days ago" +%Y%m%d 2>/dev/null || date -v-${retention_days}d +%Y%m%d)

    for backup_file in "$BACKUP_DIR"/*.tar.gz "$BACKUP_DIR"/*.db; do
        if [ -f "$backup_file" ]; then
            local file_date=$(basename "$backup_file" | grep -oP '\d{8}' || echo "")

            if [ -n "$file_date" ] && [ "$file_date" -lt "$cutoff_date" ]; then
                log_info "删除旧备份: $(basename "$backup_file")"
                rm -f "$backup_file"
            fi
        fi
    done

    log_success "旧备份清理完成"
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite 备份脚本"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --full)
                FULL_BACKUP=true
                ;;
            --output=*)
                OUTPUT_PATH="${arg#*=}"
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  bash deploy/backup.sh [--full] [--output=PATH]"
                echo
                echo "选项:"
                echo "  --full        创建包含日志和工作空间的完整备份"
                echo "  --output=PATH  指定备份输出路径"
                echo "  --help, -h     显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 更新备份路径
    if [ -n "$OUTPUT_PATH" ]; then
        BACKUP_DIR="$OUTPUT_PATH"
    fi

    log_info "备份模式: $([ "$FULL_BACKUP" = true ] && echo "完整" || echo "标准")"
    log_info "备份目录: $BACKUP_DIR"
    echo

    # 创建备份目录
    create_backup_dir

    # 执行备份
    if [ "$FULL_BACKUP" = true ]; then
        create_full_backup
    else
        backup_database
        backup_config
        backup_logs
        backup_workspace
    fi

    # 清理旧备份
    cleanup_old_backups

    echo
    log_success "备份完成！"
    echo
    log_info "备份位置: $BACKUP_DIR"
    log_info "请妥善保管备份文件"
}

# 运行主程序
main "$@"
