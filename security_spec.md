# Firestore Security Rules Specification

## Phase 0: Data Invariants & Threat Model
1. **Default-Deny Baseline**: Every unspecified collection or document path is denied by `match /{document=**} { allow read, write: if false; }`.
2. **PII Isolation**: Patient PII (`fullName`, `phoneNumber`, `disease`, `age`) exists only inside `/bookings/{bookingId}` and `/treatment_history/{recordId}` and is strictly restricted to verified clinic administrators (`isAdmin()`). Public live-queue reads use `/public_queue/{bookingId}` which contains zero PII.
3. **No Self-Assigned Roles**: Users cannot create or elevate entries in `/admins/{adminUid}`; only `isSuperAdmin()` (including the verified owner email `emsrkl1669@gmail.com`) may manage `/admins`.
4. **Immutable Audit Trail**: `/audit_logs/{logId}` entries require `actorUid == request.auth.uid`, `createdAt == request.time`, and may never be updated or deleted.
5. **Terminal State Locking & Server Timestamps**: `bookings` cannot leave `completed` or `cancelled` states without an admin override, and every `createdAt` / `updatedAt` field must equal `request.time`.

## The "Dirty Dozen" Attack Payloads (All Must Fail with `PERMISSION_DENIED`)
1. Unauthenticated read of `/bookings/1` (PII exfiltration).
2. Unauthenticated list query on `/bookings` or `/treatment_history`.
3. Unverified email (`email_verified: false`) spoofing `emsrkl1669@gmail.com` to write `/schedule_dates/2026-12-01`.
4. Non-admin signed-in user attempting self-promotion by writing `/admins/{uid}` with `role: "super_admin"`.
5. Admin attempting to write a shadow/ghost field `isVerified: true` into `/bookings/{id}` (blocked by `keys().hasOnly(...)`).
6. Admin attempting to update `/bookings/{id}` with a client-forged `createdAt` timestamp (blocked by immutability).
7. Admin attempting to update `/bookings/{id}` with `updatedAt != request.time` (blocked by temporal integrity).
8. Oversized path ID poisoning (> 128 chars or invalid characters) on `/schedule_dates/{badId}`.
9. Oversized string injection (> `maxLength`) into `pauseReason` on `/clinic_config/settings`.
10. Modifying or deleting an existing `/audit_logs/{logId}` entry.
11. Writing `/audit_logs/{logId}` with `actorUid` spoofed to another UID.
12. Deleting `/clinic_config/settings` or creating an arbitrary doc `/clinic_config/arbitrary`.
