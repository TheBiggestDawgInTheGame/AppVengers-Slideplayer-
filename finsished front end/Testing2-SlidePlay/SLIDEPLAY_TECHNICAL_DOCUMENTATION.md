# SlidePlay Technical Documentation

## Backend Team

### Technologies Used

- Node.js
- Express 5
- Firebase Admin SDK
- Firebase Web SDK on the client
- SendGrid Mail SDK
- Axios
- Dotenv
- Google Generative AI SDK
- Native Node modules: `fs`, `path`, `crypto`, `querystring`

### APIs Implemented

- `POST /api/users/sync`
- `GET /api/users/:uid/role`
- `POST /api/gameplay/record`
- `POST /api/sessions/archive`
- `POST /api/missions/create`
- `GET /api/missions/:missionId`
- `POST /api/missions/:missionId/progress`
- `GET /api/replay/:uid`
- `POST /api/ai-hint`
- `POST /api/payfast/init`
- `POST /api/payments/simulate`
- `POST /api/payfast/ipn`
- `POST /send-welcome-email`
- `POST /api/sms/test`
- Admin endpoints under `/api/admin/*`
- SEO and ops endpoints: `/health`, `/robots.txt`, `/sitemap.xml`

### Authentication Process

SlidePlay uses Firebase Authentication on the client and Firebase Admin on the server.

1. Users sign up or log in with email/password or Google Sign-In.
2. The client stores the Firebase ID token locally and sends it as a Bearer token when needed.
3. The backend verifies the token for protected routes.
4. User role is resolved from Firebase Realtime Database and falls back to the backend role endpoint when needed.
5. Admin routes are protected by `ensureAdmin`, which checks Firebase auth and the admin allowlist.

### Deployment Details

SlidePlay is deployed on Render as a Node web service.

- Root directory: `finsished front end/Testing2-SlidePlay`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Environment variables used in deployment:
  - `APP_URL`
  - `SENDGRID_API_KEY`
  - `GEMINI_API_KEY`
  - `FIREBASE_DB_URL`
  - `FIREBASE_SERVICE_ACCOUNT_JSON`

The live deployment is configured to serve the frontend, API, health endpoint, sitemap, and admin routes from one service.

## Database Team

### Database Technologies Used

- Firebase Realtime Database
- Local JSON file storage as a fallback for resilience

### What Was Implemented

- User records and role storage
- Session history persistence
- Gameplay event tracking
- Mission creation and mission progress storage
- Payment row persistence
- Support message status updates
- Security alert snapshots for admin monitoring

### Firebase/Database Explanation

Firebase is the main cloud data layer for authentication-linked records and role management. SlidePlay uses the backend service account to read and update Realtime Database data such as user roles, premium status, and session-linked records.

When Firebase Admin is unavailable, the backend can still preserve some app behavior by writing to local JSON files. That fallback keeps the app usable during development or partial outages, but Firebase remains the intended production source for live user data.

### User Roles and Storage Structure

SlidePlay supports three roles:

- `student`
- `teacher`
- `admin`

Primary Firebase structure:

- `users/<uid>/role`
- `users/<uid>/email`
- `users/<uid>/displayName`
- `users/<uid>/createdAt`
- `users/<uid>/lastLoginAt`
- optional payment and plan fields such as premium status

Fallback/local storage files used by the backend:

- `users-local.json`
- `session-history.json`
- `gameplay-events.json`
- `learning-missions.json`
- `payfast_payments.json`
- `support-messages.json`

## API Integration Section

### Firebase Authentication

SlidePlay uses Firebase Authentication for sign-up, login, email verification, and Google Sign-In.

Flow summary:

1. User signs in through the frontend.
2. Firebase returns an authenticated user session.
3. The client stores the ID token and role data.
4. The backend validates the token for secure API calls.
5. The app redirects the user based on role.

### Google Sign-In

Google Sign-In is implemented with a resilient dual-flow approach:

- `signInWithPopup` is used first on desktop.
- `signInWithRedirect` is used when popups are blocked or on mobile.
- `getRedirectResult` restores the sign-in state after redirect.
- Recovery logic finalizes the login if the redirect returns indirectly.

After Google sign-in, SlidePlay resolves the user role from Firebase or the backend and then sends the user to the correct dashboard or onboarding flow.

### SendGrid Email API

SlidePlay uses SendGrid for transactional email delivery.

Implemented email use-cases:

- Welcome email after signup
- Payment confirmation email after successful payment
- Admin bulk email sending

Email sending is brand-controlled through:

- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_FROM_NAME`

### Password Reset API Flow

Password reset is handled by Firebase Auth on the frontend.

Flow summary:

1. User clicks Forgot Password on the login page.
2. The app opens `reset.html`.
3. The user enters their email address.
4. The frontend calls `sendPasswordResetEmail`.
5. Firebase sends the reset email.
6. The user resets the password using Firebase’s secure reset link.

If you want, I can also turn this into a shorter report version or a presentation version for slides.