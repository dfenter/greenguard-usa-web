# Google Ads API setup

One-time setup so `node app/_scripts/audit-ad-urls.js` can list every live
ad URL and flag stale destinations (Acuity, old Squarespace, etc.).

## 1. Request a developer token

1. Sign in to **ads.google.com** as the account owner (admin@greenguard-usa.com).
2. Top right gear → **Tools and settings** → **API Center** (under "Setup").
3. Fill out the "Apply for token" form. Contact email = admin@greenguard-usa.com.
   Tool name = "GreenGuard internal audit". Purpose = "Audit final URLs on
   our own account; no third-party data."
4. **Submit.** Google takes 1-2 business days to approve a basic token.
   Until approved, you'll see a "test" token that only works against test
   accounts. The audit script needs the approved (live) token.
5. Once approved, copy the token from the API Center page.

## 2. Get your customer ID

In the top-right of ads.google.com, under your email, you'll see something
like `123-456-7890`. That's the customer ID. Strip the dashes →
`1234567890`. If you use a manager account (MCC), note its ID too.

## 3. Reuse the existing OAuth client + add the AdWords scope

The Google Cloud project that already issues your Calendar / Gmail tokens
can also issue Ads tokens — just needs an extra scope.

1. **console.cloud.google.com** → select the project (same one as Gmail/Calendar).
2. **APIs & Services → Library** → search "Google Ads API" → **Enable**.
3. **APIs & Services → OAuth consent screen** → **Add scope** →
   `https://www.googleapis.com/auth/adwords` → Save.
4. Regenerate the refresh token with the new scope by running:

   ```
   cd /Users/lucille/greenguard_agent
   python3 -c "
   from google_auth_oauthlib.flow import InstalledAppFlow
   SCOPES = ['https://www.googleapis.com/auth/adwords']
   flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
   creds = flow.run_local_server(port=0)
   print('REFRESH_TOKEN=', creds.refresh_token)
   "
   ```

   Approve in the browser; copy the printed refresh token.

## 4. Add the env vars

Edit `app/.env` (and the Vercel project env for production):

```
GOOGLE_ADS_DEVELOPER_TOKEN=<from step 1>
GOOGLE_ADS_CUSTOMER_ID=<from step 2, no dashes>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<MCC ID if used, otherwise omit>
GOOGLE_ADS_CLIENT_ID=<same as GOOGLE_CLIENT_ID>
GOOGLE_ADS_CLIENT_SECRET=<same as GOOGLE_CLIENT_SECRET>
GOOGLE_ADS_REFRESH_TOKEN=<from step 3>
```

## 5. Run the audit

```
cd app
node _scripts/audit-ad-urls.js
```

Exit code 0 = clean. Exit code 2 = stale URLs found (script prints them).

## 6. Wire to CI (optional but recommended)

A weekly GitHub Action that runs the audit and emails you on stale URLs
catches drift automatically.
