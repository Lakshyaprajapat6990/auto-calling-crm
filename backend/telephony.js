const https = require("https");

function getTelephonyConfig() {
  return {
    mode: process.env.CALL_MODE || "simulation",
    provider: process.env.TELEPHONY_PROVIDER || "simulation",
    companyCallerId: process.env.COMPANY_CALLER_ID || "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`
  };
}

function isLiveMode() {
  return getTelephonyConfig().mode === "live";
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildOutboundTwiml({ message, publicBaseUrl, callId }) {
  const action = `${publicBaseUrl}/api/telephony/ivr?callId=${encodeURIComponent(callId || "")}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message || "Hello from Auto Calling CRM.")}</Say>
  <Gather numDigits="1" timeout="8" action="${escapeXml(action)}" method="POST">
    <Say voice="alice">Press 1 to talk to an executive. Press 2 for a callback. Press 9 to opt out.</Say>
  </Gather>
  <Say voice="alice">We did not receive any input. Goodbye.</Say>
</Response>`;
}

function buildIncomingTwiml({ publicBaseUrl }) {
  const action = `${publicBaseUrl}/api/telephony/ivr`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="8" action="${escapeXml(action)}" method="POST">
    <Say voice="alice">Welcome to Auto Calling CRM. Press 1 for Sales. Press 2 for Support. Press 3 for a callback.</Say>
  </Gather>
  <Say voice="alice">We did not receive any input. Goodbye.</Say>
</Response>`;
}

function buildIvrResultTwiml({ digits, transferNumber }) {
  if (digits === "1" && transferNumber) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to an executive now.</Say>
  <Dial>${escapeXml(transferNumber)}</Dial>
</Response>`;
  }
  if (digits === "1") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, no executive is free right now. We will call you back.</Say>
</Response>`;
  }
  if (digits === "2" || digits === "3") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. We have scheduled a callback.</Say>
</Response>`;
  }
  if (digits === "9") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">You have been opted out. Goodbye.</Say>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Goodbye.</Say>
</Response>`;
}

function twilioRequest(pathName, form) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const body = new URLSearchParams(form).toString();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.twilio.com",
        path: pathName,
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = { raw: data };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || parsed.raw || `Twilio error ${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function startOutboundCall({ customer, campaign, call }) {
  const config = getTelephonyConfig();
  if (!isLiveMode()) {
    return {
      provider: "simulation",
      providerCallId: `sim_${call.id}`,
      status: "simulated",
      note: "CALL_MODE is simulation. No real phone call was placed."
    };
  }

  if (config.provider === "twilio") {
    return startTwilioCall({ config, customer, campaign, call });
  }

  if (config.provider === "exotel") {
    return startExotelCall({ config, customer, call });
  }

  return {
    provider: config.provider,
    providerCallId: null,
    status: "not_configured",
    note: `Live adapter for ${config.provider} is not implemented yet.`
  };
}

async function startTwilioCall({ config, customer, call }) {
  const required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    return {
      provider: "twilio",
      providerCallId: null,
      status: "missing_credentials",
      note: `Missing ${missing.join(", ")}`
    };
  }

  const twimlUrl = `${config.publicBaseUrl}/api/telephony/ivr?callId=${encodeURIComponent(call.id)}&mode=outbound`;
  const statusUrl = `${config.publicBaseUrl}/api/telephony/status`;

  try {
    const result = await twilioRequest(`/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
      To: customer.phone,
      From: process.env.TWILIO_FROM_NUMBER,
      Url: twimlUrl,
      Method: "POST",
      StatusCallback: statusUrl,
      StatusCallbackMethod: "POST"
    });

    return {
      provider: "twilio",
      providerCallId: result.sid || null,
      status: result.status || "queued",
      note: `Live call started to ${customer.phone} from ${process.env.TWILIO_FROM_NUMBER}`,
      webhookUrl: twimlUrl
    };
  } catch (error) {
    return {
      provider: "twilio",
      providerCallId: null,
      status: "failed",
      note: error.message
    };
  }
}

async function startExotelCall({ config, customer, call }) {
  const required = ["EXOTEL_ACCOUNT_SID", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN", "EXOTEL_CALLER_ID"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    return {
      provider: "exotel",
      providerCallId: null,
      status: "missing_credentials",
      note: `Missing ${missing.join(", ")}`
    };
  }

  const subdomain = process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";
  const twimlUrl = `${config.publicBaseUrl}/api/telephony/ivr?callId=${encodeURIComponent(call.id)}&mode=outbound`;
  const auth = Buffer.from(`${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}`).toString("base64");
  const body = new URLSearchParams({
    From: process.env.EXOTEL_CALLER_ID,
    To: customer.phone,
    CallerId: process.env.EXOTEL_CALLER_ID,
    Url: twimlUrl,
    CallType: "trans"
  }).toString();

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: subdomain,
          path: `/v1/Accounts/${process.env.EXOTEL_ACCOUNT_SID}/Calls/connect.json`,
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body)
          }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            let parsed = {};
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = { raw: data };
            }
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
            else reject(new Error(parsed.RestException?.Message || parsed.message || parsed.raw || `Exotel error ${res.statusCode}`));
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const callData = result.Call || result;
    return {
      provider: "exotel",
      providerCallId: callData.Sid || callData.sid || null,
      status: callData.Status || callData.status || "queued",
      note: `Live Exotel call started to ${customer.phone}`,
      webhookUrl: twimlUrl
    };
  } catch (error) {
    return {
      provider: "exotel",
      providerCallId: null,
      status: "failed",
      note: error.message
    };
  }
}

module.exports = {
  getTelephonyConfig,
  isLiveMode,
  startOutboundCall,
  buildOutboundTwiml,
  buildIncomingTwiml,
  buildIvrResultTwiml
};
