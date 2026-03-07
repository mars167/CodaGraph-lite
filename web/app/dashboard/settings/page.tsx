'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, PasswordInput } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import { rememberOAuthStatePlatform } from '@/lib/oauth-state';
import type { LlmTestResult, OAuthInstallation, Platform, SystemSettings } from '@/types';

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

const llmProviders = [
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: '适配大多数 `/v1/chat/completions` 风格 API',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: '使用 OpenAI 默认域名与协议',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: '使用 OpenRouter 默认域名与协议',
  },
] as const;

const platformNames: Record<Platform, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
};

const platformIcons: Record<Platform, React.ReactNode> = {
  github: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.11.78-.24.78-.55v-2.01c-3.2.7-3.88-1.35-3.88-1.35-.52-1.3-1.27-1.65-1.27-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.18 1.74 1.18 1.01 1.73 2.65 1.23 3.3.94.1-.74.4-1.23.74-1.51-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.44-2.26 1.17-3.06-.12-.29-.51-1.47.11-3.07 0 0 .96-.31 3.15 1.17A10.9 10.9 0 0 1 12 6.32a10.9 10.9 0 0 1 2.87.39c2.18-1.48 3.14-1.17 3.14-1.17.63 1.6.24 2.78.12 3.07.73.8 1.17 1.81 1.17 3.06 0 4.41-2.69 5.38-5.25 5.66.41.36.78 1.06.78 2.14v3.16c0 .31.2.67.79.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  ),
  gitee: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1.25A10.75 10.75 0 1 0 22.75 12 10.76 10.76 0 0 0 12 1.25Zm5.9 5.08h-4.54a1.1 1.1 0 0 0-1.1 1.1v4.72h-1.66V7.98a1.1 1.1 0 0 0-1.1-1.1H6.06a1.1 1.1 0 0 0-1.1 1.1v4.72H2.9a.64.64 0 0 0-.65.64v2.6a.64.64 0 0 0 .64.64H17.9a.64.64 0 0 0 .64-.64v-2.6a.64.64 0 0 0-.64-.64Z" />
    </svg>
  ),
  gitlab: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="m22.63 14.42-1.1-3.4-2.2-6.78a.9.9 0 0 0-1.7 0l-1.87 5.77H8.24L6.37 4.24a.9.9 0 0 0-1.7 0L2.47 11l-1.1 3.4a.74.74 0 0 0 .27.83L12 22.74l10.36-7.49a.74.74 0 0 0 .27-.83Z" />
    </svg>
  ),
};

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
  llmProvider: 'openai-compatible',
  llmApiKey: '',
  llmApiBaseUrl: '',
  llmModel: '',
  llmMaxRetries: 2,
};

type SettingsTab = 'general' | 'security' | 'oauth' | 'llm' | 'database' | 'backup';

function mergeModelOptions(result: string[], currentModel: string): string[] {
  return [...new Set([currentModel, ...result].filter((item) => item.trim().length > 0))];
}

function formatLatency(value?: number): string {
  if (!value) {
    return '--';
  }
  return `${value} ms`;
}

function formatCount(value?: number): string {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function getPlatformAuthType(platform: Platform): 'oauth' | 'github_app' {
  return platform === 'github' ? 'github_app' : 'oauth';
}

export default function SettingsPage() {
  const { admin } = useAuth();
  const { success, error } = useNotificationHelpers();
  const [isLoading, setIsLoading] = useState(true);
  const [isOAuthLoading, setIsOAuthLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState<Platform | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<SystemSettings>(defaultSettings);
  const [installations, setInstallations] = useState<OAuthInstallation[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [llmTestResult, setLlmTestResult] = useState<LlmTestResult | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSettings();
      const nextSettings = {
        ...defaultSettings,
        ...(response.data || {}),
      };

      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setDiscoveredModels(mergeModelOptions([], nextSettings.llmModel));
    } catch (err) {
      console.error('加载设置失败:', err);
      setSettings(defaultSettings);
      setSavedSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadInstallations = useCallback(async () => {
    try {
      setIsOAuthLoading(true);
      const response = await apiClient.getOAuthInstallations();
      setInstallations(response.data.installations);
    } catch (err) {
      error('加载失败', err instanceof Error ? err.message : '无法获取 OAuth 连接');
    } finally {
      setIsOAuthLoading(false);
    }
  }, [error]);

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      const response = await apiClient.saveSettings(settings);
      const persisted = {
        ...defaultSettings,
        ...(response.data || settings),
      };

      setSettings(persisted);
      setSavedSettings(persisted);
      success('保存成功', '系统设置已保存，运行中服务可能需要重启后完全生效');
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
    if (!confirm('确定要恢复数据库吗？此操作将覆盖当前数据库。')) {
      return;
    }

    try {
      setIsBackingUp(true);
      await apiClient.restoreBackup('latest');
      success('恢复成功', '数据库已恢复，正在刷新页面');
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

  const handleTestLlm = async () => {
    try {
      setIsTestingLlm(true);
      const response = await apiClient.testLlmSettings({
        llmProvider: settings.llmProvider,
        llmApiKey: settings.llmApiKey,
        llmApiBaseUrl: settings.llmApiBaseUrl,
        llmModel: settings.llmModel,
        llmMaxRetries: settings.llmMaxRetries,
      });

      setLlmTestResult(response.data);
      setDiscoveredModels(mergeModelOptions(response.data.availableModels, response.data.model || settings.llmModel));
      success('测试成功', response.data.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM API 测试失败';
      setLlmTestResult(null);
      error('测试失败', message);
    } finally {
      setIsTestingLlm(false);
    }
  };

  const handleAuthorize = async (platform: Platform) => {
    try {
      setIsAuthorizing(platform);
      const response = await apiClient.getOAuthAuthorizationUrl(platform, getPlatformAuthType(platform));
      rememberOAuthStatePlatform(response.data.authorizationUrl, platform);
      window.location.href = response.data.authorizationUrl;
    } catch (err) {
      error('授权失败', err instanceof Error ? err.message : '无法获取授权链接');
      setIsAuthorizing(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('确定要断开此 OAuth 连接吗？')) {
      return;
    }

    try {
      await apiClient.disconnectOAuth(id);
      success('断开成功', 'OAuth 连接已断开');
      await loadInstallations();
    } catch (err) {
      error('断开失败', err instanceof Error ? err.message : '无法断开 OAuth 连接');
    }
  };

  const handleRefreshToken = async (id: string) => {
    try {
      await apiClient.refreshOAuthToken(id);
      success('刷新成功', 'Token 已刷新');
      await loadInstallations();
    } catch (err) {
      error('刷新失败', err instanceof Error ? err.message : '无法刷新 Token');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      error('表单错误', '请填写完整的密码信息');
      return;
    }

    if (passwordForm.newPassword.length < Math.max(settings.passwordMinLength, 6)) {
      error('密码错误', `新密码长度至少为 ${Math.max(settings.passwordMinLength, 6)} 位`);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      error('密码错误', '两次输入的新密码不一致');
      return;
    }

    try {
      setIsChangingPassword(true);
      await apiClient.updatePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      success('修改成功', '管理员密码已更新');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      error('修改失败', err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const resetToDefaults = () => {
    if (!confirm('确定要恢复默认设置吗？这会覆盖当前编辑中的内容。')) {
      return;
    }

    setSettings(defaultSettings);
    setDiscoveredModels(mergeModelOptions(discoveredModels, defaultSettings.llmModel));
    setLlmTestResult(null);
  };

  useEffect(() => {
    void loadSettings();
    void loadInstallations();
  }, [loadInstallations, loadSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextTab = window.location.hash.replace('#', '') as SettingsTab;
    if (['general', 'security', 'oauth', 'llm', 'database', 'backup'].includes(nextTab)) {
      setActiveTab(nextTab);
    }
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(savedSettings));
  }, [savedSettings, settings]);

  const tabs: Array<{ id: SettingsTab; label: string; accent: string }> = [
    { id: 'general', label: '通用设置', accent: 'from-emerald-500 to-teal-600' },
    { id: 'security', label: '管理员与安全', accent: 'from-rose-500 to-red-600' },
    { id: 'oauth', label: 'OAuth 连接', accent: 'from-violet-500 to-fuchsia-600' },
    { id: 'llm', label: 'LLM API', accent: 'from-cyan-500 to-blue-600' },
    { id: 'database', label: '数据库', accent: 'from-amber-500 to-orange-600' },
    { id: 'backup', label: '备份恢复', accent: 'from-slate-500 to-slate-700' },
  ];

  const SettingsSection = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <Card className="border-gray-200/80 dark:border-gray-800">
      <CardHeader className="mb-5">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
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
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200/80 bg-white/70 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/60">
      <div className="space-y-1">
        <p className="font-medium text-gray-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
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
      onChange={(event) => onChange(Number(event.target.value))}
      min={min}
      max={max}
      helperText={unit ? `单位：${unit}` : undefined}
    />
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16">
          <Loading size="lg" text="加载系统设置中..." />
        </CardContent>
      </Card>
    );
  }

  const llmConfigured = settings.llmApiKey.trim().length > 0;
  const testBadgeVariant = llmTestResult?.available ? 'success' : llmConfigured ? 'warning' : 'default';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.92))] p-6 shadow-sm dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.18),_transparent_32%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.94))]">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
              系统设置中心
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                把管理员、连接和模型配置放到同一个入口
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                这里统一管理管理员密码、OAuth 平台连接和 LLM API 配置，避免在多个页面之间来回切换。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge variant="info">
                管理员 {admin?.username || '未知'}
              </Badge>
              <Badge variant={installations.length > 0 ? 'success' : 'warning'}>
                OAuth 连接 {installations.length} 个
              </Badge>
              <Badge variant={llmConfigured ? 'success' : 'warning'}>
                {llmConfigured ? '已配置 LLM API' : '未配置 LLM API'}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Card className="rounded-3xl border-white/70 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">管理员账户</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {admin?.username || '--'}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/70 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">OAuth 连接</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {formatCount(installations.length)}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/70 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
              <CardContent>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">LLM 默认模型</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {settings.llmModel || '未选择'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', `#${tab.id}`);
              }
            }}
            className={`group relative min-w-fit overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all ${
              activeTab === tab.id
                ? 'border-slate-900 bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:border-white dark:bg-white dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
            }`}
          >
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tab.accent}`} />
            <span className="relative text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsSection title="环境配置">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <NumberInput label="API 端口" value={settings.apiPort} onChange={(value) => setSettings({ ...settings, apiPort: value })} min={1024} max={65535} />
              <Input label="API 主机" value={settings.apiHost} onChange={(event) => setSettings({ ...settings, apiHost: event.target.value })} />
              <NumberInput label="前端端口" value={settings.frontendPort} onChange={(value) => setSettings({ ...settings, frontendPort: value })} min={1024} max={65535} />
              <Input label="前端 URL" value={settings.frontendUrl} onChange={(event) => setSettings({ ...settings, frontendUrl: event.target.value })} />
            </div>
          </SettingsSection>

          <SettingsSection title="作业配置">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <NumberInput label="作业超时时间（秒）" value={settings.jobTimeout} onChange={(value) => setSettings({ ...settings, jobTimeout: value })} min={60} max={3600} unit="秒" />
              <NumberInput label="最大重试次数" value={settings.jobMaxRetries} onChange={(value) => setSettings({ ...settings, jobMaxRetries: value })} min={0} max={10} />
              <NumberInput label="并发作业数" value={settings.jobConcurrency} onChange={(value) => setSettings({ ...settings, jobConcurrency: value })} min={1} max={10} />
            </div>
          </SettingsSection>

          <SettingsSection title="性能优化" description="这部分主要是运行时策略记录，完整生效通常需要重启服务。">
            <ToggleSetting
              label="启用 2u2g 优化"
              description="启用后端 2u2g 模式以优化内存和并发占用"
              checked={settings.twoU2gEnabled}
              onChange={(value) => setSettings({ ...settings, twoU2gEnabled: value })}
            />
            <NumberInput label="内存限制（MB）" value={settings.memoryLimit} onChange={(value) => setSettings({ ...settings, memoryLimit: value })} min={256} max={8192} unit="MB" />
          </SettingsSection>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <SettingsSection title="管理员账户">
              <div className="rounded-3xl border border-gray-200/80 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-950/50">
                <p className="text-sm text-gray-500 dark:text-gray-400">当前登录管理员</p>
                <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                  {admin?.username || '--'}
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  密码修改后会立即影响后续登录。
                </p>
              </div>
            </SettingsSection>

            <SettingsSection title="密码策略">
              <NumberInput label="最小密码长度" value={settings.passwordMinLength} onChange={(value) => setSettings({ ...settings, passwordMinLength: value })} min={6} max={32} />
              <ToggleSetting
                label="要求强密码"
                description="密码必须包含大小写字母、数字和特殊字符"
                checked={settings.requireStrongPassword}
                onChange={(value) => setSettings({ ...settings, requireStrongPassword: value })}
              />
            </SettingsSection>

            <SettingsSection title="会话管理">
              <NumberInput label="会话超时时间（秒）" value={settings.sessionTimeout} onChange={(value) => setSettings({ ...settings, sessionTimeout: value })} min={300} max={604800} unit="秒" />
              <p className="text-sm text-gray-500 dark:text-gray-400">超时后需要重新登录。建议生产环境不要低于 15 分钟。</p>
            </SettingsSection>
          </div>

          <div className="space-y-6">
            <SettingsSection title="修改管理员密码" description="修改密码不依赖底部的“保存设置”，提交后立即生效。">
              <div className="grid gap-4 md:grid-cols-2">
                <PasswordInput
                  label="当前密码"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                />
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-950/50">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">修改建议</p>
                  <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    新密码建议与现有平台账号不同，并使用密码管理器保存。
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <PasswordInput
                  label="新密码"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                  helperText={`至少 ${Math.max(settings.passwordMinLength, 6)} 位`}
                />
                <PasswordInput
                  label="确认新密码"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  修改成功后不会自动登出当前会话。
                </p>
                <Button onClick={handleChangePassword} loading={isChangingPassword}>
                  {isChangingPassword ? '更新中...' : '更新管理员密码'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title="系统日志">
              <div className="flex flex-wrap gap-2">
                {logLevels.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setSettings({ ...settings, logLevel: level.value })}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      settings.logLevel === level.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </SettingsSection>
          </div>
        </div>
      )}

      {activeTab === 'oauth' && (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <SettingsSection title="平台启用状态">
              <div className="space-y-3">
                <ToggleSetting
                  label="GitHub 集成"
                  description="启用 GitHub OAuth 登录和 GitHub App 安装"
                  checked={settings.githubEnabled}
                  onChange={(value) => setSettings({ ...settings, githubEnabled: value })}
                />
                <ToggleSetting
                  label="Gitee 集成"
                  description="启用 Gitee OAuth 登录和仓库授权"
                  checked={settings.giteeEnabled}
                  onChange={(value) => setSettings({ ...settings, giteeEnabled: value })}
                />
                <ToggleSetting
                  label="GitLab 集成"
                  description="启用 GitLab OAuth 登录和仓库授权"
                  checked={settings.gitlabEnabled}
                  onChange={(value) => setSettings({ ...settings, gitlabEnabled: value })}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="新增连接" description="GitHub 默认会走 GitHub App 安装，其他平台走 OAuth 授权。">
              <div className="grid gap-4">
                {(['github', 'gitee', 'gitlab'] as Platform[]).map((platform) => {
                  const isConnected = installations.some((item) => item.platform === platform);
                  return (
                    <div
                      key={platform}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-4 ${
                        isConnected
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/10'
                          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-gray-100 p-2 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                          {platformIcons[platform]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{platformNames[platform]}</p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {isConnected ? '已存在连接，可继续添加或刷新 token。' : '尚未连接'}
                          </p>
                        </div>
                      </div>
                      {isConnected ? (
                        <Badge variant="success">已连接</Badge>
                      ) : (
                        <Button size="sm" onClick={() => handleAuthorize(platform)} loading={isAuthorizing === platform}>
                          {isAuthorizing === platform ? '授权中...' : '连接'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SettingsSection>
          </div>

          <div className="space-y-6">
            <SettingsSection title="当前 OAuth 连接" description="连接管理已经并入系统设置页，不需要再切到独立的 OAuth 页面。">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  共 {formatCount(installations.length)} 个连接
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadInstallations()} disabled={isOAuthLoading}>
                  {isOAuthLoading ? '刷新中...' : '刷新连接列表'}
                </Button>
              </div>

              {isOAuthLoading ? (
                <div className="py-10">
                  <Loading text="正在同步 OAuth 连接..." />
                </div>
              ) : installations.length > 0 ? (
                <div className="space-y-4">
                  {installations.map((installation) => (
                    <div
                      key={installation.id}
                      className="rounded-3xl border border-gray-200/80 bg-white/80 p-5 dark:border-gray-800 dark:bg-gray-950/50"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="rounded-2xl bg-gray-100 p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                            {platformIcons[installation.platform]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {installation.platformUsername}
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {platformNames[installation.platform]} · {installation.platformUserId}
                            </p>
                            {installation.expiresAt && (
                              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                过期时间: {new Date(installation.expiresAt).toLocaleString('zh-CN')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleRefreshToken(installation.id)}>
                            刷新 Token
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDisconnect(installation.id)}>
                            断开连接
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50/80 px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-950/40">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    暂无 OAuth 连接，可以直接在左侧卡片中发起授权。
                  </p>
                </div>
              )}
            </SettingsSection>
          </div>
        </div>
      )}

      {activeTab === 'llm' && (
        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="space-y-6">
            <SettingsSection
              title="模型接入"
              description="优先适配 OpenAI-compatible API。Base URL 填写到 `/v1` 即可，系统会自动补全 `chat/completions` 和 `models`。"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/70">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
                  <select
                    value={settings.llmProvider}
                    onChange={(event) => setSettings({ ...settings, llmProvider: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    {llmProviders.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {llmProviders.find((item) => item.value === settings.llmProvider)?.description}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/70">
                  <Input
                    label="Base URL"
                    placeholder="https://api.example.com/v1"
                    value={settings.llmApiBaseUrl}
                    onChange={(event) => setSettings({ ...settings, llmApiBaseUrl: event.target.value })}
                    helperText="如果使用官方 OpenAI/OpenRouter，可留空使用默认地址。"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <PasswordInput
                  label="API Key"
                  placeholder="sk-..."
                  value={settings.llmApiKey}
                  onChange={(event) => setSettings({ ...settings, llmApiKey: event.target.value })}
                  helperText="会保存在本地管理库中，仅管理后台可见。"
                />
                <NumberInput
                  label="最大重试次数"
                  value={settings.llmMaxRetries}
                  onChange={(value) => setSettings({ ...settings, llmMaxRetries: value })}
                  min={0}
                  max={10}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950/60">
                  <Input
                    label="模型 ID"
                    placeholder="gpt-4.1-mini / glm-4.5 / DeepSeek-V3"
                    value={settings.llmModel}
                    onChange={(event) => setSettings({ ...settings, llmModel: event.target.value })}
                    list="llm-model-list"
                    helperText="可以手填，也可以先测试接口后从返回的模型列表中选择。"
                  />
                  <datalist id="llm-model-list">
                    {discoveredModels.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>

                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-950/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">模型发现</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {discoveredModels.length > 0 ? `已发现 ${discoveredModels.length} 个模型` : '尚未获取模型列表'}
                      </p>
                    </div>
                    <Badge variant={discoveredModels.length > 0 ? 'success' : 'default'}>
                      {discoveredModels.length > 0 ? 'Ready' : 'Idle'}
                    </Badge>
                  </div>
                  {discoveredModels.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {discoveredModels.slice(0, 8).map((model) => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => setSettings({ ...settings, llmModel: model })}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            settings.llmModel === model
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleTestLlm}
                  loading={isTestingLlm}
                  disabled={!settings.llmApiKey.trim()}
                  className="rounded-xl"
                >
                  {isTestingLlm ? '测试中...' : '测试 API 可用性'}
                </Button>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  建议先测试连接，再保存到系统默认配置。
                </p>
              </div>
            </SettingsSection>

            <SettingsSection
              title="接入建议"
              description="不同提供方都可以走这条配置链路，关键是 Base URL 与 model id 要匹配。"
            >
              <div className="grid gap-4 md:grid-cols-3">
                {llmProviders.map((provider) => (
                  <div
                    key={provider.value}
                    className={`rounded-2xl border p-4 ${
                      settings.llmProvider === provider.value
                        ? 'border-blue-500 bg-blue-50 dark:border-blue-500/70 dark:bg-blue-950/30'
                        : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/50'
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{provider.label}</p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{provider.description}</p>
                  </div>
                ))}
              </div>
            </SettingsSection>
          </div>

          <div className="space-y-6">
            <SettingsSection title="连接状态" description="测试结果会显示模型是否可用，以及接口返回的基本信息。">
              <div className="rounded-3xl border border-gray-200/80 bg-gray-50/80 p-5 dark:border-gray-800 dark:bg-gray-950/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">最近一次测试</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {llmTestResult?.message || '还没有执行过接口测试'}
                    </p>
                  </div>
                  <Badge variant={testBadgeVariant}>
                    {llmTestResult?.available ? 'Available' : llmConfigured ? 'Pending' : 'Unset'}
                  </Badge>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Provider</p>
                    <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                      {llmTestResult?.provider || settings.llmProvider}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Model</p>
                    <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                      {llmTestResult?.model || settings.llmModel || '未选择'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Latency</p>
                    <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                      {formatLatency(llmTestResult?.latencyMs)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Usage</p>
                    <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                      {formatCount(llmTestResult?.usage?.totalTokens)} tokens
                    </p>
                  </div>
                </div>

                {llmTestResult?.responsePreview && (
                  <div className="mt-5 rounded-2xl bg-slate-950 px-4 py-4 text-sm text-slate-100">
                    <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-400">Response Preview</p>
                    <p className="leading-6 text-slate-200">{llmTestResult.responsePreview}</p>
                  </div>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="当前默认值" description="保存后，新的 review 作业会直接使用这里的默认模型配置。">
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Base URL</p>
                  <p className="mt-2 break-all font-medium text-gray-900 dark:text-white">
                    {settings.llmApiBaseUrl || '使用 provider 默认地址'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">模型选择</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">
                    {settings.llmModel || '尚未指定'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200/80 px-4 py-4 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">重试策略</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">
                    最多 {settings.llmMaxRetries} 次重试
                  </p>
                </div>
              </div>
            </SettingsSection>
          </div>
        </div>
      )}

      {activeTab === 'database' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsSection title="连接配置">
            <div className="grid gap-4 md:grid-cols-2">
              <NumberInput label="连接池大小" value={settings.dbConnectionPoolSize} onChange={(value) => setSettings({ ...settings, dbConnectionPoolSize: value })} min={1} max={100} />
              <NumberInput label="连接超时（秒）" value={settings.dbConnectionTimeout} onChange={(value) => setSettings({ ...settings, dbConnectionTimeout: value })} min={5} max={120} unit="秒" />
            </div>
          </SettingsSection>

          <SettingsSection title="缓存配置">
            <NumberInput label="缓存大小（MB）" value={settings.dbCacheSize} onChange={(value) => setSettings({ ...settings, dbCacheSize: value })} min={64} max={2048} unit="MB" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              数据库查询缓存会影响内存占用，这里的值更适合作为平台默认策略而不是短时调参。
            </p>
          </SettingsSection>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsSection title="自动备份">
            <ToggleSetting
              label="启用自动备份"
              description="定期自动创建数据库备份"
              checked={settings.autoBackupEnabled}
              onChange={(value) => setSettings({ ...settings, autoBackupEnabled: value })}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">备份计划</label>
                <select
                  value={settings.backupSchedule}
                  onChange={(event) => setSettings({ ...settings, backupSchedule: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  {backupSchedules.map((schedule) => (
                    <option key={schedule.value} value={schedule.value}>
                      {schedule.label}
                    </option>
                  ))}
                </select>
              </div>
              <NumberInput label="备份保留天数" value={settings.backupRetentionDays} onChange={(value) => setSettings({ ...settings, backupRetentionDays: value })} min={1} max={90} unit="天" />
            </div>
          </SettingsSection>

          <SettingsSection title="手动操作">
            <div className="grid gap-4 md:grid-cols-2">
              <Button variant="outline" onClick={handleBackup} disabled={isBackingUp}>
                {isBackingUp ? '备份中...' : '创建备份'}
              </Button>
              <Button variant="danger" onClick={handleRestore} disabled={isBackingUp}>
                {isBackingUp ? '恢复中...' : '恢复备份'}
              </Button>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">恢复会覆盖当前数据库，请在确认后执行。</p>
          </SettingsSection>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[28px] border border-gray-200/80 bg-white/85 p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950/70 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={resetToDefaults}>
            恢复默认设置
          </Button>
          {hasChanges ? (
            <Badge variant="warning">有未保存的更改</Badge>
          ) : (
            <Badge variant="success">当前配置已同步</Badge>
          )}
        </div>

        <Button onClick={saveSettings} disabled={!hasChanges || isSaving || isBackingUp} loading={isSaving} className="rounded-xl">
          {isSaving ? '保存中...' : '保存设置'}
        </Button>
      </div>
    </div>
  );
}
