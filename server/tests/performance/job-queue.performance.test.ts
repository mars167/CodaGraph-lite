import { JobQueue } from '../../src/jobs/JobQueue';
import { closeDatabase, initDatabase } from '../../src/database/connection';

describe('Job Queue Performance Tests', () => {
  let jobQueue: JobQueue;

  beforeAll(async () => {
    await initDatabase(':memory:');
    jobQueue = JobQueue.getInstance();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await jobQueue.clear();
  });

  describe('Job Creation Performance', () => {
    it('should create 100 jobs within 1 second', async () => {
      const startTime = Date.now();
      const jobCount = 100;

      const promises = [];
      for (let i = 0; i < jobCount; i++) {
        promises.push(
          jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i },
          })
        );
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(jobCount);
    });

    it('should create 1000 jobs within 10 seconds', async () => {
      const startTime = Date.now();
      const jobCount = 1000;

      const promises = [];
      for (let i = 0; i < jobCount; i++) {
        promises.push(
          jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i },
          })
        );
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(jobCount);
    });
  });

  describe('Job Retrieval Performance', () => {
    beforeEach(async () => {
      const jobCount = 500;
      for (let i = 0; i < jobCount; i++) {
        await jobQueue.addJob({
          type: 'code-review',
          payload: { prNumber: i },
        });
      }
    });

    it('should retrieve next pending job within 10ms', async () => {
      const startTime = Date.now();
      const job = await jobQueue.getNextJob();
      const duration = Date.now() - startTime;

      expect(job).toBeDefined();
      expect(duration).toBeLessThan(10);
    });

    it('should retrieve 100 jobs sequentially within 500ms', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const job = await jobQueue.getNextJob();
        if (job) {
          await jobQueue.updateJobStatus(job.id, 'completed');
        }
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Job Status Update Performance', () => {
    let jobIds: string[] = [];

    beforeEach(async () => {
      jobIds = [];
      for (let i = 0; i < 100; i++) {
        const job = await jobQueue.addJob({
          type: 'code-review',
          payload: { prNumber: i },
        });
        jobIds.push(job.id);
      }
    });

    it('should update 100 job statuses within 200ms', async () => {
      const startTime = Date.now();

      for (const jobId of jobIds) {
        await jobQueue.updateJobStatus(jobId, 'processing');
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent status updates', async () => {
      const startTime = Date.now();

      const promises = jobIds.map((jobId) =>
        jobQueue.updateJobStatus(jobId, 'completed')
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Job Query Performance', () => {
    beforeEach(async () => {
      for (let i = 0; i < 200; i++) {
        await jobQueue.addJob({
          type: 'code-review',
          payload: { prNumber: i },
          priority: i % 3,
        });
      }
    });

    it('should query jobs by status within 50ms', async () => {
      const startTime = Date.now();
      const jobs = await jobQueue.getJobs({ status: 'pending' });
      const duration = Date.now() - startTime;

      expect(jobs.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });

    it('should query jobs by priority within 50ms', async () => {
      const startTime = Date.now();
      const jobs = await jobQueue.getJobs({ priority: 2 });
      const duration = Date.now() - startTime;

      expect(jobs.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });

    it('should get job statistics within 30ms', async () => {
      const startTime = Date.now();
      const stats = await jobQueue.getStats();
      const duration = Date.now() - startTime;

      expect(stats).toBeDefined();
      expect(duration).toBeLessThan(30);
    });
  });

  describe('Job Deletion Performance', () => {
    let jobIds: string[] = [];

    beforeEach(async () => {
      jobIds = [];
      for (let i = 0; i < 100; i++) {
        const job = await jobQueue.addJob({
          type: 'code-review',
          payload: { prNumber: i },
        });
        jobIds.push(job.id);
      }
    });

    it('should delete 100 jobs within 300ms', async () => {
      const startTime = Date.now();

      for (const jobId of jobIds) {
        await jobQueue.deleteJob(jobId);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Queue Throughput', () => {
    it('should process 50 jobs end-to-end within 5 seconds', async () => {
      const jobCount = 50;
      const startTime = Date.now();

      const processJob = async (i: number) => {
        const job = await jobQueue.addJob({
          type: 'code-review',
          payload: { prNumber: i },
        });

        const nextJob = await jobQueue.getNextJob();
        if (nextJob) {
          await jobQueue.updateJobStatus(nextJob.id, 'processing');
          await jobQueue.updateJobStatus(nextJob.id, 'completed');
        }

        return job;
      };

      const promises = [];
      for (let i = 0; i < jobCount; i++) {
        promises.push(processJob(i));
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);

      const stats = await jobQueue.getStats();
      expect(stats.completed).toBe(jobCount);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during job processing', async () => {
        const initialMemory = process.memoryUsage();

        for (let i = 0; i < 1000; i++) {
          await jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i, data: 'x'.repeat(100) },
          });
        }

        const afterCreationMemory = process.memoryUsage();
        const memoryIncrease = afterCreationMemory - initialMemory;

        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

        await jobQueue.clear();

        if (global.gc) {
          global.gc();
        }

        const afterClearMemory = process.memoryUsage();
        const memoryAfterClear = afterClearMemory - initialMemory;

        expect(memoryAfterClear).toBeLessThan(memoryIncrease * 0.5);
      });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent job creation', async () => {
      const concurrentCount = 10;
      const jobsPerThread = 20;

      const createJobs = async () => {
        for (let i = 0; i < jobsPerThread; i++) {
          await jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i },
          });
        }
      };

      const promises = [];
      for (let i = 0; i < concurrentCount; i++) {
        promises.push(createJobs());
      }

      await Promise.all(promises);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(concurrentCount * jobsPerThread);
    });

    it('should handle concurrent reads and writes', async () => {
      const readOps = [];
      const writeOps = [];

      for (let i = 0; i < 50; i++) {
        writeOps.push(
          jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i },
          })
        );
      }

      for (let i = 0; i < 30; i++) {
        readOps.push(jobQueue.getStats());
      }

      await Promise.all([...writeOps, ...readOps]);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(50);
    });
  });

  describe('Stress Tests', () => {
    it('should handle burst of 500 job creations', async () => {
        const startTime = Date.now();
        const burstSize = 500;

        const promises = [];
        for (let i = 0; i < burstSize; i++) {
          promises.push(
            jobQueue.addJob({
              type: 'code-review',
              payload: { prNumber: i },
            })
          );
        }

        await Promise.all(promises);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(5000);

        const stats = await jobQueue.getStats();
        expect(stats.total).toBe(burstSize);
      });

    it('should maintain performance with large queue size', async () => {
        const largeSize = 1000;

        for (let i = 0; i < largeSize; i++) {
          await jobQueue.addJob({
            type: 'code-review',
            payload: { prNumber: i },
          });
        }

        const startTime = Date.now();
        const job = await jobQueue.getNextJob();
        const duration = Date.now() - startTime;

        expect(job).toBeDefined();
        expect(duration).toBeLessThan(100);
      });
  });
});
