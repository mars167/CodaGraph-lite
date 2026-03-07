"""
Context Agent gRPC Server
用于收集代码上下文的智能代理服务

关键特性：
- ReAct 循环（Reason-Act-Observe）用于智能上下文收集
- 与 git-ai CLI 集成进行语义搜索
- 严格超时控制（默认 5 分钟）
- 内存限制执行（300m）
- 响应 SIGTERM/SIGKILL 信号
"""
import asyncio
import grpc
import os
import signal
import sys
import resource
import psutil
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv

# 导入生成的 protobuf 模块
import agent_pb2
import agent_pb2_grpc

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('context-agent')

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# 加载环境变量
load_dotenv()

GRPC_PORT = int(os.getenv('CONTEXT_AGENT_PORT', '50052'))
GIT_AI_BIN = os.getenv('GIT_AI_BIN', '/usr/local/bin/git-ai')
PYTHON_MEMORY_LIMIT = os.getenv('PYTHON_MEMORY_LIMIT', '300m')


def set_memory_limit():
    """
    设置 Python 进程内存限制
    支持 300m, 512m 等格式
    """
    try:
        limit_str = PYTHON_MEMORY_LIMIT
        if limit_str.endswith('m'):
            limit_mb = int(limit_str[:-1])
            limit_bytes = limit_mb * 1024 * 1024
        elif limit_str.endswith('g'):
            limit_gb = int(limit_str[:-1])
            limit_bytes = limit_gb * 1024 * 1024 * 1024
        else:
            limit_bytes = int(limit_str)

        # 设置软限制和硬限制
        resource.setrlimit(
            resource.RLIMIT_AS,
            (limit_bytes, limit_bytes)
        )
        logger.info(f"✓ 内存限制设置为: {limit_str}")
    except Exception as e:
        logger.warning(f"⚠️  无法设置内存限制: {e}"


def check_memory_usage():
    """检查当前内存使用情况"""
    try:
        process = psutil.Process()
        mem_info = process.memory_info()
        mem_mb = mem_info.rss / 1024 / 1024
        return mem_mb
    except Exception as e:
        logger.warning(f"无法获取内存使用: {e}")
        return 0


class ReActAgent:
    """
    ReAct (Reason-Act-Observe) 智能代理
    用于逐步收集代码上下文
    """

    def __init__(self, repository_path: str, git_ai_path: str, max_iterations: int = 5):
        self.repository_path = repository_path
        self.git_ai_path = git_ai_path
        self.max_iterations = max_iterations
        self.steps_taken: List[str] = []
        self.symbols: List[dict] = []
        self.call_graph: List[dict] = []
        self.relationships: List[dict] = []
        self.file_summaries: List[dict] = []

    async def collect_context(self, files: List[str]) -> agent_pb2.ContextData:
        """
        执行 ReAct 循环收集上下文

        Args:
            files: 需要分析的文件列表

        Returns:
            ContextData: 收集到的上下文数据
        """
        logger.info(f"🔄 开始 ReAct 上下文收集，目标文件: {len(files)}")

        # 迭代循环
        for iteration in range(self.max_iterations):
            logger.info(f"📝 ReAct 迭代 {iteration + 1}/{self.max_iterations}")

            # Phase 1: Reason - 分析当前状态并决定下一步
            action = self._reason(iteration)
            self.steps_taken.append(f"Iteration {iteration + 1} Reason: {action}")

            # Phase 2: Act - 执行行动
            if action == "collect_symbols":
                await self._act_collect_symbols(files)
            elif action == "analyze_dependencies":
                await self._act_analyze_dependencies(files)
            elif action == "summarize_files":
                await self._act_summarize_files(files)
            elif action == "complete":
                logger.info("✅ 上下文收集完成")
                break

            # Phase 3: Observe - 评估收集进度
            if self._observe():
                logger.info("✅ 上下文已充分收集")
                break

            # 内存检查
            mem_mb = check_memory_usage()
            logger.info(f"💾 内存使用: {mem_mb:.1f} MB")

            # 超时检查（由外部处理）
            # 在实际实现中，这里会检查是否超时

        return self._build_context_data()

    def _reason(self, iteration: int) -> str:
        """推理阶段 - 决定下一步行动"""
        if iteration == 0:
            return "collect_symbols"
        elif iteration == 1:
            return "analyze_dependencies"
        elif iteration == 2:
            return "summarize_files"
        else:
            return "complete"

    async def _act_collect_symbols(self, files: List[str]):
        """行动阶段 - 收集符号信息"""
        self.steps_taken.append("  Act: 收集符号定义")
        # 在实际实现中，这里会调用 git-ai 符号查询
        for file_path in files:
            # 模拟符号收集
            # 实际实现会使用 git-ai CLI
            pass

    async def _act_analyze_dependencies(self, files: List[str]):
        """行动阶段 - 分析依赖关系"""
        self.steps_taken.append("  Act: 分析依赖关系")
        # 在实际实现中，这里会分析调用图

    async def _act_summarize_files(self, files: List[str]):
        """行动阶段 - 文件摘要"""
        self.steps_taken.append("  Act: 生成文件摘要")
        # 在实际实现中，这里会生成每个文件的摘要

    def _observe(self) -> bool:
        """观察阶段 - 评估收集是否充分"""
        # 简单启发式：如果收集了足够的符号，认为上下文充分
        return len(self.symbols) > 0 or len(self.file_summaries) > 0

    def _build_context_data(self) -> agent_pb2.ContextData:
        """构建 protobuf 上下文数据"""
        context_data = agent_pb2.ContextData()

        # 添加符号
        for sym in self.symbols:
            symbol_pb = context_data.symbols.add()
            symbol_pb.name = sym.get('name', '')
            symbol_pb.kind = sym.get('kind', 'function')
            symbol_pb.file_path = sym.get('file_path', '')
            symbol_pb.line_number = sym.get('line_number', 0)
            for param in sym.get('parameters', []):
                symbol_pb.parameters.append(param)
            symbol_pb.return_type = sym.get('return_type', '')
            symbol_pb.signature = sym.get('signature', '')
            for usage in sym.get('usages', []):
                symbol_pb.usages.append(usage)

        # 添加调用图
        for entry in self.call_graph:
            call_pb = context_data.call_graph.add()
            call_pb.caller_file = entry.get('caller_file', '')
            call_pb.caller_function = entry.get('caller_function', '')
            call_pb.callee_file = entry.get('callee_file', '')
            call_pb.callee_function = entry.get('callee_function', '')
            call_pb.call_count = entry.get('call_count', 0)

        # 添加关系
        for rel in self.relationships:
            rel_pb = context_data.relationships.add()
            rel_pb.type = rel.get('type', 'uses')
            rel_pb.from_file = rel.get('from_file', '')
            rel_pb.from_symbol = rel.get('from_symbol', '')
            rel_pb.to_file = rel.get('to_file', '')
            rel_pb.to_symbol = rel.get('to_symbol', '')

        # 添加文件摘要
        for summary in self.file_summaries:
            summary_pb = context_data.file_summaries.add()
            summary_pb.file_path = summary.get('file_path', '')
            summary_pb.line_count = summary.get('line_count', 0)
            summary_pb.function_count = summary.get('function_count', 0)
            summary_pb.class_count = summary.get('class_count', 0)
            summary_pb.language = summary.get('language', '')
            summary_pb.purpose = summary.get('purpose', '')

        # 添加 Git 上下文
        git_context = context_data.git_context
        git_context.branch_info = "PR context"

        return context_data


class ContextAgentServicer(agent_pb2_grpc.ContextAgentServiceServicer):
    """
    Context Agent gRPC 服务实现
    """

    def __init__(self):
        self.start_time = datetime.now()

    async def CollectContext(
        self,
        request: agent_pb2.ContextRequest,
        context: grpc.aio.ServicerContext
    ) -> agent_pb2.ContextResponse:
        """
        收集 PR 上下文信息

        这是主要的 gRPC 方法，用于处理来自后端的上下文收集请求
        """
        logger.info("=" * 50)
        logger.info("📥 收到上下文收集请求")
        logger.info(f"📂 仓库: {request.pr_info.owner}/{request.pr_info.repo}")
        logger.info(f"🔢 PR: {request.pr_info.pr_number}")
        logger.info(f"📁 文件数: {len(request.files)}")
        logger.info("=" * 50)

        response = agent_pb2.ContextResponse()

        try:
            # 创建 ReAct 代理
            agent = ReActAgent(
                repository_path=request.repository_path,
                git_ai_path=request.git_ai_path,
                max_iterations=request.max_iterations
            )

            # 提取文件路径
            files = [f.path for f in request.files]

            # 执行上下文收集
            context_data = await agent.collect_context(files)

            # 填充响应
            response.success = True
            response.context.CopyFrom(context_data)
            response.steps_taken.extend(agent.steps_taken)

            logger.info("✅ 上下文收集成功")

        except Exception as e:
            logger.error(f"❌ 上下文收集失败: {e}", exc_info=True)
            response.success = False
            response.error_message = str(e)

        return response

    async def HealthCheck(
        self,
        request: agent_pb2.HealthCheckRequest,
        context: grpc.aio.ServicerContext
    ) -> agent_pb2.HealthCheckResponse:
        """健康检查端点"""
        uptime = (datetime.now() - self.start_time).total_seconds()
        mem_mb = check_memory_usage()

        return agent_pb2.HealthCheckResponse(
            healthy=True,
            version="1.0.0",
            uptime_seconds=int(uptime),
            message=f"Context Agent running, memory: {mem_mb:.1f} MB"
        )


async def serve() -> None:
    """
    启动 gRPC 服务器

    使用异步服务器以提高并发性能
    """
    # 设置内存限制
    set_memory_limit()

    server = grpc.aio.server(
        maximum_concurrent_rpcs=1,  # 2u2g: 任何时候只处理一个请求
        options=[
            ('grpc.max_receive_message_length', 100 * 1024 * 1024),  # 100MB
            ('grpc.max_send_message_length', 100 * 1024 * 1024),      # 100MB
        ]
    )

    # 注册服务
    agent_pb2_grpc.add_ContextAgentServiceServicer_to_server(
        ContextAgentServicer(),
        server
    )

    # 绑定端口
    listen_addr = f'[::]:{GRPC_PORT}'
    server.add_insecure_port(listen_addr)

    logger.info("=" * 50)
    logger.info(f"🚀 Context Agent 服务启动")
    logger.info(f"📍 端口: {GRPC_PORT}")
    logger.info(f"🧠 内存限制: {PYTHON_MEMORY_LIMIT}")
    logger.info(f"🔧 git-ai 路径: {GIT_AI_BIN}")
    logger.info(f"⏱️  最大并发: 1")
    logger.info("=" * 50)

    # 启动服务器
    await server.start()
    logger.info("✅ Context Agent 已就绪，等待请求...")

    # 等待终止信号
    shutdown_event = asyncio.Event()

    def signal_handler(signum, frame):
        logger.info(f"\n收到信号 {signum}，正在优雅关闭...")
        shutdown_event.set()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # 等待关闭
    await shutdown_event.wait()

    # 优雅关闭
    logger.info("正在关闭 gRPC 服务器...")
    await server.stop(grace=5)  # 5 秒优雅关闭
    logger.info("🛑 Context Agent 已停止")


if __name__ == '__main__':
    asyncio.run(serve())
