const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SEED_PATH = path.join(ROOT, "data", "seed.json");
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "auto-calling-data")
  : path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const GLOBAL_KEY = "__AUTO_CALLING_DB__";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
}

function readFileDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const seed = loadSeed();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  const current = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const hasData = Object.values(current).some((value) => Array.isArray(value) && value.length > 0);
  if (!hasData) {
    const seed = loadSeed();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  return current;
}

function getMemoryDb() {
  if (!globalThis[GLOBAL_KEY]) {
    try {
      globalThis[GLOBAL_KEY] = readFileDb();
    } catch {
      globalThis[GLOBAL_KEY] = loadSeed();
    }
  }
  return globalThis[GLOBAL_KEY];
}

function readDb() {
  if (process.env.VERCEL) {
    return clone(getMemoryDb());
  }
  return readFileDb();
}

function writeDb(db) {
  const next = clone(db);
  if (process.env.VERCEL) {
    globalThis[GLOBAL_KEY] = next;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(next, null, 2));
  } catch (error) {
    if (!process.env.VERCEL) throw error;
  }
}

function replaceDb(db) {
  const seedUsers = loadSeed().users;
  const next = {
    users: Array.isArray(db.users) && db.users.length ? db.users : seedUsers,
    employees: Array.isArray(db.employees) ? db.employees : [],
    customers: Array.isArray(db.customers) ? db.customers : [],
    campaigns: Array.isArray(db.campaigns) ? db.campaigns : [],
    calls: Array.isArray(db.calls) ? db.calls : [],
    callbacks: Array.isArray(db.callbacks) ? db.callbacks : [],
    recordings: Array.isArray(db.recordings) ? db.recordings : []
  };
  writeDb(next);
  return readDb();
}

module.exports = {
  readDb,
  writeDb,
  replaceDb,
  loadSeed
};
