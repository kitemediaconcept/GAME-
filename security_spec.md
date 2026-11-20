# Firestore Security Specification (Name & Phone Giveaway Architecture)

## 1. Data Invariants
1. **Strict Admin-Only PII Reads**: `/participants/{participantId}` stores player Name and Phone Number only (no email). Public and unauthenticated reads (`get` and `list`) are strictly DENIED (`false`). Only the verified bootstrapped Admin (`kitemediaconcept@gmail.com` with `email_verified == true`) or an Admin in `/admins/{uid}` may read or delete participant records.
2. **Phone-Keyed One-Entry Identity**: Each participant document ID MUST match `^p_[0-9]{7,20}$` and equal `'p_' + incoming().normalizedPhone`. Because `allow create` only permits creating a non-existent document, duplicate phone submissions cannot overwrite existing entries.
3. **Self-Role & Winner Tampering Prevention**: Players cannot create or modify `/admins/*`, cannot set `winnerStatus != 'none'` on create, and cannot modify `winnerStatus`, `overrideNote`, `winnerConfirmedAt`, `name`, `phone`, `normalizedPhone`, `entryNumber`, or `sessionSecret` on update.
4. **Terminal State Locking**: Once a participant's `status == 'completed'`, player updates are permanently locked. Only verified Admins can update `winnerStatus`, `overrideNote`, and `winnerConfirmedAt`.
5. **Temporal Integrity**: `createdAt` and `updatedAt` MUST match `request.time` on create; `createdAt` is immutable on update and `updatedAt == request.time`.
6. **Admin-Only Campaign & Audit Writes**: Only verified admins can write `/campaign/main` or create `/auditLogs/{logId}`. Audit logs are strictly append-only (no update/delete).

## 2. Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated PII Read**: `GET /participants/p_919876543210` with `auth == null`.
2. **Non-Admin Authenticated PII Read**: `GET /participants/p_919876543210` as any non-admin user.
3. **Blanket List Scraping**: `LIST /participants` by anyone other than verified bootstrapped admin.
4. **Unverified Email Spoofing Admin**: `LIST /participants` with `email: 'kitemediaconcept@gmail.com', email_verified: false`.
5. **Phone ID Mismatch on Create**: `CREATE /participants/p_1111111111` with `normalizedPhone: '9999999999'`.
6. **Shadow Field / Email Injection**: `CREATE /participants/p_919876543210` with extra field `email` or `isAdmin: true`.
7. **Self-Confirmed Winner on Create**: `CREATE /participants/p_919876543210` with `winnerStatus: 'confirmed'`.
8. **Score Tampering Post-Completion**: `UPDATE /participants/p_919876543210` when `existing.status == 'completed'`.
9. **Winner Status Tampering During Play**: `UPDATE /participants/p_919876543210` modifying `winnerStatus: 'confirmed'` alongside a shot update.
10. **ID Poisoning / Denial of Wallet**: `CREATE /participants/<invalid-id>` or `name` > 80 chars or `attempts` array > 10 items.
11. **Backdated Timestamp Forgery**: `CREATE /participants/p_919876543210` with client-forged `createdAt` != `request.time`.
12. **Self-Assigned Admin Escalation**: `CREATE /admins/uid_attacker` as non-bootstrapped user.
