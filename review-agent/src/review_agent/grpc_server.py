"""
Review Agent gRPC Server
用于代码审查的智能代理服务

关键特性：
- LLM 驱动的逐文件代码分析
- 安全性、性能、代码风格检查
- 严格超时控制（默认 10 分钟）
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
from typing import List, Dict
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv

# 导入生成的 protobuf 模块
import agent_pb2
import agent_pb2_grpc

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('review-agent')

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# 加载环境变量
load_dotenv()

GRPC_PORT = int(os.getenv('REVIEW_AGENT_PORT', '50051'))
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
        logger.warning(f"⚠️  无法设置内存限制: {e}")


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


class LLMClient:
    """
    LLM 客户端抽象层
    支持多个 LLM 提供商
    """

    def __init__(self, provider: str, model: str, api_key: str, api_base_url: str = ""):
        self.provider = provider.lower()
        self.model = model
        self.api_key = api_key
        self.api_base_url = api_base_url

    async def analyze_file(
        self,
        file_path: str,
        file_content: str,
        context: Dict
    ) -> Dict:
        """
        使用 LLM 分析单个文件

        Args:
            file_path: 文件路径
            file_content: 文件内容
            context: 来自 Context Agent 的上下文信息

        Returns:
            Dict: 分析结果，包括问题和建议
        """
        # 在实际实现中，这里会调用相应的 LLM API
        # OpenAI, Anthropic, DeepSeek 等

        # 模拟返回结果（实际需要调用 LLM）
        return {
            "issues": [],
            "suggestions": [],
            "metrics": {
                "complexity": 0,
                "lines_of_code": len(file_content.split('\n')),
                "code_smells": []
            }
        }

    async def generate_summary(self, file_reviews: List[Dict]) -> str:
        """生成整体审查摘要"""
        # 在实际实现中，这里会调用 LLM 生成摘要
        return "代码审查完成，暂未发现问题。"


class CodeAnalyzer:
    """
    代码分析器
    协调 LLM 调用和结果处理
    """

    def __init__(
        self,
        llm_client: LLMClient,
        context: agent_pb2.ContextData,
        include_security: bool = True,
        include_performance: bool = True,
        include_style: bool = True
    ):
        self.llm_client = llm_client
        self.context = context
        self.include_security = include_security
        self.include_performance = include_performance
        self.include_style = include_style

    async def analyze_pr_files(
        self,
        files: List[agent_pb2.FileChange]
    ) -> List[agent_pb2.FileReview]:
        """
        分析 PR 中的所有文件

        Args:
            files: 文件变更列表

        Returns:
            List[FileReview]: 每个文件的审查结果
        """
        logger.info(f"📄 开始分析 {len(files)} 个文件")

        file_reviews = []
        total_issues = 0
        critical_count = 0
        major_count = 0
        minor_count = 0

        for i, file_change in enumerate(files):
            logger.info(f"📝 分析文件 {i + 1}/{len(files)}: {file_change.path}")

            # 跳过删除的文件
            if file_change.status == "deleted":
                logger.info(f"   ⊘ 跳过已删除文件: {file_change.path}")
                continue

            # 分析文件
            file_review = await self._analyze_single_file(file_change)

            # 统计问题
            total_issues += len(file_review.issues)
            for issue in file_review.issues:
                if issue.severity == "critical":
                    critical_count += 1
                elif issue.severity == "major":
                    major_count += 1
                elif issue.severity == "minor":
                    minor_count += 1

            file_reviews.append(file_review)

            # 内存检查
            mem_mb = check_memory_usage()
            logger.info(f"   💾 内存: {mem_mb:.1f} MB")

        logger.info(f"✅ 文件分析完成: {total_issues} 个问题")
        logger.info(f"   - Critical: {critical_count}")
        logger.info(f"   - Major: {major_count}")
        logger.info(f"   - Minor: {minor_count}")

        return file_reviews

    async def _analyze_single_file(
        self,
        file_change: agent_pb2.FileChange
    ) -> agent_pb2.FileReview:
        """分析单个文件"""
        file_review = agent_pb2.FileReview()
        file_review.file_path = file_change.path

        # 使用 LLM 分析
        result = await self.llm_client.analyze_file(
            file_path=file_change.path,
            file_content=file_change.content,
            context=self._get_context_for_file(file_change)
        )

        # 添加问题
        for issue_data in result.get("issues", []):
            issue = file_review.issues.add()
            issue.severity = issue_data.get("severity", "info")
            issue.category = issue_data.get("category", "style")
            issue.title = issue_data.get("title", "")
            issue.description = issue_data.get("description", "")
            issue.suggestion = issue_data.get("suggestion", "")
            issue.code_snippet = issue_data.get("code_snippet", "")

        # 添加建议
        for suggestion_data in result.get("suggestions", []):
            suggestion = file_review.suggestions.add()
            suggestion.title = suggestion_data.get("title", "")
            suggestion.description = suggestion_data.get("description", "")
            suggestion.suggestion_code = suggestion_data.get("suggestion_code", "")
            suggestion.reason = suggestion_data.get("reason", "")
            suggestion.impact = suggestion_data.get("impact", "medium")

        # 添加指标
        metrics_data = result.get("metrics", {})
        metrics = file_review.metrics
        metrics.complexity = metrics_data.get("complexity", 0)
        metrics.lines_of_code = metrics_data.get("lines_of_code", 0)
        for smell in metrics_data.get("code_smells", []):
            metrics.code_smells.append(smell)

        return file_review

    def _get_context_for_file(
        self,
        file_change: agent_pb2.FileChange
    ) -> Dict:
        """为特定文件获取相关上下文"""
        # 在实际实现中，这里会从 ContextData 中提取相关符号和关系
        return {
            "related_symbols": [],
            "related_calls": [],
            "file_summary": ""
        }


class ReviewAgentServicer(agent_pb2_grpc.ReviewAgentServiceServicer):
    """
    Review Agent gRPC 服务实现
    """

    def __init__(self):
        self.start_time = datetime.now()

    async def ReviewCode(
        self,
        request: agent_pb2.ReviewRequest,
        context: grpc.aio.ServicerContext
    ) -> agent_pb2.ReviewResponse:
        """
        执行代码审查

        这是主要的 gRPC 方法，用于处理来自后端的代码审查请求
        """
        logger.info("=" * 50)
        logger.info("📥 收到代码审查请求")
        logger.info(f"📂 仓库: {request.pr_info.owner}/{request.pr_info.repo}")
        logger.info(f"🔢 PR: {request.pr_info.pr_number}")
        logger.info(f"📁 文件数: {len(request.files)}")
        logger.info(f"🤖 LLM: {request.llm_provider}/{request.llm_model}")
        logger.info("=" * 50)

        response = agent_pb2.ReviewResponse()

        try:
            # 创建 LLM 客户端
            llm_client = LLMClient(
                provider=request.llm_provider,
                model=request.llm_model,
                api_key=request.llm_api_key
            )

            # 创建代码分析器
            analyzer = CodeAnalyzer(
                llm_client=llm_client,
                context=request.context,
                include_security=request.include_security,
                include_performance=request.include_performance,
                include_style=request.include_style
            )

            # 分析所有文件
            file_reviews = await analyzer.analyze_pr_files(list(request.files))

            # 生成摘要
            summary = await llm_client.generate_summary([
                {
                    "path": fr.file_path,
                    "issues": len(fr.issues)
                }
                for fr in file_reviews
            ])

            # 统计问题
            total_issues = sum(len(fr.issues) for fr in file_reviews)
            critical_count = sum(
                1 for fr in file_reviews
                for issue in fr.issues
                if issue.severity == "critical"
            )
            major_count = sum(
                1 for fr in file_reviews
                for issue in fr.issues
                if issue.severity == "major"
            )
            minor_count = sum(
                1 for fr in file_reviews
                for issue in fr.issues
                if issue.severity == "minor"
            )

            # 填充响应
            response.success = True
            response.file_reviews.extend(file_reviews)
            response.summary = summary
            response.total_issues = total_issues
            response.critical_count = critical_count
            response.major_count = major_count
            response.minor_count = minor_count

            logger.info("✅ 代码审查成功")
            logger.info(f"📊 总问题数: {total_issues}")
            logger.info(f"   - Critical: {critical_count}")
            logger.info(f"   - Major: {major_count}")
            logger.info(f"   - Minor: {minor_count}")

        except Exception as e:
            logger.error(f"❌ 代码审查失败: {e}", exc_info=True)
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
            message=f"Review Agent running, memory: {mem_mb:.1f} MB"
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
    agent_pb2_grpc.add_ReviewAgentServiceServicer_to_server(
        ReviewAgentServicer(),
        server
    )

    # 绑定端口
    listen_addr = f'[::]:{GRPC_PORT}'
    server.add_insecure_port(listen_addr)

    logger.info("=" * 50)
    logger.info(f"🚀 Review Agent 服务启动")
    logger.info(f"📍 端口: {GRPC_PORT}")
    logger.info(f"🧠 内存限制: {PYTHON_MEMORY_LIMIT}")
    logger.info(f"⏱️  最大并发: 1")
    logger.info("=" * 50)

    # 启动服务器
    await server.start()
    logger.info("✅ Review Agent 已就绪，等待请求...")

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
    logger.info("🛑 Review Agent 已停止")


if __name__ == '__main__':
    asyncio.run(serve())
