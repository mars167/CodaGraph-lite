'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationHelpers } from '@/contexts/NotificationContext';
import styles from './Login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, noLoginMode } = useAuth();
  const { error, success } = useNotificationHelpers();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 已登录则重定向
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  // 免登录模式：直接跳转到仪表盘
  React.useEffect(() => {
    if (noLoginMode) {
      router.push('/dashboard');
    }
  }, [noLoginMode, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      error('表单错误', '请输入用户名和密码');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username, password);
      success('登录成功', '欢迎回来');
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败，请稍后重试';
      error('登录失败', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgLayer} />
      <div className={styles.container}>
        <div className={styles.brand}>
          <h1 className={styles.title}>CodaGraph Lite</h1>
          <p className={styles.subtitle}>智能代码审查平台</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>管理员登录</h2>

          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>用户名</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                disabled={isSubmitting}
                autoComplete="username"
                required
                className={styles.input}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>密码</span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                disabled={isSubmitting}
                autoComplete="current-password"
                required
                className={styles.input}
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submit}
            >
              {isSubmitting ? '登录中...' : '登录'}
            </button>
          </form>

          <div className={styles.tip}>
            <p>首次使用？请检查服务器日志获取初始凭据</p>
          </div>
        </div>

        <div className={styles.backWrap}>
          <Link href="/" className={styles.backLink}>
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
