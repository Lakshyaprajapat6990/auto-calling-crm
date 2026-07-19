const app = document.querySelector("#app");
const STORAGE_KEY = "auto_calling_crm_data_v3";
const SETTINGS_KEY = "auto_calling_crm_settings_v1";

const DISPOSITIONS = [
  "interested",
  "not_interested",
  "callback",
  "busy",
  "no_answer",
  "wrong_number",
  "opt_out",
  "connected"
];

const defaultSettings = () => ({
  companyName: "Auto Calling CRM",
  industry: "Business",
  timezone: "Asia/Kolkata",
  callingHoursStart: "09:00",
  callingHoursEnd: "19:00",
  defaultLanguage: "Hindi",
  supportEmail: "support@company.local"
});

const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  page: "dashboard",
  editing: { customerId: "", employeeId: "", campaignId: "" },
  settings: loadSettings(),
  data: {
    analytics: {},
    employees: [],
    customers: [],
    campaigns: [],
    calls: [],
    callbacks: [],
    dnc: [],
    telephony: {}
  }
};

const allPages = [
  ["dashboard", "Dashboard", "all"],
  ["customers", "Customers", "all"],
  ["employees", "Employees", "admin"],
  ["campaigns", "Campaigns", "admin"],
  ["outbound", "Outbound Calls", "all"],
  ["incoming", "Incoming Calls", "all"],
  ["callbacks", "Callbacks", "all"],
  ["dnc", "DND List", "admin"],
  ["reports", "Reports", "all"],
  ["telephony", "Calling Setup", "admin"],
  ["settings", "Settings", "admin"]
];

function visiblePages() {
  const role = state.user?.role || "admin";
  return allPages.filter(([, , access]) => access === "all" || role === "admin");
}

function isAdmin() {
  return (state.user?.role || "admin") === "admin";
}

function makeLocalId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 12)}`;
}

function loadSettings() {
  try {
    return { ...defaultSettings(), ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function computeAnalytics(data) {
  const calls = data.calls || [];
  const callbacks = data.callbacks || [];
  const employees = data.employees || [];
  const optedOut = (data.customers || []).filter((c) => c.optOut).length;
  return {
    totalCustomers: (data.customers || []).length,
    totalEmployees: employees.length,
    totalCampaigns: (data.campaigns || []).length,
    totalCalls: calls.length,
    transferred: calls.filter((call) => call.status === "transferred").length,
    callbacks: callbacks.filter((callback) => callback.status === "pending").length,
    freeEmployees: employees.filter((employee) => employee.online && employee.availability === "free").length,
    optedOut,
    failed: calls.filter((call) => call.status === "failed").length
  };
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("auto_calling_crm_data_v2") || localStorage.getItem("auto_calling_crm_data_v1");
      return legacy ? JSON.parse(legacy) : null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalData() {
  const payload = {
    employees: state.data.employees || [],
    customers: state.data.customers || [],
    campaigns: state.data.campaigns || [],
    calls: state.data.calls || [],
    callbacks: state.data.callbacks || [],
    dnc: state.data.dnc || []
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  state.data.analytics = computeAnalytics(state.data);
}

async function syncToServer() {
  if (!state.token) return;
  try {
    const result = await api("/api/db/sync", {
      method: "POST",
      body: JSON.stringify({
        db: {
          employees: state.data.employees,
          customers: state.data.customers,
          campaigns: state.data.campaigns,
          calls: state.data.calls,
          callbacks: state.data.callbacks,
          dnc: state.data.dnc || [],
          settings: state.settings
        }
      })
    });
    if (result.settings) state.settings = { ...state.settings, ...result.settings };
    if (Array.isArray(result.dnc)) state.data.dnc = result.dnc;
    state.storageMode = result.storage || state.storageMode;
  } catch {
    // Keep local data even if server sync fails.
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function refresh() {
  const telephony = await api("/api/telephony/config");
  const local = loadLocalData();
  if (local) {
    state.data = {
      ...state.data,
      employees: local.employees || [],
      customers: local.customers || [],
      campaigns: local.campaigns || [],
      calls: local.calls || [],
      callbacks: local.callbacks || [],
      dnc: local.dnc || [],
      telephony,
      analytics: {}
    };
    state.data.analytics = computeAnalytics(state.data);
    await syncToServer();
    return;
  }

  const [employees, customers, campaigns, calls, callbacks] = await Promise.all([
    api("/api/employees"),
    api("/api/customers"),
    api("/api/campaigns"),
    api("/api/calls"),
    api("/api/callbacks")
  ]);
  state.data = { analytics: {}, employees, customers, campaigns, calls, callbacks, telephony };
  state.data.analytics = computeAnalytics(state.data);
  saveLocalData();
}

function html(strings, ...values) {
  return strings.map((item, index) => item + (values[index] ?? "")).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rowStatus(value) {
  return `<span class="status ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function normalizePhoneValue(value) {
  let phone = String(value || "").trim().replace(/[\s\-()]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^0\d{10}$/.test(phone)) phone = `+91${phone.slice(1)}`;
  if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  if (!phone.startsWith("+")) phone = `+${phone}`;
  return phone;
}

function formValues(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const multi = form.querySelector("select[multiple]");
  if (multi) data[multi.name] = [...multi.selectedOptions].map((option) => option.value);
  if (data.phone) data.phone = normalizePhoneValue(data.phone);
  return data;
}

function confirmDelete(label) {
  return window.confirm(`Delete this ${label}? This cannot be undone.`);
}

function renderLogin(message = "") {
  app.innerHTML = html`
    <section class="login">
      <form class="login-card" id="loginForm">
        <h1>${escapeHtml(state.settings.companyName || "Auto Calling CRM")}</h1>
        <p>Sign in to manage customers, campaigns, executives, and live calling.</p>
        <label>Email <input name="email" value="admin@autocalling.local" required></label>
        <label>Password <input name="password" type="password" value="admin123" required></label>
        <button type="submit">Login</button>
        <div class="message">${escapeHtml(message)}</div>
        <p class="message">Admin: admin@autocalling.local / admin123<br>Agent: agent@autocalling.local / agent123</p>
      </form>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      localStorage.removeItem("token");
      state.token = "";
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem("token", state.token);
      await refresh();
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  });
}

function renderApp() {
  const pages = visiblePages();
  if (!pages.some(([id]) => id === state.page)) state.page = "dashboard";
  app.innerHTML = html`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">${escapeHtml(state.settings.companyName || "Auto Calling")}<br><small>CRM</small></div>
        <div class="nav">
          ${pages.map(([id, label]) => `<button class="${state.page === id ? "active" : ""}" data-page="${id}">${label}</button>`).join("")}
        </div>
      </aside>
      <section class="content">
        <div class="topbar">
          <div>
            <h1>${pages.find(([id]) => id === state.page)?.[1] || "Dashboard"}</h1>
            <p>${escapeHtml(state.user?.name || "User")} · ${escapeHtml(state.user?.role || "admin")}</p>
          </div>
          <div class="actions">
            <button class="secondary" id="refreshBtn">Refresh</button>
            <button class="secondary" id="logoutBtn">Logout</button>
          </div>
        </div>
        ${renderPage()}
      </section>
    </div>
  `;
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = button.dataset.page;
      renderApp();
    });
  });
  document.querySelector("#refreshBtn").addEventListener("click", async () => {
    await refresh();
    renderApp();
  });
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    state.token = "";
    renderLogin();
  });
  bindPageEvents();
}

function renderPage() {
  return {
    dashboard: renderDashboard,
    customers: renderCustomers,
    employees: renderEmployees,
    campaigns: renderCampaigns,
    outbound: renderOutbound,
    incoming: renderIncoming,
    telephony: renderTelephony,
    callbacks: renderCallbacks,
    dnc: renderDnc,
    reports: renderReports,
    settings: renderSettings
  }[state.page]();
}

function renderDashboard() {
  const a = state.data.analytics;
  const free = state.data.employees.filter((e) => e.online !== false && e.availability === "free");
  const busy = state.data.employees.filter((e) => e.availability === "busy");
  return html`
    <div class="grid">
      <div class="card">Customers<strong>${a.totalCustomers || 0}</strong></div>
      <div class="card">Employees<strong>${a.totalEmployees || 0}</strong></div>
      <div class="card">Campaigns<strong>${a.totalCampaigns || 0}</strong></div>
      <div class="card">Pending callbacks<strong>${a.callbacks || 0}</strong></div>
    </div>
    <div class="grid" style="margin-top:14px">
      <div class="card">Total calls<strong>${a.totalCalls || 0}</strong></div>
      <div class="card">Transferred<strong>${a.transferred || 0}</strong></div>
      <div class="card">Failed<strong>${a.failed || 0}</strong></div>
      <div class="card">Opted out<strong>${a.optedOut || 0}</strong></div>
    </div>
    <div class="panel">
      <h2>Agent Live Board</h2>
      <div class="panel-body">
        <p class="message">Free: ${free.length} · Busy: ${busy.length} · DND numbers: ${(state.data.dnc || []).length}</p>
        ${employeesTable(state.data.employees, true)}
      </div>
    </div>
    <div class="split">
      <div class="panel"><h2>Recent Calls</h2><div class="panel-body">${callsTable(state.data.calls.slice(0, 5), true)}</div></div>
      <div class="panel"><h2>Storage</h2><div class="panel-body"><p class="message">Mode: ${escapeHtml(state.storageMode || "browser+server sync")}. For multi-user production, connect Postgres (see Settings).</p></div></div>
    </div>
  `;
}

function renderCustomers() {
  const editing = state.data.customers.find((c) => c.id === state.editing.customerId);
  return html`
    <div class="panel">
      <h2>${editing ? "Edit Customer" : "Add Customer"}</h2>
      <div class="panel-body">
        <form id="customerForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}">
          <label>Name <input name="name" value="${escapeHtml(editing?.name || "")}" required></label>
          <label>Phone <input name="phone" type="tel" inputmode="tel" placeholder="+91XXXXXXXXXX" value="${escapeHtml(editing?.phone || "")}" required></label>
          <label>City <input name="city" value="${escapeHtml(editing?.city || "")}"></label>
          <label>Language <select name="language"><option ${editing?.language === "Hindi" || !editing ? "selected" : ""}>Hindi</option><option ${editing?.language === "English" ? "selected" : ""}>English</option></select></label>
          <label>Product <input name="product" value="${escapeHtml(editing?.product || "")}"></label>
          <label>Notes <input name="notes" value="${escapeHtml(editing?.notes || "")}"></label>
          <button type="submit">${editing ? "Update Customer" : "Add Customer"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancelCustomerEdit">Cancel</button>` : ""}
        </form>
        <p class="message">Use international format (+91...). Opt-out / DND customers are blocked from outbound calls.</p>
        <div class="actions" style="margin-top:12px">
          <label class="secondary" style="padding:10px 14px;border-radius:6px;background:#eef2f6;cursor:pointer">
            Import CSV
            <input id="csvImportInput" type="file" accept=".csv,text/csv" hidden>
          </label>
          <a class="message" href="/customers-sample.csv" style="align-self:center">Download sample CSV</a>
        </div>
      </div>
    </div>
    <div class="panel"><h2>Customers</h2><div class="panel-body">${customersTable(state.data.customers)}</div></div>
  `;
}

function renderEmployees() {
  const editing = state.data.employees.find((e) => e.id === state.editing.employeeId);
  return html`
    <div class="panel">
      <h2>${editing ? "Edit Employee" : "Add Employee"}</h2>
      <div class="panel-body">
        <form id="employeeForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}">
          <label>Name <input name="name" value="${escapeHtml(editing?.name || "")}" required></label>
          <label>Phone <input name="phone" type="tel" value="${escapeHtml(editing?.phone || "")}" required></label>
          <label>Email <input name="email" type="email" value="${escapeHtml(editing?.email || "")}"></label>
          <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
          <label>Language <select name="language"><option>Hindi</option><option>English</option></select></label>
          <label>Status <select name="availability"><option>free</option><option>busy</option></select></label>
          <button type="submit">${editing ? "Update Employee" : "Add Employee"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancelEmployeeEdit">Cancel</button>` : ""}
        </form>
      </div>
    </div>
    <div class="panel"><h2>Employees</h2><div class="panel-body">${employeesTable(state.data.employees, true)}</div></div>
  `;
}

function renderCampaigns() {
  const editing = state.data.campaigns.find((c) => c.id === state.editing.campaignId);
  const selected = new Set(editing?.customerIds || state.data.customers.map((c) => c.id));
  const customerOptions = state.data.customers
    .map((customer) => `<option value="${customer.id}" ${selected.has(customer.id) ? "selected" : ""}>${escapeHtml(customer.name)}</option>`)
    .join("");
  const defaultMessage = `Hello {{name}}, this is ${state.settings.companyName} calling about your {{product}}. Press 1 to talk to our executive, press 2 for callback, or press 9 to opt out.`;
  return html`
    <div class="panel">
      <h2>${editing ? "Edit Campaign" : "Create Campaign"}</h2>
      <div class="panel-body">
        <form id="campaignForm">
          <input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}">
          <div class="form-grid">
            <label>Name <input name="name" value="${escapeHtml(editing?.name || "")}" required></label>
            <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
            <label>Status <select name="status"><option value="draft">draft</option><option value="active">active</option><option value="paused">paused</option></select></label>
            <label>Retry Limit <input name="retryLimit" type="number" value="${escapeHtml(editing?.retryLimit || 2)}"></label>
          </div>
          <label>Message Template
            <textarea name="messageTemplate">${escapeHtml(editing?.messageTemplate || defaultMessage)}</textarea>
          </label>
          <label>Customers <select name="customerIds" multiple size="4">${customerOptions}</select></label>
          <div class="actions" style="margin-top:12px">
            <button type="submit">${editing ? "Update Campaign" : "Create Campaign"}</button>
            ${editing ? `<button type="button" class="secondary" id="cancelCampaignEdit">Cancel</button>` : ""}
          </div>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Campaigns</h2><div class="panel-body">${campaignsTable(state.data.campaigns)}</div></div>
  `;
}

function renderOutbound() {
  const activeCustomers = state.data.customers.filter((c) => !c.optOut);
  const campaignOptions = state.data.campaigns.map((campaign) => `<option value="${campaign.id}">${escapeHtml(campaign.name)}</option>`).join("");
  const customerOptions = activeCustomers.map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)} - ${escapeHtml(customer.phone)}</option>`).join("");
  const latest = state.data.calls[0];
  const latestNote = latest?.providerNote ? `<p class="message"><strong>Last call:</strong> ${escapeHtml(latest.status)} — ${escapeHtml(latest.providerNote)}</p>` : "";
  return html`
    <div class="panel">
      <h2>Start Outbound Call</h2>
      <div class="panel-body">
        <p class="message">Single call or queue auto-dial (next eligible customer in campaign). Calling hours and DND are enforced.</p>
        ${latestNote}
        <form id="outboundForm" class="form-grid">
          <label>Campaign <select name="campaignId">${campaignOptions}</select></label>
          <label>Customer <select name="customerId">${customerOptions}</select></label>
          <label>Expected IVR choice (simulation helper)
            <select name="ivrChoice">
              <option value="1">1 - Talk to executive</option>
              <option value="2">2 - Callback</option>
              <option value="9">9 - Opt out</option>
              <option value="0">0 - Message only</option>
            </select>
          </label>
          <button type="submit">Start Call</button>
          <button type="button" class="secondary" id="dialNextBtn">Dial Next In Queue</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Call History</h2><div class="panel-body">${callsTable(state.data.calls, true)}</div></div>
  `;
}

function renderDnc() {
  return html`
    <div class="panel">
      <h2>Add DND / Do-Not-Call Number</h2>
      <div class="panel-body">
        <form id="dncForm" class="form-grid">
          <label>Phone <input name="phone" type="tel" placeholder="+91XXXXXXXXXX" required></label>
          <label>Reason <input name="reason" placeholder="Customer request / DND registry"></label>
          <button type="submit">Add to DND</button>
        </form>
        <p class="message">Numbers on this list cannot be dialed. Opt-out dispositions are also added here automatically.</p>
      </div>
    </div>
    <div class="panel"><h2>DND List</h2><div class="panel-body">${dncTable(state.data.dnc || [])}</div></div>
  `;
}

function renderIncoming() {
  return html`
    <div class="panel">
      <h2>Log / Test Incoming Call</h2>
      <div class="panel-body">
        <form id="incomingForm" class="form-grid">
          <label>Name <input name="name" value="Incoming Customer"></label>
          <label>Phone <input name="phone" value="+919700009999"></label>
          <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
          <label>Language <select name="language"><option>Hindi</option><option>English</option></select></label>
          <label>Choice <select name="ivrChoice"><option value="1">Talk to executive</option><option value="3">Callback</option></select></label>
          <button type="submit">Process Incoming Call</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Call History</h2><div class="panel-body">${callsTable(state.data.calls, true)}</div></div>
  `;
}

function renderCallbacks() {
  return `<div class="panel"><h2>Callback Queue</h2><div class="panel-body">${callbacksTable(state.data.callbacks)}</div></div>`;
}

function renderTelephony() {
  const config = state.data.telephony;
  const base = config.publicBaseUrl || window.location.origin;
  return html`
    <div class="grid">
      <div class="card">Mode<strong>${escapeHtml(config.mode || "simulation")}</strong></div>
      <div class="card">Provider<strong>${escapeHtml(config.provider || "twilio")}</strong></div>
      <div class="card">Caller ID<strong>${escapeHtml(config.companyCallerId || "Not set")}</strong></div>
      <div class="card">Public URL<strong>${escapeHtml(base)}</strong></div>
    </div>
    <div class="panel">
      <h2>Provider Webhook URLs</h2>
      <div class="panel-body">
        <p>Configure these in your telephony provider dashboard.</p>
        <table>
          <thead><tr><th>Purpose</th><th>URL</th></tr></thead>
          <tbody>
            <tr><td>Incoming Call</td><td>${escapeHtml(base)}/api/telephony/incoming</td></tr>
            <tr><td>IVR Keypress</td><td>${escapeHtml(base)}/api/telephony/ivr</td></tr>
            <tr><td>Call Status</td><td>${escapeHtml(base)}/api/telephony/status</td></tr>
            <tr><td>Recording</td><td>${escapeHtml(base)}/api/telephony/recording</td></tr>
          </tbody>
        </table>
        <p class="message">Provider API keys are set in server environment variables (.env / Vercel), not in the browser, for security.</p>
      </div>
    </div>
  `;
}

function renderReports() {
  const a = state.data.analytics;
  const opted = state.data.customers.filter((c) => c.optOut);
  return html`
    <div class="grid">
      <div class="card">Total calls<strong>${a.totalCalls || 0}</strong></div>
      <div class="card">Transferred<strong>${a.transferred || 0}</strong></div>
      <div class="card">Failed<strong>${a.failed || 0}</strong></div>
      <div class="card">Opt-outs<strong>${a.optedOut || 0}</strong></div>
    </div>
    <div class="panel"><h2>Call Report</h2><div class="panel-body">${callsTable(state.data.calls, true)}</div></div>
    <div class="panel"><h2>Opt-out List</h2><div class="panel-body">${
      opted.length
        ? `<table><thead><tr><th>Name</th><th>Phone</th><th>Status</th></tr></thead><tbody>${opted
            .map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone)}</td><td>${rowStatus("opt_out")}</td></tr>`)
            .join("")}</tbody></table>`
        : "<p>No opted-out customers.</p>"
    }</div></div>
  `;
}

function renderSettings() {
  const s = state.settings;
  return html`
    <div class="panel">
      <h2>Company Profile</h2>
      <div class="panel-body">
        <form id="settingsForm" class="form-grid">
          <label>Company Name <input name="companyName" value="${escapeHtml(s.companyName)}" required></label>
          <label>Industry <input name="industry" value="${escapeHtml(s.industry)}"></label>
          <label>Support Email <input name="supportEmail" type="email" value="${escapeHtml(s.supportEmail)}"></label>
          <label>Timezone <input name="timezone" value="${escapeHtml(s.timezone)}"></label>
          <label>Calling Hours Start <input name="callingHoursStart" type="time" value="${escapeHtml(s.callingHoursStart)}"></label>
          <label>Calling Hours End <input name="callingHoursEnd" type="time" value="${escapeHtml(s.callingHoursEnd)}"></label>
          <label>Default Language <select name="defaultLanguage"><option ${s.defaultLanguage === "Hindi" ? "selected" : ""}>Hindi</option><option ${s.defaultLanguage === "English" ? "selected" : ""}>English</option></select></label>
          <label>Enforce Calling Hours
            <select name="enforceCallingHours">
              <option value="true" ${s.enforceCallingHours !== false ? "selected" : ""}>Yes - block calls outside hours</option>
              <option value="false" ${s.enforceCallingHours === false ? "selected" : ""}>No</option>
            </select>
          </label>
          <button type="submit">Save Settings</button>
        </form>
      </div>
    </div>
    <div class="panel">
      <h2>Change Password</h2>
      <div class="panel-body">
        <form id="passwordForm" class="form-grid">
          <label>Current Password <input name="currentPassword" type="password" required></label>
          <label>New Password <input name="newPassword" type="password" minlength="6" required></label>
          <button type="submit">Update Password</button>
        </form>
      </div>
    </div>
    <div class="panel">
      <h2>Data Management</h2>
      <div class="panel-body">
        <p class="message">Storage: ${escapeHtml(state.storageMode || "browser+server sync")}. For company sale, connect a real Postgres database (Neon free tier) using DATABASE_URL.</p>
        <div class="actions">
          <button class="secondary" id="clearCallsBtn">Clear Call History</button>
          <button class="secondary" id="clearCallbacksBtn">Clear Callbacks</button>
          <button class="danger" id="resetAllBtn">Reset All CRM Data</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <h2>Roles</h2>
      <div class="panel-body">
        <table>
          <thead><tr><th>Role</th><th>Access</th><th>Login</th></tr></thead>
          <tbody>
            <tr><td>Admin</td><td>Full access including Settings, Employees, Campaigns, delete/reset</td><td>admin@autocalling.local / admin123</td></tr>
            <tr><td>Agent</td><td>Dashboard, Customers, Calls, Callbacks, Reports</td><td>agent@autocalling.local / agent123</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function customersTable(customers) {
  if (!customers.length) return "<p>No customers yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Product</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${customers
      .map(
        (c) => `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.city)}</td>
      <td>${escapeHtml(c.product)}</td>
      <td>${rowStatus(c.optOut ? "opt_out" : c.status)}</td>
      <td class="actions">
        <button class="secondary" data-edit-customer="${c.id}">Edit</button>
        <button class="secondary" data-optout-customer="${c.id}">${c.optOut ? "Undo Opt-out" : "Opt-out"}</button>
        ${isAdmin() ? `<button class="danger" data-delete-customer="${c.id}">Delete</button>` : ""}
      </td>
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function employeesTable(employees, withAction = false) {
  if (!employees.length) return "<p>No employees yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Department</th><th>Language</th><th>Phone</th><th>Status</th>${withAction ? "<th>Actions</th>" : ""}</tr></thead><tbody>
    ${employees
      .map(
        (e) => `<tr>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.department)}</td>
      <td>${escapeHtml(e.language)}</td>
      <td>${escapeHtml(e.phone)}</td>
      <td>${rowStatus(e.availability)}</td>
      ${
        withAction
          ? `<td class="actions">
        <button class="secondary" data-free="${e.id}">Mark Free</button>
        ${isAdmin() ? `<button class="secondary" data-edit-employee="${e.id}">Edit</button>` : ""}
        ${isAdmin() ? `<button class="danger" data-delete-employee="${e.id}">Delete</button>` : ""}
      </td>`
          : ""
      }
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function campaignsTable(campaigns) {
  if (!campaigns.length) return "<p>No campaigns yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Department</th><th>Status</th><th>Customers</th><th>Message</th><th>Actions</th></tr></thead><tbody>
    ${campaigns
      .map(
        (c) => `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.department)}</td>
      <td>${rowStatus(c.status)}</td>
      <td>${(c.customerIds || []).length}</td>
      <td>${escapeHtml(c.messageTemplate)}</td>
      <td class="actions">
        <button class="secondary" data-edit-campaign="${c.id}">Edit</button>
        ${isAdmin() ? `<button class="danger" data-delete-campaign="${c.id}">Delete</button>` : ""}
      </td>
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function callsTable(calls, withDelete = false) {
  if (!calls.length) return "<p>No calls yet.</p>";
  return html`<table><thead><tr><th>Type</th><th>Customer</th><th>Status</th><th>Disposition</th><th>Recording</th><th>Outcome / Note</th><th>Time</th><th>Actions</th></tr></thead><tbody>
    ${calls
      .map(
        (c) => `<tr>
      <td>${escapeHtml(c.type)}</td>
      <td>${escapeHtml(c.customerName)}<br>${escapeHtml(c.phone)}</td>
      <td>${rowStatus(c.status)}</td>
      <td>
        <select data-disposition-call="${c.id}">
          <option value="">Set disposition</option>
          ${DISPOSITIONS.map((d) => `<option value="${d}" ${c.disposition === d ? "selected" : ""}>${d}</option>`).join("")}
        </select>
      </td>
      <td>${c.recordingUrl ? `<a href="${escapeHtml(c.recordingUrl)}" target="_blank" rel="noreferrer">Play</a>` : "-"}</td>
      <td>${escapeHtml(c.providerNote || c.outcome || "-")}</td>
      <td>${new Date(c.createdAt).toLocaleString()}</td>
      <td class="actions">
        ${withDelete && isAdmin() ? `<button class="danger" data-delete-call="${c.id}">Delete</button>` : ""}
      </td>
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function dncTable(rows) {
  if (!rows.length) return "<p>No DND numbers yet.</p>";
  return html`<table><thead><tr><th>Phone</th><th>Reason</th><th>Added</th><th>Actions</th></tr></thead><tbody>
    ${rows
      .map(
        (row) => `<tr>
      <td>${escapeHtml(row.phone)}</td>
      <td>${escapeHtml(row.reason || "-")}</td>
      <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
      <td>${isAdmin() ? `<button class="danger" data-delete-dnc="${row.id}">Delete</button>` : ""}</td>
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function callbacksTable(callbacks) {
  if (!callbacks.length) return "<p>No callbacks pending.</p>";
  return html`<table><thead><tr><th>Customer</th><th>Reason</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
    ${callbacks
      .map(
        (c) => `<tr>
      <td>${escapeHtml(c.customerName)}</td>
      <td>${escapeHtml(c.reason)}</td>
      <td>${rowStatus(c.status)}</td>
      <td>${new Date(c.createdAt).toLocaleString()}</td>
      <td class="actions">
        <button class="secondary" data-done-callback="${c.id}">Mark Done</button>
        ${isAdmin() ? `<button class="danger" data-delete-callback="${c.id}">Delete</button>` : ""}
      </td>
    </tr>`
      )
      .join("")}
  </tbody></table>`;
}

function bindPageEvents() {
  const customerForm = document.querySelector("#customerForm");
  if (customerForm) {
    customerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(customerForm);
      if (body.id) {
        const existing = state.data.customers.find((c) => c.id === body.id);
        if (existing) Object.assign(existing, { name: body.name, phone: body.phone, city: body.city || "", language: body.language || "Hindi", product: body.product || "", notes: body.notes || "" });
        state.editing.customerId = "";
      } else {
        state.data.customers.unshift({
          id: makeLocalId("cus"),
          name: body.name,
          phone: body.phone,
          city: body.city || "",
          language: body.language || "Hindi",
          product: body.product || "",
          status: "new",
          notes: body.notes || "",
          optOut: false
        });
      }
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  }
  document.querySelector("#cancelCustomerEdit")?.addEventListener("click", () => {
    state.editing.customerId = "";
    renderApp();
  });

  const employeeForm = document.querySelector("#employeeForm");
  if (employeeForm) {
    employeeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(employeeForm);
      if (body.id) {
        const existing = state.data.employees.find((e) => e.id === body.id);
        if (existing) {
          Object.assign(existing, {
            name: body.name,
            phone: body.phone,
            email: body.email || "",
            department: body.department || "Sales",
            language: body.language || "Hindi",
            availability: body.availability || "free",
            online: true
          });
        }
        state.editing.employeeId = "";
      } else {
        state.data.employees.unshift({
          id: makeLocalId("emp"),
          name: body.name,
          phone: body.phone,
          email: body.email || "",
          department: body.department || "Sales",
          language: body.language || "Hindi",
          availability: body.availability || "free",
          online: true
        });
      }
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  }
  document.querySelector("#cancelEmployeeEdit")?.addEventListener("click", () => {
    state.editing.employeeId = "";
    renderApp();
  });

  const campaignForm = document.querySelector("#campaignForm");
  if (campaignForm) {
    campaignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(campaignForm);
      if (body.id) {
        const existing = state.data.campaigns.find((c) => c.id === body.id);
        if (existing) {
          Object.assign(existing, {
            name: body.name,
            department: body.department || "Sales",
            status: body.status || "draft",
            messageTemplate: body.messageTemplate,
            customerIds: body.customerIds || [],
            retryLimit: Number(body.retryLimit || 2)
          });
        }
        state.editing.campaignId = "";
      } else {
        state.data.campaigns.unshift({
          id: makeLocalId("cmp"),
          name: body.name,
          status: body.status || "draft",
          department: body.department || "Sales",
          messageTemplate: body.messageTemplate,
          customerIds: body.customerIds || [],
          retryLimit: Number(body.retryLimit || 2)
        });
      }
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  }
  document.querySelector("#cancelCampaignEdit")?.addEventListener("click", () => {
    state.editing.campaignId = "";
    renderApp();
  });

  const outboundForm = document.querySelector("#outboundForm");
  if (outboundForm) {
    outboundForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(outboundForm);
      const customer = state.data.customers.find((item) => item.id === body.customerId);
      const campaign = state.data.campaigns.find((item) => item.id === body.campaignId);
      if (!customer || !campaign) return alert("Select a valid campaign and customer first.");
      if (customer.optOut) return alert("This customer opted out and cannot be called.");
      await syncToServer();
      try {
        const call = await api("/api/simulate/outbound", {
          method: "POST",
          body: JSON.stringify({ campaignId: campaign.id, customerId: customer.id, ivrChoice: body.ivrChoice, customer, campaign })
        });
        state.data.calls.unshift(call);
        if (call.outcome === "opt_out") {
          customer.optOut = true;
          customer.status = "opt_out";
        }
        saveLocalData();
        await syncToServer();
        renderApp();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const incomingForm = document.querySelector("#incomingForm");
  if (incomingForm) {
    incomingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(incomingForm);
      await syncToServer();
      const call = await api("/api/simulate/incoming", { method: "POST", body: JSON.stringify(body) });
      state.data.calls.unshift(call);
      saveLocalData();
      renderApp();
    });
  }

  const settingsForm = document.querySelector("#settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(settingsForm);
      body.enforceCallingHours = String(body.enforceCallingHours) !== "false";
      state.settings = { ...state.settings, ...body };
      saveSettings();
      try {
        await api("/api/settings", { method: "PUT", body: JSON.stringify(state.settings) });
      } catch {
        // local settings still saved
      }
      await syncToServer();
      alert("Settings saved.");
      renderApp();
    });
  }

  const passwordForm = document.querySelector("#passwordForm");
  if (passwordForm) {
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(passwordForm);
      try {
        await api("/api/password/change", { method: "POST", body: JSON.stringify(body) });
        alert("Password updated.");
        passwordForm.reset();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const dncForm = document.querySelector("#dncForm");
  if (dncForm) {
    dncForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formValues(dncForm);
      state.data.dnc = state.data.dnc || [];
      if (!state.data.dnc.some((item) => item.phone === body.phone)) {
        state.data.dnc.unshift({
          id: makeLocalId("dnc"),
          phone: body.phone,
          reason: body.reason || "manual",
          createdAt: new Date().toISOString()
        });
      }
      const customer = state.data.customers.find((c) => c.phone === body.phone);
      if (customer) {
        customer.optOut = true;
        customer.status = "opt_out";
      }
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  }

  document.querySelector("#dialNextBtn")?.addEventListener("click", async () => {
    const outboundForm = document.querySelector("#outboundForm");
    if (!outboundForm) return;
    const body = formValues(outboundForm);
    const campaign = state.data.campaigns.find((item) => item.id === body.campaignId);
    if (!campaign) return alert("Select a campaign first.");
    await syncToServer();
    try {
      const result = await api("/api/campaigns/dial-next", {
        method: "POST",
        body: JSON.stringify({ campaignId: campaign.id, campaign, ivrChoice: body.ivrChoice })
      });
      state.data.calls.unshift(result.call);
      saveLocalData();
      await syncToServer();
      alert(`Queued/started call. Remaining in queue estimate: ${result.remaining}`);
      renderApp();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelector("#csvImportInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await api("/api/customers/import", {
        method: "POST",
        body: JSON.stringify({ csv: text })
      });
      for (const customer of result.customers || []) {
        if (!state.data.customers.some((c) => c.id === customer.id || c.phone === customer.phone)) {
          state.data.customers.unshift(customer);
        }
      }
      saveLocalData();
      await syncToServer();
      alert(`Imported ${result.imported} customers.`);
      renderApp();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelectorAll("[data-disposition-call]").forEach((select) => {
    select.addEventListener("change", async () => {
      const callId = select.dataset.dispositionCall;
      const disposition = select.value;
      if (!disposition) return;
      const call = state.data.calls.find((c) => c.id === callId);
      if (call) call.disposition = disposition;
      if (disposition === "opt_out" && call) {
        const customer = state.data.customers.find((c) => c.id === call.customerId);
        if (customer) {
          customer.optOut = true;
          customer.status = "opt_out";
        }
      }
      saveLocalData();
      try {
        await api(`/api/calls/${callId}/disposition`, {
          method: "POST",
          body: JSON.stringify({ disposition })
        });
      } catch {
        // keep local
      }
      await syncToServer();
      renderApp();
    });
  });

  document.querySelectorAll("[data-delete-dnc]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("DND number")) return;
      state.data.dnc = (state.data.dnc || []).filter((item) => item.id !== button.dataset.deleteDnc);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });

  document.querySelector("#clearCallsBtn")?.addEventListener("click", async () => {
    if (!confirmDelete("all call history")) return;
    state.data.calls = [];
    saveLocalData();
    await syncToServer();
    renderApp();
  });
  document.querySelector("#clearCallbacksBtn")?.addEventListener("click", async () => {
    if (!confirmDelete("all callbacks")) return;
    state.data.callbacks = [];
    saveLocalData();
    await syncToServer();
    renderApp();
  });
  document.querySelector("#resetAllBtn")?.addEventListener("click", async () => {
    if (!window.confirm("Reset ALL CRM data (customers, employees, campaigns, calls, callbacks)?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("auto_calling_crm_data_v1");
    state.data.customers = [];
    state.data.employees = [];
    state.data.campaigns = [];
    state.data.calls = [];
    state.data.callbacks = [];
    saveLocalData();
    await syncToServer();
    alert("CRM data cleared. Click Refresh to reload starter sample data from server if needed.");
    renderApp();
  });

  document.querySelectorAll("[data-edit-customer]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editing.customerId = button.dataset.editCustomer;
      state.page = "customers";
      renderApp();
    });
  });
  document.querySelectorAll("[data-delete-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("customer")) return;
      state.data.customers = state.data.customers.filter((c) => c.id !== button.dataset.deleteCustomer);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });
  document.querySelectorAll("[data-optout-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const customer = state.data.customers.find((c) => c.id === button.dataset.optoutCustomer);
      if (!customer) return;
      customer.optOut = !customer.optOut;
      customer.status = customer.optOut ? "opt_out" : "new";
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });

  document.querySelectorAll("[data-edit-employee]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editing.employeeId = button.dataset.editEmployee;
      state.page = "employees";
      renderApp();
    });
  });
  document.querySelectorAll("[data-delete-employee]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("employee")) return;
      state.data.employees = state.data.employees.filter((e) => e.id !== button.dataset.deleteEmployee);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });
  document.querySelectorAll("[data-free]").forEach((button) => {
    button.addEventListener("click", async () => {
      const employee = state.data.employees.find((item) => item.id === button.dataset.free);
      if (!employee) return;
      employee.availability = "free";
      employee.online = true;
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });

  document.querySelectorAll("[data-edit-campaign]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editing.campaignId = button.dataset.editCampaign;
      state.page = "campaigns";
      renderApp();
    });
  });
  document.querySelectorAll("[data-delete-campaign]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("campaign")) return;
      state.data.campaigns = state.data.campaigns.filter((c) => c.id !== button.dataset.deleteCampaign);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });

  document.querySelectorAll("[data-delete-call]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("call record")) return;
      state.data.calls = state.data.calls.filter((c) => c.id !== button.dataset.deleteCall);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });
  document.querySelectorAll("[data-delete-callback]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDelete("callback")) return;
      state.data.callbacks = state.data.callbacks.filter((c) => c.id !== button.dataset.deleteCallback);
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });
  document.querySelectorAll("[data-done-callback]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = state.data.callbacks.find((c) => c.id === button.dataset.doneCallback);
      if (!item) return;
      item.status = "done";
      saveLocalData();
      await syncToServer();
      renderApp();
    });
  });
}

async function boot() {
  state.settings = loadSettings();
  if (!state.token) return renderLogin();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await refresh();
    renderApp();
  } catch {
    localStorage.removeItem("token");
    state.token = "";
    renderLogin();
  }
}

boot();
