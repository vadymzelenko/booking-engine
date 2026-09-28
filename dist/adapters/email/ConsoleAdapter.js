"use strict";
// src/adapters/email/ConsoleAdapter.ts
// Dev/demo-реализация IEmailProvider — ничего никуда не отправляет, просто печатает
// письмо в консоль сервера. Используется, когда <PREFIX>_EMAIL_PROVIDER=console
// (или не задан вовсе) — ровно то поведение, которое уже описано в .env как поведение
// по умолчанию, но которому не хватало реализации.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleEmailAdapter = void 0;
class ConsoleEmailAdapter {
    async sendMail(params) {
        console.log("\n===== [ConsoleEmailAdapter] письмо (не отправлено, только лог) =====");
        console.log("Кому:", params.to);
        console.log("Тема:", params.subject);
        console.log("HTML:\n", params.html);
        console.log("======================================================================\n");
    }
}
exports.ConsoleEmailAdapter = ConsoleEmailAdapter;
