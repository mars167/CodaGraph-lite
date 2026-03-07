'use client';

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./Home.module.css";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className={styles.page}>
      <div className={styles.backgroundLayer} />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            GitHub Style · Semantic PR Review
          </div>
          <h1 className={styles.heroTitle}>
            CodaGraph Lite
          </h1>
          <p className={styles.heroSubtitle}>
            面向 GitHub / Gitee / GitLab 的深色审查控制台，聚焦语义变更、影响范围和合并风险。
          </p>
          <div className={styles.heroActions}>
            <Link
              href={isAuthenticated ? "/dashboard" : "/login"}
              className={`${styles.actionBtn} ${styles.actionPrimary}`}
            >
              {isAuthenticated ? "进入仪表板" : "管理员登录"}
            </Link>
            <a
              href="#features"
              className={`${styles.actionBtn} ${styles.actionGhost}`}
            >
              查看能力
            </a>
          </div>
          <div className={styles.metrics}>
            <div className={styles.metricCard}>
              <p className={styles.metricLabel}>分析引擎</p>
              <p className={styles.metricValue}>Semantic + Dependency Graph</p>
            </div>
            <div className={styles.metricCard}>
              <p className={styles.metricLabel}>运行模式</p>
              <p className={styles.metricValue}>2u2g 资源友好串行处理</p>
            </div>
            <div className={styles.metricCard}>
              <p className={styles.metricLabel}>接入平台</p>
              <p className={styles.metricValue}>GitHub · Gitee · GitLab</p>
            </div>
          </div>
        </section>

        <section id="features" className={styles.featuresGrid}>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg className={styles.iconBlue} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M9 8h6M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
              </svg>
            </div>
            <h2 className={styles.featureTitle}>语义分析</h2>
            <p className={styles.featureDesc}>
              基于代码结构识别真实改动，过滤格式噪音并聚焦逻辑变更。
            </p>
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg className={styles.iconGreen} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 5a3 3 0 110 6 3 3 0 010-6zM6 9a3 3 0 110 6 3 3 0 010-6zm12 4a3 3 0 110 6 3 3 0 010-6zM8.7 12.6l6.6 3.8M15.3 7.6L8.7 11.4" />
              </svg>
            </div>
            <h2 className={styles.featureTitle}>影响图谱</h2>
            <p className={styles.featureDesc}>
              展示改动在模块与接口间的传播路径，提前发现潜在连锁影响。
            </p>
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg className={styles.iconGold} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" />
              </svg>
            </div>
            <h2 className={styles.featureTitle}>自动审查</h2>
            <p className={styles.featureDesc}>
              自动识别高风险变更并给出可执行建议，提升合并前质量门槛。
            </p>
          </article>
        </section>

        <section className={styles.deployPanel}>
          <h2 className={styles.deployTitle}>平台与部署</h2>
          <div className={styles.deployGrid}>
            <div className={styles.deployCard}>
              <p className={styles.deployCardTitle}>代码托管平台</p>
              <div className={styles.tagGroup}>
                <span className={styles.tag}>GitHub</span>
                <span className={styles.tag}>Gitee</span>
                <span className={styles.tag}>GitLab</span>
              </div>
            </div>
            <div className={styles.deployCard}>
              <p className={styles.deployCardTitle}>轻量部署能力</p>
              <ul className={styles.deployList}>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGreen}`} />
                  SQLite 持久化，免 PostgreSQL
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotBlue}`} />
                  内置队列，免 Redis
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGold}`} />
                  串行任务调度，内存稳定
                </li>
              </ul>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          CodaGraph Lite v{process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0"}
        </footer>
      </main>
    </div>
  );
}
