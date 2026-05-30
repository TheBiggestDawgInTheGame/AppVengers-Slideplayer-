# Render Deploy (SlidePlay)

This repo is ready to deploy on Render using [render.yaml](render.yaml).

## 1) Push your current branch

From repo root:

```powershell
git add -A
git commit -m "chore: prepare render deployment"
git push origin karabo
```

## 2) Create the web service in Render

1. Open Render Dashboard.
2. Click New + -> Blueprint.
3. Connect repo: TheBiggestDawgInTheGame/AppVengers-Slideplayer-.
4. Select branch: karabo.
5. Render reads render.yaml and creates the service.

## 3) Set required environment variables in Render

- APP_URL = your live URL (for example https://slideplay-app.onrender.com)
- SENDGRID_API_KEY = your SendGrid API key
- GEMINI_API_KEY = your Gemini key (if AI features are needed)

## 4) Verify after deploy

- Health check: https://your-domain/health
- Landing page: https://your-domain/main.html
- Signup: https://your-domain/signup.html

## 5) Welcome email mobile flow test

1. Create a new account from signup page.
2. Open welcome email on phone.
3. Tap Open My Account.
4. Login page should open with email prefilled.
