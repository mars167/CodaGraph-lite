#!/bin/bash
#
# CodaGraph-lite 卸载脚本
# 安全地停止服务、移除配置文件和清理数据
#
# 使用方法:
#   sudo bash deploy/uninstall.sh [--remove-data]
#

set -e  # 遇到错误立即退出

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/codagraph-lite"
LOG_DIR="/var/log/codagraph-lite"
BACKUP_DIR="/var/backups/codagraph-lite"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 是否删除数据
REMOVE_DATA=false

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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行"
        log_info "请使用: sudo bash deploy/uninstall.sh"
        exit 1
    fi
}

stop_systemd_services() {
    log_info "停止 systemd 服务..."

    if systemctl is-active --quiet codagraph-lite-backend 2>/dev/null; then
        systemctl stop codagraph-lite-backend
        log_success "已停止后端服务"
    fi

    if systemctl is-active --quiet codagraph-lite-frontend 2>/dev/null; then
        systemctl stop codagraph-lite-frontend
        log_success "已停止前端服务"
    fi

    # 禁用服务
    systemctl disable codagraph-lite-backend 2>/dev/null || true
    systemctl disable codagraph-lite-frontend 2>/dev/null || true

    log_success "systemd 服务已停止"
}

stop_pm2_services() {
    log_info "停止 PM2 服务..."

    if command -v pm2 &> /dev/null; then
        # 检查是否有 CodaGraph-lite 进程在运行
        if pm2 list | grep -q "codagraph-lite"; then
            pm2 stop all
            pm2 delete all
            pm2 save
            log_success "PM2 服务已停止"
        else
            log_info "没有运行中的 PM2 服务"
        fi
    fi
}

remove_systemd_files() {
    log_info "移除 systemd 配置文件..."

    local service_dir="/etc/systemd/system"

    if [ -f "$service_dir/codagraph-lite-backend.service" ]; then
        rm -f "$service_dir/codagraph-lite-backend.service"
        log_success "已移除后端服务文件"
    fi

    if [ -f "$service_dir/codagraph-lite-frontend.service" ]; then
        rm -f "$service_dir/codagraph-lite-frontend.service"
        log_success "已移除前端服务文件"
    fi

    # 重新加载 systemd
    systemctl daemon-reload
    systemctl reset-failed

    log_success "systemd 配置已移除"
}

remove_pm2_config() {
    log_info "移除 PM2 配置..."

    if [ -f "$INSTALL_DIR/deploy/pm2/ecosystem.config.js" ]; then
        rm -f "$INSTALL_DIR/deploy/pm2/ecosystem.config.js"
        log_success "已移除 PM2 配置文件"
    fi
}

remove_logrotate_config() {
    log_info "移除日志轮转配置..."

    if [ -f "/etc/logrotate.d/codagraph-lite" ]; then
        rm -f /etc/logrotate.d/codagraph-lite
        log_success "已移除日志轮转配置"
    fi
}

remove_application_files() {
    if [ ! -d "$INSTALL_DIR" ]; then
        log_info "应用程序目录不存在，跳过"
        return
    fi

    log_warning "将删除应用程序目录: $INSTALL_DIR"
    read -p "确认删除? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
        log_success "应用程序目录已删除"
    else
        log_info "跳过删除应用程序目录"
    fi
}

remove_logs() {
    if [ ! -d "$LOG_DIR" ] || [ -z "$(ls -A $LOG_DIR)" ]; then
        log_info "日志目录为空或不存在，跳过"
        return
    fi

    log_warning "将删除日志目录: $LOG_DIR"
    read -p "确认删除日志? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$LOG_DIR"
        log_success "日志目录已删除"
    else
        log_info "跳过删除日志"
    fi
}

remove_backups() {
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR)" ]; then
        log_info "备份目录为空或不存在，跳过"
        return
    fi

    log_warning "将删除备份目录: $BACKUP_DIR"
    read -p "确认删除所有备份? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$BACKUP_DIR"
        log_success "备份目录已删除"
    else
        log_info "跳过删除备份"
    fi
}

remove_user() {
    log_info "检查是否需要删除用户..."

    if id "nodejs" &>/dev/null; then
        log_warning "检测到 nodejs 用户"
        read -p "删除 nodejs 用户? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            userdel -r nodejs 2>/dev/null || userdel nodejs
            log_success "nodejs 用户已删除"
        else
            log_info "跳过删除用户"
        fi
    fi

    if id "nextjs" &>/dev/null; then
        log_warning "检测到 nextjs 用户"
        read -p "删除 nextjs 用户? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            userdel -r nextjs 2>/dev/null || userdel nextjs
            log_success "nextjs 用户已删除"
        else
            log_info "跳过删除用户"
        fi
    fi
}

show_summary() {
    echo
    log_success "卸载完成！"
    echo
    log_info "以下项目已被移除："
    log_info "  ✓ systemd 服务文件"
    log_info "  ✓ PM2 配置文件（如适用）"
    log_info "  ✓ 日志轮转配置"
    log_info "  ✓ 应用程序文件"
    log_info "  ✓ 日志文件"
    log_info "  ✓ 备份文件"
    log_info "  ✓ 系统用户"
    echo
    log_info "感谢使用 CodaGraph-lite！"
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite 卸载脚本"
    echo "  版本: 1.0.0"
    echo "============================================"
    echo

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --remove-data)
                REMOVE_DATA=true
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  sudo bash deploy/uninstall.sh [--remove-data]"
                echo
                echo "选项:"
                echo "  --remove-data    自动删除所有数据（不提示）"
                echo "  -h, --help     显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 检查 root 权限
    check_root

    # 确认卸载
    log_warning "此操作将卸载 CodaGraph-lite"
    read -p "确认继续卸载? (yes/no): " -r
    echo

    if [[ $REPLY != "yes" ]]; then
        log_info "卸载已取消"
        exit 0
    fi

    # 检测部署模式并停止服务
    if [ -f "/etc/systemd/system/codagraph-lite-backend.service" ]; then
        stop_systemd_services
        remove_systemd_files
        remove_logrotate_config
    elif command -v pm2 &> /dev/null && pm2 list | grep -q "codagraph-lite"; then
        stop_pm2_services
        remove_pm2_config
    else
        log_warning "未检测到运行中的服务"
    fi

    # 删除文件和数据
    remove_application_files

    if [ "$REMOVE_DATA" = true ]; then
        remove_logs
        remove_backups
    else
        remove_logs
        remove_backups
    fi

    remove_user

    # 显示总结
    show_summary
}

# 运行主程序
main "$@"
