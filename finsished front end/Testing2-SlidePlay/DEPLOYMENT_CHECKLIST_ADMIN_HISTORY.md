# Deployment Checklist: Admin Access + Session History

Use this checklist when deploying `Testing2-SlidePlay` so admin login and session history work in production.

## 1. Code + Dependencies

- Confirm these files are deployed:
  - `server.js`
  - `admin-dashboard.html`
  - `authentication.js`
  - `reset.html`
  - `live-game.js`
  - `UploadPage.js`
  - `p2p-session.js`
  - `session-history.json`
- Install dependencies on deploy (`npm install`).
- Verify `firebase-admin` is installed.

## 2. Environment Variables

Set these in Render (or your host):

- `PORT` (Render usually injects this automatically)
- `FIREBASE_DB_URL` = your RTDB URL for this app
- `FIREBASE_SERVICE_ACCOUNT_JSON` = full JSON for service account (single-line JSON string)
- `SENDGRID_API_KEY` (if admin bulk email and welcome mail should work)
- `SENDGRID_FROM_EMAIL` (recommended)

Optional security/session tuning:

- `SESSION_HISTORY_MAX_ROWS` (example: `2000`)
- `SESSION_HISTORY_RETENTION_DAYS` (example: `120`)
- `SECURITY_WINDOW_MS`
- `SECURITY_THRESHOLD_TOTAL`
- `SECURITY_THRESHOLD_PER_IP`
- `SECURITY_THRESHOLD_PER_PATH`

## 3. Firebase Console Checks

- Auth enabled for Email/Password and Google (if used).
- Authorized domain includes your Render domain.
- RTDB path `users/<uid>/role` is writable by backend service account.
- `kingsleydasilva0@gmail.com` can be promoted to `admin` by allowlist logic.

## 4. Verify Password Reset Uses Correct Project

- Open `login.html` and click Forgot Password.
- Confirm reset emails apply to the same Firebase project used by login.
- After reset, login should succeed with the new password.

## 5. Verify Admin Gate + APIs

- Login as `kingsleydasilva0@gmail.com`.
- Open `admin-dashboard.html`.
- Verify these endpoints return data (with Bearer token):
  - `/api/admin/stats`
  - `/api/admin/users`
  - `/api/admin/sessions`
  - `/api/admin/payments`
  - `/api/admin/support/messages`

## 6. Verify Session History Persistence

Run these flows and confirm entries appear under Admin Sessions:

- End from `live-game` teacher flow.
- End from upload/wait-room flow.
- End from P2P host flow.

Expected behavior:

- `liveRooms` contains active sessions only.
- `sessions` includes merged historical entries from DB + `session-history.json`.
- Duplicate codes should collapse to latest archived record.

## 7. Smoke Tests for Production URL

- `GET /api/admin/sessions` without token returns `401`.
- `POST /api/sessions/archive` without token returns `401`.
- Admin dashboard loads with real metrics when logged in as admin.

## 8. Rollback Plan

- Keep previous deploy as fallback.
- If issues occur, roll back to previous release and inspect:
  - service account JSON validity
  - token verification errors
  - RTDB connectivity

