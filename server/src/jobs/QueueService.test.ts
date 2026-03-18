const jobModelMock = {
  create: jest.fn(),
  findNext: jest.fn(),
  markProcessing: jest.fn(),
  findById: jest.fn(),
  markPending: jest.fn(),
  findProcessing: jest.fn(),
  markComplete: jest.fn(),
  markFailed: jest.fn(),
  markCancelled: jest.fn(),
  markDead: jest.fn(),
  update: jest.fn(),
  getQueueStats: jest.fn(() => ({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead: 0,
    avgProcessingTime: 0,
  })),
};

const jobLogModelMock = {
  create: jest.fn(),
};

const analysisModelMock = {
  markPending: jest.fn(),
};

const analysisJobModelMock = {
  markPending: jest.fn(),
};

jest.mock('../models/Job', () => ({
  getJobModel: () => jobModelMock,
}));

jest.mock('../models/JobLog', () => ({
  getJobLogModel: () => jobLogModelMock,
}));

jest.mock('../models/Analysis', () => ({
  getAnalysisModel: () => analysisModelMock,
}));

jest.mock('../models/AnalysisJob', () => ({
  getAnalysisJobModel: () => analysisJobModelMock,
}));

import { QueueService } from './QueueService';

describe('QueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobModelMock.findProcessing.mockReturnValue([]);
  });

  it('recovers interrupted processing jobs back to pending state on restart', () => {
    jobModelMock.findProcessing.mockReturnValue([
      {
        id: 9326,
        payload: JSON.stringify({
          platform: 'gitee',
          repo_name: 'mars167/go-view',
          pr_number: '1',
          analysis_id: '9239',
          analysis_job_id: '38',
        }),
      },
    ]);

    const service = new QueueService();
    const result = service.recoverInterruptedJobs();

    expect(jobModelMock.markPending).toHaveBeenCalledWith(9326);
    expect(analysisModelMock.markPending).toHaveBeenCalledWith(9239);
    expect(analysisJobModelMock.markPending).toHaveBeenCalledWith(38);
    expect(jobLogModelMock.create).toHaveBeenCalledWith(
      9326,
      'warn',
      '检测到服务重启或进程退出，作业已自动恢复为待处理状态'
    );
    expect(result).toEqual({
      recoveredCount: 1,
      recoveredJobIds: [9326],
    });
  });
});
