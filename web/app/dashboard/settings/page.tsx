'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import type { SystemSettings } from '@/types';

const logLevels = [
  { value: 'debug', label: '调试 (Debug)' },
  { value: 'info', label: '信息 (Info)' },
  { value: 'warn', label: '警告 (Warn)' },
  { value: 'error', label: '错误 (Error)' },
] as const;

const backupSchedules = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
] as const;

const defaultSettings: SystemSettings = {
  apiPort: 7900,
  apiHost: 'localhost',
  frontendPort: 3000,
  frontendUrl: 'http://localhost:3000',
  dbCacheSize: 256,
  dbConnectionPoolSize: 10,
  dbConnectionTimeout: 30,
  githubEnabled: false,
  giteeEnabled: false,
  gitlabEnabled: false,
  logLevel: 'info',
  jobTimeout: 300,
  jobMaxRetries: 3,
  jobConcurrency: 2,
  twoU2gEnabled: false,
  memoryLimit: 1024,
  sessionTimeout: 86400,
  passwordMinLength: 8,
  requireStrongPassword: true,
  autoBackupEnabled: true,
  backupSchedule: 'daily',
  backupRetentionDays: 7,
};

export default function SettingsPage() {
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'database' | 'oauth' | 'security' | 'backup'>('general');
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response: any = await apiClient.get('/api/settings');
      if (response?.data) {
        setSettings(response.data);
      }
    } catch (err) {
      console.error('加载设置失败:', err);
      // 使用默认设置
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      await apiClient.put('/api/settings', settings);
      success('保存成功', '系统设置已保存，部分配置需要重启服务生效');
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存设置失败';
      error('保存失败', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackup = async () => {
    try {
      setIsBackingUp(true);
      await apiClient.createBackup({ retentionDays: settings.backupRetentionDays });
      success('备份成功', '数据库备份已创建');
    } catch (err) {
      const message = err instanceof Error ? err.message : '备份失败';
      error('备份失败', message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm('确定要恢复数据库吗？此操作将覆盖当前数据库！')) {
      return;
    }
    try {
      setIsBackingUp(true);
      await apiClient.restoreBackup('latest');
      success('恢复成功', '数据库已恢复，正在重启服务...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '恢复失败';
      error('恢复失败', message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const resetToDefaults = () => {
    if (!confirm('确定要恢复默认设置吗？此操作将覆盖所有当前设置！')) {
      return;
    }
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(defaultSettings));
  }, [settings]);

  const tabs = [
    { id: 'general', label: '通用设置', icon: '⚙️' },
    { id: 'database', label: '数据库', icon: '💾' },
    { id: 'oauth', label: 'OAuth 集成', icon: '🔐' },
    { id: 'security', label: '安全设置', icon: '🔒' },
    { id: 'backup', label: '备份恢复', icon: '📦' },
  ] as const;

  const SettingsSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );

  const ToggleSetting = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
  }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <label className="font-medium text-gray-900 dark:text-white">{label}</label>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
          ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );

  const NumberInput = ({
    label,
    value,
    onChange,
    min,
    max,
    unit,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    unit?: string;
  }) => (
    <Input
      label={label}
      type="number"
      value={value.toString()}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      helperText={unit && `单位：${unit}`}
    />
  );

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          系统设置
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          配置 CodaGraph 系统参数和功能选项
        </p>
      </div>

      {/* 标签页导航 */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }
              `}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <Loading size="lg" text="加载设置中..." />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 通用设置 */}
          {activeTab === 'general' && (
            <>
              <SettingsSection title="环境配置">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <NumberInput
                    label="API 端口"
                    value={settings.apiPort}
                    onChange={(v) => setSettings({ ...settings, apiPort: v })}
                    min={1024}
                    max={65535}
                  />
                  <Input
                    label="API 主机"
                    value={settings.apiHost}
                    onChange={(e) => setSettings({ ...settings, apiHost: e.target.value })}
                  />
                  <NumberInput
                    label="前端端口"
                    value={settings.frontendPort}
                    onChange={(v) => setSettings({ ...settings, frontendPort: v })}
                    min={1024}
                    max={65535}
                  />
                  <Input
                    label="前端 URL"
                    value={settings.frontendUrl}
                    onChange={(e) => setSettings({ ...settings, frontendUrl: e.target.value })}
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="作业配置">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <NumberInput
                    label="作业超时时间（秒）"
                    value={settings.jobTimeout}
                    onChange={(v) => setSettings({ ...settings, jobTimeout: v })}
                    min={60}
                    max={3600}
                    unit="秒"
                  />
                  <NumberInput
                    label="最大重试次数"
                    value={settings.jobMaxRetries}
                    onChange={(v) => setSettings({ ...settings, jobMaxRetries: v })}
                    min={1}
                    max={10}
                  />
                  <NumberInput
                    label="并发作业数"
                    value={settings.jobConcurrency}
                    onChange={(v) => setSettings({ ...settings, jobConcurrency: v })}
                    min={1}
                    max={10}
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="性能优化">
                <ToggleSetting
                  label="启用 2u2g 优化"
                  description="启用后端 2u2g 模式以优化内存使用"
                  checked={settings.twoU2gEnabled}
                  onChange={(v) => setSettings({ ...settings, twoU2gEnabled: v })}
                />
                <NumberInput
                  label="内存限制（MB）"
                  value={settings.memoryLimit}
                  onChange={(v) => setSettings({ ...settings, memoryLimit: v })}
                  min={256}
                  max={8192}
                  unit="MB"
                />
              </SettingsSection>
            </>
          )}

          {/* 数据库设置 */}
          {activeTab === 'database' && (
            <>
              <SettingsSection title="连接配置">
                <NumberInput
                  label="连接池大小"
                  value={settings.dbConnectionPoolSize}
                  onChange={(v) => setSettings({ ...settings, dbConnectionPoolSize: v })}
                  min={1}
                  max={100}
                />
                <NumberInput
                  label="连接超时（秒）"
                  value={settings.dbConnectionTimeout}
                  onChange={(v) => setSettings({ ...settings, dbConnectionTimeout: v })}
                  min={5}
                  max={120}
                  unit="秒"
                />
              </SettingsSection>

              <SettingsSection title="缓存配置">
                <NumberInput
                  label="缓存大小（MB）"
                  value={settings.dbCacheSize}
                  onChange={(v) => setSettings({ ...settings, dbCacheSize: v })}
                  min={64}
                  max={2048}
                  unit="MB"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  数据库查询结果缓存大小。增加此值可以提高查询性能，但会增加内存使用量。
                </p>
              </SettingsSection>
            </>
          )}

          {/* OAuth 设置 */}
          {activeTab === 'oauth' && (
            <>
              <SettingsSection title="已启用的平台">
                <div className="space-y-3">
                  <ToggleSetting
                    label="GitHub 集成"
                    description="启用 GitHub OAuth 登录和 Webhook"
                    checked={settings.githubEnabled}
                    onChange={(v) => setSettings({ ...settings, githubEnabled: v })}
                  />
                  <ToggleSetting
                    label="Gitee 集成"
                    description="启用 Gitee OAuth 登录和 Webhook"
                    checked={settings.giteeEnabled}
                    onChange={(v) => setSettings({ ...settings, giteeEnabled: v })}
                  />
                  <ToggleSetting
                    label="GitLab 集成"
                    description="启用 GitLab OAuth 登录和 Webhook"
                    checked={settings.gitlabEnabled}
                    onChange={(v) => setSettings({ ...settings, gitlabEnabled: v })}
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="OAuth 应用管理">
                <div className="space-y-3">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">GitHub 应用</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client ID: gh_xxx</p>
                      </div>
                      <Badge variant={settings.githubEnabled ? 'success' : 'warning'}>
                        {settings.githubEnabled ? '已配置' : '未配置'}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">
                      配置
                    </Button>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">Gitee 应用</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client ID: ge_xxx</p>
                      </div>
                      <Badge variant={settings.giteeEnabled ? 'success' : 'warning'}>
                        {settings.giteeEnabled ? '已配置' : '未配置'}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">
                      配置
                    </Button>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">GitLab 应用</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client ID: gl_xxx</p>
                      </div>
                      <Badge variant={settings.gitlabEnabled ? 'success' : 'warning'}>
                        {settings.gitlabEnabled ? '已配置' : '未配置'}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">
                      配置
                    </Button>
                  </div>
                </div>
              </SettingsSection>
            </>
          )}

          {/* 安全设置 */}
          {activeTab === 'security' && (
            <>
              <SettingsSection title="会话管理">
                <NumberInput
                  label="会话超时时间（秒）"
                  value={settings.sessionTimeout}
                  onChange={(v) => setSettings({ ...settings, sessionTimeout: v })}
                  min={300}
                  max={604800}
                  unit="秒（默认：24小时）"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  用户登录后的会话有效期。超时后需要重新登录。
                </p>
              </SettingsSection>

              <SettingsSection title="密码策略">
                <NumberInput
                  label="最小密码长度"
                  value={settings.passwordMinLength}
                  onChange={(v) => setSettings({ ...settings, passwordMinLength: v })}
                  min={6}
                  max={32}
                />
                <ToggleSetting
                  label="要求强密码"
                  description="密码必须包含大小写字母、数字和特殊字符"
                  checked={settings.requireStrongPassword}
                  onChange={(v) => setSettings({ ...settings, requireStrongPassword: v })}
                />
              </SettingsSection>

              <SettingsSection title="系统日志">
                <div className="space-y-3">
                  <label className="font-medium text-gray-900 dark:text-white">日志级别</label>
                  <div className="flex flex-wrap gap-2">
                    {logLevels.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setSettings({ ...settings, logLevel: level.value as any })}
                        className={`
                          px-4 py-2 rounded-lg text-sm font-medium transition-colors
                          ${settings.logLevel === level.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }
                        `}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SettingsSection>
            </>
          )}

          {/* 备份恢复 */}
          {activeTab === 'backup' && (
            <>
              <SettingsSection title="自动备份">
                <ToggleSetting
                  label="启用自动备份"
                  description="定期自动创建数据库备份"
                  checked={settings.autoBackupEnabled}
                  onChange={(v) => setSettings({ ...settings, autoBackupEnabled: v })}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white mb-2">备份计划</label>
                    <select
                      value={settings.backupSchedule}
                      onChange={(e) => setSettings({ ...settings, backupSchedule: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      {backupSchedules.map((schedule) => (
                        <option key={schedule.value} value={schedule.value}>
                          {schedule.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <NumberInput
                    label="备份保留天数"
                    value={settings.backupRetentionDays}
                    onChange={(v) => setSettings({ ...settings, backupRetentionDays: v })}
                    min={1}
                    max={90}
                    unit="天"
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="手动操作">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    onClick={handleBackup}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? (
                      <>
                        <Loading size="sm" />
                        <span className="ml-2">备份中...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003-3h10a3 3 0 003 3v1m-4-4l-4 4m5 0l-4-4m4 4v4m-4 4l4-4m4 4v4" />
                        </svg>
                        创建备份
                      </>
                    )}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleRestore()}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? (
                      <>
                        <Loading size="sm" />
                        <span className="ml-2">恢复中...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-8.268 2-012 2-012 0-2h.01M21 12a9 9 0 11-18 0 9 9 0 011.018 0 9-9 0 011-018 0z" />
                        </svg>
                        恢复备份
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400 mt-4">
                  ⚠️ 恢复操作将覆盖当前数据库，请谨慎操作！
                </p>
              </SettingsSection>

              <SettingsSection title="备份历史">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">codagraph-backup-20240301-000000.sql</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">大小: 45.2 MB • 创建时间: 2024-03-01 00:00:00</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">下载</Button>
                      <Button variant="danger" size="sm">删除</Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">codagraph-backup-20240228-000000.sql</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">大小: 43.8 MB • 创建时间: 2024-02-28 00:00:00</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">下载</Button>
                      <Button variant="danger" size="sm">删除</Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">codagraph-backup-20240221-000000.sql</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">大小: 42.5 MB • 创建时间: 2024-02-21 00:00:00</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">下载</Button>
                      <Button variant="danger" size="sm">删除</Button>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  查看所有备份
                </Button>
              </SettingsSection>
            </>
          )}
        </>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={resetToDefaults}
          >
            恢复默认设置
          </Button>
          {hasChanges && (
            <Badge variant="success">有未保存的更改</Badge>
          )}
        </div>
        <Button
          onClick={saveSettings}
          disabled={!hasChanges || isSaving || isBackingUp}
          loading={isSaving}
        >
          {isSaving ? '保存中...' : '保存设置'}
        </Button>
      </div>

      {/* 保存成功提示 */}
      {!hasChanges && !isLoading && (
        <div className="fixed bottom-4 right-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-4 py-2 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>所有设置已保存</span>
        </div>
      )}
    </div>
  );
}
