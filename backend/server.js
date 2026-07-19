const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  getTelephonyConfig,
  startOutboundCall,
  buildOutboundTwiml,
  buildIncomingTwiml,
  buildIvrResultTwiml
} = require("./telephony");

const ROOT = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "auto-calling-data")
  : path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(ROOT, "data", "seed.json");
const PORT = Number(process.env.PORT || 3001);
const AUTH_SECRET = process.env.AUTH_SECRET || "auto-calling-crm-dev-secret";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, fs.readFileSync(SEED_PATH, "utf8"));
    return;
  }
  const current = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const hasData = Object.values(current).some((value) => Array.isArray(value) && value.length > 0);
  if (!hasData) {
    fs.writeFileSync(DB_PATH, fs.readFileSync(SEED_PATH, "utf8"));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendTwiml(res, xml) {
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(xml);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(body);
        return resolve(Object.fromEntries(params.entries()));
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        const params = new URLSearchParams(body);
        if ([...params.keys()].length) return resolve(Object.fromEntries(params.entries()));
        reject(new Error("Invalid request body"));
      }
    });
  });
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(user) {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

function getUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyToken(token);
}

function requireUser(req, res) {
  const user = getUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return user;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function renderTemplate(template, customer) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === "company") return "Auto Calling CRM";
    return customer[key] ?? "";
  });
}

function findFreeEmployee(db, department, language) {
  return db.employees.find((employee) => {
    const departmentOk = !department || employee.department === department;
    const languageOk = !language || employee.language === language || employee.language === "English";
    return employee.online && employee.availability === "free" && departmentOk && languageOk;
  });
}

function createCallback(db, customer, campaign, reason) {
  const callback = {
    id: makeId("cb"),
    customerId: customer.id,
    customerName: customer.name,
    campaignId: campaign?.id || null,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  db.callbacks.unshift(callback);
  return callback;
}

async function simulateOutboundCall(db, campaignId, customerId, ivrChoice = "1") {
  const campaign = db.campaigns.find((item) => item.id === campaignId);
  const customer = db.customers.find((item) => item.id === customerId);
  if (!campaign || !customer) {
    return { error: "Campaign or customer not found" };
  }
  if (customer.optOut) {
    return { error: "Customer has opted out" };
  }

  const live = (process.env.CALL_MODE || "simulation") === "live";
  const call = {
    id: makeId("call"),
    type: "outbound",
    campaignId,
    customerId,
    customerName: customer.name,
    phone: customer.phone,
    message: renderTemplate(campaign.messageTemplate, customer),
    ivrChoice: live ? null : ivrChoice,
    status: live ? "queued" : "connected",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    outcome: null,
    provider: "simulation",
    providerCallId: null,
    providerStatus: null,
    createdAt: new Date().toISOString()
  };

  if (!live) {
    if (ivrChoice === "1") {
      const employee = findFreeEmployee(db, campaign.department, customer.language);
      if (employee) {
        employee.availability = "busy";
        call.status = "transferred";
        call.assignedEmployeeId = employee.id;
        call.assignedEmployeeName = employee.name;
        call.outcome = "live_transfer";
      } else {
        call.status = "callback";
        call.outcome = "no_employee_free";
        createCallback(db, customer, campaign, "No employee free during outbound transfer");
      }
    } else if (ivrChoice === "2") {
      call.status = "callback";
      call.outcome = "customer_requested_callback";
      createCallback(db, customer, campaign, "Customer pressed callback option");
    } else if (ivrChoice === "9") {
      call.status = "completed";
      call.outcome = "opt_out";
      customer.optOut = true;
      customer.status = "opt_out";
    } else {
      call.status = "completed";
      call.outcome = "message_played";
    }
  }

  const providerResult = await startOutboundCall({ customer, campaign, call });
  call.provider = providerResult.provider;
  call.providerCallId = providerResult.providerCallId;
  call.providerStatus = providerResult.status;
  call.providerNote = providerResult.note;
  if (providerResult.status === "failed" || providerResult.status === "missing_credentials") {
    call.status = "failed";
    call.outcome = providerResult.status;
  }

  db.calls.unshift(call);
  return { call };
}

function simulateIncomingCall(db, payload) {
  const customer = db.customers.find((item) => item.phone === payload.phone) || {
    id: makeId("guest"),
    name: payload.name || "Incoming Customer",
    phone: payload.phone || "Unknown",
    language: payload.language || "Hindi"
  };
  const department = payload.department || "Sales";
  const call = {
    id: makeId("call"),
    type: "incoming",
    campaignId: null,
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    message: "Welcome. Press 1 for Sales, press 2 for Support, press 3 for callback.",
    ivrChoice: payload.ivrChoice || "1",
    status: "connected",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    outcome: null,
    createdAt: new Date().toISOString()
  };

  if (call.ivrChoice === "3") {
    call.status = "callback";
    call.outcome = "incoming_callback_requested";
    createCallback(db, customer, null, "Incoming caller requested callback");
  } else {
    const employee = findFreeEmployee(db, department, customer.language);
    if (employee) {
      employee.availability = "busy";
      call.status = "transferred";
      call.assignedEmployeeId = employee.id;
      call.assignedEmployeeName = employee.name;
      call.outcome = "incoming_transfer";
    } else {
      call.status = "callback";
      call.outcome = "no_employee_free";
      createCallback(db, customer, null, "No employee free for incoming call");
    }
  }

  db.calls.unshift(call);
  return { call };
}

function analytics(db) {
  const totalCalls = db.calls.length;
  const transferred = db.calls.filter((call) => call.status === "transferred").length;
  const callbacks = db.callbacks.filter((callback) => callback.status === "pending").length;
  const freeEmployees = db.employees.filter((employee) => employee.online && employee.availability === "free").length;
  return {
    totalCustomers: db.customers.length,
    totalEmployees: db.employees.length,
    totalCampaigns: db.campaigns.length,
    totalCalls,
    transferred,
    callbacks,
    freeEmployees
  };
}

async function handleApi(req, res, pathname, searchParams = new URLSearchParams()) {
  const db = readDb();
  const config = getTelephonyConfig();

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    const user = db.users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return sendJson(res, 401, { error: "Invalid email or password" });
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = signToken(safeUser);
    return sendJson(res, 200, { token, user: safeUser });
  }

  // Public Twilio webhooks (no auth)
  if (req.method === "POST" && pathname === "/api/telephony/incoming") {
    const body = await parseBody(req);
    if (body.From || body.CallSid) {
      db.calls.unshift({
        id: makeId("call"),
        type: "incoming",
        campaignId: null,
        customerId: null,
        customerName: body.CallerName || "Incoming Caller",
        phone: body.From || "",
        message: "Incoming IVR",
        ivrChoice: null,
        status: "ringing",
        provider: "twilio",
        providerCallId: body.CallSid || null,
        providerStatus: body.CallStatus || "ringing",
        createdAt: new Date().toISOString()
      });
      writeDb(db);
      return sendTwiml(res, buildIncomingTwiml({ publicBaseUrl: config.publicBaseUrl }));
    }
    const result = simulateIncomingCall(db, {
      name: body.name || "Incoming Caller",
      phone: body.from || body.phone,
      department: body.department || "Sales",
      language: body.language || "Hindi",
      ivrChoice: body.ivrChoice || "1"
    });
    writeDb(db);
    return sendJson(res, 201, result.call);
  }

  if (req.method === "POST" && pathname === "/api/telephony/ivr") {
    const body = await parseBody(req);
    const digits = body.Digits || body.digits || body.ivrChoice || null;
    const callId = searchParams.get("callId") || body.callId || null;
    const mode = searchParams.get("mode") || "";

    if (!digits) {
      const existing = callId ? db.calls.find((item) => item.id === callId) : null;
      const message = existing?.message || "Hello from Auto Calling CRM.";
      return sendTwiml(
        res,
        mode === "outbound" || existing
          ? buildOutboundTwiml({ message, publicBaseUrl: config.publicBaseUrl, callId })
          : buildIncomingTwiml({ publicBaseUrl: config.publicBaseUrl })
      );
    }

    let transferNumber = "";
    const existing = callId ? db.calls.find((item) => item.id === callId) : null;
    if (existing) {
      existing.ivrChoice = digits;
      const customer = db.customers.find((item) => item.id === existing.customerId);
      const campaign = db.campaigns.find((item) => item.id === existing.campaignId);
      if (digits === "1") {
        const employee = findFreeEmployee(db, campaign?.department, customer?.language);
        if (employee) {
          employee.availability = "busy";
          existing.status = "transferred";
          existing.assignedEmployeeId = employee.id;
          existing.assignedEmployeeName = employee.name;
          existing.outcome = "live_transfer";
          transferNumber = employee.phone;
        } else {
          existing.status = "callback";
          existing.outcome = "no_employee_free";
          if (customer) createCallback(db, customer, campaign, "No employee free during outbound transfer");
        }
      } else if (digits === "2" || digits === "3") {
        existing.status = "callback";
        existing.outcome = "customer_requested_callback";
        if (customer) createCallback(db, customer, campaign, "Customer requested callback");
      } else if (digits === "9") {
        existing.status = "completed";
        existing.outcome = "opt_out";
        if (customer) {
          customer.optOut = true;
          customer.status = "opt_out";
        }
      } else {
        existing.status = "completed";
        existing.outcome = "message_played";
      }
      writeDb(db);
    } else if (digits === "1") {
      const employee = findFreeEmployee(db, "Sales", "Hindi");
      transferNumber = employee?.phone || "";
    }

    return sendTwiml(res, buildIvrResultTwiml({ digits, transferNumber }));
  }

  if (req.method === "POST" && pathname === "/api/telephony/status") {
    const body = await parseBody(req);
    const providerCallId = body.CallSid || body.providerCallId || null;
    if (providerCallId) {
      const existing = db.calls.find((item) => item.providerCallId === providerCallId);
      if (existing) {
        existing.providerStatus = body.CallStatus || body.CallStatus || existing.providerStatus;
        if (body.CallStatus === "completed" && existing.status === "queued") {
          existing.status = "completed";
        }
        if (body.CallStatus === "in-progress") existing.status = "connected";
        if (body.CallStatus === "ringing") existing.status = "ringing";
        writeDb(db);
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/telephony/recording") {
    const body = await parseBody(req);
    const recording = {
      id: makeId("rec"),
      callId: body.callId || null,
      providerCallId: body.CallSid || body.providerCallId || null,
      url: body.RecordingUrl || body.recordingUrl || body.url || "",
      createdAt: new Date().toISOString()
    };
    db.recordings.unshift(recording);
    writeDb(db);
    return sendJson(res, 201, recording);
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === "GET" && pathname === "/api/me") return sendJson(res, 200, { user });
  if (req.method === "GET" && pathname === "/api/analytics") return sendJson(res, 200, analytics(db));
  if (req.method === "GET" && pathname === "/api/employees") return sendJson(res, 200, db.employees);
  if (req.method === "GET" && pathname === "/api/customers") return sendJson(res, 200, db.customers);
  if (req.method === "GET" && pathname === "/api/campaigns") return sendJson(res, 200, db.campaigns);
  if (req.method === "GET" && pathname === "/api/calls") return sendJson(res, 200, db.calls);
  if (req.method === "GET" && pathname === "/api/callbacks") return sendJson(res, 200, db.callbacks);
  if (req.method === "GET" && pathname === "/api/telephony/config") return sendJson(res, 200, getTelephonyConfig());

  if (req.method === "POST" && pathname === "/api/employees") {
    const body = await parseBody(req);
    const employee = {
      id: makeId("emp"),
      name: body.name,
      phone: body.phone,
      email: body.email,
      department: body.department || "Sales",
      language: body.language || "Hindi",
      availability: body.availability || "free",
      online: body.online !== false
    };
    db.employees.unshift(employee);
    writeDb(db);
    return sendJson(res, 201, employee);
  }

  if (req.method === "POST" && pathname === "/api/customers") {
    const body = await parseBody(req);
    const customer = {
      id: makeId("cus"),
      name: body.name,
      phone: body.phone,
      city: body.city || "",
      language: body.language || "Hindi",
      product: body.product || "",
      status: "new",
      notes: body.notes || "",
      optOut: false
    };
    db.customers.unshift(customer);
    writeDb(db);
    return sendJson(res, 201, customer);
  }

  if (req.method === "POST" && pathname === "/api/campaigns") {
    const body = await parseBody(req);
    const campaign = {
      id: makeId("cmp"),
      name: body.name,
      status: body.status || "draft",
      department: body.department || "Sales",
      messageTemplate: body.messageTemplate,
      customerIds: body.customerIds || [],
      retryLimit: Number(body.retryLimit || 2)
    };
    db.campaigns.unshift(campaign);
    writeDb(db);
    return sendJson(res, 201, campaign);
  }

  if (req.method === "POST" && pathname === "/api/simulate/outbound") {
    const body = await parseBody(req);
    const result = await simulateOutboundCall(db, body.campaignId, body.customerId, body.ivrChoice);
    if (result.error) return sendJson(res, 400, result);
    writeDb(db);
    return sendJson(res, 201, result.call);
  }

  if (req.method === "POST" && pathname === "/api/simulate/incoming") {
    const body = await parseBody(req);
    const result = simulateIncomingCall(db, body);
    writeDb(db);
    return sendJson(res, 201, result.call);
  }

  if (req.method === "POST" && pathname.startsWith("/api/employees/") && pathname.endsWith("/free")) {
    const id = pathname.split("/")[3];
    const employee = db.employees.find((item) => item.id === id);
    if (!employee) return sendJson(res, 404, { error: "Employee not found" });
    employee.availability = "free";
    employee.online = true;
    writeDb(db);
    return sendJson(res, 200, employee);
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname, url.searchParams);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message });
  }
});

ensureDb();

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Auto Calling CRM running at http://localhost:${PORT}`);
  });
}

module.exports = server;
