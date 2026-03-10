#!/bin/bash
#
# CodaGraph-lite 部署脚本
# 适用于 2u2g 服务器优化
#
# 使用方法:
#   sudo bash deploy/deploy.sh [systemd|pm2]
#

set -e  # 遇到错误立即退出

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/opt/codagraph-lite"
LOG_DIR="/var/log/codagraph-lite"
BACKUP_DIR="/var/backups/codagraph-lite"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
        log_info "请使用: sudo bash deploy/deploy.sh"
        exit 1
    fi
}

check_dependencies() {
    log_info "检查系统依赖..."

    local missing_deps=()

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("nodejs")
    fi

    # 检查 Python
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    fi

    # 检查 npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi

    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "缺少以下依赖: ${missing_deps[*]}"
        log_info "请先安装缺少的依赖"
        exit 1
    fi

    log_success "所有依赖检查通过"
    log_info "Node.js 版本: $(node --version)"
    log_info "Python 版本: $(python3 --version)"
}

check_swap() {
    log_info "检查 Swap 配置..."

    local swap_total=$(free -h | awk '/^Swap:/ {print $2}')

    if [[ "$swap_total" == "0B" ]] || [[ "$swap_total" == "" ]]; then
        log_warning "未检测到 Swap 空间"
        log_info "2u2g 服务器建议配置 2GB Swap"
        read -p "是否现在设置 Swap? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            bash "$SCRIPT_DIR/setup-swap.sh"
        fi
    else
        log_success "Swap 检测通过: $swap_total"
    fi
}

create_directories() {
    log_info "创建必要的目录..."

    mkdir -p "$INSTALL_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"

    # 设置权限
    chown -R $SUDO_USER:$SUDO_USER "$INSTALL_DIR"
    chown -R root:adm "$LOG_DIR"
    chmod 755 "$LOG_DIR"

    log_success "目录创建完成"
}

copy_files() {
    log_info "复制项目文件..."

    # 复制项目文件（排除 node_modules 和 .git）
    rsync -av --progress \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.next' \
        --exclude 'dist' \
        --exclude 'data' \
        --exclude 'logs' \
        --exclude '.DS_Store' \
        "$PROJECT_DIR/" "$INSTALL_DIR/"

    log_success "文件复制完成"
}

install_dependencies() {
    log_info "安装 Node.js 依赖..."

    cd "$INSTALL_DIR"
    npm install --production
    # Review Runtime 已并入 server，仅需安装 context-agent 的 Python 依赖。
    python3 -m pip install -r context-agent/requirements.txt
    cd web && npm install --production && npm run build && cd ..

    cd server && npm install && npm run build && cd ..

    log_success "依赖安装完成"
}

setup_environment() {
    log_info "设置环境配置..."

    if [ ! -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        log_warning "已创建 .env 文件，请编辑配置"
        log_warning "特别是以下关键配置："
        log_warning "  - ADMIN_PASSWORD"
        log_warning "  - SESSION_SECRET"
        log_warning "  - WEBHOOK_SECRET"
        log_warning "  - LLM_API_KEY"
        read -p "按 Enter 继续安装默认配置，或按 Ctrl+C 退出编辑..."
    fi

    log_success "环境配置完成"
}

setup_systemd() {
    log_info "配置 systemd 服务..."

    local service_dir="/etc/systemd/system"

    # 复制服务文件
    cp "$SCRIPT_DIR/systemd/codagraph-lite-frontend.service" "$service_dir/"
    cp "$SCRIPT_DIR/systemd/codagraph-lite-backend.service" "$service_dir/"

    # 重新加载 systemd
    systemctl daemon-reload

    log_success "systemd 服务配置完成"
    log_info "可使用以下命令管理服务："
    log_info "  systemctl start codagraph-lite-frontend"
    log_info "  systemctl start codagraph-lite-backend"
    log_info "  systemctl stop codagraph-lite-backend"
    log_info "  systemctl status codagraph-lite-backend"
}

setup_pm2() {
    log_info "配置 PM2 服务..."

    if ! command -v pm2 &> /dev/null; then
        log_info "安装 PM2..."
        npm install -g pm2
    fi

    # 复制 PM2 配置
    cp "$SCRIPT_DIR/pm2/ecosystem.config.js" "$INSTALL_DIR/"

    log_success "PM2 配置完成"
    log_info "可使用以下命令管理服务："
    log_info "  pm2 start $INSTALL_DIR/deploy/pm2/ecosystem.config.js"
    log_info "  pm2 stop codagraph-lite-backend"
    log_info "  pm2 restart codagraph-lite-backend"
    log_info "  pm2 logs"
}

setup_logrotate() {
    log_info "配置日志轮转..."

    cat > /etc/logrotate.d/codagraph-lite <<'EOF'
/var/log/codagraph-lite/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
    sharedscripts
    postrotate
        systemctl reload codagraph-lite-backend >/dev/null 2>&1 || true
    endscript
}
EOF

    log_success "日志轮转配置完成"
}

verify_deployment() {
    log_info "验证部署..."
    bash "$SCRIPT_DIR/verify.sh"
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite 部署脚本"
    echo "  版本: 1.0.0"
    echo "  2u2g 服务器优化"
    echo "============================================"
    echo

    # 检查参数
    local deploy_mode="${1:-systemd}"

    if [[ "$deploy_mode" != "systemd" && "$deploy_mode" != "pm2" ]]; then
        log_error "无效的部署模式: $deploy_mode"
        log_info "使用方法: sudo bash deploy/deploy.sh [systemd|pm2]"
        exit 1
    fi

    log_info "部署模式: $deploy_mode"
    echo

    # 执行部署步骤
    check_root
    check_dependencies
    check_swap
    create_directories

    # 备份现有安装（如果存在）
    if [ -d "$INSTALL_DIR" ] && [ "$(ls -A $INSTALL_DIR)" ]; then
        log_warning "检测到现有安装，创建备份..."
        local backup_file="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
        mkdir -p "$BACKUP_DIR"
        tar -czf "$backup_file" -C "$INSTALL_DIR" . 2>/dev/null || true
        log_success "备份已创建: $backup_file"
    fi

    copy_files
    install_dependencies
    setup_environment

    if [[ "$deploy_mode" == "systemd" ]]; then
        setup_systemd
        setup_logrotate
    else
        setup_pm2
    fi

    verify_deployment

    echo
    log_success "部署完成！"
    echo
    log_info "下一步操作："
    log_info "1. 编辑 $INSTALL_DIR/.env 配置文件"
    log_info "2. 启动服务"
    if [[ "$deploy_mode" == "systemd" ]]; then
        log_info "   systemctl enable --now codagraph-lite-backend"
        log_info "   systemctl enable --now codagraph-lite-frontend"
    else
        log_info "   pm2 start $INSTALL_DIR/deploy/pm2/ecosystem.config.js"
        log_info "   pm2 save"
        log_info "   pm2 startup"
    fi
    log_info "3. 访问 http://localhost:3000"
}

# 运行主程序
main "$@"
