# Security Rotation Checklist (2.5 Step)

This is the safe pre-hosting hardening pass before full credential rotation.

## 1) Inventory and classify secrets

- [ ] DB credentials (`DB_USER`, `DB_PASSWORD`)
- [ ] AI keys (`GROQ_API_KEY`, `GEMINI_API_KEY`)
- [ ] Email provider (`SENDGRID_API_KEY`)
- [ ] SMS provider (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- [ ] Payment credentials (`PAYFAST_*`, `STRIPE_SECRET_KEY`, `COINBASE_*`)

## 2) Rotate in provider dashboards

- [ ] Generate new credentials in each provider
- [ ] Revoke old credentials immediately after cutover
- [ ] Record rotation date and owner

## 3) Update runtime only (not source)

- [ ] Put new values in hosting platform environment variables
- [ ] Keep `.env.example` as placeholders only
- [ ] Do not commit `.env` files

## 4) Verify after rotation

- [ ] AI text endpoint (`/api/gemini-proxy`) works
- [ ] AI image endpoint and OCR fallback both work
- [ ] Test receipt email endpoint works
- [ ] Test SMS endpoint works (or returns expected provider restriction)
- [ ] PayFast init endpoint still signs requests correctly

## 5) Post-rotation cleanup

- [ ] Remove any old secrets from local notes/snippets
- [ ] Ensure CI/CD and hosting envs match production values
- [ ] Re-test deployment from clean environment

## Notes

- In this repository, notification and payment flows are best-effort by design.
- Rotation should be done during a low-traffic window to avoid interrupted payment or invite flows.
