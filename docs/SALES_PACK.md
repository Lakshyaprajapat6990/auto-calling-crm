# Sales Pack — Auto Calling CRM

## Product one-liner
Auto Calling CRM helps small and mid-size companies run outbound campaigns, IVR, live transfer, callbacks, DND control, and call reporting from one dashboard.

## Who it is for
- Local sales teams (insurance, education, real estate, collections)
- SMBs that need affordable dialer + CRM without buying full Exotel/MyOperator suites first

## What is included (current)
- Customers, Employees, Campaigns
- CSV lead import
- Outbound call + queue dial-next
- Incoming IVR test flow
- Call dispositions
- DND / Do-Not-Call list
- Calling hours enforcement
- Agent live board
- Call recording link playback (when provider sends recording URL)
- Admin / Agent roles
- Company settings + password change
- Twilio live adapter + Exotel live adapter

## Suggested pricing (India starter)
| Plan | Price (example) | Includes |
|------|------------------|----------|
| Starter | ₹4,999 / month | 1 company, 3 agents, Twilio/Exotel bring-your-own number |
| Growth | ₹9,999 / month | 10 agents, CSV import, reports, DND |
| Setup fee | ₹7,999 one-time | Install, webhook setup, training (2 hours) |

Adjust freely. Telephony usage (per-minute) is paid by client to Twilio/Exotel.

## Demo script (10 minutes)
1. Login as Admin
2. Settings → set company name + calling hours
3. Import sample CSV
4. Create campaign
5. Start one outbound call / Dial Next In Queue
6. Set disposition
7. Show DND list and Reports
8. Login as Agent and show limited access

## Before you close a deal — checklist
- [ ] Client has telephony number (Exotel recommended for India)
- [ ] Webhooks configured on provider
- [ ] At least one verified test number works
- [ ] Admin password changed
- [ ] Calling hours set
- [ ] DND process explained
- [ ] Postgres planned for multi-user production (`DATABASE_URL`)

## Production database (required for serious clients)
1. Create free Neon Postgres: https://neon.tech
2. Copy connection string
3. Set Vercel env `DATABASE_URL=...`
4. Redeploy

> Current release uses browser + server sync storage that is good for demos and single-office use. For multiple staff on different PCs, connect Postgres.
