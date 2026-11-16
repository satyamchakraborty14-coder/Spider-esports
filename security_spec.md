# SPIDER ESPORTS — Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses and consent metadata are stored exclusively in `/users/{userId}/private/{docId}`, readable only by the owning user or an authorized administrator. Public `/users/{userId}` profiles contain no PII.
2. **Duplicate Registration Prevention**: Every registration document uses deterministic ID `${tournamentId}_${userId}`, enforced in rules (`registrationId == incoming().tournamentId + '_' + request.auth.uid`) and strictly requires an existing parent tournament with `filledSlots < maxSlots`.
3. **Room Credential Gating**: Custom Room ID and Room Password live in `/matches/{matchId}/credentials/secret`. Non-admins can read them ONLY if they are email-verified, hold a `confirmed` registration for that `matchId`, and `request.time >= existing().releaseAt`.
4. **Role & Privilege Escalation Protection**: `isAdmin()` verifies `request.auth.token.email_verified == true` and checks either `/admins/{uid}` existence or the bootstrapped verified admin email. Self-assignment of wins, kills, points, or admin status is blocked.
5. **No Client-Delegated List Queries**: Every `allow list` rule evaluates `resource.data` directly (`published == true`, `verified == true`, `active == true`, or `resource.data.userId == request.auth.uid`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: User with `email: "satyamchakraborty14@gmail.com"` and `email_verified: false` tries to create `/tournaments/t1`.
2. **Shadow Field Injection on User Profile**: Verified user updates `/users/{uid}` adding `isAdmin: true` or `suspended: false` override.
3. **Stat Inflation Attack**: Regular user attempts to update `/users/{uid}` setting `totalWins: 999` or `totalKills: 5000`.
4. **PII Scraping**: User A attempts `get` on `/users/userB/private/info`.
5. **Credential Peeking (Unregistered)**: User not registered in `t1` attempts `get` on `/matches/t1/credentials/secret`.
6. **Credential Peeking (Early Access)**: Registered user attempts `get` on `/matches/t1/credentials/secret` before `releaseAt`.
7. **Duplicate Registration**: User attempts to create `/registrations/custom_id_bypass` instead of `${tournamentId}_${uid}`.
8. **Full Tournament Bypass**: User attempts to create registration when `filledSlots >= maxSlots`.
9. **ID Poisoning**: Attacker attempts write to `/tournaments/${'a'.repeat(300)}` or invalid characters `../admin`.
10. **Non-Admin Tournament Creation**: Regular verified player attempts to create a tournament or publish results in `/results/r1`.
11. **Unconstrained List Scraping**: Anonymous/regular user attempts to list `/users` or `/users/{id}/private`.
12. **Client Timestamp Tampering**: User attempts to create `/users/{uid}` with backdated `createdAt` not matching `request.time`.
