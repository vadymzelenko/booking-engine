// src/schema/types.ts
// Универсальные типы для динамического описания таблиц (листов) и колонок
// в Google Sheets. Эта часть библиотеки не завязана на бронирования —
// с её помощью можно описать И создать в таблице лист ЛЮБОЙ формы и сложности
// (не только users/bookings, а произвольные CRM-сущности: отзывы, заказы,
// склад, лиды и т.д.), после чего работать с ним через общий CRUD-протокол.
//
// ВНИМАНИЕ: текущая версия AppsScriptAdapter (src/adapters/storage/AppsScriptAdapter.ts)
// реализует только IBookingStorage и НЕ реализует ISchemaCapableStorage ниже —
// этот модуль сохранён как самостоятельный, не подключённый к publicAPI (src/index.ts).
// Чтобы снова включить универсальный движок таблиц, адаптер нужно доработать
// (см. примечание в README).

/** Поддерживаемые типы колонок. */
export type ColumnType =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "url"
  | "select"
  | "multiselect"
  | "json";

export interface ColumnSchema {
  key: string;
  header: string;
  type: ColumnType;
  required?: boolean;
  unique?: boolean;
  options?: string[];
  defaultValue?: unknown;
  width?: number;
  description?: string;
}

export interface TableSchema {
  name: string;
  primaryKey: string;
  columns: ColumnSchema[];
  freezeHeader?: boolean;
}

export interface TableInfo {
  name: string;
  rowCount: number;
  columns: ColumnSchema[];
  primaryKey: string;
}

export type RowData = Record<string, unknown>;
export type RowFilter = Record<string, unknown>;

export interface ISchemaCapableStorage {
  ensureTable(schema: TableSchema): Promise<TableInfo>;
  dropTable(tableName: string): Promise<void>;
  listTables(): Promise<TableInfo[]>;
  getTableSchema(tableName: string): Promise<TableSchema | null>;
  ensureColumn(tableName: string, column: ColumnSchema): Promise<void>;
  dropColumn(tableName: string, columnKey: string): Promise<void>;
  upsertRow(tableName: string, row: RowData): Promise<RowData>;
  findRows(tableName: string, filter?: RowFilter): Promise<RowData[]>;
  getRow(tableName: string, primaryKeyValue: string): Promise<RowData | null>;
  deleteRow(tableName: string, primaryKeyValue: string): Promise<void>;
  countRows(tableName: string): Promise<number>;
}
