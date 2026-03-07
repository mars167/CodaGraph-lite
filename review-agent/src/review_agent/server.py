"""
Review Agent gRPC Server
用于代码审查的智能代理服务
"""
import os
import signal
import sys
from pathlib import Path
from dotenv import load_dotenv

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# 加载环境变量
load_dotenv()

GRPC_PORT = int(os.getenv('REVIEW_AGENT_PORT', '50051'))


class ReviewAgentService:
    """Review Agent 服务类"""

    def __init__(self):
        self.server = None

    def start(self):
        """启动 gRPC 服务器"""
        print(f"🚀 Review Agent 服务启动在端口 {GRPC_PORT}")
        # TODO: 实现 gRPC 服务启动逻辑
        # 目前只是占位符，稍后实现完整的 gRPC 服务

    def stop(self):
        """停止 gRPC 服务器"""
        print("🛑 Review Agent 服务停止")
        if self.server:
            self.server.stop(None)
            self.server.wait_for_termination()


def signal_handler(signum, frame):
    """信号处理器"""
    print(f"\n收到信号 {signum}, 正在关闭...")
    sys.exit(0)


def main():
    """主函数"""
    # 注册信号处理器
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # 启动服务
    service = ReviewAgentService()
    service.start()


if __name__ == '__main__':
    main()
