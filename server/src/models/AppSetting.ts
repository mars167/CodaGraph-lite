import { getConnection } from '../database/connection';

type AppSettingRow = {
  setting_key: string;
  setting_value: string;
  updated_at: string;
};

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class AppSettingModel {
  private db = getConnection();

  get<T>(key: string): T | null {
    const row = this.db.get<AppSettingRow>(
      'SELECT setting_key, setting_value, updated_at FROM app_setting WHERE setting_key = ?',
      [key]
    );

    if (!row) {
      return null;
    }

    return parseValue(row.setting_value) as T;
  }

  getAll(): Record<string, unknown> {
    const rows = this.db.all<AppSettingRow>(
      'SELECT setting_key, setting_value, updated_at FROM app_setting'
    );

    return rows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.setting_key] = parseValue(row.setting_value);
      return acc;
    }, {});
  }

  set(key: string, value: unknown): void {
    this.db.execute(
      `INSERT INTO app_setting (setting_key, setting_value)
       VALUES (?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  }

  setMany(entries: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value);
    }
  }
}

let appSettingModelInstance: AppSettingModel | null = null;

export function getAppSettingModel(): AppSettingModel {
  if (!appSettingModelInstance) {
    appSettingModelInstance = new AppSettingModel();
  }

  return appSettingModelInstance;
}
