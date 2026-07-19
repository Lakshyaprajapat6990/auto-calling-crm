const app = document.querySelector("#app");

const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  page: "dashboard",
  data: {
    analytics: {},
    employees: [],
    customers: [],
    campaigns: [],
    calls: [],
    callbacks: [],
    telephony: {}
  }
};

const pages = [
  ["dashboard", "Dashboard"],
  ["customers", "Customers"],
  ["employees", "Employees"],
  ["campaigns", "Campaigns"],
  ["outbound", "Outbound Demo"],
  ["incoming", "Incoming Demo"],
  ["telephony", "Telephony"],
  ["callbacks", "Callbacks"],
  ["reports", "Reports"]
];

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
  const [analytics, employees, customers, campaigns, calls, callbacks, telephony] = await Promise.all([
    api("/api/analytics"),
    api("/api/employees"),
    api("/api/customers"),
    api("/api/campaigns"),
    api("/api/calls"),
    api("/api/callbacks"),
    api("/api/telephony/config")
  ]);
  state.data = { analytics, employees, customers, campaigns, calls, callbacks, telephony };
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

function renderLogin(message = "") {
  app.innerHTML = html`
    <section class="login">
      <form class="login-card" id="loginForm">
        <h1>Auto Calling CRM</h1>
        <p>Login to manage campaigns, customers, executives, and simulated call flows.</p>
        <label>Email <input name="email" value="admin@autocalling.local" required></label>
        <label>Password <input name="password" type="password" value="admin123" required></label>
        <button type="submit">Login</button>
        <div class="message">${escapeHtml(message)}</div>
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
  app.innerHTML = html`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">Auto Calling<br>CRM</div>
        <div class="nav">
          ${pages.map(([id, label]) => `<button class="${state.page === id ? "active" : ""}" data-page="${id}">${label}</button>`).join("")}
        </div>
      </aside>
      <section class="content">
        <div class="topbar">
          <div>
            <h1>${pages.find(([id]) => id === state.page)?.[1] || "Dashboard"}</h1>
            <p>Logged in as ${escapeHtml(state.user?.name || "Admin")}</p>
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
    reports: renderReports
  }[state.page]();
}

function renderDashboard() {
  const a = state.data.analytics;
  return html`
    <div class="grid">
      <div class="card">Customers<strong>${a.totalCustomers || 0}</strong></div>
      <div class="card">Employees<strong>${a.totalEmployees || 0}</strong></div>
      <div class="card">Campaigns<strong>${a.totalCampaigns || 0}</strong></div>
      <div class="card">Pending callbacks<strong>${a.callbacks || 0}</strong></div>
    </div>
    <div class="split">
      <div class="panel"><h2>Recent Calls</h2><div class="panel-body">${callsTable(state.data.calls.slice(0, 5))}</div></div>
      <div class="panel"><h2>Employee Availability</h2><div class="panel-body">${employeesTable(state.data.employees)}</div></div>
    </div>
  `;
}

function renderCustomers() {
  return html`
    <div class="panel">
      <h2>Add Customer</h2>
      <div class="panel-body">
        <form id="customerForm" class="form-grid">
          <label>Name <input name="name" required></label>
          <label>Phone <input name="phone" type="tel" inputmode="tel" placeholder="+918602842351" required></label>
          <label>City <input name="city"></label>
          <label>Language <select name="language"><option>Hindi</option><option>English</option></select></label>
          <label>Product <input name="product"></label>
          <label>Notes <input name="notes"></label>
          <button type="submit">Add Customer</button>
        </form>
        <p class="message">Tip: save phone as +91XXXXXXXXXX (example +918602842351). If you type 0860..., it will auto-convert to +91860...</p>
      </div>
    </div>
    <div class="panel"><h2>Customers</h2><div class="panel-body">${customersTable(state.data.customers)}</div></div>
  `;
}

function renderEmployees() {
  return html`
    <div class="panel">
      <h2>Add Employee</h2>
      <div class="panel-body">
        <form id="employeeForm" class="form-grid">
          <label>Name <input name="name" required></label>
          <label>Phone <input name="phone" type="tel" inputmode="tel" placeholder="+919800000001" required></label>
          <label>Email <input name="email" type="email"></label>
          <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
          <label>Language <select name="language"><option>Hindi</option><option>English</option></select></label>
          <label>Status <select name="availability"><option>free</option><option>busy</option></select></label>
          <button type="submit">Add Employee</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Employees</h2><div class="panel-body">${employeesTable(state.data.employees, true)}</div></div>
  `;
}

function renderCampaigns() {
  const customerOptions = state.data.customers.map((customer) => `<option value="${customer.id}" selected>${escapeHtml(customer.name)}</option>`).join("");
  return html`
    <div class="panel">
      <h2>Create Campaign</h2>
      <div class="panel-body">
        <form id="campaignForm">
          <div class="form-grid">
            <label>Name <input name="name" required></label>
            <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
            <label>Retry Limit <input name="retryLimit" type="number" value="2"></label>
          </div>
          <label>Message Template
            <textarea name="messageTemplate">Hello {{name}}, this is Auto Calling CRM calling about your {{product}}. Press 1 to talk to our executive, press 2 for callback, or press 9 to opt out.</textarea>
          </label>
          <label>Customers <select name="customerIds" multiple size="4">${customerOptions}</select></label>
          <button type="submit">Create Campaign</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Campaigns</h2><div class="panel-body">${campaignsTable(state.data.campaigns)}</div></div>
  `;
}

function renderOutbound() {
  const campaignOptions = state.data.campaigns.map((campaign) => `<option value="${campaign.id}">${escapeHtml(campaign.name)}</option>`).join("");
  const customerOptions = state.data.customers.map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)} - ${escapeHtml(customer.phone)}</option>`).join("");
  const latest = state.data.calls[0];
  const latestNote = latest?.providerNote ? `<p class="message"><strong>Last call:</strong> ${escapeHtml(latest.status)} — ${escapeHtml(latest.providerNote)}</p>` : "";
  return html`
    <div class="panel">
      <h2>Outbound Auto Call</h2>
      <div class="panel-body">
        <p class="message">Twilio trial can call only verified numbers. Verify the phone in Twilio → Phone Numbers → Verified Caller IDs.</p>
        ${latestNote}
        <form id="outboundForm" class="form-grid">
          <label>Campaign <select name="campaignId">${campaignOptions}</select></label>
          <label>Customer <select name="customerId">${customerOptions}</select></label>
          <label>Customer Choice
            <select name="ivrChoice">
              <option value="1">Press 1 - Talk to executive</option>
              <option value="2">Press 2 - Callback</option>
              <option value="9">Press 9 - Opt out</option>
              <option value="0">No key - Message only</option>
            </select>
          </label>
          <button type="submit">Start Live Call</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Latest Calls</h2><div class="panel-body">${callsTable(state.data.calls)}</div></div>
  `;
}

function renderIncoming() {
  return html`
    <div class="panel">
      <h2>Simulate Incoming Call</h2>
      <div class="panel-body">
        <form id="incomingForm" class="form-grid">
          <label>Name <input name="name" value="New Incoming Customer"></label>
          <label>Phone <input name="phone" value="+919700009999"></label>
          <label>Department <select name="department"><option>Sales</option><option>Support</option><option>Payment</option></select></label>
          <label>Language <select name="language"><option>Hindi</option><option>English</option></select></label>
          <label>Choice <select name="ivrChoice"><option value="1">Talk to executive</option><option value="3">Callback</option></select></label>
          <button type="submit">Run Incoming Simulation</button>
        </form>
      </div>
    </div>
    <div class="panel"><h2>Incoming and Outbound Calls</h2><div class="panel-body">${callsTable(state.data.calls)}</div></div>
  `;
}

function renderCallbacks() {
  return `<div class="panel"><h2>Callback Queue</h2><div class="panel-body">${callbacksTable(state.data.callbacks)}</div></div>`;
}

function renderTelephony() {
  const config = state.data.telephony;
  const base = config.publicBaseUrl || "http://localhost:3000";
  return html`
    <div class="grid">
      <div class="card">Mode<strong>${escapeHtml(config.mode || "simulation")}</strong></div>
      <div class="card">Provider<strong>${escapeHtml(config.provider || "simulation")}</strong></div>
      <div class="card">Caller ID<strong>${escapeHtml(config.companyCallerId || "Not set")}</strong></div>
      <div class="card">Base URL<strong>${escapeHtml(base)}</strong></div>
    </div>
    <div class="panel">
      <h2>Go Live Webhook URLs</h2>
      <div class="panel-body">
        <p>Set these URLs inside your telephony provider dashboard after deployment or tunnel setup.</p>
        <table>
          <thead><tr><th>Purpose</th><th>URL</th></tr></thead>
          <tbody>
            <tr><td>Incoming Call</td><td>${escapeHtml(base)}/api/telephony/incoming</td></tr>
            <tr><td>IVR Keypress</td><td>${escapeHtml(base)}/api/telephony/ivr</td></tr>
            <tr><td>Call Status</td><td>${escapeHtml(base)}/api/telephony/status</td></tr>
            <tr><td>Recording</td><td>${escapeHtml(base)}/api/telephony/recording</td></tr>
          </tbody>
        </table>
        <p class="message">Current app is safe in simulation mode. To place real calls, copy .env.example to .env, set CALL_MODE=live, add provider credentials, and deploy with HTTPS.</p>
      </div>
    </div>
  `;
}

function renderReports() {
  const a = state.data.analytics;
  return html`
    <div class="grid">
      <div class="card">Total calls<strong>${a.totalCalls || 0}</strong></div>
      <div class="card">Transferred<strong>${a.transferred || 0}</strong></div>
      <div class="card">Free employees<strong>${a.freeEmployees || 0}</strong></div>
      <div class="card">Callbacks<strong>${a.callbacks || 0}</strong></div>
    </div>
    <div class="panel"><h2>Call Report</h2><div class="panel-body">${callsTable(state.data.calls)}</div></div>
  `;
}

function customersTable(customers) {
  if (!customers.length) return "<p>No customers yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Product</th><th>Status</th></tr></thead><tbody>
    ${customers.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.city)}</td><td>${escapeHtml(c.product)}</td><td>${rowStatus(c.optOut ? "opt_out" : c.status)}</td></tr>`).join("")}
  </tbody></table>`;
}

function employeesTable(employees, withAction = false) {
  if (!employees.length) return "<p>No employees yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Department</th><th>Language</th><th>Status</th>${withAction ? "<th>Action</th>" : ""}</tr></thead><tbody>
    ${employees.map((e) => `<tr><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.department)}</td><td>${escapeHtml(e.language)}</td><td>${rowStatus(e.availability)}</td>${withAction ? `<td><button class="secondary" data-free="${e.id}">Mark Free</button></td>` : ""}</tr>`).join("")}
  </tbody></table>`;
}

function campaignsTable(campaigns) {
  if (!campaigns.length) return "<p>No campaigns yet.</p>";
  return html`<table><thead><tr><th>Name</th><th>Department</th><th>Status</th><th>Customers</th><th>Message</th></tr></thead><tbody>
    ${campaigns.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.department)}</td><td>${rowStatus(c.status)}</td><td>${c.customerIds.length}</td><td>${escapeHtml(c.messageTemplate)}</td></tr>`).join("")}
  </tbody></table>`;
}

function callsTable(calls) {
  if (!calls.length) return "<p>No calls yet. Start an outbound call to create history.</p>";
  return html`<table><thead><tr><th>Type</th><th>Customer</th><th>Status</th><th>Executive</th><th>Provider</th><th>Outcome / Note</th><th>Time</th></tr></thead><tbody>
    ${calls.map((c) => `<tr><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.customerName)}<br>${escapeHtml(c.phone)}</td><td>${rowStatus(c.status)}</td><td>${escapeHtml(c.assignedEmployeeName || "-")}</td><td>${escapeHtml(c.provider || "simulation")}<br>${escapeHtml(c.providerStatus || "-")}</td><td>${escapeHtml(c.providerNote || c.outcome || "-")}</td><td>${new Date(c.createdAt).toLocaleString()}</td></tr>`).join("")}
  </tbody></table>`;
}

function callbacksTable(callbacks) {
  if (!callbacks.length) return "<p>No callbacks pending.</p>";
  return html`<table><thead><tr><th>Customer</th><th>Reason</th><th>Status</th><th>Created</th></tr></thead><tbody>
    ${callbacks.map((c) => `<tr><td>${escapeHtml(c.customerName)}</td><td>${escapeHtml(c.reason)}</td><td>${rowStatus(c.status)}</td><td>${new Date(c.createdAt).toLocaleString()}</td></tr>`).join("")}
  </tbody></table>`;
}

function formValues(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const multi = form.querySelector("select[multiple]");
  if (multi) {
    data[multi.name] = [...multi.selectedOptions].map((option) => option.value);
  }
  if (data.phone) {
    let phone = String(data.phone).trim().replace(/[\s\-()]/g, "");
    if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
    if (/^0\d{10}$/.test(phone)) phone = `+91${phone.slice(1)}`;
    if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
    if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
    if (!phone.startsWith("+")) phone = `+${phone}`;
    data.phone = phone;
  }
  return data;
}

function bindPageEvents() {
  const bindForm = (id, path) => {
    const form = document.querySelector(id);
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await api(path, { method: "POST", body: JSON.stringify(formValues(form)) });
      await refresh();
      renderApp();
    });
  };
  bindForm("#customerForm", "/api/customers");
  bindForm("#employeeForm", "/api/employees");
  bindForm("#campaignForm", "/api/campaigns");
  bindForm("#outboundForm", "/api/simulate/outbound");
  bindForm("#incomingForm", "/api/simulate/incoming");
  document.querySelectorAll("[data-free]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/employees/${button.dataset.free}/free`, { method: "POST" });
      await refresh();
      renderApp();
    });
  });
}

async function boot() {
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
