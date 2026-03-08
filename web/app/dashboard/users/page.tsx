'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/datetime';
import type { Admin } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Badge } from '@/components/ui/Badge';
import { useNotificationHelpers } from '@/contexts/NotificationContext';

// 模拟用户活动日志类型
interface UserActivity {
  id: string;
  userId: string;
  username: string;
  action: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

// 模拟用户统计类型
interface UserStats {
  totalUsers: number;
  activeUsers: number;
  totalLogins: number;
  avgLoginDuration: number;
}

export default function UsersPage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<Admin[]>([]);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Admin | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // 加载用户数据
  useEffect(() => {
    loadUsersData();
  }, []);

  const loadUsersData = async () => {
    try {
      setIsLoading(true);
      // 获取当前管理员信息
      const meResponse = await apiClient.getCurrentAdmin();
      if (meResponse.success && meResponse.data?.admin) {
        setUsers([meResponse.data.admin]);
      }

      // 模拟加载活动日志
      const mockActivities: UserActivity[] = [
        {
          id: '1',
          userId: meResponse.data?.admin?.id || '',
          username: meResponse.data?.admin?.username || '',
          action: '登录',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '2',
          userId: meResponse.data?.admin?.id || '',
          username: meResponse.data?.admin?.username || '',
          action: '修改密码',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: '3',
          userId: meResponse.data?.admin?.id || '',
          username: meResponse.data?.admin?.username || '',
          action: '更新设置',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ];
      setActivities(mockActivities);

      // 模拟统计数据
      setStats({
        totalUsers: 1,
        activeUsers: 1,
        totalLogins: 42,
        avgLoginDuration: 7.5,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载用户数据失败';
      error('加载失败', message);
    } finally {
      setIsLoading(false);
    }
  };

  // 添加用户
  const handleAddUser = async () => {
    if (!formData.username || !formData.password) {
      error('表单错误', '请填写完整的用户信息');
      return;
    }

    if (formData.password.length < 6) {
      error('密码错误', '密码长度至少为 6 位');
      return;
    }

    try {
      // 模拟添加用户（实际需要后端 API）
      await new Promise(resolve => setTimeout(resolve, 500));
      success('添加成功', '用户已创建');
      setShowAddModal(false);
      setFormData({ username: '', password: '' });
      await loadUsersData();
    } catch (err) {
      const message = err instanceof Error ? err.message : '添加用户失败';
      error('添加失败', message);
    }
  };

  // 编辑用户
  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      // 模拟编辑用户（实际需要后端 API）
      await new Promise(resolve => setTimeout(resolve, 500));
      success('编辑成功', '用户信息已更新');
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '编辑用户失败';
      error('编辑失败', message);
    }
  };

  // 修改密码
  const handleChangePassword = async () => {
    if (passwordFormData.newPassword.length < 6) {
      error('密码错误', '新密码长度至少为 6 位');
      return;
    }

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      error('密码错误', '两次输入的密码不一致');
      return;
    }

    try {
      await apiClient.updatePassword({
        currentPassword: passwordFormData.currentPassword,
        newPassword: passwordFormData.newPassword,
      });
      success('修改成功', '密码已更新');
      setShowPasswordModal(false);
      setPasswordFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '修改密码失败';
      error('修改失败', message);
    }
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    return formatDateTime(dateStr, { fallback: '-' });
  };

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                用户设置
              </h1>
            </div>
            <Button onClick={() => setShowAddModal(true)}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H8m8 8l-8-8m0 0l8-8m-8 16l8-8m0-0l8-8m-8-8l8 8" />
              </svg>
              添加用户
            </Button>
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">总用户数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalUsers}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">活跃用户</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.activeUsers}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">总登录次数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalLogins}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">平均会话时长</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.avgLoginDuration.toFixed(1)} 小时
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 用户列表 */}
          <Card>
            <CardHeader>
              <CardTitle>用户列表</CardTitle>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                  暂无用户
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {user.username}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            创建于 {formatDate(user.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditModal(true);
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414 0H9m1.414 0 0 001.414 1.586 0 0 001.414 1.586v4H8m-1.414 0 0 001.414 1.586 0 0 001.414-1.586v4.414H15a1.586 0 0 01.586-1.414V5h.414a1.586 0 0 001.586 1.414H15m-1.586 0 00-1.414 2z" />
                          </svg>
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordModal(true);
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2h4a2 2 0 012 2z" />
                          </svg>
                          修改密码
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 活动日志 */}
          <Card>
            <CardHeader>
              <CardTitle>活动日志</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                  暂无活动记录
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                        {activity.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {activity.username}
                          </p>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(activity.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{activity.action}</Badge>
                          {activity.details && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {activity.details}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 密码策略提示 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>密码策略</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>密码长度至少 6 位</span>
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>建议使用大小写字母、数字和特殊字符组合</span>
              </li>
              <li className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>定期更换密码以确保账户安全</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 添加用户模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>添加用户</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    用户名
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    密码
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAddUser}>
                    添加
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 编辑用户模态框 */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>编辑用户</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    用户名
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600"
                    value={selectedUser.username}
                    disabled
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}>
                    取消
                  </Button>
                  <Button onClick={handleEditUser}>
                    保存
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 修改密码模态框 */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>修改密码 - {selectedUser.username}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    当前密码
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    value={passwordFormData.currentPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    新密码
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    value={passwordFormData.newPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    确认新密码
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    value={passwordFormData.confirmPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => {
                    setShowPasswordModal(false);
                    setSelectedUser(null);
                    setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}>
                    取消
                  </Button>
                  <Button onClick={handleChangePassword}>
                    确认修改
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
