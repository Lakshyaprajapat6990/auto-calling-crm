const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getTelephonyConfig, startOutboundCall } = require("./telephony");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "auto-calling-data")
  : path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(ROOT, "data", "seed.json");
const PORT = Number(process.env.PORT || 3001);

const sessions = new Map();

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token ? sessions.get(token) : null;
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

  const call = {
    id: makeId("call"),
    type: "outbound",
    campaignId,
    customerId,
    customerName: customer.name,
    phone: customer.phone,
    message: renderTemplate(campaign.messageTemplate, customer),
    ivrChoice,
    status: "connected",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    outcome: null,
    provider: "simulation",
    providerCallId: null,
    providerStatus: null,
    createdAt: new Date().toISOString()
  };

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

  const providerResult = await startOutboundCall({ customer, campaign, call });
  call.provider = providerResult.provider;
  call.providerCallId = providerResult.providerCallId;
  call.providerStatus = providerResult.status;
  call.providerNote = providerResult.note;

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

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    const user = db.users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return sendJson(res, 401, { error: "Invalid email or password" });
    const token = crypto.randomBytes(24).toString("hex");
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    sessions.set(token, safeUser);
    return sendJson(res, 200, { token, user: safeUser });
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

  if (req.method === "POST" && pathname === "/api/telephony/incoming") {
    const body = await parseBody(req);
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
    return sendJson(res, 200, {
      ok: true,
      receivedChoice: body.digits || body.ivrChoice || null,
      nextAction: "Route choice to live transfer or callback logic"
    });
  }

  if (req.method === "POST" && pathname === "/api/telephony/status") {
    const body = await parseBody(req);
    return sendJson(res, 200, { ok: true, received: body });
  }

  if (req.method === "POST" && pathname === "/api/telephony/recording") {
    const body = await parseBody(req);
    const recording = {
      id: makeId("rec"),
      callId: body.callId || null,
      providerCallId: body.providerCallId || null,
      url: body.recordingUrl || body.url || "",
      createdAt: new Date().toISOString()
    };
    db.recordings.unshift(recording);
    writeDb(db);
    return sendJson(res, 201, recording);
  }

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
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (error) {
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
