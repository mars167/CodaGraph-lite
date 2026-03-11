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
            Local-First · High-Signal PR Review
          </div>
          <h1 className={styles.heroTitle}>
            CodaGraph Lite
          </h1>
          <p className={styles.heroSubtitle}>
            面向 GitHub / Gitee / GitLab 的本地优先审查控制台，把高信号摘要、行级评论、影响分析和可替换 LLM API 放进同一套 workflow。
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
              <p className={styles.metricLabel}>审查输出</p>
              <p className={styles.metricValue}>Summary + Inline Comments</p>
            </div>
            <div className={styles.metricCard}>
              <p className={styles.metricLabel}>部署方式</p>
              <p className={styles.metricValue}>Local-First · Self-Hosted</p>
            </div>
            <div className={styles.metricCard}>
              <p className={styles.metricLabel}>LLM 接入</p>
              <p className={styles.metricValue}>Swappable APIs · BYO Model</p>
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
            <h2 className={styles.featureTitle}>高信号审查</h2>
            <p className={styles.featureDesc}>
              先给 overview，再给真正值得看的行级评论，减少“把 diff 再讲一遍”的低价值反馈。
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
            <h2 className={styles.featureTitle}>可替换 LLM API</h2>
            <p className={styles.featureDesc}>
              可切换 OpenAI、Anthropic、DeepSeek 或 OpenAI-compatible 接口，在质量、速度和成本之间自己取舍。
            </p>
          </article>
        </section>

        <section className={styles.deployPanel}>
          <h2 className={styles.deployTitle}>为什么更适合日常团队使用</h2>
          <div className={styles.deployGrid}>
            <div className={styles.deployCard}>
              <p className={styles.deployCardTitle}>本地优先</p>
              <ul className={styles.deployList}>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGreen}`} />
                  可部署在本机、内网或私有云
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotBlue}`} />
                  SQLite 持久化，免 PostgreSQL
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGold}`} />
                  内置队列，免 Redis
                </li>
              </ul>
            </div>
            <div className={styles.deployCard}>
              <p className={styles.deployCardTitle}>成本与模型自由度</p>
              <ul className={styles.deployList}>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGreen}`} />
                  默认单 Worker，review 成本更可控
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotBlue}`} />
                  OpenAI / Anthropic / DeepSeek 可切换
                </li>
                <li className={styles.deployListItem}>
                  <span className={`${styles.dot} ${styles.dotGold}`} />
                  支持 OpenAI-compatible Base URL
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
