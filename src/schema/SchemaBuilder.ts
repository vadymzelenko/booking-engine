// src/schema/SchemaBuilder.ts
// Удобный fluent-API для описания таблицы, чтобы не собирать TableSchema
// вручную объектным литералом. Полностью опционален: TableSchema можно
// собрать и напрямую, билдер лишь удобнее и меньше подвержен опечаткам.
//
// Пример:
//
//   const reviewsTable = table("Отзывы")
//     .text("clientEmail", "Почта клиента", { required: true })
//     .number("rating", "Оценка (1-5)", { required: true })
//     .longText("comment", "Комментарий")
//     .select("status", "Статус модерации", ["Новый", "Одобрен", "Скрыт"], { defaultValue: "Новый" })
//     .datetime("createdAt", "Дата создания")
//     .primaryKey("clientEmail")
//     .build();

import type { ColumnSchema, ColumnType, TableSchema } from "./types";

type ColumnOptions = Partial<Omit<ColumnSchema, "key" | "header" | "type">>;

export class TableSchemaBuilder {
  private columns: ColumnSchema[] = [];
  private primaryKeyField: string | undefined;
  private freeze = true;

  private constructor(private readonly tableName: string) {}

  /** Точка входа: table("Имя листа"). */
  static table(name: string): TableSchemaBuilder {
    if (!name || !name.trim()) {
      throw new Error("TableSchemaBuilder: имя таблицы не может быть пустым");
    }
    return new TableSchemaBuilder(name.trim());
  }

  /** Универсальный метод добавления колонки любого типа. */
  column(key: string, header: string, type: ColumnType, opts: ColumnOptions = {}): this {
    if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw new Error(
        `TableSchemaBuilder("${this.tableName}"): key колонки "${key}" должен быть похож на программный идентификатор (латиница, цифры, "_", не начинаться с цифры)`
      );
    }
    if (this.columns.some((c) => c.key === key)) {
      throw new Error(`TableSchemaBuilder("${this.tableName}"): колонка с key="${key}" уже добавлена`);
    }
    if ((type === "select" || type === "multiselect") && (!opts.options || opts.options.length === 0)) {
      throw new Error(
        `TableSchemaBuilder("${this.tableName}"): для колонки "${key}" типа "${type}" нужно передать options (список значений)`
      );
    }
    this.columns.push({ key, header, type, ...opts });
    return this;
  }

  text(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "text", opts);
  }

  longText(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "long_text", opts);
  }

  number(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "number", opts);
  }

  currency(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "currency", opts);
  }

  boolean(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "boolean", opts);
  }

  date(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "date", opts);
  }

  datetime(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "datetime", opts);
  }

  email(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "email", opts);
  }

  phone(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "phone", opts);
  }

  url(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "url", opts);
  }

  /** options передаётся отдельным аргументом (частый случай), опции стиля — третьим. */
  select(key: string, header: string, options: string[], opts: ColumnOptions = {}): this {
    return this.column(key, header, "select", { ...opts, options });
  }

  multiselect(key: string, header: string, options: string[], opts: ColumnOptions = {}): this {
    return this.column(key, header, "multiselect", { ...opts, options });
  }

  json(key: string, header: string, opts: ColumnOptions = {}): this {
    return this.column(key, header, "json", opts);
  }

  /** Указать, какая колонка — первичный ключ. Если не вызвать — берётся первая добавленная колонка. */
  primaryKey(key: string): this {
    this.primaryKeyField = key;
    return this;
  }

  freezeHeader(value: boolean): this {
    this.freeze = value;
    return this;
  }

  build(): TableSchema {
    if (this.columns.length === 0) {
      throw new Error(`TableSchemaBuilder("${this.tableName}"): в таблице нет ни одной колонки`);
    }
    const primaryKey = this.primaryKeyField ?? this.columns[0].key;
    if (!this.columns.some((c) => c.key === primaryKey)) {
      throw new Error(
        `TableSchemaBuilder("${this.tableName}"): primaryKey "${primaryKey}" не найден среди добавленных колонок`
      );
    }
    return {
      name: this.tableName,
      primaryKey,
      columns: this.columns,
      freezeHeader: this.freeze,
    };
  }
}

/** Короткий алиас для TableSchemaBuilder.table(...). */
export function table(name: string): TableSchemaBuilder {
  return TableSchemaBuilder.table(name);
}
