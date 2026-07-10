function getTelephonyConfig() {
  return {
    mode: process.env.CALL_MODE || "simulation",
    provider: process.env.TELEPHONY_PROVIDER || "simulation",
    companyCallerId: process.env.COMPANY_CALLER_ID || "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
  };
}

function isLiveMode() {
  return getTelephonyConfig().mode === "live";
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

  return {
    provider: config.provider,
    providerCallId: null,
    status: "not_configured",
    note: `Live adapter for ${config.provider} is not implemented yet. Add provider API credentials and adapter code.`
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

  return {
    provider: "twilio",
    providerCallId: null,
    status: "adapter_ready",
    note: `Ready to call ${customer.phone} from ${process.env.TWILIO_FROM_NUMBER}. Install provider SDK or use HTTPS API in the next step.`,
    webhookUrl: `${config.publicBaseUrl}/api/telephony/ivr?callId=${encodeURIComponent(call.id)}`
  };
}

module.exports = {
  getTelephonyConfig,
  isLiveMode,
  startOutboundCall
};
