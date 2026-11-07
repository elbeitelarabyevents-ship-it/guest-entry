const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const { createCanvas } = require('@napi-rs/canvas');
const { randomBytes, randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

function makePwaIcons() {
  for (const size of [192, 512]) {
    const canvas = createCanvas(size, size);
    const c = canvas.getContext('2d');
    c.fillStyle = '#0B1233';
    c.beginPath();
    c.roundRect(0, 0, size, size, size * 0.22);
    c.fill();
    c.strokeStyle = '#e6d7b0';
    c.lineWidth = size * 0.035;
    c.beginPath();
    c.arc(size / 2, size * 0.42, size * 0.2, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(size / 2, size * 0.44, size * 0.09, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(size * 0.25, size * 0.76);
    c.quadraticCurveTo(size * 0.5, size * 0.5, size * 0.75, size * 0.76);
    c.stroke();
    for (const [x, y] of [[0.5, 0.13], [0.27, 0.4], [0.73, 0.4], [0.35, 0.23], [0.65, 0.23]]) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(size * x, size * y, size * 0.009, 0, Math.PI * 2);
      c.fill();
    }
    fs.writeFileSync(path.join(ROOT, 'public', `icon-${size}.png`), canvas.toBuffer('image/png'));
  }
}
makePwaIcons();

const db = new Database(path.join(DATA, 'guest-entry.sqlite'));
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

if (!db.prepare('PRAGMA table_info(events)').all().some(c => c.name === 'slug')) {
  db.exec('ALTER TABLE events ADD COLUMN slug TEXT');
}

function slugBase(name) {
  return String(name || 'event').normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'event';
}

function uniqueSlug(name, excludeId) {
  const base = slugBase(name);
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM events WHERE slug=? AND id<>?').get(slug, excludeId || '')) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

for (const e of db.prepare('SELECT id, name FROM events WHERE slug IS NULL OR slug=""').all()) {
  db.prepare('UPDATE events SET slug=? WHERE id=?').run(uniqueSlug(e.name, e.id), e.id);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:']
    }
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
app.get('/vendor/jsqr.js', (_, res) => res.sendFile(require.resolve('jsqr')));

const upload = multer({
  dest: path.join(DATA, 'uploads'),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^(image\/png|image\/jpeg|text\/csv|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)$/.test(f.mimetype))
});

const sessions = new Map();
const SESS_MAX_AGE = 12 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
const token = (n = 32) => randomBytes(n).toString('base64url');
const err = (res, status, message) => res.status(status).json({ error: message });

// Periodic cleanup of expired sessions
setInterval(() => {
  const cur = Date.now();
  for (const [sid, s] of sessions.entries()) {
    if (s.expiresAt && s.expiresAt < cur) sessions.delete(sid);
  }
}, 60 * 60 * 1000);

function auth(req, res, next) {
  const id = req.cookies.sid;
  const s = id && sessions.get(id);
  if (!s || (s.expiresAt && s.expiresAt < Date.now())) {
    if (id) sessions.delete(id);
    return err(res, 401, 'يرجى تسجيل الدخول');
  }
  req.user = s;
  next();
}

function admin(req, res, next) {
  if (req.user.role !== 'admin') return err(res, 403, 'غير مصرح');
  next();
}

function eventAccess(req, res, next) {
  const id = req.params.eventId || req.body.event_id;
  if (req.user.role === 'admin' || req.user.event_id === id) {
    req.eventId = id;
    return next();
  }
  return err(res, 403, 'لا تملك صلاحية لهذا الحدث');
}

const countryCodes = {
  Egypt: '20', 'مصر': '20', Sudan: '249', 'السودان': '249',
  'Saudi Arabia': '966', 'السعودية': '966', UAE: '971', 'الإمارات': '971',
  Qatar: '974', 'قطر': '974', Kuwait: '965', 'الكويت': '965',
  Oman: '968', 'عمان': '968', Bahrain: '973', 'البحرين': '973',
  Jordan: '962', 'الأردن': '962', Lebanon: '961', 'لبنان': '961',
  Iraq: '964', 'العراق': '964', Libya: '218', 'ليبيا': '218',
  Tunisia: '216', 'تونس': '216', Algeria: '213', 'الجزائر': '213',
  Morocco: '212', 'المغرب': '212', Turkey: '90', 'تركيا': '90',
  UK: '44', USA: '1', Canada: '1'
};

function normalizePhone(raw, country, defaultCountry) {
  if (!raw) return { phone: '', needs: false };
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return { phone: '', needs: false };

  const known = ['249', '966', '971', '974', '965', '968', '973', '962', '961', '964', '218', '216', '213', '212', '90', '44', '20', '1'];

  const stripNationalZero = (num, code) => {
    if (num.startsWith(code)) {
      const rest = num.slice(code.length).replace(/^0+/, '');
      return code + rest;
    }
    return num;
  };

  if (/^\s*(\+|00)/.test(raw)) {
    let clean = /^\s*00/.test(raw) ? digits.slice(2) : digits;
    for (const code of known) {
      if (clean.startsWith(code) && clean.length >= code.length + 7) {
        return { phone: stripNationalZero(clean, code), needs: false };
      }
    }
    return { phone: clean, needs: false };
  }

  const c = countryCodes[country] || String(country || '').replace(/\D/g, '') || countryCodes[defaultCountry] || '';
  if (c) {
    let stripped = digits.replace(/^0+/, '');
    if (stripped.startsWith(c) && stripped.length >= c.length + 7) {
      return { phone: stripNationalZero(stripped, c), needs: false };
    }
    return { phone: c + stripped, needs: false };
  }

  for (const code of known) {
    if (!digits.startsWith('0') && digits.startsWith(code) && digits.length >= code.length + 7) {
      return { phone: stripNationalZero(digits, code), needs: false };
    }
  }

  return { phone: digits, needs: true };
}

function nextSerial(eventId) {
  const row = db.prepare('SELECT MAX(CAST(serial AS INTEGER)) AS max_s FROM guests WHERE event_id=?').get(eventId);
  const nextNum = (row && row.max_s ? Number(row.max_s) : 0) + 1;
  return String(nextNum).padStart(3, '0');
}

function publicGuest(g) {
  return { ...g, token: undefined };
}

// Render crisp Arabic-shaped text to PNG buffer using Skia / @napi-rs/canvas
function renderTextBanner(text, width = 1014, height = 80, fontSize = 36) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111111';
  ctx.font = `600 ${fontSize}px "Cairo", "Segoe UI", "Tahoma", "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || ''), width / 2, height / 2);
  return canvas.toBuffer('image/png');
}

app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), async (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || ''));
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) {
    return err(res, 401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  const sid = token(32);
  sessions.set(sid, {
    id: u.id,
    username: u.username,
    role: u.role,
    event_id: u.event_id,
    expiresAt: Date.now() + SESS_MAX_AGE
  });
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESS_MAX_AGE
  });
  res.json({ user: { username: u.username, role: u.role, event_id: u.event_id } });
});

app.post('/api/logout', (req, res) => {
  if (req.cookies.sid) sessions.delete(req.cookies.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: { username: req.user.username, role: req.user.role, event_id: req.user.event_id } });
});

app.get('/api/config', (_, res) => {
  res.json({
    bulkEnabled: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_TEMPLATE && process.env.WA_LANG)
  });
});

const graphVersion = process.env.WA_GRAPH_VERSION || 'v27.0';
if (!db.prepare('PRAGMA table_info(send_groups)').all().some(c => c.name === 'pdf_url')) {
  db.exec("ALTER TABLE send_groups ADD COLUMN pdf_url TEXT NOT NULL DEFAULT ''");
}

async function processSendJob(jobId) {
  const job = db.prepare('SELECT * FROM send_jobs WHERE id=?').get(jobId);
  if (!job || !process.env.WA_TOKEN || !process.env.WA_PHONE_ID || !process.env.WA_TEMPLATE || !process.env.WA_LANG) return;

  db.prepare("UPDATE send_jobs SET state='Running' WHERE id=?").run(jobId);
  const groups = db.prepare("SELECT * FROM send_groups WHERE job_id=? AND state='Pending' ORDER BY rowid").all(jobId);

  for (const g of groups) {
    db.prepare("UPDATE send_groups SET state='Sending',updated_at=? WHERE id=?").run(now(), g.id);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${process.env.WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: g.phone,
          type: 'template',
          template: {
            name: process.env.WA_TEMPLATE,
            language: { code: process.env.WA_LANG },
            components: [
              {
                type: 'header',
                parameters: [{ type: 'document', document: { link: g.pdf_url, filename: 'Invitation.pdf' } }]
              },
              {
                type: 'body',
                parameters: [{ type: 'text', text: g.names || 'Guest' }]
              }
            ]
          }
        })
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `WhatsApp API returned ${response.status}`);
      db.prepare("UPDATE send_groups SET state='Sent',message_id=?,error='',updated_at=? WHERE id=?")
        .run(data.messages?.[0]?.id || '', now(), g.id);
    } catch (e) {
      db.prepare("UPDATE send_groups SET state='Failed',error=?,updated_at=? WHERE id=?")
        .run(String(e.message || e).slice(0, 500), now(), g.id);
    }

    const counts = db.prepare("SELECT sum(state='Sent') sent, sum(state='Failed') failed FROM send_groups WHERE job_id=?").get(jobId);
    db.prepare('UPDATE send_jobs SET sent=?,failed=? WHERE id=?').run(counts.sent || 0, counts.failed || 0, jobId);
    await new Promise(r => setTimeout(r, 334));
  }

  db.prepare("UPDATE send_jobs SET state=CASE WHEN EXISTS(SELECT 1 FROM send_groups WHERE job_id=? AND state='Pending') THEN 'Queued' ELSE 'Done' END WHERE id=?").run(jobId, jobId);
  if (db.prepare('SELECT state FROM send_jobs WHERE id=?').get(jobId)?.state === 'Queued') {
    setTimeout(() => processSendJob(jobId), 1000);
  }
}

db.prepare("UPDATE send_groups SET state='Pending' WHERE state='Sending'").run();
db.prepare("UPDATE send_jobs SET state='Queued' WHERE state='Running'").run();
for (const j of db.prepare("SELECT id FROM send_jobs WHERE state='Queued'").all()) {
  setTimeout(() => processSendJob(j.id), 1000);
}

app.get('/api/events', auth, admin, (_, res) => {
  res.json(db.prepare(`
    SELECT e.*, count(g.id) total, sum(g.status='Admitted') admitted
    FROM events e
    LEFT JOIN guests g ON g.event_id=e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all());
});

app.post('/api/events', auth, admin, upload.fields([{ name: 'original', maxCount: 1 }, { name: 'qr', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const id = randomUUID();
  const original = req.files?.original?.[0]?.path || null;
  const qr = req.files?.qr?.[0]?.path || null;
  if (!b.name) return err(res, 400, 'اسم المناسبة مطلوب');
  const slug = uniqueSlug(b.name);
  db.prepare(`
    INSERT INTO events(id, name, slug, date_time, place, default_country, original_image, qr_image, qr_x, qr_y, qr_size, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, b.name, slug, b.date_time || '', b.place || '', b.default_country || '',
    original, qr, Number(b.qr_x || 50), Number(b.qr_y || 50), Number(b.qr_size || 25), now()
  );
  res.status(201).json({ id, slug, url: `${req.protocol}://${req.get('host')}/e/${slug}` });
});

app.post('/api/ushers', auth, admin, (req, res) => {
  const { username, password, event_id } = req.body || {};
  if (!username || !password || String(password).length < 8 || !db.prepare('SELECT 1 FROM events WHERE id=?').get(event_id)) {
    return err(res, 400, 'أدخل اسم مستخدم وكلمة مرور من 8 أحرف واختر مناسبة صالحة');
  }
  try {
    const id = randomUUID();
    db.prepare('INSERT INTO users(id, username, password_hash, role, event_id) VALUES(?,?,?,?,?)')
      .run(id, String(username).trim(), bcrypt.hashSync(String(password), 12), 'usher', event_id);
    res.status(201).json({ id });
  } catch (e) {
    err(res, 409, 'اسم المستخدم مستخدم بالفعل');
  }
});

app.get('/api/events/:eventId/send-jobs', auth, admin, eventAccess, (req, res) => {
  const job = db.prepare('SELECT * FROM send_jobs WHERE event_id=? ORDER BY created_at DESC LIMIT 1').get(req.eventId);
  if (!job) return res.json({ job: null });
  const groups = db.prepare('SELECT phone, state, error FROM send_groups WHERE job_id=? ORDER BY rowid').all(job.id);
  res.json({ job, groups });
});

app.post('/api/events/:eventId/send-jobs', auth, admin, eventAccess, (req, res) => {
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_ID || !process.env.WA_TEMPLATE || !process.env.WA_LANG) {
    return err(res, 400, 'اضبط WA_TOKEN وWA_PHONE_ID وWA_TEMPLATE وWA_LANG أولًا');
  }
  const guests = db.prepare('SELECT * FROM guests WHERE event_id=? ORDER BY serial').all(req.eventId);
  const grouped = new Map();
  for (const g of guests) {
    if (!g.phone) continue;
    if (!grouped.has(g.phone)) grouped.set(g.phone, []);
    grouped.get(g.phone).push(g);
  }
  const unsent = [...grouped.entries()].filter(([phone]) =>
    !db.prepare("SELECT 1 FROM send_groups WHERE event_id=? AND phone=? AND state IN ('Sent','Pending','Sending','Failed')").get(req.eventId, phone)
  );
  if (!unsent.length) return res.json({ job: null, skipped: guests.length });

  const id = randomUUID();
  const at = now();
  const origin = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO send_jobs(id, event_id, state, total, created_at) VALUES(?, ?, 'Queued', ?, ?)")
      .run(id, req.eventId, unsent.length, at);
    for (const [phone, gs] of unsent) {
      db.prepare(`
        INSERT INTO send_groups(id, job_id, event_id, phone, guest_ids, names, invite_token, pdf_url, state, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).run(
        randomUUID(), id, req.eventId, phone,
        JSON.stringify(gs.map(g => g.id)),
        gs.map(g => g.name || g.serial).join(' + '),
        gs[0].token,
        `${origin}/invitation/${gs[0].token}`,
        at
      );
    }
  });
  tx();
  setTimeout(() => processSendJob(id), 0);
  res.status(202).json({ id, total: unsent.length, skipped: guests.length - unsent.length });
});

app.post('/api/events/:eventId/send-jobs/:jobId/retry', auth, admin, eventAccess, (req, res) => {
  const old = db.prepare("SELECT * FROM send_groups WHERE job_id=? AND event_id=? AND state='Failed'").all(req.params.jobId, req.eventId);
  if (!old.length) return res.json({ id: null, total: 0 });

  const id = randomUUID();
  const at = now();
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO send_jobs(id, event_id, state, total, created_at) VALUES(?, ?, 'Queued', ?, ?)")
      .run(id, req.eventId, old.length, at);
    for (const g of old) {
      db.prepare(`
        INSERT INTO send_groups(id, job_id, event_id, phone, guest_ids, names, invite_token, pdf_url, state, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).run(randomUUID(), id, g.event_id, g.phone, g.guest_ids, g.names, g.invite_token, g.pdf_url, at);
    }
  });
  tx();
  setTimeout(() => processSendJob(id), 0);
  res.status(202).json({ id, total: old.length });
});

app.delete('/api/events/:eventId', auth, admin, (req, res) => {
  const id = req.params.eventId;
  const e = db.prepare('SELECT original_image, qr_image FROM events WHERE id=?').get(id);
  if (!e) return res.json({ ok: true });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM send_groups WHERE event_id=?').run(id);
    db.prepare('DELETE FROM send_jobs WHERE event_id=?').run(id);
    db.prepare('DELETE FROM users WHERE event_id=?').run(id);
    db.prepare('DELETE FROM events WHERE id=?').run(id);
  });
  tx();

  for (const f of [e.original_image, e.qr_image]) {
    if (f && fs.existsSync(f)) fs.unlink(f, () => {});
  }
  res.json({ ok: true });
});

app.get('/api/events/:eventId', auth, admin, eventAccess, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(req.eventId);
  if (!e) return err(res, 404, 'المناسبة غير موجودة');
  res.json(e);
});

app.get('/api/public/events/:slug', (req, res) => {
  const e = db.prepare('SELECT id, name, slug, date_time, place, (original_image IS NOT NULL) has_art, (qr_image IS NOT NULL) has_qr_art FROM events WHERE slug=?').get(req.params.slug);
  if (!e) return err(res, 404, 'المناسبة غير موجودة');
  res.json(e);
});

app.get('/api/public/events/:slug/art', (req, res) => {
  const e = db.prepare('SELECT original_image FROM events WHERE slug=?').get(req.params.slug);
  if (!e || !e.original_image || !fs.existsSync(e.original_image)) return res.status(404).end();
  res.sendFile(path.resolve(e.original_image));
});

app.get('/api/public/events/:slug/qr-art', (req, res) => {
  const e = db.prepare('SELECT qr_image FROM events WHERE slug=?').get(req.params.slug);
  if (!e || !e.qr_image || !fs.existsSync(e.qr_image)) return res.status(404).end();
  res.sendFile(path.resolve(e.qr_image));
});

app.get('/api/qr-sample', auth, admin, async (_, res) => {
  res.json({ data: await QRCode.toDataURL('GUEST-ENTRY-PREVIEW', { margin: 1, errorCorrectionLevel: 'H' }) });
});

app.put('/api/events/:eventId', auth, admin, upload.fields([{ name: 'original', maxCount: 1 }, { name: 'qr', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const current = db.prepare('SELECT original_image, qr_image FROM events WHERE id=?').get(req.params.eventId);
  const newOriginal = req.files?.original?.[0]?.path || null;
  const newQr = req.files?.qr?.[0]?.path || null;

  if (newOriginal && current?.original_image && fs.existsSync(current.original_image)) {
    fs.unlink(current.original_image, () => {});
  }
  if (newQr && current?.qr_image && fs.existsSync(current.qr_image)) {
    fs.unlink(current.qr_image, () => {});
  }

  db.prepare(`
    UPDATE events
    SET name=?, date_time=?, place=?, default_country=?, qr_x=?, qr_y=?, qr_size=?,
        original_image=coalesce(?, original_image),
        qr_image=coalesce(?, qr_image)
    WHERE id=?
  `).run(
    b.name, b.date_time || '', b.place || '', b.default_country || '',
    Number(b.qr_x || 50), Number(b.qr_y || 50), Number(b.qr_size || 25),
    newOriginal, newQr, req.params.eventId
  );
  res.json({ ok: true });
});

app.get('/api/events/:eventId/guests', auth, eventAccess, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const status = req.query.status;
  if (req.user.role === 'usher' && !q) return err(res, 403, 'استخدم البحث داخل شاشة الاستقبال');

  let rows = db.prepare(`
    SELECT g.*, s.scanned_at, s.usher,
           (SELECT sg.state FROM send_groups sg WHERE sg.event_id=g.event_id AND sg.phone=g.phone ORDER BY sg.rowid DESC LIMIT 1) send_status
    FROM guests g
    LEFT JOIN scans s ON s.guest_id=g.id
    WHERE g.event_id=?
    ORDER BY g.serial
  `).all(req.eventId);

  if (q) {
    rows = rows.filter(g => [g.name, g.serial, g.host, g.phone, g.raw_phone].some(x => String(x || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const ap = [a.name, a.serial, a.host, a.phone, a.raw_phone].some(x => String(x || '').toLowerCase().startsWith(q));
        const bp = [b.name, b.serial, b.host, b.phone, b.raw_phone].some(x => String(x || '').toLowerCase().startsWith(q));
        return Number(bp) - Number(ap);
      });
  }

  if (status === 'needs_country') rows = rows.filter(g => !g.phone && !!g.raw_phone);
  else if (status === 'not_sent') rows = rows.filter(g => !g.send_status);
  else if (status === 'failed') rows = rows.filter(g => g.send_status === 'Failed');
  else if (status === 'waiting') rows = rows.filter(g => g.status === 'Waiting');
  else if (status === 'admitted') rows = rows.filter(g => g.status === 'Admitted');
  else if (status) rows = rows.filter(g => g.status === status);

  res.json(rows.slice(0, 200).map(publicGuest));
});

app.post('/api/events/:eventId/guests', auth, admin, eventAccess, (req, res) => {
  const b = req.body || {};
  const phone = normalizePhone(b.phone, b.country, db.prepare('SELECT default_country FROM events WHERE id=?').get(req.eventId)?.default_country);
  const id = randomUUID();
  db.prepare('INSERT INTO guests(id, event_id, serial, name, host, raw_phone, phone, country, token, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.eventId, String(b.serial || nextSerial(req.eventId)), b.name || '', b.host || '', b.phone || '', phone.needs ? '' : phone.phone, b.country || '', token(), now());
  res.status(201).json({ id, needs_country: phone.needs });
});

app.put('/api/events/:eventId/guests/:guestId', auth, admin, eventAccess, (req, res) => {
  const b = req.body || {};
  const g = db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.eventId);
  if (!g) return err(res, 404, 'الضيف غير موجود');

  const phone = normalizePhone(b.phone ?? g.raw_phone, b.country ?? g.country, db.prepare('SELECT default_country FROM events WHERE id=?').get(req.eventId)?.default_country);
  db.prepare('UPDATE guests SET serial=?, name=?, host=?, raw_phone=?, phone=?, country=? WHERE id=?')
    .run(b.serial || g.serial, b.name ?? g.name, b.host ?? g.host, b.phone ?? g.raw_phone, phone.needs ? '' : phone.phone, b.country ?? g.country, g.id);
  res.json({ ok: true, needs_country: phone.needs });
});

app.delete('/api/events/:eventId/guests/:guestId', auth, admin, eventAccess, (req, res) => {
  db.prepare('DELETE FROM guests WHERE id=? AND event_id=?').run(req.params.guestId, req.eventId);
  res.json({ ok: true });
});

app.post('/api/events/:eventId/guests/batch', auth, admin, eventAccess, (req, res) => {
  const { count, host = '' } = req.body || {};
  const n = Math.max(1, Math.min(1000, Number(count) || 1));
  const maxRow = db.prepare('SELECT MAX(CAST(serial AS INTEGER)) AS max_s FROM guests WHERE event_id=?').get(req.eventId);
  let cur = (maxRow?.max_s ? Number(maxRow.max_s) : 0) + 1;
  const insertStmt = db.prepare('INSERT INTO guests(id, event_id, serial, name, host, token, created_at) VALUES(?,?,?,?,?,?,?)');

  const add = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      insertStmt.run(randomUUID(), req.eventId, String(cur++).padStart(3, '0'), '', host, token(), now());
    }
  });
  add();
  res.json({ added: n });
});

const aliases = {
  serial: ['serial', 'no', '#', 'رقم', 'التسلسل', 'مسلسل'],
  name: ['name', 'guest', 'اسم', 'الضيف', 'الاسم'],
  host: ['host', 'side', 'صاحب', 'الطرف', 'الجهة'],
  phone: ['phone', 'mobile', 'whatsapp', 'هاتف', 'موبايل', 'رقم الهاتف'],
  country: ['country', 'دولة', 'البلد', 'الدولة']
};

app.post('/api/events/:eventId/import', auth, admin, eventAccess, upload.single('file'), (req, res) => {
  if (!req.file) return err(res, 400, 'اختر ملف CSV أو Excel');
  try {
    const wb = req.file.mimetype === 'text/csv' || req.file.originalname.toLowerCase().endsWith('.csv')
      ? { SheetNames: ['data'], Sheets: { data: XLSX.utils.aoa_to_sheet(parse(fs.readFileSync(req.file.path, 'utf8'), { skip_empty_lines: false })) } }
      : XLSX.readFile(req.file.path);

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const norm = x => String(x || '').trim().toLowerCase();
    const header = (rows[0] || []).map(norm);
    const mapped = {};
    for (const [field, names] of Object.entries(aliases)) {
      const idx = header.findIndex(h => names.some(n => h === n.toLowerCase()));
      if (idx >= 0) mapped[field] = idx;
    }
    if (!Object.keys(mapped).length) {
      return err(res, 400, 'لم أجد عناوين معروفة. استخدم: serial, name, host, phone, country (أو عناوينها بالعربية).');
    }

    let added = 0;
    let skipped = 0;
    const defaultCountry = db.prepare('SELECT default_country FROM events WHERE id=?').get(req.eventId)?.default_country;
    const insertStmt = db.prepare('INSERT INTO guests(id, event_id, serial, name, host, raw_phone, phone, country, token, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');

    const tx = db.transaction(() => {
      for (const row of rows.slice(1)) {
        if (!row.some(x => String(x).trim())) {
          skipped++;
          continue;
        }
        let serial = mapped.serial != null ? String(row[mapped.serial] || '').trim() : '';
        if (!serial || db.prepare('SELECT 1 FROM guests WHERE event_id=? AND serial=?').get(req.eventId, serial)) {
          serial = nextSerial(req.eventId);
        }
        const p = String(row[mapped.phone] || '');
        const c = String(row[mapped.country] || '');
        const phone = normalizePhone(p, c, defaultCountry);
        insertStmt.run(randomUUID(), req.eventId, serial, String(row[mapped.name] || ''), String(row[mapped.host] || ''), p, phone.needs ? '' : phone.phone, c, token(), now());
        added++;
      }
    });
    tx();
    res.json({ added, skipped });
  } catch (e) {
    err(res, 400, 'تعذر قراءة الملف: ' + e.message);
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/events/:eventId/apply-country', auth, admin, eventAccess, (req, res) => {
  const c = req.body.country;
  const code = countryCodes[c] || String(c || '').replace(/\D/g, '');
  if (!code) return err(res, 400, 'اختر دولة صالحة');
  const rows = db.prepare("SELECT id, raw_phone FROM guests WHERE event_id=? AND phone='' AND raw_phone<>''").all(req.eventId);
  const tx = db.transaction(() => rows.forEach(g => {
    db.prepare('UPDATE guests SET phone=?, country=? WHERE id=?').run(code + g.raw_phone.replace(/\D/g, '').replace(/^0+/, ''), c, g.id);
  }));
  tx();
  res.json({ fixed: rows.length });
});

async function makePdfForGuest(guest, res) {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(guest.event_id);
  const peers = guest.phone ? db.prepare('SELECT * FROM guests WHERE event_id=? AND phone=? ORDER BY serial').all(guest.event_id, guest.phone) : [guest];

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="invitation.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.pipe(res);

  if (e.original_image && fs.existsSync(e.original_image)) {
    doc.image(e.original_image, 36, 36, { fit: [523, 770], align: 'center', valign: 'center' });
  } else {
    const titleImg = renderTextBanner(e.name, 1046, 100, 46);
    doc.image(titleImg, 36, 110, { width: 523, height: 50 });
    const sub = `${e.date_time || ''}   ${e.place || ''}`.trim();
    if (sub) {
      const subImg = renderTextBanner(sub, 1046, 70, 28);
      doc.image(subImg, 36, 165, { width: 523, height: 35 });
    }
  }

  for (const [, g] of peers.entries()) {
    doc.addPage();
    if (e.qr_image && fs.existsSync(e.qr_image)) {
      doc.image(e.qr_image, 36, 36, { fit: [523, 770], align: 'center', valign: 'center' });
    } else {
      doc.rect(36, 36, 523, 770).fill('#fff');
      doc.rect(36, 36, 523, 770).lineWidth(1).stroke('#ddd');
    }

    const size = Math.max(70, Math.min(360, 523 * e.qr_size / 100));
    const cx = 36 + 523 * e.qr_x / 100;
    const cy = 36 + 770 * e.qr_y / 100;
    const x = Math.max(40, Math.min(559 - size, cx - size / 2));
    const y = Math.max(40, Math.min(806 - size, cy - size / 2));

    doc.rect(x - 9, y - 9, size + 18, size + 18).fill('#fff');
    const image = await QRCode.toDataURL(g.token, { margin: 1, errorCorrectionLevel: 'H' });
    doc.image(image, x, y, { width: size });

    // Render guest name & serial with Arabic shaping
    const labelText = `${g.name || 'Guest'}   ·   ${g.serial}`;
    const labelImg = renderTextBanner(labelText, 1014, 80, 36);
    doc.image(labelImg, 44, Math.min(790, y + size + 10), { width: 507, height: 40 });
  }

  doc.end();
}

const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { error: 'طلبات كثيرة جدًا، يرجى الانتظار قليلاً' }
});

app.get('/api/events/:eventId/guests/:guestId/pdf', auth, admin, eventAccess, pdfLimiter, async (req, res) => {
  const g = db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.eventId);
  if (!g) return err(res, 404, 'الضيف غير موجود');
  try {
    await makePdfForGuest(g, res);
  } catch (e) {
    if (!res.headersSent) err(res, 500, 'تعذر إنشاء ملف الدعوة');
  }
});

app.get('/api/events/:eventId/guests/:guestId/share', auth, admin, eventAccess, (req, res) => {
  const g = db.prepare('SELECT token FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.eventId);
  if (!g) return err(res, 404, 'الضيف غير موجود');
  res.json({ url: `${req.protocol}://${req.get('host')}/invitation/${g.token}` });
});

app.get('/api/events/:eventId/scan/:pass', auth, eventAccess, (req, res) => {
  const g = db.prepare('SELECT * FROM guests WHERE token=? AND event_id=?').get(req.params.pass, req.eventId);
  if (!g) return res.json({ result: 'invalid' });
  res.json({ result: 'ok', guest: publicGuest(g) });
});

app.post('/api/events/:eventId/scan', auth, eventAccess, (req, res) => {
  const { pass, guest_id, request_id } = req.body || {};
  if (!request_id) return err(res, 400, 'request_id مطلوب');

  const old = db.prepare('SELECT * FROM scans WHERE request_id=?').get(request_id);
  if (old) {
    const g = db.prepare('SELECT * FROM guests WHERE id=?').get(old.guest_id);
    return res.json({ result: old.result, guest: publicGuest(g), scanned_at: old.scanned_at, usher: old.usher });
  }

  const g = guest_id
    ? db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(guest_id, req.eventId)
    : db.prepare('SELECT * FROM guests WHERE token=? AND event_id=?').get(pass, req.eventId);

  if (!g) return res.json({ result: 'invalid' });

  const run = db.transaction(() => {
    const current = db.prepare('SELECT status FROM guests WHERE id=?').get(g.id);
    if (current.status === 'Admitted') {
      const first = db.prepare('SELECT scanned_at, usher FROM scans WHERE guest_id=? AND result="admitted" ORDER BY scanned_at LIMIT 1').get(g.id);
      db.prepare('INSERT INTO scans(request_id, guest_id, result, scanned_at, usher) VALUES(?,?,?,?,?)')
        .run(request_id, g.id, 'duplicate', now(), req.user.username);
      return { result: 'duplicate', ...(first || {}) };
    }
    const at = now();
    db.prepare("UPDATE guests SET status='Admitted' WHERE id=?").run(g.id);
    db.prepare('INSERT INTO scans(request_id, guest_id, result, scanned_at, usher) VALUES(?,?,?,?,?)')
      .run(request_id, g.id, 'admitted', at, req.user.username);
    return { result: 'admitted', scanned_at: at, usher: req.user.username };
  });

  const result = run();
  res.json({ ...result, guest: publicGuest(g) });
});

app.get('/api/usher-events', auth, (req, res) => {
  if (req.user.role === 'usher') return res.json(db.prepare('SELECT * FROM events WHERE id=?').all(req.user.event_id));
  res.json(db.prepare('SELECT * FROM events ORDER BY created_at DESC').all());
});

app.get('/api/events/:eventId/stats', auth, eventAccess, (req, res) => {
  const summary = db.prepare(`SELECT count(*) total, sum(status='Admitted') admitted, sum(status='Waiting') waiting FROM guests WHERE event_id=?`).get(req.eventId);
  if (req.user.role === 'usher') return res.json({ summary });
  const last = db.prepare(`SELECT g.name, g.serial, s.scanned_at, s.usher FROM scans s JOIN guests g ON g.id=s.guest_id WHERE g.event_id=? AND s.result="admitted" ORDER BY s.scanned_at DESC LIMIT 10`).all(req.eventId);
  const byUsher = db.prepare(`SELECT usher, count(*) count FROM scans s JOIN guests g ON g.id=s.guest_id WHERE g.event_id=? AND s.result="admitted" GROUP BY usher ORDER BY count DESC`).all(req.eventId);
  res.json({ summary, last, byUsher });
});

app.get('/api/events/:eventId/export.csv', auth, admin, eventAccess, (req, res) => {
  const rows = db.prepare(`
    SELECT g.serial, g.name, g.host, g.raw_phone, g.phone, g.country, g.status,
           coalesce(s.scanned_at, '') AS admitted_at, coalesce(s.usher, '') AS usher
    FROM guests g
    LEFT JOIN scans s ON s.guest_id = g.id AND s.result = 'admitted'
    WHERE g.event_id = ?
    ORDER BY g.serial
  `).all(req.eventId);

  const esc = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
  const header = 'serial,name,host,phone,normalized_phone,country,status,admitted_at,usher';
  const csvContent = '\uFEFF' + [
    header,
    ...rows.map(r => Object.values(r).map(esc).join(','))
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.attachment('guests.csv').send(csvContent);
});

app.get('/api/events/:eventId/export.xlsx', auth, admin, eventAccess, (req, res) => {
  const rows = db.prepare(`
    SELECT g.serial, g.name, g.host, g.raw_phone AS phone, g.phone AS normalized_phone,
           g.country, g.status, coalesce(s.scanned_at, '') AS admitted_at, coalesce(s.usher, '') AS usher
    FROM guests g
    LEFT JOIN scans s ON s.guest_id = g.id AND s.result = 'admitted'
    WHERE g.event_id = ?
    ORDER BY g.serial
  `).all(req.eventId);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Guests');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment('guests.xlsx')
    .send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

app.get('/invitation/:publicToken', pdfLimiter, async (req, res) => {
  const g = db.prepare('SELECT * FROM guests WHERE token=?').get(req.params.publicToken);
  if (!g) return res.status(404).send('Invitation not found');
  try {
    await makePdfForGuest(g, res);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Could not prepare invitation');
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return auth(req, res, next);
  next();
});

app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Guest Entry listening on http://localhost:${PORT}`));
