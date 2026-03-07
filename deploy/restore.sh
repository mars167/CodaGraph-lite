#!/bin/bash
#
# CodaGraph-lite 恢复脚本
# 从备份文件恢复数据库和配置
#
# 使用方法:
#   sudo bash deploy/restore.sh <backup_file>
#

set -e  # 遇到错误立即退出

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${INSTALL_DIR:-/opt/codagraph-lite}"

DATA_DIR="${INSTALL_DIR}/data"
LOG_DIR="${INSTALL_DIR}/logs"

# 备份文件路径
BACKUP_FILE=""

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

validate_backup() {
    log_info "验证备份文件..."

    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "备份文件不存在: $BACKUP_FILE"
        exit 1
    fi

    # 显示备份信息（如果存在）
    if tar -tzf "$BACKUP_FILE" | grep -q "BACKUP_INFO.txt"; then
        log_info "备份信息:"
        tar -xzf "$BACKUP_FILE" -O BACKUP_INFO.txt 2>/dev/null || true
        echo
    fi

    log_success "备份文件验证通过"
}

check_services() {
    log_info "检查服务状态..."

    local services_running=false

    # 检查 systemd
    if systemctl is-active --quiet codagraph-lite-backend 2>/dev/null; then
        services_running=true
        log_warning "后端服务正在运行"
    fi

    if systemctl is-active --quiet codagraph-lite-frontend 2>/dev/null; then
        services_running=true
        log_warning "前端服务正在运行"
    fi

    # 检查 PM2
    if command -v pm2 &> /dev/null && pm2 list | grep -q "codagraph-lite.*online"; then
        services_running=true
        log_warning "PM2 进程正在运行"
    fi

    if [ "$services_running" = true ]; then
        log_error "请先停止所有服务后再执行恢复"
        log_info "systemd: systemctl stop codagraph-lite-backend codagraph-lite-frontend"
        log_info "PM2: pm2 stop all"
        exit 1
    fi

    log_success "服务状态检查通过（所有服务已停止）"
}

backup_current_data() {
    log_info "备份当前数据（安全措施）..."

    local emergency_backup="${INSTALL_DIR}/backups/emergency-pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
    mkdir -p "$(dirname "$emergency_backup")"

    # 备份数据库
    if [ -f "$DATA_DIR/codagraph-lite.db" ]; then
        tar -czf "$emergency_backup" -C "$DATA_DIR" . 2>/dev/null || true
        local backup_size=$(du -h "$emergency_backup" | cut -f1)
        log_success "当前数据已备份到: $emergency_backup ($backup_size)"
    fi
}

restore_from_full_backup() {
    log_info "从完整备份恢复..."

    local temp_dir=$(mktemp -d)
    mkdir -p "${temp_dir}/restore"

    # 解压备份文件
    log_info "解压备份文件..."
    tar -xzf "$BACKUP_FILE" -C "${temp_dir}/restore"

    # 恢复数据库
    if [ -f "${temp_dir}/restore/codagraph-lite.db" ]; then
        log_info "恢复数据库..."
        mkdir -p "$DATA_DIR"
        cp "${temp_dir}/restore/codagraph-lite.db" "$DATA_DIR/"
        log_success "数据库已恢复"
    fi

    # 恢复配置文件
    if [ -f "${temp_dir}/restore/.env" ]; then
        log_warning "恢复 .env 配置文件..."
        read -p "确认覆盖现有配置? (y/n): " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "${temp_dir}/restore/.env" "$INSTALL_DIR/.env"
            log_success "配置文件已恢复"
        else
            log_info "跳过配置文件恢复"
        fi
    fi

    # 恢复日志（如果存在）
    if [ -d "${temp_dir}/restore/logs" ]; then
        log_warning "恢复日志文件..."
        read -p "是否覆盖现有日志? (y/n): " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mkdir -p "$LOG_DIR"
            cp -r "${temp_dir}/restore/logs/"* "$LOG_DIR/"
            log_success "日志文件已恢复"
        else
            log_info "跳过日志恢复"
        fi
    fi

    # 清理临时目录
    rm -rf "$temp_dir"
}

restore_database() {
    log_info "恢复数据库..."

    local temp_dir=$(mktemp -d)

    # 解压备份文件
    tar -xzf "$BACKUP_FILE" -C "$temp_dir" 2>/dev/null || cp "$BACKUP_FILE" "$temp_dir/"

    # 查找数据库文件
    local db_file=""
    if [ -f "$temp_dir/codagraph-lite.db" ]; then
        db_file="$temp_dir/codagraph-lite.db"
    elif [ -f "$temp_dir/database-"*.db ]; then
        db_file=$(find "$temp_dir" -name "database-*.db" | head -1)
    else
        log_error "备份中未找到数据库文件"
        rm -rf "$temp_dir"
        exit 1
    fi

    # 验证数据库完整性
    if command -v sqlite3 &> /dev/null; then
        local integrity_check=$(sqlite3 "$db_file" "PRAGMA integrity_check;" 2>&1)
        if [ "$integrity_check" != "ok" ]; then
            log_error "备份数据库完整性检查失败: $integrity_check"
            read -p "仍要继续恢复? (y/n): " -n 1 -r
            echo

            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                rm -rf "$temp_dir"
                exit 1
            fi
        fi
    fi

    # 恢复数据库
    mkdir -p "$DATA_DIR"
    cp "$db_file" "$DATA_DIR/codagraph-lite.db"

    local db_size=$(du -h "$DATA_DIR/codagraph-lite.db" | cut -f1)
    log_success "数据库已恢复 (大小: $db_size)"

    # 清理临时目录
    rm -rf "$temp_dir"
}

restore_config() {
    log_info "检查配置文件恢复..."

    local temp_dir=$(mktemp -d)

    # 解压备份文件
    tar -xzf "$BACKUP_FILE" -C "$temp_dir" 2>/dev/null || true

    # 查找配置文件
    if [ -f "$temp_dir/.env" ]; then
        log_warning "发现 .env 配置文件"
        read -p "恢复配置文件? (y/n): " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$temp_dir/.env" "$INSTALL_DIR/.env"
            log_success "配置文件已恢复"
        fi
    fi

    rm -rf "$temp_dir"
}

set_permissions() {
    log_info "设置文件权限..."

    # 设置数据目录权限
    if [ -d "$DATA_DIR" ]; then
        chown -R root:root "$DATA_DIR"
        chmod 644 "$DATA_DIR"/*.db 2>/dev/null || true
    fi

    # 设置日志目录权限
    if [ -d "$LOG_DIR" ]; then
        chown -R root:adm "$LOG_DIR"
        chmod 755 "$LOG_DIR"
    fi

    log_success "权限设置完成"
}

show_next_steps() {
    echo
    log_success "恢复完成！"
    echo
    log_info "下一步操作："
    log_info "1. 验证恢复的数据"
    log_info "2. 启动服务"
    log_info "   systemd: systemctl start codagraph-lite-backend codagraph-lite-frontend"
    log_info "   PM2: pm2 start $INSTALL_DIR/deploy/pm2/ecosystem.config.js"
    log_info "3. 检查服务状态"
    log_info "   bash deploy/verify.sh"
    echo
    log_info "如果遇到问题，应急备份位于:"
    find "$INSTALL_DIR/backups" -name "emergency-pre-restore-*" -type f | tail -1
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite 恢复脚本"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 检查参数
    if [ $# -lt 1 ]; then
        log_error "缺少备份文件参数"
        echo "使用方法: sudo bash deploy/restore.sh <backup_file>"
        exit 1
    fi

    BACKUP_FILE="$1"

    # 验证备份文件
    validate_backup

    # 检查服务状态
    check_services

    # 显示恢复预览
    echo
    log_warning "即将执行恢复操作"
    log_warning "此操作将覆盖当前数据和配置"
    read -p "确认继续? (yes/no): " -r
    echo

    if [[ $REPLY != "yes" ]]; then
        log_info "恢复已取消"
        exit 0
    fi

    # 备份当前数据
    backup_current_data

    # 执行恢复
    if tar -tzf "$BACKUP_FILE" | grep -q "BACKUP_INFO.txt"; then
        restore_from_full_backup
    else
        restore_database
        restore_config
    fi

    # 设置权限
    set_permissions

    # 显示下一步
    show_next_steps
}

# 运行主程序
main "$@"
