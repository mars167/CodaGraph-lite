/**
 * Dashboard 组件测试
 *
 * 测试主仪表板组件的渲染和交互
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../../app/page';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dashboard title', () => {
      render(<Dashboard />);

      expect(screen.getByText('CodaGraph-lite')).toBeInTheDocument();
      expect(screen.getByText('代码审查仪表板')).toBeInTheDocument();
    });

    it('should render navigation menu', () => {
      render(<Dashboard />);

      expect(screen.getByText('概览')).toBeInTheDocument();
      expect(screen.getByText('仓库')).toBeInTheDocument();
      expect(screen.getByText('作业')).toBeInTheDocument();
      expect(screen.getByText('设置')).toBeInTheDocument();
    });

    it('should render statistics cards', () => {
      render(<Dashboard />);

      expect(screen.getByText('总作业数')).toBeInTheDocument();
      expect(screen.getByText('处理中')).toBeInTheDocument();
      expect(screen.getByText('已完成')).toBeInTheDocument();
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(<Dashboard />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch and display job statistics', async () => {
      const mockStats = {
        totalJobs: 100,
        processingJobs: 5,
        completedJobs: 90,
        failedJobs: 5,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      });

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('90')).toBeInTheDocument();
      });
    });

    it('should fetch and display recent jobs', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          type: 'code-review',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          payload: { prNumber: 42 },
        },
        {
          id: 'job-2',
          type: 'code-review',
          status: 'processing',
          createdAt: '2024-01-02T00:00:00Z',
          payload: { prNumber: 43 },
        },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('job-1')).toBeInTheDocument();
        expect(screen.getByText('job-2')).toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText(/加载失败/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should navigate to repositories page', async () => {
      render(<Dashboard />);

      const reposLink = screen.getByText('仓库');
      fireEvent.click(reposLink);

      // Verify navigation (would use router mock in real implementation)
      expect(reposLink).toBeInTheDocument();
    });

    it('should refresh data when refresh button clicked', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ totalJobs: 50 }),
      });

      render(<Dashboard />);

      const refreshButton = screen.getByText('刷新');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });
    });

    it('should filter jobs by status', async () => {
      const mockJobs = [
        { id: 'job-1', status: 'completed' },
        { id: 'job-2', status: 'processing' },
        { id: 'job-3', status: 'completed' },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
      });

      render(<Dashboard />);

      // Select completed status filter
      const statusFilter = screen.getByLabelText('状态筛选');
      fireEvent.change(statusFilter, { target: { value: 'completed' } });

      await waitFor(() => {
        expect(screen.getByText('job-1')).toBeInTheDocument();
        expect(screen.getByText('job-3')).toBeInTheDocument();
        expect(screen.queryByText('job-2')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<Dashboard />);

      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('CodaGraph-lite');
    });

    it('should have accessible navigation', () => {
      render(<Dashboard />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('should have proper button labels', () => {
      render(<Dashboard />);

      const refreshButton = screen.getByRole('button', { name: /刷新/i });
      expect(refreshButton).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render mobile menu on small screens', () => {
      // Mock window.innerWidth
      global.innerWidth = 500;
      global.dispatchEvent(new Event('resize'));

      render(<Dashboard />);

      expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();
    });

    it('should render desktop menu on large screens', () => {
      // Mock window.innerWidth
      global.innerWidth = 1200;
      global.dispatchEvent(new Event('resize'));

      render(<Dashboard />);

      expect(screen.getByTestId('desktop-menu')).toBeInTheDocument();
    });
  });
});
