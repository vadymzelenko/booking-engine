export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export interface UserRecord {
    id: string;
    email: string;
    name: string;
    phone: string;
    createdAt: string;
    [key: string]: unknown;
}
export interface ResourceRecord {
    id: string;
    name: string;
    [key: string]: unknown;
}
export interface BookingRecord {
    id: string;
    userEmail: string;
    resourceId: string;
    startTime: string;
    endTime: string;
    serviceData: string;
    status: BookingStatus;
    token: string;
    createdAt: string;
}
export interface LogRecord {
    timestamp: string;
    action: string;
    email: string;
    details: string;
}
export interface CreateUserInput {
    email: string;
    name: string;
    phone: string;
    [key: string]: unknown;
}
export interface CreateResourceInput {
    name: string;
    [key: string]: unknown;
}
export interface CreateBookingInput {
    userEmail: string;
    resourceId?: string;
    startTime: string;
    endTime: string;
    serviceData?: Record<string, unknown>;
}
export interface ReserveSlotInput {
    id: string;
    userEmail: string;
    resourceId: string;
    startTime: string;
    endTime: string;
    serviceData: string;
    token: string;
    staleBefore: string;
}
export type ReserveSlotResult = {
    reserved: true;
    booking: BookingRecord;
} | {
    reserved: false;
    reason: "SLOT_TAKEN" | "LOCK_BUSY";
};
export type ConfirmBookingResult = {
    status: "OK";
    booking: BookingRecord;
} | {
    status: "NOT_FOUND" | "CANCELLED" | "EXPIRED";
};
export type CancelBookingResult = {
    status: "OK" | "NOT_FOUND" | "FORBIDDEN";
};
export type RescheduleBookingResult = {
    status: "OK";
    booking: BookingRecord;
} | {
    status: "NOT_FOUND" | "FORBIDDEN" | "CANCELLED" | "EXPIRED" | "SLOT_TAKEN";
};
export interface AvailabilityData {
    resources: ResourceRecord[];
    bookings: BookingRecord[];
}
export interface AvailabilitySlot {
    startTime: string;
    endTime: string;
    freeResourceIds: string[];
}
export interface IBookingStorage {
    findUserByEmail(email: string): Promise<UserRecord | null>;
    createUser(input: CreateUserInput): Promise<UserRecord>;
    listUsers(): Promise<UserRecord[]>;
    listResources(): Promise<ResourceRecord[]>;
    createResource(input: CreateResourceInput): Promise<ResourceRecord>;
    deleteResource(id: string): Promise<void>;
    findBookingById(id: string): Promise<BookingRecord | null>;
    findBookingsInRange(startTime: string, endTime: string): Promise<BookingRecord[]>;
    createBooking(record: Omit<BookingRecord, "id" | "createdAt"> & {
        id?: string;
    }): Promise<BookingRecord>;
    updateBookingStatus(id: string, status: BookingStatus): Promise<void>;
    updateBookingTime(id: string, startTime: string, endTime: string): Promise<void>;
    listBookingsByUser(email: string): Promise<BookingRecord[]>;
    listBookings(): Promise<BookingRecord[]>;
    deleteBooking(id: string): Promise<void>;
    /** Опциональная атомарная "проверить слот + записать" за один round-trip. */
    reserveSlot?(input: ReserveSlotInput): Promise<ReserveSlotResult>;
    appendLog(log: LogRecord): Promise<void>;
    listLogs(): Promise<LogRecord[]>;
    /** Специфично для Apps Script. */
    rebuildReport?(): Promise<void>;
    /** Идемпотентно подтверждает PENDING. Заменяет findById + update + createUser + log. */
    confirmBooking?(input: {
        bookingId: string;
        staleBefore: string;
    }): Promise<ConfirmBookingResult>;
    /** Отмена с проверкой владельца. Идемпотентно для уже отменённой. */
    cancelBooking?(input: {
        bookingId: string;
        requesterEmail: string;
    }): Promise<CancelBookingResult>;
    /** Перенос с проверкой владельца, статуса и занятости под одним lock'ом. */
    rescheduleBooking?(input: {
        bookingId: string;
        requesterEmail: string;
        startTime: string;
        endTime: string;
        staleBefore: string;
    }): Promise<RescheduleBookingResult>;
    /**
     * Мастера + брони диапазона одним запросом.
     * FIX: добавлен staleBefore — сервер сам фильтрует stale-PENDING.
     */
    getAvailabilityData?(startTime: string, endTime: string, staleBefore: string): Promise<AvailabilityData>;
}
export interface IEmailProvider {
    sendMail(params: {
        to: string;
        subject: string;
        html: string;
        text?: string;
    }): Promise<void>;
}
export interface ILockProvider {
    acquire(key: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
}
export interface BookingEngineConfig {
    storage: IBookingStorage;
    emailProvider: IEmailProvider;
    lockProvider?: ILockProvider;
    jwtSecret: string;
    baseUrl: string;
    pendingTtlMinutes?: number;
    confirmTokenTtlMinutes?: number;
    loginTokenTtlMinutes?: number;
    sessionTtlDays?: number;
    /**
     * Для serverless: продлевает жизнь функции до завершения фоновых логов/писем.
     * Next.js 15: after(); Vercel: waitUntil из "@vercel/functions".
     */
    waitUntil?: (promise: Promise<unknown>) => void;
}
