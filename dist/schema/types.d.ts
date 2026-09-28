/** Поддерживаемые типы колонок. */
export type ColumnType = "text" | "long_text" | "number" | "currency" | "boolean" | "date" | "datetime" | "email" | "phone" | "url" | "select" | "multiselect" | "json";
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
