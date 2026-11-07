const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { randomUUID, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'guest-entry.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','usher')),
    event_id TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    date_time TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    default_country TEXT NOT NULL DEFAULT '',
    original_image TEXT,
    qr_image TEXT,
    qr_x REAL NOT NULL DEFAULT 50,
    qr_y REAL NOT NULL DEFAULT 50,
    qr_size REAL NOT NULL DEFAULT 25,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    serial TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    host TEXT NOT NULL DEFAULT '',
    raw_phone TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Waiting',
    created_at TEXT NOT NULL,
    UNIQUE(event_id, serial)
  );
  CREATE TABLE IF NOT EXISTS scans (
    request_id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    result TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    usher TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS send_jobs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    state TEXT NOT NULL,
    total INTEGER NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS send_groups (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES send_jobs(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    guest_ids TEXT NOT NULL,
    names TEXT NOT NULL,
    invite_token TEXT NOT NULL,
    pdf_url TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'Pending',
    error TEXT NOT NULL DEFAULT '',
    message_id TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
`);

if (!db.prepare('SELECT 1 FROM users WHERE role="admin"').get()) {
  const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO users(id, username, password_hash, role) VALUES(?,?,?,?)')
    .run(randomUUID(), 'admin', bcrypt.hashSync(password, 12), 'admin');
  console.log(`Created admin account: admin / ${password}`);
}

if (!db.prepare('SELECT 1 FROM events').get()) {
  const eventId = randomUUID();
  const at = new Date().toISOString();
  db.prepare(`
    INSERT INTO events(id, name, slug, date_time, place, default_country, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `).run(eventId, 'Demo Evening', 'demo-evening', 'Saturday, 7:00 PM', 'The Garden', 'Egypt', at);

  const addGuest = db.prepare(`
    INSERT INTO guests(id, event_id, serial, name, host, raw_phone, phone, country, token, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const demoGuests = [
    ['001', 'Amira Hassan', 'Bride', '201001234567', '201001234567', 'Egypt'],
    ['002', 'Omar Nabil', 'Groom', '', '', ''],
    ['003', 'Family Guest', 'Bride', '+966501234567', '966501234567', 'Saudi Arabia']
  ];

  demoGuests.forEach(g => {
    addGuest.run(randomUUID(), eventId, ...g, randomBytes(32).toString('base64url'), at);
  });
  console.log('Created the Demo Evening event and three sample guests.');
}

db.close();
