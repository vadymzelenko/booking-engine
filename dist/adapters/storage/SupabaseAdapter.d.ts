import type { IBookingStorage, UserRecord, BookingRecord, LogRecord, CreateUserInput, CreateResourceInput, ResourceRecord, BookingStatus, ReserveSlotInput, ReserveSlotResult, ConfirmBookingResult, CancelBookingResult, RescheduleBookingResult, AvailabilityData } from "../../types";
export interface SupabaseAdapterConfig {
    /** URL проекта Supabase, напр. https://xyzcompany.supabase.co */
    url: string;
    /** service_role-ключ (ТОЛЬКО на сервере, никогда не должен уходить в браузер). */
    serviceRoleKey: string;
    /** Идентификатор сайта из sites/<id>/config.js (например "dance-studio"). */
    siteId: string;
}
export declare class SupabaseAdapter implements IBookingStorage {
    private client;
    private siteId;
    constructor(config: SupabaseAdapterConfig);
    private mapBooking;
    private mapUser;
    private mapResource;
    private mapLog;
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
    reserveSlot(input: ReserveSlotInput): Promise<ReserveSlotResult>;
    confirmBooking(input: {
        bookingId: string;
        staleBefore: string;
    }): Promise<ConfirmBookingResult>;
    cancelBooking(input: {
        bookingId: string;
        requesterEmail: string;
    }): Promise<CancelBookingResult>;
    rescheduleBooking(input: {
        bookingId: string;
        requesterEmail: string;
        startTime: string;
        endTime: string;
        staleBefore: string;
    }): Promise<RescheduleBookingResult>;
    getAvailabilityData(startTime: string, endTime: string, _staleBefore: string): Promise<AvailabilityData>;
    appendLog(log: LogRecord): Promise<void>;
    listLogs(): Promise<LogRecord[]>;
    private parseServiceData;
    /** Диагностический пинг — удобно вызывать при старте приложения. */
    ping(): Promise<boolean>;
}
