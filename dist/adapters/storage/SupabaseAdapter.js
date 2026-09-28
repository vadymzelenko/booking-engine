"use strict";
// src/adapters/storage/SupabaseAdapter.ts
// Реализация IBookingStorage поверх Supabase (Postgres).
// Мультитенантность: каждый экземпляр адаптера жёстко привязан к одному siteId,
// все запросы автоматически фильтруются по колонке site_id. Один Supabase-проект
// обслуживает сколько угодно лендингов, не пересекая данные.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseAdapter = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
class SupabaseAdapter {
    constructor(config) {
        this.client = (0, supabase_js_1.createClient)(config.url, config.serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        this.siteId = config.siteId;
    }
    // ---------- мапперы snake_case -> camelCase ----------
    mapBooking(row) {
        return {
            id: row.id,
            userEmail: row.user_email,
            resourceId: row.resource_id ?? "",
            startTime: row.start_time,
            endTime: row.end_time,
            serviceData: typeof row.service_data === "string"
                ? row.service_data
                : JSON.stringify(row.service_data ?? {}),
            status: row.status,
            token: row.token ?? "",
            createdAt: row.created_at,
        };
    }
    mapUser(row) {
        return {
            id: row.email,
            email: row.email,
            name: row.name ?? "",
            phone: row.phone ?? "",
            createdAt: row.created_at,
        };
    }
    mapResource(row) {
        return { id: row.id, name: row.name };
    }
    mapLog(row) {
        return {
            timestamp: row.timestamp,
            action: row.action,
            email: row.email ?? "",
            details: row.details ?? "",
        };
    }
    // ---------- Users ----------
    async findUserByEmail(email) {
        const { data, error } = await this.client
            .from("booking_users")
            .select("*")
            .eq("site_id", this.siteId)
            .eq("email", email)
            .maybeSingle();
        if (error)
            throw new Error(`SupabaseAdapter.findUserByEmail: ${error.message}`);
        return data ? this.mapUser(data) : null;
    }
    async createUser(input) {
        const { data, error } = await this.client
            .from("booking_users")
            .upsert({
            site_id: this.siteId,
            email: input.email,
            name: input.name ?? "",
            phone: input.phone ?? "",
        }, { onConflict: "site_id,email" })
            .select("*")
            .single();
        if (error)
            throw new Error(`SupabaseAdapter.createUser: ${error.message}`);
        return this.mapUser(data);
    }
    async listUsers() {
        const { data, error } = await this.client
            .from("booking_users")
            .select("*")
            .eq("site_id", this.siteId)
            .order("created_at", { ascending: false });
        if (error)
            throw new Error(`SupabaseAdapter.listUsers: ${error.message}`);
        return (data ?? []).map((r) => this.mapUser(r));
    }
    // ---------- Resources ----------
    async listResources() {
        const { data, error } = await this.client
            .from("booking_resources")
            .select("*")
            .eq("site_id", this.siteId)
            .order("created_at", { ascending: true });
        if (error)
            throw new Error(`SupabaseAdapter.listResources: ${error.message}`);
        return (data ?? []).map((r) => this.mapResource(r));
    }
    async createResource(input) {
        const id = input.id || (0, crypto_1.randomUUID)();
        const { data, error } = await this.client
            .from("booking_resources")
            .upsert({ site_id: this.siteId, id, name: input.name }, { onConflict: "site_id,id" })
            .select("*")
            .single();
        if (error)
            throw new Error(`SupabaseAdapter.createResource: ${error.message}`);
        return this.mapResource(data);
    }
    async deleteResource(id) {
        const { error } = await this.client
            .from("booking_resources")
            .delete()
            .eq("site_id", this.siteId)
            .eq("id", id);
        if (error)
            throw new Error(`SupabaseAdapter.deleteResource: ${error.message}`);
    }
    // ---------- Bookings ----------
    async findBookingById(id) {
        const { data, error } = await this.client
            .from("booking_records")
            .select("*")
            .eq("site_id", this.siteId)
            .eq("id", id)
            .maybeSingle();
        if (error)
            throw new Error(`SupabaseAdapter.findBookingById: ${error.message}`);
        return data ? this.mapBooking(data) : null;
    }
    async findBookingsInRange(startTime, endTime) {
        // Пересечение [start, end): b.start < end AND start < b.end
        const { data, error } = await this.client
            .from("booking_records")
            .select("*")
            .eq("site_id", this.siteId)
            .lt("start_time", endTime)
            .gt("end_time", startTime);
        if (error)
            throw new Error(`SupabaseAdapter.findBookingsInRange: ${error.message}`);
        return (data ?? []).map((r) => this.mapBooking(r));
    }
    async createBooking(record) {
        const id = record.id || (0, crypto_1.randomUUID)();
        const { data, error } = await this.client
            .from("booking_records")
            .insert({
            site_id: this.siteId,
            id,
            user_email: record.userEmail,
            resource_id: record.resourceId,
            start_time: record.startTime,
            end_time: record.endTime,
            service_data: this.parseServiceData(record.serviceData),
            status: record.status,
            token: record.token,
        })
            .select("*")
            .single();
        if (error)
            throw new Error(`SupabaseAdapter.createBooking: ${error.message}`);
        return this.mapBooking(data);
    }
    async updateBookingStatus(id, status) {
        const { error } = await this.client
            .from("booking_records")
            .update({ status })
            .eq("site_id", this.siteId)
            .eq("id", id);
        if (error)
            throw new Error(`SupabaseAdapter.updateBookingStatus: ${error.message}`);
    }
    async updateBookingTime(id, startTime, endTime) {
        const { error } = await this.client
            .from("booking_records")
            .update({ start_time: startTime, end_time: endTime })
            .eq("site_id", this.siteId)
            .eq("id", id);
        if (error)
            throw new Error(`SupabaseAdapter.updateBookingTime: ${error.message}`);
    }
    async listBookingsByUser(email) {
        const { data, error } = await this.client
            .from("booking_records")
            .select("*")
            .eq("site_id", this.siteId)
            .eq("user_email", email)
            .order("start_time", { ascending: false });
        if (error)
            throw new Error(`SupabaseAdapter.listBookingsByUser: ${error.message}`);
        return (data ?? []).map((r) => this.mapBooking(r));
    }
    async listBookings() {
        const { data, error } = await this.client
            .from("booking_records")
            .select("*")
            .eq("site_id", this.siteId)
            .order("start_time", { ascending: false });
        if (error)
            throw new Error(`SupabaseAdapter.listBookings: ${error.message}`);
        return (data ?? []).map((r) => this.mapBooking(r));
    }
    async deleteBooking(id) {
        const { error } = await this.client
            .from("booking_records")
            .delete()
            .eq("site_id", this.siteId)
            .eq("id", id);
        if (error)
            throw new Error(`SupabaseAdapter.deleteBooking: ${error.message}`);
    }
    // ---------- Атомарные операции (Postgres functions) ----------
    async reserveSlot(input) {
        const { data, error } = await this.client.rpc("reserve_slot", {
            p_site_id: this.siteId,
            p_id: input.id,
            p_user_email: input.userEmail,
            p_resource_id: input.resourceId,
            p_start_time: input.startTime,
            p_end_time: input.endTime,
            p_service_data: this.parseServiceData(input.serviceData),
            p_token: input.token,
            p_stale_before: input.staleBefore,
        });
        if (error)
            throw new Error(`SupabaseAdapter.reserveSlot: ${error.message}`);
        if (data?.reserved) {
            return { reserved: true, booking: this.mapBooking(data.booking) };
        }
        return {
            reserved: false,
            reason: data?.reason === "LOCK_BUSY" ? "LOCK_BUSY" : "SLOT_TAKEN",
        };
    }
    async confirmBooking(input) {
        const { data, error } = await this.client.rpc("confirm_booking", {
            p_site_id: this.siteId,
            p_booking_id: input.bookingId,
            p_stale_before: input.staleBefore,
        });
        if (error)
            throw new Error(`SupabaseAdapter.confirmBooking: ${error.message}`);
        if (data?.status === "OK") {
            return { status: "OK", booking: this.mapBooking(data.booking) };
        }
        return { status: (data?.status ?? "NOT_FOUND") };
    }
    async cancelBooking(input) {
        const { data, error } = await this.client.rpc("cancel_booking", {
            p_site_id: this.siteId,
            p_booking_id: input.bookingId,
            p_requester_email: input.requesterEmail,
        });
        if (error)
            throw new Error(`SupabaseAdapter.cancelBooking: ${error.message}`);
        return { status: (data?.status ?? "NOT_FOUND") };
    }
    async rescheduleBooking(input) {
        const { data, error } = await this.client.rpc("reschedule_booking", {
            p_site_id: this.siteId,
            p_booking_id: input.bookingId,
            p_requester_email: input.requesterEmail,
            p_start_time: input.startTime,
            p_end_time: input.endTime,
            p_stale_before: input.staleBefore,
        });
        if (error)
            throw new Error(`SupabaseAdapter.rescheduleBooking: ${error.message}`);
        if (data?.status === "OK") {
            return { status: "OK", booking: this.mapBooking(data.booking) };
        }
        return {
            status: (data?.status ?? "NOT_FOUND"),
        };
    }
    async getAvailabilityData(startTime, endTime, _staleBefore) {
        // Два запроса параллельно — этого достаточно, фильтрация stale-PENDING
        // происходит на стороне BookingEngine (он знает про TTL).
        const [resources, bookings] = await Promise.all([
            this.listResources(),
            this.findBookingsInRange(startTime, endTime),
        ]);
        return { resources, bookings };
    }
    // ---------- Logs ----------
    async appendLog(log) {
        const { error } = await this.client.from("booking_logs").insert({
            site_id: this.siteId,
            timestamp: log.timestamp,
            action: log.action,
            email: log.email,
            details: log.details,
        });
        if (error)
            throw new Error(`SupabaseAdapter.appendLog: ${error.message}`);
    }
    async listLogs() {
        const { data, error } = await this.client
            .from("booking_logs")
            .select("*")
            .eq("site_id", this.siteId)
            .order("timestamp", { ascending: false })
            .limit(500);
        if (error)
            throw new Error(`SupabaseAdapter.listLogs: ${error.message}`);
        return (data ?? []).map((r) => this.mapLog(r));
    }
    // ---------- helpers ----------
    parseServiceData(raw) {
        if (!raw)
            return {};
        if (typeof raw === "object")
            return raw;
        if (typeof raw === "string") {
            try {
                return JSON.parse(raw);
            }
            catch {
                return { value: raw };
            }
        }
        return {};
    }
    /** Диагностический пинг — удобно вызывать при старте приложения. */
    async ping() {
        const { error } = await this.client
            .from("booking_records")
            .select("id", { count: "exact", head: true })
            .limit(1);
        return !error;
    }
}
exports.SupabaseAdapter = SupabaseAdapter;
