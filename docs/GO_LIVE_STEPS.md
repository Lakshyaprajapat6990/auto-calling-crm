# Go Live Steps - Auto Calling CRM

This project is currently running in simulation mode. To make real calls, connect one telephony provider and expose the app to the internet for call webhooks.

## 1. What You Need To Arrange

- Buy or activate one business calling number from a telephony provider.
- Choose provider: Twilio, Exotel, MyOperator, Knowlarity, Asterisk/SIP, or GSM gateway.
- Get API credentials from that provider.
- Get permission/compliance approval for automated calling in your target country.
- Decide whether calls should use recorded audio, text-to-speech, or both.
- Decide which employee phones/SIP extensions receive live transferred calls.

## 2. Recommended Provider Choice

For India business calling, start with one of these:

- Exotel
- MyOperator
- Knowlarity

For global testing and easy APIs, Twilio is also good.

## 3. Live Calling Flow

1. Admin creates campaign in CRM.
2. Customer enters outbound call queue.
3. Backend calls provider API.
4. Provider calls customer using company number.
5. Provider plays greeting/audio/IVR.
6. Customer presses 1, 2, or 9.
7. Provider sends webhook to this backend.
8. Backend checks employee availability.
9. If employee is free, backend tells provider to transfer/connect the call.
10. If no employee is free, backend creates callback.
11. Provider sends call status and recording webhooks.
12. Backend updates call history and reports.

## 4. Incoming Call Flow

1. Customer calls company number.
2. Provider sends incoming call webhook to backend.
3. Backend returns IVR instructions.
4. Customer selects department or callback.
5. Backend checks free employee.
6. Provider transfers call to employee or callback is created.

## 5. Required Public URLs

When deployed, configure these webhook URLs inside the provider dashboard:

```text
https://your-domain.example.com/api/telephony/incoming
https://your-domain.example.com/api/telephony/ivr
https://your-domain.example.com/api/telephony/status
https://your-domain.example.com/api/telephony/recording
```

For local testing, use a tunnel like ngrok or Cloudflare Tunnel:

```text
https://your-tunnel-url.ngrok-free.app/api/telephony/incoming
```

## 6. Environment Setup

Copy `.env.example` to `.env` and fill provider details:

```powershell
copy .env.example .env
```

Important values:

```text
CALL_MODE=live
TELEPHONY_PROVIDER=twilio
COMPANY_CALLER_ID=your purchased number
PUBLIC_BASE_URL=your deployed domain or tunnel URL
```

## 7. Testing Order

- Test one outbound call to your own phone.
- Test IVR keypress: 1 for executive.
- Test when all employees are busy.
- Test incoming call to company number.
- Test call recording webhook.
- Test reports after live calls.

## 8. Production Checklist

- Use HTTPS domain.
- Store provider credentials securely.
- Add proper password hashing before real client deployment.
- Add customer opt-out enforcement.
- Add business calling hours.
- Limit retry attempts.
- Add recording access permissions.
- Keep provider call logs and CRM logs matched by provider call ID.

