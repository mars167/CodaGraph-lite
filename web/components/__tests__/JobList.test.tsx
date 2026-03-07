import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import JobList from '../../components/JobList';

global.fetch = jest.fn();

describe('JobList Component', () => {
  const mockJobs = [
    {
      id: 'job-1',
      type: 'code-review',
      status: 'completed',
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T10:15:00Z',
      payload: {
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        prNumber: 42,
      },
      result: {
        filesReviewed: 10,
        issuesFound: 3,
      },
    },
    {
      id: 'job-2',
      type: 'code-review',
      status: 'processing',
      createdAt: '2024-01-01T11:00:00Z',
      payload: {
        platform: 'gitee',
        owner: 'owner',
        repo: 'repo',
        prNumber: 15,
      },
    },
    {
      id: 'job-3',
      type: 'code-review',
      status: 'failed',
      createdAt: '2024-01-01T12:00:00Z',
      error: 'Authentication failed',
      payload: {
        platform: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        prNumber: 33,
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render list of jobs', () => {
      render(<JobList initialJobs={mockJobs} />);

      expect(screen.getByText('job-1')).toBeInTheDocument();
      expect(screen.getByText('job-2')).toBeInTheDocument();
      expect(screen.getByText('job-3')).toBeInTheDocument();
    });

    it('should display job status badges', () => {
      render(<JobList initialJobs={mockJobs} />);

      expect(screen.getByText('已完成')).toBeInTheDocument();
      expect(screen.getByText('处理中')).toBeInTheDocument();
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    it('should display platform icons', () => {
      render(<JobList initialJobs={mockJobs} />);

      expect(screen.getByAltText('GitHub')).toBeInTheDocument();
      expect(screen.getByAltText('Gitee')).toBeInTheDocument();
      expect(screen.getByAltText('GitLab')).toBeInTheDocument();
    });

    it('should display PR information', () => {
      render(<JobList initialJobs={mockJobs} />);

      expect(screen.getByText('owner/repo#42')).toBeInTheDocument();
      expect(screen.getByText('owner/repo#15')).toBeInTheDocument();
      expect(screen.getByText('owner/repo#33')).toBeInTheDocument();
    });

    it('should show empty state when no jobs', () => {
      render(<JobList initialJobs={[]} />);

      expect(screen.getByText('暂无作业')).toBeInTheDocument();
    });
  });

  describe('Job Details', () => {
    it('should expand job details when clicked', async () => {
      render(<JobList initialJobs={mockJobs} />);

      const jobItem = screen.getByText('job-1').closest('div');
      fireEvent.click(jobItem!);

      await waitFor(() => {
        expect(screen.getByText('审查文件: 10')).toBeInTheDocument();
        expect(screen.getByText('发现问题: 3')).toBeInTheDocument();
      });
    });

    it('should display error message for failed jobs', () => {
      render(<JobList initialJobs={mockJobs} />);

      const failedJob = screen.getByText('job-3').closest('div');
      fireEvent.click(failedJob!);

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });

    it('should show job duration for completed jobs', () => {
      render(<JobList initialJobs={mockJobs} />);

      const completedJob = screen.getByText('job-1').closest('div');
      fireEvent.click(completedJob!);

      expect(screen.getByText(/15分钟/)).toBeInTheDocument();
    });
  });

  describe('Filtering and Sorting', () => {
    it('should filter jobs by status', () => {
      render(<JobList initialJobs={mockJobs} />);

      const statusFilter = screen.getByLabelText('状态筛选');
      fireEvent.change(statusFilter, { target: { value: 'completed' } });

      expect(screen.getByText('job-1')).toBeInTheDocument();
      expect(screen.queryByText('job-2')).not.toBeInTheDocument();
      expect(screen.queryByText('job-3')).not.toBeInTheDocument();
    });

    it('should filter jobs by platform', () => {
      render(<JobList initialJobs={mockJobs} />);

      const platformFilter = screen.getByLabelText('平台筛选');
      fireEvent.change(platformFilter, { target: { value: 'github' } });

      expect(screen.getByText('job-1')).toBeInTheDocument();
      expect(screen.queryByText('job-2')).not.toBeInTheDocument();
      expect(screen.queryByText('job-3')).not.toBeInTheDocument();
    });

    it('should sort jobs by date descending', () => {
      render(<JobList initialJobs={mockJobs} />);

      const sortSelect = screen.getByLabelText('排序方式');
      fireEvent.change(sortSelect, { target: { value: 'date-desc' } });

      const jobIds = screen.getAllByTestId(/job-item-/);
      expect(jobIds[0]).toHaveAttribute('data-job-id', 'job-3');
      expect(jobIds[1]).toHaveAttribute('data-job-id', 'job-2');
      expect(jobIds[2]).toHaveAttribute('data-job-id', 'job-1');
    });

    it('should sort jobs by status', () => {
      render(<JobList initialJobs={mockJobs} />);

      const sortSelect = screen.getByLabelText('排序方式');
      fireEvent.change(sortSelect, { target: { value: 'status' } });

      const jobIds = screen.getAllByTestId(/job-item-/);
      expect(jobIds[0]).toHaveAttribute('data-job-id', 'job-2');
      expect(jobIds[1]).toHaveAttribute('data-job-id', 'job-1');
      expect(jobIds[2]).toHaveAttribute('data-job-id', 'job-3');
    });
  });

  describe('Actions', () => {
    it('should cancel pending job', async () => {
      const pendingJob = {
        ...mockJobs[1],
        status: 'pending',
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'cancelled' }),
      });

      render(<JobList initialJobs={[pendingJob]} />);

      const cancelButton = screen.getByText('取消');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/jobs/job-2/cancel',
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('should retry failed job', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-4', status: 'pending' }),
      });

      render(<JobList initialJobs={mockJobs} />);

      const failedJob = screen.getByText('job-3').closest('div');
      fireEvent.click(failedJob!);

      const retryButton = screen.getByText('重试');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/jobs',
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('should view job logs', async () => {
      render(<JobList initialJobs={mockJobs} />);

      const jobItem = screen.getByText('job-1').closest('div');
      fireEvent.click(jobItem!);

      const viewLogsButton = screen.getByText('查看日志');
      fireEvent.click(viewLogsButton);

      expect(viewLogsButton).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should display pagination controls', () => {
      const manyJobs = Array.from({ length: 25 }, (_, i) => ({
        id: `job-${i}`,
        type: 'code-review',
        status: 'completed',
        createdAt: new Date().toISOString(),
        payload: { prNumber: i },
      }));

      render(<JobList initialJobs={manyJobs} pageSize={10} />);

      expect(screen.getByText('上一页')).toBeInTheDocument();
      expect(screen.getByText('下一页')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should navigate to next page', async () => {
      const manyJobs = Array.from({ length: 25 }, (_, i) => ({
        id: `job-${i}`,
        type: 'code-review',
        status: 'completed',
        createdAt: new Date().toISOString(),
        payload: { prNumber: i },
      }));

      render(<JobList initialJobs={manyJobs} pageSize={10} />);

      const nextButton = screen.getByText('下一页');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('job-10')).toBeInTheDocument();
        expect(screen.queryByText('job-0')).not.toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should poll for job updates', async () => {
      jest.useFakeTimers();

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      render(<JobList initialJobs={mockJobs} pollInterval={5000} />);

      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('should update job status in real-time', async () => {
      const processingJob = {
        ...mockJobs[1],
        status: 'processing',
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobs: [processingJob] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobs: [{ ...processingJob, status: 'completed' }],
          }),
        });

      jest.useFakeTimers();

      render(<JobList initialJobs={[processingJob]} pollInterval={1000} />);

      expect(screen.getByText('处理中')).toBeInTheDocument();

      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(screen.getByText('已完成')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });
});
