// src/core/BookingEngine.ts
// Ядро библиотеки. Работает только через интерфейсы IBookingStorage / IEmailProvider / ILockProvider.

import { randomUUID } from "crypto";
import type {
  IBookingStorage,
  IEmailProvider,
  ILockProvider,
  BookingEngineConfig,
  BookingRecord,
  CreateBookingInput,
  ResourceRecord,
  CreateResourceInput,
  AvailabilitySlot,
  UserRecord,
  LogRecord,
  BookingStatus,
} from "../types";
import { signToken, verifyToken } from "./jwt";
import { nowIso, minutesAgoIso, isRangeOverlap, generateSlots } from "./dates";
import { MemoryLockAdapter } from "../adapters/lock/MemoryLockAdapter";

const DEFAULT_PENDING_TTL_MINUTES = 15;
const DEFAULT_CONFIRM_TOKEN_TTL_MINUTES = 30;
const DEFAULT_LOGIN_TOKEN_TTL_MINUTES = 15;
const DEFAULT_SESSION_TTL_DAYS = 30;
const LOCK_TTL_MS = 3000;

export class BookingEngineError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "BookingEngineError";
  }
}

export class BookingEngine {
  private storage: IBookingStorage;
  private emailProvider: IEmailProvider;
  private lockProvider: ILockProvider;
  private jwtSecret: string;
  private baseUrl: string;
  private pendingTtlMinutes: number;
  private confirmTokenTtlMinutes: number;
  private loginTokenTtlMinutes: number;
  private sessionTtlDays: number;

  // NEW
  private waitUntil?: (p: Promise<unknown>) => void;
  private resourcesCache: { at: number; data: ResourceRecord[] } | null = null;

  constructor(config: BookingEngineConfig) {
    this.storage = config.storage;
    this.emailProvider = config.emailProvider;
    this.lockProvider = config.lockProvider ?? new MemoryLockAdapter();
    this.jwtSecret = config.jwtSecret;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.pendingTtlMinutes = config.pendingTtlMinutes ?? DEFAULT_PENDING_TTL_MINUTES;
    this.confirmTokenTtlMinutes = config.confirmTokenTtlMinutes ?? DEFAULT_CONFIRM_TOKEN_TTL_MINUTES;
    this.loginTokenTtlMinutes = config.loginTokenTtlMinutes ?? DEFAULT_LOGIN_TOKEN_TTL_MINUTES;
    this.sessionTtlDays = config.sessionTtlDays ?? DEFAULT_SESSION_TTL_DAYS;
    this.waitUntil = config.waitUntil;
  }

  private slotKey(resourceId: string, startTime: string, endTime: string): string {
    return `slot:${resourceId}:${startTime}:${endTime}`;
  }

  // FIX: пробрасываем promise в waitUntil, если передан (serverless).
  private fireAndForget(promise: Promise<unknown>, context: string): void {
    const safe = promise.catch((err) => {
      console.error(`[BookingEngine] ${context} (фоновое действие):`, err);
    });
    this.waitUntil?.(safe);
  }

  // FIX: маппинг статусов составных операций в BookingEngineError.
  private throwStatus(status: string): never {
    const map: Record<string, string> = {
      NOT_FOUND:  "Запись не найдена",
      CANCELLED:  "Запись была отменена",
      EXPIRED:    "Время удержания слота истекло, запись отменена",
      FORBIDDEN:  "Нет доступа к этой записи",
      SLOT_TAKEN: "Выбранное время уже занято",
    };
    throw new BookingEngineError(map[status] ?? "Ошибка хранилища", status);
  }

  private isBlocked(
      bookings: BookingRecord[],
      resourceId: string,
      startTime: string,
      endTime: string,
      staleBefore: string,
      excludeBookingId?: string
  ): boolean {
    return bookings.some((b) => {
      if (excludeBookingId && b.id === excludeBookingId) return false;
      if (b.resourceId !== resourceId) return false;
      if (b.status === "CANCELLED") return false;
      if (b.status === "PENDING" && b.createdAt < staleBefore) return false;
      return isRangeOverlap(b.startTime, b.endTime, startTime, endTime);
    });
  }

  async isSlotAvailable(
      startTime: string,
      endTime: string,
      resourceId: string,
      excludeBookingId?: string
  ): Promise<boolean> {
    const overlapping = await this.storage.findBookingsInRange(startTime, endTime);
    const staleBefore = minutesAgoIso(this.pendingTtlMinutes);
    return !this.isBlocked(overlapping, resourceId, startTime, endTime, staleBefore, excludeBookingId);
  }

  // FIX: список мастеров кэшируется на 60 сек; инвалидируется в create/delete.
  async listResources(): Promise<ResourceRecord[]> {
    const c = this.resourcesCache;
    if (c && Date.now() - c.at < 60_000) return c.data;
    const data = await this.storage.listResources();
    this.resourcesCache = { at: Date.now(), data };
    return data;
  }

  private invalidateResourcesCache(): void {
    this.resourcesCache = null;
  }

  async createResource(input: CreateResourceInput): Promise<ResourceRecord> {
    const r = await this.storage.createResource(input);
    this.invalidateResourcesCache();
    return r;
  }

  async deleteResource(resourceId: string): Promise<void> {
    await this.storage.deleteResource(resourceId);
    this.invalidateResourcesCache();
  }

  async getAvailability(
      startTime: string,
      endTime: string,
      slotMinutes: number
  ): Promise<{ resources: ResourceRecord[]; slots: AvailabilitySlot[] }> {
    const staleBefore = minutesAgoIso(this.pendingTtlMinutes);

    const { resources, bookings } = this.storage.getAvailabilityData
        ? await this.storage.getAvailabilityData(startTime, endTime, staleBefore)
        : await Promise.all([
          this.listResources(),
          this.storage.findBookingsInRange(startTime, endTime),
        ]).then(([resources, bookings]) => ({ resources, bookings }));

    const slots = generateSlots(startTime, endTime, slotMinutes).map((s) => ({
      ...s,
      freeResourceIds: resources
          .filter((r) => !this.isBlocked(bookings, r.id, s.startTime, s.endTime, staleBefore))
          .map((r) => r.id),
    }));

    return { resources, slots };
  }

  // ---------- Booking flow ----------

  async requestBooking(
      input: CreateBookingInput & { name?: string; phone?: string }
  ): Promise<BookingRecord> {
    const resourceId = input.resourceId ?? "";
    const key = this.slotKey(resourceId, input.startTime, input.endTime);
    const release = await this.lockProvider.acquire(key, LOCK_TTL_MS);
    if (!release) {
      throw new BookingEngineError("Слот сейчас обрабатывается, попробуйте ещё раз", "LOCK_BUSY");
    }

    try {
      const bookingId = randomUUID();
      const token = signToken(
          { purpose: "confirm_booking", bookingId },
          this.jwtSecret,
          this.confirmTokenTtlMinutes
      );
      const serviceData = JSON.stringify({
        ...input.serviceData,
        name: input.name,
        phone: input.phone,
      });

      let booking: BookingRecord;
      if (this.storage.reserveSlot) {
        const result = await this.storage.reserveSlot({
          id: bookingId,
          userEmail: input.userEmail,
          resourceId,
          startTime: input.startTime,
          endTime: input.endTime,
          serviceData,
          token,
          staleBefore: minutesAgoIso(this.pendingTtlMinutes),
        });

        if (!result.reserved) {
          throw new BookingEngineError(
              result.reason === "LOCK_BUSY"
                  ? "Слот сейчас обрабатывается, попробуйте ещё раз"
                  : "Выбранное время уже занято",
              result.reason
          );
        }
        booking = result.booking;
      } else {
        const available = await this.isSlotAvailable(input.startTime, input.endTime, resourceId);
        if (!available) throw new BookingEngineError("Выбранное время уже занято", "SLOT_TAKEN");

        booking = await this.storage.createBooking({
          id: bookingId,
          userEmail: input.userEmail,
          resourceId,
          startTime: input.startTime,
          endTime: input.endTime,
          serviceData,
          status: "PENDING",
          token,
        });
      }

      this.fireAndForget(
          this.storage.appendLog({
            timestamp: nowIso(),
            action: "BOOKING_REQUESTED",
            email: input.userEmail,
            details: `Запрошена новая запись ${bookingId} на ${input.startTime}–${input.endTime}`,
          }),
          "лог BOOKING_REQUESTED"
      );

      const confirmUrl = `${this.baseUrl}/api/confirm?token=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(input.name ?? "");
      const safeStart = escapeHtml(input.startTime);
      const safeEnd = escapeHtml(input.endTime);
      this.fireAndForget(
          this.emailProvider.sendMail({
            to: input.userEmail,
            subject: "Подтвердите запись",
            html: `<p>Здравствуйте${safeName ? `, ${safeName}` : ""}!</p>
<p>Подтвердите запись на <b>${safeStart}–${safeEnd}</b>, перейдя по ссылке:</p>
<p><a href="${confirmUrl}">${confirmUrl}</a></p>
<p>Ссылка действительна ${this.confirmTokenTtlMinutes} минут. Слот удерживается за вами ${this.pendingTtlMinutes} минут — если не успеть, придётся бронировать заново.</p>`,
          }),
          "письмо подтверждения"
      );

      return booking;
    } finally {
      await release();
    }
  }

  async confirmBooking(token: string): Promise<BookingRecord> {
    const payload = verifyToken(token, this.jwtSecret);
    if (!payload || payload.purpose !== "confirm_booking" || !payload.bookingId) {
      throw new BookingEngineError("Недействительная или просроченная ссылка", "INVALID_TOKEN");
    }

    // NEW: если хранилище умеет составной confirm — один round-trip.
    if (this.storage.confirmBooking) {
      const r = await this.storage.confirmBooking({
        bookingId: payload.bookingId,
        staleBefore: minutesAgoIso(this.pendingTtlMinutes),
      });
      if (r.status !== "OK") this.throwStatus(r.status);
      return r.booking;
    }

    // Fallback
    const booking = await this.storage.findBookingById(payload.bookingId);
    if (!booking) throw new BookingEngineError("Запись не найдена", "NOT_FOUND");
    if (booking.status === "CANCELLED") {
      throw new BookingEngineError("Запись была отменена", "CANCELLED");
    }
    if (booking.status === "CONFIRMED") return booking;

    const staleBefore = minutesAgoIso(this.pendingTtlMinutes);
    if (booking.createdAt < staleBefore) {
      await this.storage.updateBookingStatus(booking.id, "CANCELLED");
      throw new BookingEngineError("Время удержания слота истекло, запись отменена", "EXPIRED");
    }

    await Promise.all([
      this.storage.updateBookingStatus(booking.id, "CONFIRMED"),
      this.ensureUser(booking),
    ]);

    this.fireAndForget(
        this.storage.appendLog({
          timestamp: nowIso(),
          action: "BOOKING_CONFIRMED",
          email: booking.userEmail,
          details: `Запись ${booking.id} подтверждена`,
        }),
        "лог BOOKING_CONFIRMED"
    );

    return { ...booking, status: "CONFIRMED" };
  }

  private async ensureUser(booking: BookingRecord): Promise<void> {
    const existing = await this.storage.findUserByEmail(booking.userEmail);
    if (existing) return;
    const serviceData = safeParse(booking.serviceData);
    await this.storage.createUser({
      email: booking.userEmail,
      name: (serviceData?.name as string) ?? "",
      phone: (serviceData?.phone as string) ?? "",
    });
  }

  async requestLogin(email: string): Promise<void> {
    const user = await this.storage.findUserByEmail(email);
    if (!user) return;

    const token = signToken({ purpose: "login", email }, this.jwtSecret, this.loginTokenTtlMinutes);
    const loginUrl = `${this.baseUrl}/api/login?token=${encodeURIComponent(token)}`;

    this.fireAndForget(
        this.storage.appendLog({
          timestamp: nowIso(),
          action: "LOGIN_REQUESTED",
          email,
          details: "Запрошена ссылка для входа",
        }),
        "лог LOGIN_REQUESTED"
    );

    this.fireAndForget(
        this.emailProvider.sendMail({
          to: email,
          subject: "Ссылка для входа",
          html: `<p>Перейдите по ссылке, чтобы войти в личный кабинет:</p>
<p><a href="${loginUrl}">${loginUrl}</a></p>
<p>Ссылка действительна ${this.loginTokenTtlMinutes} минут.</p>`,
        }),
        "письмо для входа"
    );
  }

  async verifyLoginToken(
      token: string
  ): Promise<{ email: string; sessionToken: string; sessionTtlDays: number }> {
    const payload = verifyToken(token, this.jwtSecret);
    if (!payload || payload.purpose !== "login" || !payload.email) {
      throw new BookingEngineError("Недействительная или просроченная ссылка", "INVALID_TOKEN");
    }

    const sessionToken = signToken(
        { purpose: "session", email: payload.email },
        this.jwtSecret,
        this.sessionTtlDays * 24 * 60
    );

    this.fireAndForget(
        this.storage.appendLog({
          timestamp: nowIso(),
          action: "LOGIN_SUCCESS",
          email: payload.email,
          details: "Вход выполнен по magic link",
        }),
        "лог LOGIN_SUCCESS"
    );

    return { email: payload.email, sessionToken, sessionTtlDays: this.sessionTtlDays };
  }

  verifySession(sessionToken: string): { email: string } | null {
    const payload = verifyToken(sessionToken, this.jwtSecret);
    if (!payload || payload.purpose !== "session" || !payload.email) return null;
    return { email: payload.email };
  }

  createSession(email: string): { sessionToken: string; sessionTtlDays: number } {
    const sessionToken = signToken(
        { purpose: "session", email },
        this.jwtSecret,
        this.sessionTtlDays * 24 * 60
    );
    return { sessionToken, sessionTtlDays: this.sessionTtlDays };
  }

  async listUserBookings(email: string): Promise<BookingRecord[]> {
    return this.storage.listBookingsByUser(email);
  }

  // ---------- Админ ----------

  async listAllBookings(): Promise<BookingRecord[]> { return this.storage.listBookings(); }
  async listUsers(): Promise<UserRecord[]> { return this.storage.listUsers(); }
  async listLogs(): Promise<LogRecord[]> { return this.storage.listLogs(); }
  async deleteBooking(bookingId: string): Promise<void> { await this.storage.deleteBooking(bookingId); }

  async setBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
    await this.storage.updateBookingStatus(bookingId, status);
  }

  async rebuildReport(): Promise<void> {
    await this.storage.rebuildReport?.();
  }

  async cancelBooking(bookingId: string, requesterEmail: string): Promise<void> {
    // NEW: если хранилище умеет — один round-trip (проверка владельца + patch + лог).
    if (this.storage.cancelBooking) {
      const r = await this.storage.cancelBooking({ bookingId, requesterEmail });
      if (r.status !== "OK") this.throwStatus(r.status);
      return;
    }

    // Fallback
    const booking = await this.storage.findBookingById(bookingId);
    if (!booking) throw new BookingEngineError("Запись не найдена", "NOT_FOUND");
    if (booking.userEmail.toLowerCase() !== requesterEmail.toLowerCase()) {
      throw new BookingEngineError("Нет доступа к этой записи", "FORBIDDEN");
    }

    await this.storage.updateBookingStatus(bookingId, "CANCELLED");
    this.fireAndForget(
        this.storage.appendLog({
          timestamp: nowIso(),
          action: "BOOKING_CANCELLED",
          email: requesterEmail,
          details: `Запись ${bookingId} отменена пользователем`,
        }),
        "лог BOOKING_CANCELLED"
    );
  }

  async rescheduleBooking(
      bookingId: string,
      requesterEmail: string,
      newStartTime: string,
      newEndTime: string
  ): Promise<BookingRecord> {
    // NEW: если хранилище умеет — один round-trip, вся проверка под его LockService.
    if (this.storage.rescheduleBooking) {
      const r = await this.storage.rescheduleBooking({
        bookingId,
        requesterEmail,
        startTime: newStartTime,
        endTime: newEndTime,
        staleBefore: minutesAgoIso(this.pendingTtlMinutes),
      });
      if (r.status !== "OK") this.throwStatus(r.status);
      return r.booking;
    }

    // Fallback
    const booking = await this.storage.findBookingById(bookingId);
    if (!booking) throw new BookingEngineError("Запись не найдена", "NOT_FOUND");
    if (booking.userEmail.toLowerCase() !== requesterEmail.toLowerCase()) {
      throw new BookingEngineError("Нет доступа к этой записи", "FORBIDDEN");
    }
    if (booking.status === "CANCELLED") {
      throw new BookingEngineError("Запись была отменена", "CANCELLED");
    }

    const key = this.slotKey(booking.resourceId, newStartTime, newEndTime);
    const release = await this.lockProvider.acquire(key, LOCK_TTL_MS);
    if (!release) {
      throw new BookingEngineError("Слот сейчас обрабатывается, попробуйте ещё раз", "LOCK_BUSY");
    }

    try {
      const available = await this.isSlotAvailable(
          newStartTime,
          newEndTime,
          booking.resourceId,
          bookingId
      );
      if (!available) throw new BookingEngineError("Выбранное время уже занято", "SLOT_TAKEN");

      await this.storage.updateBookingTime(bookingId, newStartTime, newEndTime);
      this.fireAndForget(
          this.storage.appendLog({
            timestamp: nowIso(),
            action: "BOOKING_RESCHEDULED",
            email: requesterEmail,
            details: `Запись ${bookingId} перенесена на ${newStartTime}–${newEndTime}`,
          }),
          "лог BOOKING_RESCHEDULED"
      );

      return { ...booking, startTime: newStartTime, endTime: newEndTime };
    } finally {
      await release();
    }
  }
}

function safeParse(json: string): Record<string, unknown> | null {
  try { return JSON.parse(json); } catch { return null; }
}

function escapeHtml(input: string): string {
  return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}