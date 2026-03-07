#!/bin/bash
#
# CodaGraph-lite 监控脚本
# 监控 CPU、内存和磁盘使用情况
#
# 使用方法:
#   bash deploy/monitor.sh [--continuous] [--interval=SECONDS]
#

# ============================================
# 配置变量
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${INSTALL_DIR:-/opt/codagraph-lite}"

# API 端点
BACKEND_URL="http://localhost:7900"

# 监控选项
CONTINUOUS_MODE=false
INTERVAL=5           # 默认每 5 秒刷新一次
LOG_FILE="${INSTALL_DIR}/logs/monitor.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ============================================
# 辅助函数
# ============================================

log_monitor() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

get_cpu_usage() {
    # 使用 /proc/stat 计算 CPU 使用率
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print $2}')
    echo "${cpu_usage}%"
}

get_memory_usage() {
    # 读取内存信息
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local used_mem=$(free -m | awk '/^Mem:/ {print $3}')
    local avail_mem=$(free -m | awk '/^Mem:/ {print $7}')
    local swap_total=$(free -m | awk '/^Swap:/ {print $2}')
    local swap_used=$(free -m | awk '/^Swap:/ {print $3}')

    # 计算使用百分比
    local mem_percent=$((used_mem * 100 / total_mem))
    local swap_percent=0
    if [ "$swap_total" -gt 0 ]; then
        swap_percent=$((swap_used * 100 / swap_total))
    fi

    echo "${used_mem}MB/${total_mem}MB (${mem_percent}%)"
    echo "${swap_used}MB/${swap_total}MB (${swap_percent}%)"
}

get_disk_usage() {
    local usage=$(df -h "$INSTALL_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    local available=$(df -h "$INSTALL_DIR" | awk 'NR==2 {print $4}')
    echo "${usage}%"
    echo "$available"
}

get_service_status() {
    local backend_status="停止"
    local frontend_status="停止"

    # 检查 systemd 服务
    if systemctl is-active --quiet codagraph-lite-backend 2>/dev/null; then
        backend_status="运行中"
    elif command -v pm2 &> /dev/null && pm2 list | grep -q "codagraph-lite-backend.*online"; then
        backend_status="运行中 (PM2)"
    fi

    if systemctl is-active --quiet codagraph-lite-frontend 2>/dev/null; then
        frontend_status="运行中"
    elif command -v pm2 &> /dev/null && pm2 list | grep -q "codagraph-lite-frontend.*online"; then
        frontend_status="运行中 (PM2)"
    fi

    echo "$backend_status"
    echo "$frontend_status"
}

get_process_info() {
    local node_processes=$(pgrep -c node || echo "0")
    local python_processes=$(pgrep -c python3 || echo "0")
    echo "$node_processes"
    echo "$python_processes"
}

check_api_health() {
    if command -v curl &> /dev/null; then
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/health" 2>/dev/null || echo "000")
        if [ "$http_code" == "200" ]; then
            echo "健康"
        else
            echo "异常 ($http_code)"
        fi
    else
        echo "未知"
    fi
}

check_memory_pressure() {
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local used_mem=$(free -m | awk '/^Mem:/ {print $3}')
    local mem_percent=$((used_mem * 100 / total_mem))

    if [ "$mem_percent" -ge 95 ]; then
        echo "${RED}严重${NC}"
        return 2
    elif [ "$mem_percent" -ge 80 ]; then
        echo "${YELLOW}警告${NC}"
        return 1
    else
        echo "${GREEN}正常${NC}"
        return 0
    fi
}

check_2u2g_compliance() {
    # 检查 Node.js 进程的内存使用
    local node_pids=$(pgrep node)
    local total_node_memory=0
    local max_node_memory=0

    for pid in $node_pids; do
        local mem=$(ps -p "$pid" -o rss= | tail -1 | awk '{print $1/1024}')
        total_node_memory=$(echo "$total_node_memory + $mem" | bc)
        if [ $(echo "$mem > $max_node_memory" | bc) -eq 1 ]; then
            max_node_memory=$mem
        fi
    done

    total_node_memory=$(printf "%.0f" "$total_node_memory")
    max_node_memory=$(printf "%.0f" "$max_node_memory")

    # 检查是否符合 2u2g 限制
    local compliance="符合"
    local color="${GREEN}"

    if [ $max_node_memory -gt 250 ]; then
        compliance="${RED}超出${NC}"
        color="${RED}"
    elif [ $max_node_memory -gt 200 ]; then
        compliance="${YELLOW}接近${NC}"
        color="${YELLOW}"
    fi

    echo "$total_node_memory"
    echo "$max_node_memory"
    echo "$compliance"
}

# ============================================
# 显示函数
# ============================================

clear_screen() {
    clear
    echo -e "${CYAN}============================================${NC}"
    echo -e "${CYAN}  CodaGraph-lite 系统监控${NC}"
    echo -e "${CYAN}  版本: 1.0.0 | 2u2g 服务器优化${NC}"
    echo -e "${CYAN}============================================${NC}"
    echo
}

display_header() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[${timestamp}]${NC} ${YELLOW}按 Ctrl+C 退出${NC}"
    echo
}

display_system_info() {
    echo -e "${CYAN}┌─ 系统信息${NC}─────────────────────────────────"
    echo -e "  主机名: ${GREEN}$(hostname)${NC}"
    echo -e "  系统:   ${GREEN}$(uname -s) $(uname -r)${NC}"
    echo -e "  运行时间: ${GREEN}$(uptime -p | sed 's/up //')${NC}"
}

display_cpu_info() {
    local cpu_usage=$(get_cpu_usage)
    echo
    echo -e "${CYAN}┌─ CPU${NC}──────────────────────────────────────────"
    echo -e "  使用率: ${GREEN}${cpu_usage}${NC}"

    # 显示 CPU 负载
    local load_avg=$(uptime | awk -F'load average:' '{print $2}')
    echo -e "  负载:   ${GREEN}${load_avg}${NC}"
}

display_memory_info() {
    local mem_info=$(get_memory_usage)
    local mem_usage=$(echo "$mem_info" | head -1)
    local swap_usage=$(echo "$mem_info" | tail -1)
    local pressure=$(check_memory_pressure)

    echo
    echo -e "${CYAN}┌─ 内存${NC}────────────────────────────────────────"
    echo -e "  RAM 使用:  ${GREEN}${mem_usage}${NC}"
    echo -e "  Swap 使用: ${GREEN}${swap_usage}${NC}"
    echo -e "  内存压力: ${pressure}"
}

display_disk_info() {
    local disk_info=$(get_disk_usage)
    local disk_usage=$(echo "$disk_info" | head -1)
    local disk_avail=$(echo "$disk_info" | tail -1)

    echo
    echo -e "${CYAN}┌─ 磁盘${NC}────────────────────────────────────────"
    echo -e "  使用率: ${GREEN}${disk_usage}${NC}"
    echo -e "  可用:   ${GREEN}${disk_avail}${NC}"
    echo -e "  目录:   ${INSTALL_DIR}"
}

display_service_info() {
    local service_info=$(get_service_status)
    local backend_status=$(echo "$service_info" | head -1)
    local frontend_status=$(echo "$service_info" | tail -1)
    local api_health=$(check_api_health)

    echo
    echo -e "${CYAN}┌─ 服务状态${NC}──────────────────────────────"
    echo -e "  后端服务: ${GREEN}${backend_status}${NC}"
    echo -e "  前端服务: ${GREEN}${frontend_status}${NC}"
    echo -e "  API 健康:  ${GREEN}${api_health}${NC}"
}

display_process_info() {
    local proc_info=$(get_process_info)
    local node_procs=$(echo "$proc_info" | head -1)
    local python_procs=$(echo "$proc_info" | tail -1)

    echo
    echo -e "${CYAN}┌─ 进程${NC}──────────────────────────────────────"
    echo -e "  Node.js 进程: ${GREEN}${node_procs}${NC}"
    echo -e "  Python 进程: ${GREEN}${python_procs}${NC}"
}

display_2u2g_info() {
    local compliance_info=$(check_2u2g_compliance)
    local total_mem=$(echo "$compliance_info" | head -1)
    local max_mem=$(echo "$compliance_info" | tail -2 | head -1)
    local compliance=$(echo "$compliance_info" | tail -1)

    echo
    echo -e "${CYAN}┌─ 2u2g 合规性${NC}──────────────────────────"
    echo -e "  Node.js 总内存: ${GREEN}${total_mem}MB${NC}"
    echo -e "  单进程最大:   ${GREEN}${max_mem}MB${NC}"
    echo -e "  限制:         ${GREEN}200MB${NC}"
    echo -e "  合规状态:     ${compliance}"
}

display_job_info() {
    echo
    echo -e "${CYAN}┌─ 作业队列${NC}──────────────────────────────────"

    # 尝试从 API 获取作业信息
    if command -v curl &> /dev/null; then
        local job_info=$(curl -s "${BACKEND_URL}/api/jobs" 2>/dev/null || echo '{"pending":0,"processing":0,"completed":0,"failed":0}')

        local pending=$(echo "$job_info" | grep -o '"pending":[0-9]*' | cut -d':' -f2)
        local processing=$(echo "$job_info" | grep -o '"processing":[0-9]*' | cut -d':' -f2)
        local completed=$(echo "$job_info" | grep -o '"completed":[0-9]*' | cut -d':' -f2)
        local failed=$(echo "$job_info" | grep -o '"failed":[0-9]*' | cut -d':' -f2)

        echo -e "  待处理: ${YELLOW}${pending}${NC}"
        echo -e "  处理中: ${GREEN}${processing}${NC}"
        echo -e "  已完成: ${GREEN}${completed}${NC}"
        echo -e "  失败:   ${RED}${failed}${NC}"
    else
        echo -e "  信息: ${YELLOW}curl 不可用${NC}"
    fi
}

display_alerts() {
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local used_mem=$(free -m | awk '/^Mem:/ {print $3}')
    local mem_percent=$((used_mem * 100 / total_mem))
    local swap_total=$(free -m | awk '/^Swap:/ {print $2}')
    local swap_used=$(free -m | awk '/^Swap:/ {print $3}')

    local alerts=()

    if [ $mem_percent -ge 95 ]; then
        alerts+=("严重: 内存使用率 ${mem_percent}%")
    elif [ $mem_percent -ge 80 ]; then
        alerts+=("警告: 内存使用率 ${mem_percent}%")
    fi

    if [ $swap_total -gt 0 ] && $swap_used -gt 0 ]; then
        alerts+=("警告: 正在使用 Swap")
    fi

    if [ ${#alerts[@]} -gt 0 ]; then
        echo
        echo -e "${CYAN}┌─ 告警${NC}────────────────────────────────────────"
        for alert in "${alerts[@]}"; do
            if [[ $alert == 严重* ]]; then
                echo -e "  ${RED}${alert}${NC}"
            else
                echo -e "  ${YELLOW}${alert}${NC}"
            fi
        done
    fi
}

display_footer() {
    echo
    echo -e "${CYAN}============================================${NC}"
    echo -e "  前端: ${GREEN}http://localhost:3000${NC}"
    echo -e "  后端: ${GREEN}http://localhost:7900${NC}"
    echo -e "${CYAN}============================================${NC}"
}

# ============================================
# 主程序
# ============================================

main() {
    # 解析参数
    for arg in "$@"; do
        case $arg in
            --continuous)
                CONTINUOUS_MODE=true
                ;;
            --interval=*)
                INTERVAL="${arg#*=}"
                ;;
            -h|--help)
                echo "使用方法:"
                echo "  bash deploy/monitor.sh [--continuous] [--interval=SECONDS]"
                echo
                echo "选项:"
                echo "  --continuous       持续监控模式（按 Ctrl+C 退出）"
                echo "  --interval=SECONDS  刷新间隔（默认: 5秒）"
                echo "  --help, -h        显示此帮助信息"
                exit 0
                ;;
        esac
    done

    # 创建日志目录
    mkdir -p "$(dirname "$LOG_FILE")"

    # 持续监控模式
    if [ "$CONTINUOUS_MODE" = true ]; then
        trap 'echo; log_monitor "监控已停止"; exit 0' INT TERM

        log_monitor "开始持续监控"

        while true; do
            clear_screen
            display_header
            display_system_info
            display_cpu_info
            display_memory_info
            display_disk_info
            display_service_info
            display_process_info
            display_2u2g_info
            display_job_info
            display_alerts
            display_footer

            sleep "$INTERVAL"
        done
    else
        # 单次检查模式
        clear_screen
        display_header
        display_system_info
        display_cpu_info
        display_memory_info
        display_disk_info
        display_service_info
        display_process_info
        display_2u2g_info
        display_alerts
        display_footer
    fi
}

# 运行主程序
main "$@"
