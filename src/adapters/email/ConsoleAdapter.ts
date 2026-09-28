// src/adapters/email/ConsoleAdapter.ts
// Dev/demo-реализация IEmailProvider — ничего никуда не отправляет, просто печатает
// письмо в консоль сервера. Используется, когда <PREFIX>_EMAIL_PROVIDER=console
// (или не задан вовсе) — ровно то поведение, которое уже описано в .env как поведение
// по умолчанию, но которому не хватало реализации.

import type { IEmailProvider } from "../../types";

export class ConsoleEmailAdapter implements IEmailProvider {
  async sendMail(params: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    console.log("\n===== [ConsoleEmailAdapter] письмо (не отправлено, только лог) =====");
    console.log("Кому:", params.to);
    console.log("Тема:", params.subject);
    console.log("HTML:\n", params.html);
    console.log("======================================================================\n");
  }
}
