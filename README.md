# @vzbb-db-system/core

A headless booking engine and mini-CRM for landing pages. It handles availability, slot reservations, email confirmation, passwordless sign-in with magic links, client cabinets and an admin activity log. Storage, email delivery and locking are pluggable adapters, so the same engine runs behind any number of sites.

## Features

- Availability calculation per resource (master, room, table) with configurable slot length
- Two-step bookings: a request reserves the slot as pending, a signed link in the email confirms it; unconfirmed reservations expire
- Slot locking to prevent double booking when two people submit at the same time
- Passwordless sign-in: one-time login links and signed session tokens
- Client operations: list, cancel and reschedule own bookings
- Admin operations: all bookings, status changes, users, resources, activity log
- Multi-tenant storage: one Supabase project serves many sites, every query is scoped by `site_id`
- Email adapters for Gmail (Nodemailer), Resend, and a console adapter for development
- Serverless-friendly: background emails and logs can be handed to `waitUntil` / Next.js `after()`
- Written in TypeScript, ships with type declarations

## Installation

```bash
npm install @vzbb-db-system/core
```

## Usage

```ts
import {
  BookingEngine,
  SupabaseAdapter,
  NodemailerAdapter,
  MemoryLockAdapter,
} from "@vzbb-db-system/core";

const engine = new BookingEngine({
  storage: new SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, // server only
    siteId: "photo-studio",
  }),
  emailProvider: new NodemailerAdapter({
    gmailUser: process.env.GMAIL_USER!,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD!,
    fromName: "Studio Light",
  }),
  lockProvider: new MemoryLockAdapter(),
  jwtSecret: process.env.JWT_SECRET!,
  baseUrl: "https://example.com",
});

// Free slots for a day, 60-minute steps
const { resources, slots } = await engine.getAvailability(
  "2026-12-01T09:00:00Z",
  "2026-12-01T18:00:00Z",
  60,
);

// Reserve a slot and send the confirmation email
await engine.requestBooking({
  userEmail: "client@example.com",
  name: "Anna",
  phone: "+48 600 000 000",
  resourceId: resources[0].id,
  startTime: "2026-12-01T10:00:00Z",
  endTime: "2026-12-01T11:00:00Z",
  serviceData: { service: "Portrait session" },
});

// Called from the link in the email
await engine.confirmBooking(tokenFromUrl);
```

## API

| Method | Description |
|---|---|
| `getAvailability(start, end, slotMinutes)` | Resources and free slots in a time range |
| `isSlotAvailable(start, end, resourceId)` | Check a single slot |
| `requestBooking(input)` | Reserve a slot as pending and email a confirmation link |
| `confirmBooking(token)` | Confirm a pending booking |
| `requestLogin(email)` / `verifyLoginToken(token)` | Magic-link sign-in, returns a session token |
| `createSession(email)` / `verifySession(token)` | Issue and verify session tokens |
| `listUserBookings(email)` | Bookings of one client |
| `cancelBooking(id, email)` / `rescheduleBooking(id, email, newStart, newEnd)` | Client-side changes |
| `listAllBookings()`, `listUsers()`, `listLogs()` | Admin data |
| `setBookingStatus(id, status)`, `deleteBooking(id)` | Admin changes |
| `listResources()`, `createResource(input)`, `deleteResource(id)` | Resource management |

Errors are thrown as `BookingEngineError` with a machine-readable `code` (for example `LOCK_BUSY`).

## Configuration

| Option | Required | Description |
|---|---|---|
| `storage` | yes | Implementation of `IBookingStorage` (for example `SupabaseAdapter`) |
| `emailProvider` | yes | Implementation of `IEmailProvider` |
| `lockProvider` | no | Implementation of `ILockProvider`; use a shared lock (Redis, database) when running several instances |
| `jwtSecret` | yes | Secret for confirmation, login and session tokens |
| `baseUrl` | yes | Public site URL used in email links |
| `pendingTtlMinutes`, `confirmTokenTtlMinutes`, `loginTokenTtlMinutes`, `sessionTtlDays` | no | Lifetimes of reservations and tokens |
| `waitUntil` | no | Keeps serverless functions alive until background work finishes |

Custom storage or email backends implement the exported `IBookingStorage`, `IEmailProvider` and `ILockProvider` interfaces.

## Development

```bash
npm install
npm run typecheck
npm run build      # compiles to dist/
```

## License

[MIT](LICENSE) © Vadym Zelenko
