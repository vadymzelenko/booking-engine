"use strict";
// src/schema/SheetSchemaManager.ts
// Тонкая обёртка над ISchemaCapableStorage (реализует AppsScriptAdapter):
//  - кэширует схемы таблиц, чтобы не дёргать getTableSchema на каждую запись;
//  - валидирует данные на клиенте ДО похода в Google Sheets (обязательные поля,
//    допустимые значения select/multiselect, базовая проверка типов) — так
//    ошибки видны сразу, без лишнего round-trip;
//  - даёт удобные читаемые методы вместо сырых action-вызовов.
//
// Использование ЭТОГО класса не обязательно: можно вызывать методы адаптера
// (AppsScriptAdapter) напрямую, они делают то же самое на сервере. Но
// SheetSchemaManager рекомендуется — он ловит опечатки и ошибки до сети.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SheetSchemaManager = exports.SchemaValidationError = void 0;
class SchemaValidationError extends Error {
    constructor(message, issues) {
        super(message);
        this.issues = issues;
        this.name = "SchemaValidationError";
    }
}
exports.SchemaValidationError = SchemaValidationError;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
class SheetSchemaManager {
    constructor(storage) {
        this.storage = storage;
        /** name таблицы -> её схема (обновляется при ensureTable/ensureColumn/dropColumn). */
        this.schemaCache = new Map();
    }
    /** Создать таблицу (если её нет) или дописать недостающие колонки (если уже есть). Идемпотентно. */
    async defineTable(schema) {
        const info = await this.storage.ensureTable(schema);
        this.schemaCache.set(schema.name, schema);
        return info;
    }
    /** Добавить одну колонку в уже существующую (или ещё не описанную здесь) таблицу. */
    async addColumn(tableName, column) {
        await this.storage.ensureColumn(tableName, column);
        this.schemaCache.delete(tableName); // схема изменилась — сбрасываем кэш, перечитаем при следующем обращении
    }
    async dropColumn(tableName, columnKey) {
        await this.storage.dropColumn(tableName, columnKey);
        this.schemaCache.delete(tableName);
    }
    async dropTable(tableName) {
        await this.storage.dropTable(tableName);
        this.schemaCache.delete(tableName);
    }
    async listTables() {
        return this.storage.listTables();
    }
    async getSchema(tableName) {
        const cached = this.schemaCache.get(tableName);
        if (cached)
            return cached;
        const schema = await this.storage.getTableSchema(tableName);
        if (!schema) {
            throw new Error(`SheetSchemaManager: таблица "${tableName}" не найдена. Сначала вызовите defineTable(...).`);
        }
        this.schemaCache.set(tableName, schema);
        return schema;
    }
    /** Проверяет row на соответствие схеме таблицы. Бросает SchemaValidationError со списком проблем. */
    validate(schema, row, opts) {
        const issues = [];
        for (const col of schema.columns) {
            const has = Object.prototype.hasOwnProperty.call(row, col.key);
            if (!has) {
                // partial=true — это update существующей строки, отсутствующие поля не трогаем.
                if (!opts.partial && col.required && col.defaultValue === undefined) {
                    issues.push(`поле "${col.key}" (${col.header}) обязательно`);
                }
                continue;
            }
            const value = row[col.key];
            if (value === null || value === undefined || value === "") {
                if (col.required)
                    issues.push(`поле "${col.key}" (${col.header}) обязательно и не может быть пустым`);
                continue;
            }
            switch (col.type) {
                case "number":
                case "currency":
                    if (typeof value !== "number" || Number.isNaN(value)) {
                        issues.push(`поле "${col.key}" должно быть числом, получено: ${JSON.stringify(value)}`);
                    }
                    break;
                case "boolean":
                    if (typeof value !== "boolean") {
                        issues.push(`поле "${col.key}" должно быть true/false, получено: ${JSON.stringify(value)}`);
                    }
                    break;
                case "email":
                    if (typeof value !== "string" || !EMAIL_RE.test(value)) {
                        issues.push(`поле "${col.key}" должно быть похоже на email, получено: ${JSON.stringify(value)}`);
                    }
                    break;
                case "select":
                    if (typeof value !== "string" || !(col.options ?? []).includes(value)) {
                        issues.push(`поле "${col.key}" должно быть одним из [${(col.options ?? []).join(", ")}], получено: ${JSON.stringify(value)}`);
                    }
                    break;
                case "multiselect": {
                    const values = Array.isArray(value) ? value : String(value).split(",").map((v) => v.trim());
                    const invalid = values.filter((v) => !(col.options ?? []).includes(v));
                    if (invalid.length > 0) {
                        issues.push(`поле "${col.key}" содержит недопустимые значения [${invalid.join(", ")}], разрешены: [${(col.options ?? []).join(", ")}]`);
                    }
                    break;
                }
                default:
                    break;
            }
        }
        if (issues.length > 0) {
            throw new SchemaValidationError(`SheetSchemaManager: данные для таблицы "${schema.name}" не прошли валидацию`, issues);
        }
    }
    /** Применяет defaultValue для отсутствующих полей (не трогает partial-обновления). */
    applyDefaults(schema, row) {
        const result = { ...row };
        for (const col of schema.columns) {
            if (!Object.prototype.hasOwnProperty.call(result, col.key) && col.defaultValue !== undefined) {
                result[col.key] = col.defaultValue;
            }
        }
        return result;
    }
    /**
     * Создать новую строку или обновить существующую (upsert по primaryKey).
     * При создании (primaryKey ещё не встречался в таблице) — required-поля обязательны.
     * При обновлении — можно передавать только изменяемые поля.
     */
    async save(tableName, row) {
        const schema = await this.getSchema(tableName);
        const pkValue = row[schema.primaryKey];
        if (pkValue === undefined || pkValue === null || pkValue === "") {
            throw new SchemaValidationError(`SheetSchemaManager: не передано значение первичного ключа "${schema.primaryKey}"`, [
                `поле "${schema.primaryKey}" обязательно для upsert`,
            ]);
        }
        const existing = await this.storage.getRow(tableName, String(pkValue));
        const withDefaults = existing ? row : this.applyDefaults(schema, row);
        this.validate(schema, withDefaults, { partial: Boolean(existing) });
        return this.storage.upsertRow(tableName, withDefaults);
    }
    async find(tableName, filter) {
        return this.storage.findRows(tableName, filter);
    }
    async get(tableName, primaryKeyValue) {
        return this.storage.getRow(tableName, primaryKeyValue);
    }
    async remove(tableName, primaryKeyValue) {
        await this.storage.deleteRow(tableName, primaryKeyValue);
    }
    async count(tableName) {
        return this.storage.countRows(tableName);
    }
}
exports.SheetSchemaManager = SheetSchemaManager;
