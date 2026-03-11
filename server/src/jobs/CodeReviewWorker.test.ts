const queueServiceMock = {
  recoverInterruptedJobs: jest.fn(() => ({
    recoveredCount: 1,
    recoveredJobIds: [9326],
  })),
  getNextJob: jest.fn(() => null),
  completeJob: jest.fn(),
  failJob: jest.fn(),
};

const reviewExecutionServiceMock = {
  execute: jest.fn(),
  markCancelled: jest.fn(),
  markFailed: jest.fn(),
};

jest.mock('./QueueService', () => ({
  getQueueService: () => queueServiceMock,
}));

jest.mock('../services/ReviewExecutionService', () => ({
  getReviewExecutionService: () => reviewExecutionServiceMock,
}));

import { CodeReviewWorker } from './CodeReviewWorker';

describe('CodeReviewWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recovers interrupted jobs when the worker starts', async () => {
    const worker = new CodeReviewWorker({});

    await worker.start();
    await worker.stop();

    expect(queueServiceMock.recoverInterruptedJobs).toHaveBeenCalledTimes(1);
  });
});
