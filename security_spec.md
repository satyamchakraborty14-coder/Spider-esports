# SPIDER ESPORTS — Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses and consent metadata are stored exclusively in `/users/{userId}/private/{docId}`, readable only by the owning user or an authorized administrator. Public `/users/{userId}` profiles contain no PII.
2. **Duplicate Registration Prevention**: Every registration document uses deterministic ID `${tournamentId}_${userId}`, enforced in rules (`registrationId == incoming().tournamentId + '_' + request.auth.uid`) and strictly requires an existing parent tournament with `filledSlots < maxSlots`.
3. **Room Credential Gating**: Custom Room ID and Room Password live in `/matches/{matchId}/credentials/secret`. Non-admins can read them ONLY if they are email-verified, hold a `confirmed` registration for that `matchId`, and `request.time >= existing().releaseAt`.
4. **Role & Privilege Escalation Protection**: `isAdmin()` verifies `request.auth.token.email_verified == true` and checks either `/admins/{uid}` existence or the bootstrapped verified admin email. Self-assignment of wins, kills, points, or admin status is blocked.
5. **No Client-Delegated List Queries**: Every `allow list` rule evaluates `resource.data` directly (`published == true`, `verified == true`, `active == true`, or `resource.data.userId == request.auth.uid`).
6. **Single-Use UTR & Wallet Integrity**: QR Add Coin deposits are keyed by 12-digit UTR in `/coin_deposits/{utr}` inside an atomic transaction requiring `!exists(...)` before creation, `admin_settings/default.paymentQrDataUrl` configured, and exact `1 Rupee = 1 Coin` increment matching `getAfter(/users/{uid}).data.coins` without increasing `winningCoins`.
7. **Winning-Prize-Only Redemption**: Withdrawals require `coins >= 50` (`₹50` minimum) and deduct exclusively from `winningCoins` (`winningCoins <= coins`), preventing withdrawal of QR-deposited or non-winning coins.
8. **Tournament Entry Fee & Refund Integrity**: Paid matches (`entryFeeCoins > 0`) atomically deduct `entryFeeCoins` from `coins` (spending non-redeemable coins before `winningCoins`), record exact `entryFeePaid` and `entryWinningCoinsPaid` on `/registrations/{tournamentId}_{uid}`, and strictly restore only those recorded values on cancellation so deposited coins can never be converted into `winningCoins`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: User with `email: "satyamchakraborty14@gmail.com"` and `email_verified: false` tries to create `/tournaments/t1`.
2. **Shadow Field Injection on User Profile**: Verified user updates `/users/{uid}` adding `isAdmin: true` or `suspended: false` override.
3. **Stat & Coin Inflation Attack**: Regular user attempts to update `/users/{uid}` setting `totalWins: 999` or inflating `coins`/`winningCoins` without a matching single-use `coin_deposits/{utr}` record.
4. **UTR Replay Attack**: User re-submits an already existing 12-digit UTR to `/coin_deposits/{utr}` to mint duplicate coins.
5. **Deposited Coin Withdrawal Bypass**: User with `coins: 500, winningCoins: 0` attempts to create `/withdrawals/{id}` for `50` coins or increase `winningCoins` during a QR deposit.
6. **PII Scraping**: User A attempts `get` on `/users/userB/private/info`.
7. **Credential Peeking (Unregistered)**: User not registered in `t1` attempts `get` on `/matches/t1/credentials/secret`.
8. **Credential Peeking (Early Access)**: Registered user attempts `get` on `/matches/t1/credentials/secret` before `releaseAt`.
9. **Duplicate Registration**: User attempts to create `/registrations/custom_id_bypass` instead of `${tournamentId}_${uid}`.
10. **Full Tournament Bypass**: User attempts to create registration when `filledSlots >= maxSlots`.
11. **ID Poisoning**: Attacker attempts write to `/tournaments/${'a'.repeat(300)}` or invalid characters `../admin`.
12. **Non-Admin Tournament Creation**: Regular verified player attempts to create a tournament or publish results in `/results/r1`.
13. **Unconstrained List Scraping**: Anonymous/regular user attempts to list `/users` or `/users/{id}/private`.
14. **Client Timestamp Tampering**: User attempts to create `/users/{uid}` with backdated `createdAt` not matching `request.time`.
15. **Entry Fee Laundering / Free-Join Bypass**: User attempts to join a paid tournament (`entryFeeCoins: 50`) with `entryFeePaid: 0`, or cancels a registration claiming `entryWinningCoinsPaid` refund higher than paid.
