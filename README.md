# Auto Calling CRM

MVP project for an Auto Calling CRM with simulated outbound calls, incoming IVR, employee availability, live transfer, callbacks, recordings, and reports.

## Current MVP

- Built with plain Node.js and browser JavaScript.
- No package installation required.
- Uses JSON files in `data/` as the local database.
- Starts with demo users, customers, employees, campaigns, and call history.

## Run

```powershell
npm start
```

Open:

```text
http://localhost:3001
```

## Demo Login

```text
Email: admin@autocalling.local
Password: admin123
```

## MVP Scope

This first version simulates calling logic so the product can be demonstrated before connecting real telephony.

Next production phase can connect Twilio, Exotel, Knowlarity, MyOperator, Asterisk/SIP, or a GSM gateway.

## Go Live

Read the live calling checklist:

```text
docs/GO_LIVE_STEPS.md
```

Copy the environment template:

```powershell
copy .env.example .env
```

Then set:

```text
CALL_MODE=live
TELEPHONY_PROVIDER=your_provider
COMPANY_CALLER_ID=your_provider_number
PUBLIC_BASE_URL=your_https_domain_or_tunnel
```

The app includes provider-ready webhook endpoints:

```text
/api/telephony/incoming
/api/telephony/ivr
/api/telephony/status
/api/telephony/recording
```
