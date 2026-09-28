import type { ColumnSchema, ISchemaCapableStorage, RowData, RowFilter, TableInfo, TableSchema } from "./types";
export declare class SchemaValidationError extends Error {
    readonly issues: string[];
    constructor(message: string, issues: string[]);
}
export declare class SheetSchemaManager {
    private readonly storage;
    /** name таблицы -> её схема (обновляется при ensureTable/ensureColumn/dropColumn). */
    private schemaCache;
    constructor(storage: ISchemaCapableStorage);
    /** Создать таблицу (если её нет) или дописать недостающие колонки (если уже есть). Идемпотентно. */
    defineTable(schema: TableSchema): Promise<TableInfo>;
    /** Добавить одну колонку в уже существующую (или ещё не описанную здесь) таблицу. */
    addColumn(tableName: string, column: ColumnSchema): Promise<void>;
    dropColumn(tableName: string, columnKey: string): Promise<void>;
    dropTable(tableName: string): Promise<void>;
    listTables(): Promise<TableInfo[]>;
    private getSchema;
    /** Проверяет row на соответствие схеме таблицы. Бросает SchemaValidationError со списком проблем. */
    private validate;
    /** Применяет defaultValue для отсутствующих полей (не трогает partial-обновления). */
    private applyDefaults;
    /**
     * Создать новую строку или обновить существующую (upsert по primaryKey).
     * При создании (primaryKey ещё не встречался в таблице) — required-поля обязательны.
     * При обновлении — можно передавать только изменяемые поля.
     */
    save(tableName: string, row: RowData): Promise<RowData>;
    find(tableName: string, filter?: RowFilter): Promise<RowData[]>;
    get(tableName: string, primaryKeyValue: string): Promise<RowData | null>;
    remove(tableName: string, primaryKeyValue: string): Promise<void>;
    count(tableName: string): Promise<number>;
}
