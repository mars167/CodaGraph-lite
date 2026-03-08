#!/bin/bash
#
# CodaGraph-lite Swap 设置脚本
# 为 2u2g 服务器配置 2GB Swap 空间
#
# 使用方法:
#   sudo bash deploy/setup-swap.sh [--size=SIZE] [--check-only]
#

set -e  # 遇到错误立即退出

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd"

# Swap 配置
SWAP_SIZE="2G"          # 默认 2GB
SWAP_FILE="/swapfile"    # Swap 文件位置
SWAP_BACKUP="/swapfile.bak"

# 选项
CHECK_ONLY=false
FORCE_RECREATE=false

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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行"
        log_info "请使用: sudo bash deploy/setup-swap.sh"
        exit 1
    fi
}

get_system_memory() {
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local used_mem=$(free -m | awk '/^Mem:/ {print $3}')
    local avail_mem=$(free -m | awk '/^Mem:/ {print $7}')
    local swap_total=$(free -m | awk '/^Swap:/ {print $2}')
    local swap_used=$(free -m | awk '/^Swap:/ {print $3}')

    echo "总内存: ${total_mem}MB"
    echo "已用内存: ${used_mem}MB"
    echo "可用内存: ${avail_mem}MB"
    echo "Swap 总计: ${swap_total}MB"
    echo "Swap 已用: ${swap_used}MB"

    # 计算内存使用百分比
    local mem_percent=$((used_mem * 100 / total_mem))
    echo "内存使用率: ${mem_percent}%"
}

check_existing_swap() {
    log_info "检查现有 Swap 配置..."

    local swap_info=$(swapon --show 2>/dev/null || echo "")

    if [ -z "$swap_info" ]; then
        log_info "未检测到活跃的 Swap"
        return 1
    fi

    log_info "当前 Swap 配置:"
    echo "$swap_info"

    # 检查 Swap 文件
    if [ -f "$SWAP_FILE" ]; then
        local swap_size=$(du -h "$SWAP_FILE" | cut -f1)
        log_info "Swap 文件存在: $SWAP_FILE ($swap_size)"

        # 检查大小是否足够
        local current_size_bytes=$(stat -c%s "$SWAP_FILE" 2>/dev/null || stat -f%z "$SWAP_FILE")
        local desired_size_bytes=$(numfmt --from=1G 2>/dev/null || echo 1073741824)

        if [ $current_size_bytes -ge $desired_size_bytes ]; then
            log_success "Swap 文件大小已满足要求"
            return 0
        else
            log_warning "Swap 文件大小不足，需要重建"
            return 1
        fi
    fi

    return 1
}

check_swap_usage() {
    log_info "检查 Swap 使用情况..."

    local swap_total=$(free -m | awk '/^Swap:/ {print $2}')
    local swap_used=$(free -m | awk '/^Swap:/ {print $3}')

    if [ "$swap_total" -eq 0 ]; then
        log_warning "Swap 未配置"
        return 1
    fi

    if [ "$swap_used" -gt 0 ]; then
        local swap_percent=$((swap_used * 100 / swap_total))
        log_info "Swap 使用: ${swap_used}MB / ${swap_total}MB (${swap_percent}%)"

        if [ "$swap_percent" -gt 50 ]; then
            log_warning "Swap 使用率较高，建议增加内存或优化应用"
        fi
    else
        log_info "Swap 未使用（正常）"
    fi

    return 0
}

disable_existing_swap() {
    log_info "禁用现有 Swap..."

    if [ -f "$SWAP_FILE" ]; then
        # 检查是否正在使用
        if swapon --show | grep -q "$SWAP_FILE"; then
            log_info "Swap 文件正在使用，尝试禁用..."
            swapoff "$SWAP_FILE" || true
        fi

        # 备份现有 Swap 文件
        if [ -f "$SWAP_FILE" ]; then
            local backup_file="${SWAP_BACKUP}-$(date +%Y%m%d-%H%M%S)"
            log_info "备份现有 Swap 文件到: $backup_file"
            mv "$SWAP_FILE" "$backup_file"
        fi
    fi

    # 禁用所有 Swap
    swapoff -a || true

    log_success "现有 Swap 已禁用"
}

create_swap_file() {
    log_info "创建 Swap 文件: $SWAP_FILE ($SWAP_SIZE)..."

    # 检查磁盘空间
    local available_space=$(df -BG "$SWAP_FILE" | awk 'NR==2 {print $4}' | sed 's/G//')
    local required_space=$(echo $SWAP_SIZE | sed 's/G//')

    if [ "$available_space" -lt "$required_space" ]; then
        log_error "磁盘空间不足: 需要 ${required_space}GB，可用 ${available_space}GB"
        exit 1
    fi

    # 创建 Swap 文件
    log_info "分配 Swap 空间，这可能需要一些时间..."
    dd if=/dev/zero of="$SWAP_FILE" bs=1G count="$required_size_bytes=2" status=progress || \
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count=2048 status=progress

    log_success "Swap 文件创建完成"

    # 设置权限（仅 root 可读写）
    chmod 600 "$SWAP_FILE"
    log_success "Swap 文件权限已设置: 600"
}

format_swap_file() {
    log_info "格式化 Swap 文件..."

    mkswap "$SWAP_FILE"
    log_success "Swap 文件已格式化"
}

enable_swap() {
    log_info "启用 Swap..."

    swapon "$SWAP_FILE"
    log_success "Swap 已启用"
}

configure_swappiness() {
    log_info "配置 Swap 使用策略..."

    # swappiness 控制系统使用 Swap 的积极程度
    # 0: 只在内存不足时使用 Swap
    # 100: 积极使用 Swap
    # 对于 2u2g 服务器，建议设置为 10-20

    local swappiness="10"

    echo "vm.swappiness=$swappiness" > /etc/sysctl.d/99-codagraph-lite.conf
    sysctl -p /etc/sysctl.d/99-codagraph-lite.conf

    log_success "Swap 使用策略已配置: vm.swappiness=$swappiness"

    # 设置 vfs_cache_pressure
    # 减少缓存压力，帮助系统更积极地释放内存
    echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.d/99-codagraph-lite.conf
    sysctl vm.vfs_cache_pressure=50

    log_success "缓存压力已配置: vm.vfs_cache_pressure=50"
}

add_fstab_entry() {
    log_info "添加 Swap 到 /etc/fstab（开机自动挂载）..."

    # 检查是否已存在
    if grep -q "$SWAP_FILE" /etc/fstab 2>/dev/null; then
        log_info "Swap 条目已存在于 /etc/fstab"
        return
    fi

    # 添加 Swap 条目
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    log_success "Swap 条目已添加到 /etc/fstab"
}

verify_swap() {
    log_info "验证 Swap 配置..."

    local swap_info=$(swapon --show)

    if echo "$swap_info" | grep -q "$SWAP_FILE"; then
        log_success "Swap 验证成功"
        echo
        log_info "Swap 状态:"
        echo "$swap_info"
    else
        log_error "Swap 验证失败"
        return 1
    fi
}

show_swap_summary() {
    echo
    echo "============================================"
    echo "  Swap 配置摘要"
    echo "============================================"
    get_system_memory
    echo
    log_info "Swap 文件: $SWAP_FILE ($SWAP_SIZE)"
    log_info "Swap 策略: vm.swappiness=10"
    log_info "开机挂载: 已添加到 /etc/fstab"
    echo
    log_success "Swap 配置完成！"
    echo
    log_info "Swap 将在内存不足时自动使用"
    log_info "建议的内存配置:"
    log_info "  - 总内存 (RAM + Swap): $(free -m | awk '/^Mem:/ {print $2+$2}')MB"
    log_info "  - Node.js: --max-old-space-size=200"
    log_info "  - Python: 300m"
    log_info "  - Code Context Engine runtime: 512m"
}

# ============================================
# 主程序
# ============================================

main() {
    echo "============================================"
    echo "  CodaGraph-lite Swap 设置脚本"
    echo "  版本: 1.0.0"
    echo "  2u2g 服务器优化"
    echo "============================================"
    echo

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --size=*)
                SWAP_SIZE="${arg#*=}"
                ;;
            --check-only)
                CHECK_ONLY=true
                ;;
            --force)
                FORCE_RECREATE=true
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  sudo bash deploy/setup-swap.sh [--size=SIZE] [--check-only] [--force]"
                echo
                echo "选项:"
                echo "  --size=SIZE    指定 Swap 大小（默认: 2G）"
                echo "  --check-only    仅检查 Swap 配置，不修改"
                echo "  --force        强制重新创建 Swap 文件"
                echo "  --help, -h     显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 检查 root 权限
    check_root

    # 显示当前内存状态
    log_info "当前系统内存状态:"
    get_system_memory
    echo

    # 检查现有 Swap
    if check_existing_swap; then
        if [ "$FORCE_RECREATE" = false ]; then
            check_swap_usage
            log_info "Swap 已正确配置，无需修改"
            echo
            log_info "如需重新配置，请使用 --force 参数"
            exit 0
        fi
    fi

    # 仅检查模式
    if [ "$CHECK_ONLY" = true ]; then
        exit 0
    fi

    # 确认操作
    log_warning "此操作将创建/重建 Swap 文件"
    read -p "确认继续? (yes/no): " -r
    echo

    if [[ $REPLY != "yes" ]]; then
        log_info "操作已取消"
        exit 0
    fi

    # 执行 Swap 设置
    echo
    disable_existing_swap
    create_swap_file
    format_swap_file
    enable_swap
    configure_swappiness
    add_fstab_entry
    verify_swap

    # 显示摘要
    show_swap_summary
}

# 运行主程序
main "$@"
