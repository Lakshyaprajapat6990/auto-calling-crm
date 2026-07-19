const { readDb, writeDb, replaceDb, loadSeed } = require("./db");
const { hashPassword } = require("./business");

function ensureCollections(db) {
  if (!Array.isArray(db.dnc)) db.dnc = [];
  if (!db.settings || typeof db.settings !== "object") {
    db.settings = {
      companyName: "Auto Calling CRM",
      industry: "Business",
      timezone: "Asia/Kolkata",
      callingHoursStart: "09:00",
      callingHoursEnd: "19:00",
      defaultLanguage: "Hindi",
      supportEmail: "support@company.local",
      enforceCallingHours: true
    };
  }
  if (!Array.isArray(db.recordings)) db.recordings = [];
  db.users = (db.users || []).map((user) => {
    if (user.password && !String(user.password).includes(":")) {
      return { ...user, password: hashPassword(user.password) };
    }
    return user;
  });
  return db;
}

function readStore() {
  return ensureCollections(readDb());
}

function writeStore(db) {
  writeDb(ensureCollections(db));
}

function replaceStore(db) {
  const seed = loadSeed();
  const merged = replaceDb({
    users: db.users?.length ? db.users : seed.users,
    employees: db.employees || [],
    customers: db.customers || [],
    campaigns: db.campaigns || [],
    calls: db.calls || [],
    callbacks: db.callbacks || [],
    recordings: db.recordings || [],
    dnc: db.dnc || [],
    settings: db.settings || {}
  });
  const next = ensureCollections(merged);
  if (db.settings) next.settings = { ...next.settings, ...db.settings };
  if (Array.isArray(db.dnc)) next.dnc = db.dnc;
  writeStore(next);
  return readStore();
}

module.exports = {
  readStore,
  writeStore,
  replaceStore,
  ensureCollections
};
