const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!String(stored).includes(":")) return String(password) === String(stored);
  const [salt, hash] = String(stored).split(":");
  const next = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(next, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s\-()]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^0\d{10}$/.test(phone)) phone = `+91${phone.slice(1)}`;
  if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  if (!phone.startsWith("+")) phone = `+${phone}`;
  return phone;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const split = (line) => {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return row;
  });
}

function isWithinCallingHours(settings, now = new Date()) {
  const start = settings?.callingHoursStart || "09:00";
  const end = settings?.callingHoursEnd || "19:00";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  if (startMin <= endMin) return minutes >= startMin && minutes <= endMin;
  return minutes >= startMin || minutes <= endMin;
}

function isDncBlocked(db, phone) {
  const normalized = normalizePhone(phone);
  return (db.dnc || []).some((item) => normalizePhone(item.phone) === normalized);
}

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

module.exports = {
  hashPassword,
  verifyPassword,
  normalizePhone,
  parseCsv,
  isWithinCallingHours,
  isDncBlocked,
  DISPOSITIONS
};
