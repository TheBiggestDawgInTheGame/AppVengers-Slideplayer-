# SlidePlay Deployment Guide

This project is ready to host as a single Node.js service.

## 1) Recommended hosting (easiest)

Use Render, Railway, or Fly.io with:
- Root directory: `slide_upload`
- Install command: `npm install`
- Start command: `npm start`
- Node version: 18+

The server already uses `process.env.PORT` and serves the whole workspace as static files.

## 2) Required environment variables

Set these in your hosting dashboard (do not commit them):
- `GROQ_API_KEY`
- `GROQ_VISION_MODEL` (optional, default: `llama-3.2-11b-vision-preview`)
- `SOCKET_IO_USE_REDIS` (`true` in production, `false` for single-instance/local)
- `SOCKET_IO_REQUIRE_REDIS` (`true` to make deployment readiness fail unless Redis multiplayer is live)
- `SOCKET_IO_REDIS_URL` (required when `SOCKET_IO_USE_REDIS=true`)
- `GEMINI_API_KEY` (optional fallback)
- `FIREBASE_DB_URL`
- `DB_SERVER`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SENDGRID_API_KEY` (optional)
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE` (optional)
- `PAYFAST_SANDBOX` (`true` for sandbox, `false` for live)
- `PAYFAST_URL` (`https://sandbox.payfast.co.za/eng/process` for sandbox)
- `APP_URL` (your public HTTPS domain, no trailing slash)

Optional:
- `STRIPE_SECRET_KEY`
- `COINBASE_COMMERCE_API_KEY`
- `COINBASE_COMMERCE_WEBHOOK_SECRET`

## 2.1) Multiplayer across different locations (important)

To keep Socket.IO rooms stable when you scale to multiple app instances:
- Enable Redis adapter with `SOCKET_IO_USE_REDIS=true`
- Set `SOCKET_IO_REDIS_URL` to your managed Redis endpoint
- Enable sticky sessions (session affinity) at your load balancer/proxy

Without Redis + sticky sessions, players can end up on different instances and fail to see each other in the same room.

Use these endpoints in hosting health checks:
- `/api/health` for basic process health
- `/api/ready` for deployment readiness

If you set `SOCKET_IO_REQUIRE_REDIS=true`, `/api/ready` returns `503` until the Redis Socket.IO adapter is actually connected.

## 2.2) Render and Railway notes

Render:
- If you run a single web service instance, Socket.IO works without Redis, but rooms only live on that one instance.
- If you scale to multiple instances, attach a managed Redis service and set `SOCKET_IO_REDIS_URL`.
- Use `/api/ready` as the readiness probe if you want deploys to fail fast when Redis multiplayer is not live.
- Session affinity may be handled by the platform layer, but for horizontally scaled realtime traffic you should still use Redis adapter so room events are shared across instances.

Railway:
- Add a Redis service/plugin to the project and expose its connection URL as `SOCKET_IO_REDIS_URL`.
- Use the same public domain for frontend and backend when possible.
- When placing Railway behind an external proxy/CDN, enable sticky sessions there if multiple app replicas are active.
- Point readiness checks to `/api/ready` if `SOCKET_IO_REQUIRE_REDIS=true`.

## 3) Frontend API behavior

Frontend pages now auto-use:
1. `window.SLIDEPLAY_API_BASE` (if set)
2. `localStorage.sp_api_base` (if set)
3. `window.location.origin` (default)

If frontend and backend are on the same domain, no extra config is needed.

If frontend and backend are on different domains, set one of:
- `window.SLIDEPLAY_API_BASE = "https://api.yourdomain.com"` before app scripts load, or
- In browser console once: `localStorage.setItem('sp_api_base', 'https://api.yourdomain.com')`

## 4) PayFast live switch

When going live:
- Set `PAYFAST_SANDBOX=false`
- Set `PAYFAST_URL=https://www.payfast.co.za/eng/process`
- Use your real merchant ID/key
- Ensure `APP_URL` points to your live HTTPS domain

## 5) Security cleanup before public launch

Rotate any secrets that were previously committed in old `.env` files.
This includes DB password, SendGrid key, and Groq key.

## 6) Smoke test after deploy

- Open login page
- Sign in as student and teacher
- Open payment page and test PayFast init
- Generate quiz via AI upload
- Upload an image or scanned PDF and verify OCR/vision fallback returns questions
- Open admin dashboard as admin and verify metrics load

## 7) AI fallback behavior (current)

- Text prompts: Groq first, then Gemini fallback
- Vision/image prompts: Groq vision first, then Gemini vision fallback
- If vision providers fail, client runs OCR (`tesseract.js`) and generates questions from extracted text
