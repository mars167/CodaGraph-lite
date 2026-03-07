/**
 * 作业队列 API 路由
 */

import express, { Request, Response } from 'express';
import { getQueueService } from '../jobs/QueueService';
import { getJobLogModel } from '../models/JobLog';
import { getAnalysisModel } from '../models/Analysis';
import { getAnalysisJobModel } from '../models/AnalysisJob';
import type { Job, JobType, QueueJobStatus } from '../models/types';

type SortOrder = 'ASC' | 'DESC';

const router = express.Router();

type ParsedJobPayload = {
  analysis_id?: string | number;
  platform?: string;
  repo_name?: string;
  pr_number?: string | number;
  pr_title?: string;
  trigger_source?: string;
};

function parseJobPayload(rawPayload: string): ParsedJobPayload {
  try {
    return JSON.parse(rawPayload) as ParsedJobPayload;
  } catch {
    return {};
  }
}

function resolveJobAnalysis(payload: ParsedJobPayload) {
  if (payload.analysis_id) {
    return getAnalysisModel().findById(Number(payload.analysis_id));
  }

  if (payload.platform && payload.repo_name && payload.pr_number) {
    const [owner, repoName] = payload.repo_name.includes('/')
      ? payload.repo_name.split('/', 2)
      : ['', payload.repo_name];

    if (owner && repoName) {
      return getAnalysisModel().findByPR(
        payload.platform as any,
        owner,
        repoName,
        Number(payload.pr_number)
      );
    }
  }

  return null;
}

function enrichJob(job: Job) {
  const payload = parseJobPayload(job.payload);
  const analysis = resolveJobAnalysis(payload);

  return {
    ...job,
    repo_name: typeof payload.repo_name === 'string'
      ? payload.repo_name
      : analysis
        ? `${analysis.owner}/${analysis.repo_name}`
        : null,
    pr_number: payload.pr_number !== undefined
      ? Number(payload.pr_number)
      : analysis?.pr_number ?? null,
    pr_title: typeof payload.pr_title === 'string'
      ? payload.pr_title
      : analysis?.pr_title || null,
    trigger_source: typeof payload.trigger_source === 'string' ? payload.trigger_source : null,
  };
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, payload, priority = 5 } = req.body;

    if (!type || !payload) {
      return res.status(400).json({
        error: '缺少必填字段: type, payload',
      });
    }

    const queueService = getQueueService();
    const result = await queueService.createJob(
      type as JobType,
      payload,
      priority
    );

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(201).json({
      id: result.id,
      message: '作业已创建',
    });
  } catch (error) {
    console.error('创建作业失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      type,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const validatedSortOrder = ((sortOrder as string).toUpperCase() as SortOrder) || 'DESC';
    if (validatedSortOrder !== 'ASC' && validatedSortOrder !== 'DESC') {
      return res.status(400).json({ error: '无效的排序顺序，必须是 ASC 或 DESC' });
    }

    const queueService = getQueueService();
    const jobModel = queueService.getJobModel();
    const limitNum = parseInt(limit as string, 10);
    const pageNum = parseInt(page as string, 10);

    let jobs;
    let total;
    if (status) {
      jobs = jobModel.findByStatus(status as QueueJobStatus, limitNum);
      total = jobModel.countByStatus(status as QueueJobStatus);
    } else if (type) {
      jobs = jobModel.findByType(type as JobType, limitNum);
      total = jobModel.findByType(type as JobType, 100000).length;
    } else {
      jobs = jobModel.findAll({
        page: pageNum,
        limit: limitNum,
        sortBy: sortBy as string,
        sortOrder: validatedSortOrder,
      });
      total = jobModel.count();
    }

    return res.json({
      jobs: jobs.map((job) => enrichJob(job)),
      count: total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('获取作业列表失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  console.log('获取队列统计请求', req.query);
  try {
    const queueService = getQueueService();
    const stats = queueService.getQueueStatus();
    const config = queueService.getConfig();

    return res.json({
      ...stats,
      config: {
        maxConcurrentJobs: config.maxConcurrentJobs,
        pollingIntervalMs: config.pollingIntervalMs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取队列统计失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const queueService = getQueueService();
    const jobModel = queueService.getJobModel();
    const total = jobModel.count();
    const pending = jobModel.countByStatus('pending');
    const processing = jobModel.countByStatus('processing');
    const completed = jobModel.countByStatus('completed');
    const failed = jobModel.countByStatus('failed');
    const dead = jobModel.countByStatus('dead');
    const recentJobs = jobModel.findAll({ limit: parseInt(limit as string, 10) });

    let avgProcessingTime = 0;
    let completedCount = 0;

    for (const job of recentJobs) {
      if (job.status === 'completed' && job.started_at && job.completed_at) {
        const started = new Date(job.started_at as string).getTime();
        const completedAt = new Date(job.completed_at as string).getTime();
        avgProcessingTime += (completedAt - started);
        completedCount++;
      }
    }

    if (completedCount > 0) {
      avgProcessingTime = Math.round(avgProcessingTime / completedCount);
    }

    return res.json({
      total,
      byStatus: { pending, processing, completed, failed, dead },
      avgProcessingTimeMs: avgProcessingTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取作业指标失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/dead', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const queueService = getQueueService();
    const jobModel = queueService.getJobModel();
    const deadJobs = jobModel.findByStatus('dead', parseInt(limit as string, 10));

    return res.json({
      jobs: deadJobs,
      count: deadJobs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取死信队列失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: '无效的作业 ID' });
    }

    const job = getQueueService().getJobModel().findById(jobId);
    if (!job) {
      return res.status(404).json({ error: '作业不存在' });
    }

    let analysis = null;
    try {
      analysis = resolveJobAnalysis(parseJobPayload(job.payload));
    } catch {
      analysis = null;
    }

    return res.json({ job, analysis });
  } catch (error) {
    console.error('获取作业失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(id, 10);
    const limit = parseInt((Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit || '200') as string, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: '无效的作业 ID' });
    }

    const job = getQueueService().getJobModel().findById(jobId);
    if (!job) {
      return res.status(404).json({ error: '作业不存在' });
    }

    const logs = getJobLogModel().findByJobId(jobId, Number.isNaN(limit) ? 200 : limit);
    return res.json({
      jobId,
      logs: logs.reverse(),
    });
  } catch (error) {
    console.error('获取作业日志失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: '无效的作业 ID' });
    }

    const success = getQueueService().cancelJob(jobId);
    if (!success) {
      return res.status(400).json({ error: '作业不存在或无法取消' });
    }

    return res.json({ message: '作业已取消' });
  } catch (error) {
    console.error('取消作业失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    return res.status(400).json({ error: '无效的作业 ID' });
  }

  const success = getQueueService().cancelJob(jobId);
  if (!success) {
    return res.status(400).json({ error: '作业不存在或无法取消' });
  }

  return res.json({ message: '作业已取消' });
});

router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return res.status(400).json({ error: '无效的作业 ID' });
    }

    const queueService = getQueueService();
    const jobModel = queueService.getJobModel();
    const job = jobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: '作业不存在' });
    }

    if (!['failed', 'cancelled', 'completed', 'dead'].includes(job.status)) {
      return res.status(400).json({ error: '当前作业状态不支持重试' });
    }

    let payload = JSON.parse(job.payload) as Record<string, unknown>;
    const rawAnalysisId = payload.analysis_id;
    if (rawAnalysisId !== undefined) {
      const oldAnalysis = getAnalysisModel().findById(Number(rawAnalysisId));
      if (oldAnalysis) {
        const newAnalysis = getAnalysisModel().create({
          platform: oldAnalysis.platform,
          owner: oldAnalysis.owner,
          repo_name: oldAnalysis.repo_name,
          pr_number: oldAnalysis.pr_number,
          pr_title: oldAnalysis.pr_title,
          pr_author: oldAnalysis.pr_author,
          base_commit: oldAnalysis.base_commit,
          head_commit: oldAnalysis.head_commit,
        });
        const newAnalysisJob = getAnalysisJobModel().create(newAnalysis.id, 'cloning');
        payload = {
          ...payload,
          analysis_id: String(newAnalysis.id),
          analysis_job_id: String(newAnalysisJob.id),
          repo_name: `${newAnalysis.owner}/${newAnalysis.repo_name}`,
          pr_number: String(newAnalysis.pr_number),
          platform: newAnalysis.platform,
        };
      }
    }

    const recreated = await queueService.createJob(
      job.type as JobType,
      payload as any,
      job.priority
    );
    if (recreated.error) {
      return res.status(400).json({ error: '作业不存在或无法重试' });
    }

    getJobLogModel().create(recreated.id, 'info', `作业由 #${jobId} 手动重试创建`);

    return res.json({
      message: '作业已重新排队',
      jobId: recreated.id,
    });
  } catch (error) {
    console.error('重试作业失败:', error);
    return res.status(500).json({
      error: '内部服务器错误',
      details: (error as Error).message,
    });
  }
});

export default router;
