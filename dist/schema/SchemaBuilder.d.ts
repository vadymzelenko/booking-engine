import type { ColumnSchema, ColumnType, TableSchema } from "./types";
type ColumnOptions = Partial<Omit<ColumnSchema, "key" | "header" | "type">>;
export declare class TableSchemaBuilder {
    private readonly tableName;
    private columns;
    private primaryKeyField;
    private freeze;
    private constructor();
    /** Точка входа: table("Имя листа"). */
    static table(name: string): TableSchemaBuilder;
    /** Универсальный метод добавления колонки любого типа. */
    column(key: string, header: string, type: ColumnType, opts?: ColumnOptions): this;
    text(key: string, header: string, opts?: ColumnOptions): this;
    longText(key: string, header: string, opts?: ColumnOptions): this;
    number(key: string, header: string, opts?: ColumnOptions): this;
    currency(key: string, header: string, opts?: ColumnOptions): this;
    boolean(key: string, header: string, opts?: ColumnOptions): this;
    date(key: string, header: string, opts?: ColumnOptions): this;
    datetime(key: string, header: string, opts?: ColumnOptions): this;
    email(key: string, header: string, opts?: ColumnOptions): this;
    phone(key: string, header: string, opts?: ColumnOptions): this;
    url(key: string, header: string, opts?: ColumnOptions): this;
    /** options передаётся отдельным аргументом (частый случай), опции стиля — третьим. */
    select(key: string, header: string, options: string[], opts?: ColumnOptions): this;
    multiselect(key: string, header: string, options: string[], opts?: ColumnOptions): this;
    json(key: string, header: string, opts?: ColumnOptions): this;
    /** Указать, какая колонка — первичный ключ. Если не вызвать — берётся первая добавленная колонка. */
    primaryKey(key: string): this;
    freezeHeader(value: boolean): this;
    build(): TableSchema;
}
/** Короткий алиас для TableSchemaBuilder.table(...). */
export declare function table(name: string): TableSchemaBuilder;
export {};
