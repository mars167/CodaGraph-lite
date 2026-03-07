/**
 * WebhookEvent 数据模型
 *
 * 提供 Webhook 事件的 CRUD 操作
 */

import { getConnection } from '../database/connection';
import type { WebhookEvent, Platform } from './types';

export class WebhookEventModel {
  private db = getConnection();

  /**
   * 根据 ID 查找事件
   */
  findById(id: number): WebhookEvent | null {
    const result = this.db.get<WebhookEvent>(
      'SELECT * FROM webhook_event WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * 根据 payload ID 查找事件
   */
  findByPayloadId(payloadId: string): WebhookEvent | null {
    const result = this.db.get<WebhookEvent>(
      'SELECT * FROM webhook_event WHERE payload_id = ?',
      [payloadId]
    );
    return result || null;
  }

  /**
   * 获取未处理的事件
   */
  findUnprocessed(platform?: Platform, limit = 100): WebhookEvent[] {
    let sql = 'SELECT * FROM webhook_event WHERE processed = 0';
    const params: any[] = [];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    sql += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);

    return this.db.all<WebhookEvent>(sql, params);
  }

  /**
   * 获取指定平台的事件
   */
  findByPlatform(platform: Platform, limit = 100): WebhookEvent[] {
    return this.db.all<WebhookEvent>(
      'SELECT * FROM webhook_event WHERE platform = ? ORDER BY created_at DESC LIMIT ?',
      [platform, limit]
    );
  }

  /**
   * 根据事件类型查找
   */
  findByEventType(eventType: string, limit = 100): WebhookEvent[] {
    return this.db.all<WebhookEvent>(
      'SELECT * FROM webhook_event WHERE event_type = ? ORDER BY created_at DESC LIMIT ?',
      [eventType, limit]
    );
  }

  /**
   * 获取所有事件
   */
  findAll(limit = 100): WebhookEvent[] {
    return this.db.all<WebhookEvent>(
      'SELECT * FROM webhook_event ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  /**
   * 创建 Webhook 事件记录
   */
  create(
    platform: Platform,
    eventType: string,
    payloadId: string | null,
    payload: any
  ): WebhookEvent {
    const result = this.db.execute(
      'INSERT INTO webhook_event (platform, event_type, payload_id, payload) VALUES (?, ?, ?, ?)',
      [platform, eventType, payloadId, JSON.stringify(payload)]
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('创建 Webhook 事件失败');
    }

    return created;
  }

  /**
   * 标记为已处理
   */
  markProcessed(id: number, error?: string | null): boolean {
    const fields = ['processed = 1'];
    const params: any[] = [];

    if (error !== undefined) {
      fields.push('processing_error = ?');
      params.push(error);
    }

    const sql = `UPDATE webhook_event SET ${fields.join(', ')} WHERE id = ?`;

    const result = this.db.execute(sql, [...params, id]);

    return result.changes > 0;
  }

  /**
   * 标记为处理失败
   */
  markProcessingError(id: number, errorMessage: string): boolean {
    return this.markProcessed(id, errorMessage);
  }

  /**
   * 删除事件
   */
  delete(id: number): boolean {
    const result = this.db.execute(
      'DELETE FROM webhook_event WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * 清理已处理的旧事件（超过指定天数）
   */
  deleteProcessedOlderThan(days: number): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = this.db.execute(
      'DELETE FROM webhook_event WHERE processed = 1 AND created_at < ?',
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }

  /**
   * 统计事件数量
   */
  count(): number {
    const result = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM webhook_event'
    );
    return result?.count ?? 0;
  }

  /**
   * 统计未处理事件数量
   */
  countUnprocessed(): number {
    const result = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM webhook_event WHERE processed = 0"
    );
    return result?.count ?? 0;
  }
}

// 单例实例
let webhookEventModelInstance: WebhookEventModel | null = null;

export function getWebhookEventModel(): WebhookEventModel {
  if (!webhookEventModelInstance) {
    webhookEventModelInstance = new WebhookEventModel();
  }
  return webhookEventModelInstance;
}
