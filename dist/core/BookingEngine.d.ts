import type { BookingEngineConfig, BookingRecord, CreateBookingInput, ResourceRecord, CreateResourceInput, AvailabilitySlot, UserRecord, LogRecord, BookingStatus } from "../types";
export declare class BookingEngineError extends Error {
    code: string;
    constructor(message: string, code: string);
}
export declare class BookingEngine {
    private storage;
    private emailProvider;
    private lockProvider;
    private jwtSecret;
    private baseUrl;
    private pendingTtlMinutes;
    private confirmTokenTtlMinutes;
    private loginTokenTtlMinutes;
    private sessionTtlDays;
    private waitUntil?;
    private resourcesCache;
    constructor(config: BookingEngineConfig);
    private slotKey;
    private fireAndForget;
    private throwStatus;
    private isBlocked;
    isSlotAvailable(startTime: string, endTime: string, resourceId: string, excludeBookingId?: string): Promise<boolean>;
    listResources(): Promise<ResourceRecord[]>;
    private invalidateResourcesCache;
    createResource(input: CreateResourceInput): Promise<ResourceRecord>;
    deleteResource(resourceId: string): Promise<void>;
    getAvailability(startTime: string, endTime: string, slotMinutes: number): Promise<{
        resources: ResourceRecord[];
        slots: AvailabilitySlot[];
    }>;
    requestBooking(input: CreateBookingInput & {
        name?: string;
        phone?: string;
    }): Promise<BookingRecord>;
    confirmBooking(token: string): Promise<BookingRecord>;
    private ensureUser;
    requestLogin(email: string): Promise<void>;
    verifyLoginToken(token: string): Promise<{
        email: string;
        sessionToken: string;
        sessionTtlDays: number;
    }>;
    verifySession(sessionToken: string): {
        email: string;
    } | null;
    createSession(email: string): {
        sessionToken: string;
        sessionTtlDays: number;
    };
    listUserBookings(email: string): Promise<BookingRecord[]>;
    listAllBookings(): Promise<BookingRecord[]>;
    listUsers(): Promise<UserRecord[]>;
    listLogs(): Promise<LogRecord[]>;
    deleteBooking(bookingId: string): Promise<void>;
    setBookingStatus(bookingId: string, status: BookingStatus): Promise<void>;
    rebuildReport(): Promise<void>;
    cancelBooking(bookingId: string, requesterEmail: string): Promise<void>;
    rescheduleBooking(bookingId: string, requesterEmail: string, newStartTime: string, newEndTime: string): Promise<BookingRecord>;
}
