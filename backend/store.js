const fileDb = require("./db");
const { hashPassword } = require("./business");
const {
  isMongoEnabled,
  readMongoStore,
  writeMongoStore,
  ensureCollections: ensureMongoCollections
} = require("./mongo");

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

async function readStore() {
  if (isMongoEnabled()) {
    return ensureMongoCollections(await readMongoStore());
  }
  return ensureCollections(fileDb.readDb());
}

async function writeStore(db) {
  const next = ensureCollections(db);
  if (isMongoEnabled()) {
    await writeMongoStore(next);
    return;
  }
  fileDb.writeDb(next);
}

async function replaceStore(db) {
  const seed = fileDb.loadSeed();
  const merged = {
    users: db.users?.length ? db.users : seed.users,
    employees: db.employees || [],
    customers: db.customers || [],
    campaigns: db.campaigns || [],
    calls: db.calls || [],
    callbacks: db.callbacks || [],
    recordings: db.recordings || [],
    dnc: db.dnc || [],
    settings: db.settings || {}
  };
  const next = ensureCollections(merged);
  if (db.settings) next.settings = { ...next.settings, ...db.settings };
  if (Array.isArray(db.dnc)) next.dnc = db.dnc;
  await writeStore(next);
  return readStore();
}

function storageMode() {
  if (isMongoEnabled()) return "mongodb";
  if (process.env.VERCEL) return "serverless-memory+browser";
  return "local-file+browser";
}

module.exports = {
  readStore,
  writeStore,
  replaceStore,
  ensureCollections,
  storageMode
};
