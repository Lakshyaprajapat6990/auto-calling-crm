const { MongoClient } = require("mongodb");
const { loadSeed } = require("./db");
const { hashPassword } = require("./business");

const STATE_ID = "main";
let client;
let collection;
let memoryCache = null;
let connecting = null;

function defaultSettings() {
  return {
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

function emptyState() {
  const seed = loadSeed();
  return {
    users: seed.users || [],
    employees: seed.employees || [],
    customers: seed.customers || [],
    campaigns: seed.campaigns || [],
    calls: seed.calls || [],
    callbacks: seed.callbacks || [],
    recordings: [],
    dnc: [],
    settings: defaultSettings()
  };
}

function ensureCollections(db) {
  const next = {
    users: Array.isArray(db.users) ? db.users : [],
    employees: Array.isArray(db.employees) ? db.employees : [],
    customers: Array.isArray(db.customers) ? db.customers : [],
    campaigns: Array.isArray(db.campaigns) ? db.campaigns : [],
    calls: Array.isArray(db.calls) ? db.calls : [],
    callbacks: Array.isArray(db.callbacks) ? db.callbacks : [],
    recordings: Array.isArray(db.recordings) ? db.recordings : [],
    dnc: Array.isArray(db.dnc) ? db.dnc : [],
    settings: db.settings && typeof db.settings === "object" ? { ...defaultSettings(), ...db.settings } : defaultSettings()
  };
  next.users = next.users.map((user) => {
    if (user.password && !String(user.password).includes(":")) {
      return { ...user, password: hashPassword(user.password) };
    }
    return user;
  });
  return next;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function getCollection() {
  if (collection) return collection;
  if (connecting) return connecting;
  connecting = (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    client = new MongoClient(uri, { maxPoolSize: 5 });
    await client.connect();
    const dbName = (() => {
      try {
        const path = new URL(uri).pathname.replace(/^\//, "");
        return path || "Autocall";
      } catch {
        return "Autocall";
      }
    })();
    collection = client.db(dbName).collection("crm_state");
    return collection;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function readMongoStore() {
  const col = await getCollection();
  let doc = await col.findOne({ _id: STATE_ID });
  if (!doc) {
    const seeded = ensureCollections(emptyState());
    await col.updateOne(
      { _id: STATE_ID },
      { $set: { ...seeded, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    memoryCache = seeded;
    return clone(seeded);
  }
  const { _id, updatedAt, ...state } = doc;
  const normalized = ensureCollections(state);
  // Persist hashed passwords if we just upgraded them
  if (JSON.stringify(normalized.users) !== JSON.stringify(state.users || [])) {
    await col.updateOne({ _id: STATE_ID }, { $set: { users: normalized.users, updatedAt: new Date().toISOString() } });
  }
  memoryCache = normalized;
  return clone(normalized);
}

async function writeMongoStore(db) {
  const col = await getCollection();
  const next = ensureCollections(db);
  memoryCache = next;
  await col.updateOne(
    { _id: STATE_ID },
    { $set: { ...next, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

function isMongoEnabled() {
  return Boolean(process.env.MONGODB_URI);
}

module.exports = {
  isMongoEnabled,
  readMongoStore,
  writeMongoStore,
  ensureCollections,
  emptyState,
  getCollection
};
