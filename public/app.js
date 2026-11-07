const $ = s => document.querySelector(s), app = $('#app');
let me = null, eventId = null, scanStream = null, scannerTimer = null, toastTimer = null;
let activeFilter = '', cameraFacing = 'environment', landingEvent = null, loginNotice = '';
const requestedSlug = decodeURIComponent(location.pathname.match(/^\/e\/(.+)$/)?.[1] || '');
const pendingScanIds = new Map();

const dictionary = {
  "Welcome back": "مرحبًا بعودتك",
  "Sign in to manage your event or open the door scanner.": "سجّل الدخول لإدارة الحفلة أو فتح ماسح الدخول.",
  "Sign in · دخول": "دخول · Sign in",
  "Reception staff go directly to their event scanner.": "ينتقل موظفو الاستقبال مباشرةً إلى ماسح حفلتهم.",
  "Your events": "حفلاتك",
  "Guest lists, invitations and live entry.": "قوائم الضيوف والدعوات وتسجيل الدخول مباشرةً.",
  "＋ New event": "＋ حفلة جديدة",
  "Manage guests": "إدارة الضيوف",
  "Open scanner": "فتح الماسح",
  "Edit": "تعديل",
  "Delete": "حذف",
  "Sign out": "تسجيل الخروج",
  "Date to be set": "يُحدد التاريخ لاحقًا",
  "Place to be set": "يُحدد المكان لاحقًا",
  "No events yet. Create your first event to get started.": "لا توجد حفلات بعد. أنشئ أول حفلة للبدء.",
  "Reception logins": "حسابات الاستقبال",
  "Create an event": "إنشاء حفلة",
  "Event name · اسم المناسبة": "اسم الحفلة · Event name",
  "Date and time": "التاريخ والوقت",
  "Place": "المكان",
  "Default country for phone numbers (optional)": "الدولة الافتراضية لأرقام الهاتف (اختياري)",
  "Original invitation image · PNG/JPG": "صورة الدعوة الأصلية · PNG/JPG",
  "QR invitation image · PNG/JPG": "صورة دعوة QR · PNG/JPG",
  "Save": "حفظ",
  "Cancel": "إلغاء",
  "Close": "إغلاق",
  "Create login": "إنشاء حساب",
  "Add a reception login": "إضافة حساب استقبال",
  "Username": "اسم المستخدم",
  "Temporary password": "كلمة مرور مؤقتة",
  "Guests": "الضيوف",
  "Add guest": "إضافة ضيف",
  "＋ Add guest": "＋ إضافة ضيف",
  "＋ Numbered passes": "＋ دعوات مرقمة",
  "Import CSV / Excel": "استيراد CSV / Excel",
  "Send to all waiting": "إرسال للمنتظرين",
  "Admitted": "تم الدخول",
  "Not yet": "لم يدخلوا بعد",
  "All": "الكل",
  "Search": "بحث",
  "Search name, serial or number": "ابحث بالاسم أو الرقم التسلسلي أو الهاتف",
  "No guests match this filter.": "لا يوجد ضيوف مطابقون لهذا الاختيار.",
  "Latest entries": "آخر عمليات الدخول",
  "No entries yet.": "لا توجد عمليات دخول بعد.",
  "Serial number": "الرقم التسلسلي",
  "Name · الاسم": "الاسم · Name",
  "Host / side": "صاحب الدعوة / الطرف",
  "Phone / WhatsApp": "الهاتف / واتساب",
  "Country (optional)": "الدولة (اختياري)",
  "Import guests": "استيراد الضيوف",
  "Import file": "استيراد الملف",
  "Create numbered passes": "إنشاء دعوات مرقمة",
  "Number of passes": "عدد الدعوات",
  "Choose country / اختر الدولة": "اختر الدولة / Choose country",
  "Apply to all": "تطبيق على الكل",
  "Door scanner": "ماسح الدخول",
  "Find guest": "البحث عن ضيف",
  "Check in": "تسجيل الدخول",
  "Continue scanning": "متابعة المسح",
  "No connection": "لا يوجد اتصال",
  "Not a valid pass": "دعوة غير صالحة",
  "Already admitted": "تم تسجيل الدخول مسبقًا",
  "Welcome": "أهلًا وسهلًا",
  "Online": "متصل",
  "Weak": "اتصال ضعيف",
  "Manage this event": "إدارة الحفلة",
  "Copy staff link": "نسخ رابط الموظفين",
  "Staff link copied": "تم نسخ رابط الموظفين",
  "Event staff · موظفو الحفلة": "موظفو الحفلة · Event staff",
  "Edit event": "تعديل الحفلة",
  "Add a guest": "إضافة ضيف",
  "Guest": "ضيف",
  "Search by name, serial or phone": "ابحث بالاسم أو الرقم التسلسلي أو الهاتف",
  "Start typing…": "ابدأ الكتابة…",
  "No matches": "لا توجد نتائج",
  "No internet connection — do not admit": "لا يوجد اتصال بالإنترنت — لا تسجل الدخول",
  "Camera unavailable. Allow camera access or use Find guest.": "الكاميرا غير متاحة. اسمح باستخدامها أو ابحث عن الضيف.",
  "Allow camera access, then point the camera at the guest’s QR code": "اسمح باستخدام الكاميرا، ثم وجّهها إلى رمز QR الخاص بالضيف",
  "Not sent": "لم يُرسل",
  "Failed": "فشل الإرسال",
  "Needs country": "تحديد الدولة مطلوب",
  "Waiting": "بانتظار الدخول",
  "Sent": "تم الإرسال",
  "Name": "الاسم",
  "Host": "صاحب الدعوة",
  "Phone": "الهاتف",
  "Country": "الدولة",
  "Apply": "تطبيق",
  "Preview": "معاينة",
  "Loading…": "جارٍ التحميل…",
  "Username · اسم المستخدم": "اسم المستخدم",
  "Password · كلمة المرور": "كلمة المرور",
  "Weak connection": "اتصال ضعيف",
  "Retry failed": "إعادة محاولة الفاشل",
  "Current attendance": "الحضور الحالي",
  "Attendance": "نسبة الحضور",
  "Create passes": "إنشاء الدعوات",
  "Preview QR placement": "معاينة موضع QR",
  "Add the QR invitation image to preview its placement.": "أضف صورة دعوة QR لمعاينة موضع الرمز.",
  "Export Excel": "تصدير Excel",
  "Export CSV": "تصدير CSV",
  "Flip camera": "قلب الكاميرا",
  "Flash": "الفلاش",
  "Retry": "إعادة المحاولة",
  "Could not verify. Scan the same pass again; no green result was shown.": "تعذر التحقق. أعد مسح البطاقة؛ لم تظهر النتيجة الخضراء.",
  "Do not admit anyone. Reconnect and retry.": "لا تسجل دخول أحد. أعد الاتصال بالإنترنت ثم حاول ثانية.",
  "Do not admit anyone. Retry when online.": "لا تسجل دخول أحد. أعد المحاولة عند عودة الاتصال.",
  "Do not admit anyone.": "لا تسجل دخول أحد.",
  "This QR does not belong to this event.": "رمز QR هذا لا ينتمي لهذه المناسبة.",
  "QR centre X %": "موضع QR الأفقي X %",
  "QR centre Y %": "موضع QR الرأسي Y %",
  "QR size %": "حجم QR %"
};

let language = localStorage.getItem('guest-entry-language') || 'ar';
const t = (ar, en) => (language === 'ar' ? ar : en);

function translateDom(root = document.body) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode;
    if (!n.__english) n.__english = n.nodeValue;
    const x = n.__english.trim();
    if (dictionary[x]) n.nodeValue = n.__english.replace(x, language === 'ar' ? dictionary[x] : x);
  }
  root.querySelectorAll?.('[placeholder]').forEach(n => {
    if (!n.dataset.enPlaceholder) n.dataset.enPlaceholder = n.placeholder;
    const v = n.dataset.enPlaceholder.trim();
    if (dictionary[v]) n.placeholder = language === 'ar' ? dictionary[v] : v;
  });
}

function setLanguage(value) {
  language = value;
  localStorage.setItem('guest-entry-language', value);
  translateDom();
  document.querySelectorAll('[data-language]').forEach(b => b.textContent = language === 'ar' ? 'English' : 'العربية');
}

function langButton() {
  return '<button class="secondary small" data-language="1">' + (language === 'ar' ? 'English' : 'العربية') + '</button>';
}

function setEventBrand(e) {
  if (e?.has_art) {
    document.body.style.setProperty('--event-cover', "url('/api/public/events/" + encodeURIComponent(e.slug) + "/art')");
  } else {
    document.body.style.removeProperty('--event-cover');
  }
  document.body.dataset.eventSlug = e?.slug || '';
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {})
    }
  });
  if (r.status === 401) {
    me = null;
    login();
    throw new Error(t('انتهت الجلسة، يرجى تسجيل الدخول', 'Session expired'));
  }
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : r;
  if (!r.ok) throw new Error(data.error || t('حدث خطأ', 'An error occurred'));
  return data;
}

function toast(msg) {
  let n = $('.toast');
  if (!n) {
    n = document.createElement('div');
    n.className = 'toast';
    document.body.append(n);
  }
  n.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.remove(), 2800);
}

async function login() {
  stopCamera();
  landingEvent = null;
  const notice = loginNotice;
  loginNotice = '';
  if (requestedSlug) {
    try {
      const r = await fetch('/api/public/events/' + encodeURIComponent(requestedSlug));
      if (r.ok) landingEvent = await r.json();
    } catch {}
  }
  if (landingEvent) setEventBrand(landingEvent);
  else setEventBrand(null);

  app.innerHTML = `
    <main class="card login">
      <div class="row between">
        <div class="brand">✦ Guest Entry</div>
        ${langButton()}
      </div>
      <div id="eventHeading"></div>
      <h1>Welcome back</h1>
      <p class="muted">Sign in to manage your event or open the door scanner.</p>
      <p class="banner" id="loginNotice" hidden></p>
      <form id="login">
        <div class="field">
          <label>Username · اسم المستخدم</label>
          <input name="username" autocomplete="username" required>
        </div>
        <div class="field">
          <label>Password · كلمة المرور</label>
          <input name="password" type="password" autocomplete="current-password" required>
        </div>
        <button>Sign in · دخول</button>
        <p class="footnote">Reception staff go directly to their event scanner.</p>
      </form>
    </main>
  `;

  if (landingEvent) {
    $('#eventHeading').innerHTML = `
      <h2 class="section-title">${esc(landingEvent.name)}</h2>
      <p class="muted">${esc(landingEvent.date_time)} · ${esc(landingEvent.place)}</p>
      <p class="footnote">Event staff · موظفو الحفلة</p>
    `;
  }
  if (notice) {
    $('#loginNotice').hidden = false;
    $('#loginNotice').textContent = notice;
  }

  $('#login').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(f)) });
      await boot();
    } catch (x) {
      toast(x.message);
    }
  };
  translateDom();
}

function shell(title, actions = '') {
  app.innerHTML = `
    <header class="top">
      <div class="brand">✦ Guest Entry</div>
      <div class="row">
        <span class="muted">${esc(me.username)} · ${me.role === 'admin' ? 'Admin' : 'Usher'}</span>
        ${langButton()}
        ${actions}
      </div>
    </header>
    <main class="wrap">
      <div id="view"><p class="muted">Loading…</p></div>
    </main>
  `;
  translateDom();
}

async function boot() {
  try {
    const d = await api('/api/me');
    me = d.user;
    if (me.role === 'usher') {
      const es = await api('/api/usher-events');
      if (es[0]) {
        if (requestedSlug && es[0].slug !== requestedSlug) {
          loginNotice = t('حساب الموظف مرتبط بحفلة أخرى.', 'This staff account belongs to a different event.');
          await api('/api/logout', { method: 'POST' }).catch(() => {});
          me = null;
          await login();
          return;
        }
        eventId = es[0].id;
        scanner();
      } else {
        login();
      }
    } else if (requestedSlug) {
      try {
        const e = await api('/api/public/events/' + encodeURIComponent(requestedSlug));
        eventId = e.id;
        eventView();
      } catch {
        home();
      }
    } else {
      home();
    }
  } catch {
    login();
  }
}

async function logout() {
  stopCamera();
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  me = null;
  eventId = null;
  login();
}

async function home() {
  setEventBrand(null);
  eventId = null;
  shell('Events', `
    <button class="secondary small" id="install" hidden>＋ Add to Home Screen</button>
    <button class="secondary small" id="logout">Sign out</button>
  `);
  $('#logout').onclick = logout;
  installButton();

  const v = $('#view');
  const [events, config] = await Promise.all([api('/api/events'), api('/api/config')]);

  v.innerHTML = `
    <div class="row between">
      <div>
        <h1 class="section-title">Your events</h1>
        <p class="muted">Guest lists, invitations and live entry.</p>
      </div>
      <button id="newEvent">＋ New event</button>
    </div>
    <div class="grid">
      ${events.map(e => `
        <article class="card event-card">
          <div class="row between">
            <h3>${esc(e.name)}</h3>
            <span class="badge">${e.admitted || 0} / ${e.total || 0}</span>
          </div>
          <p class="muted">${esc(e.date_time || 'Date to be set')}<br>${esc(e.place || 'Place to be set')}</p>
          <div class="row">
            <button class="small" data-open="${e.id}">Manage guests</button>
            <button class="secondary small" data-link="${e.slug}">Copy staff link</button>
            <button class="secondary small" data-scan="${e.id}">Open scanner</button>
            <button class="secondary small" data-edit="${e.id}">Edit</button>
            <button class="danger small" data-del="${e.id}">Delete</button>
          </div>
        </article>
      `).join('') || `<div class="card"><p>No events yet. Create your first event to get started.</p></div>`}
    </div>
    <p class="footnote">
      ${config.bulkEnabled ? 'WhatsApp Cloud API is configured.' : 'To enable bulk WhatsApp, set WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE and WA_LANG in the environment.'}
    </p>
    <div class="card" style="margin-top:18px">
      <h3 class="serif">Reception logins</h3>
      <p class="muted">Create an event-scoped account for each usher.</p>
      <button class="secondary" id="newUsher">＋ Add usher</button>
    </div>
  `;

  $('#newEvent').onclick = () => eventForm();
  $('#newUsher').onclick = () => usherForm(events);
  v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { eventId = b.dataset.open; eventView(); });
  v.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
    const url = location.origin + '/e/' + b.dataset.link;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast(t('تم نسخ رابط الموظفين: ', 'Staff link copied: ') + url);
  });
  v.querySelectorAll('[data-scan]').forEach(b => b.onclick = () => { eventId = b.dataset.scan; scanner(); });
  v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => eventForm(events.find(x => x.id === b.dataset.edit)));
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm(t('هل تريد بالتأكيد حذف هذه المناسبة وجميع ضيوفها وحسابات الاستقبال؟', 'Delete this event, its guests and reception logins?'))) {
      await api(`/api/events/${b.dataset.del}`, { method: 'DELETE' });
      home();
    }
  });
}

function modal(title, body, submitText = 'Save') {
  const n = document.createElement('div');
  n.className = 'modal';
  n.innerHTML = `
    <section class="modal-box">
      <div class="row between">
        <h2 class="section-title">${title}</h2>
        <button class="secondary small" data-close>Close</button>
      </div>
      <form class="modal-form">
        ${body}
        <div class="row">
          <button>${submitText}</button>
          <button type="button" class="secondary" data-close>Cancel</button>
        </div>
      </form>
    </section>
  `;
  document.body.append(n);
  n.querySelectorAll('[data-close]').forEach(x => x.onclick = () => n.remove());
  return n;
}

function eventForm(e) {
  const m = modal(e ? 'Edit event' : 'Create an event', `
    <div class="field">
      <label>Event name · اسم المناسبة</label>
      <input name="name" required value="${esc(e?.name)}">
    </div>
    <div class="formgrid">
      <div class="field">
        <label>Date and time</label>
        <input name="date_time" value="${esc(e?.date_time)}" placeholder="Friday, 7:00 PM">
      </div>
      <div class="field">
        <label>Place</label>
        <input name="place" value="${esc(e?.place)}">
      </div>
    </div>
    <div class="field">
      <label>Default country for phone numbers (optional)</label>
      <input name="default_country" value="${esc(e?.default_country)}" placeholder="Egypt or 20">
    </div>
    <div class="formgrid">
      <div class="field">
        <label>Original invitation image · PNG/JPG</label>
        <input name="original" type="file" accept="image/png,image/jpeg">
      </div>
      <div class="field">
        <label>QR invitation image · PNG/JPG</label>
        <input name="qr" type="file" accept="image/png,image/jpeg">
      </div>
    </div>
    <div class="formgrid">
      <div class="field">
        <label>QR centre X %</label>
        <input name="qr_x" type="number" min="0" max="100" value="${e?.qr_x ?? 50}">
      </div>
      <div class="field">
        <label>QR centre Y %</label>
        <input name="qr_y" type="number" min="0" max="100" value="${e?.qr_y ?? 50}">
      </div>
      <div class="field">
        <label>QR size %</label>
        <input name="qr_size" type="number" min="5" max="80" value="${e?.qr_size ?? 25}">
      </div>
    </div>
    <button type="button" class="secondary small" id="previewQr">Preview QR placement</button>
    <div class="drop" style="margin:12px 0">
      <canvas id="qrPreview" width="300" height="430" hidden style="max-width:100%;border-radius:12px"></canvas>
      <p id="previewHint" class="footnote">Add the QR invitation image to preview its placement.</p>
    </div>
  `);

  m.querySelector('#previewQr').onclick = async () => {
    try {
      const form = m.querySelector('form');
      const canvas = m.querySelector('#qrPreview');
      const ctx = canvas.getContext('2d');
      const selected = form.querySelector('[name=qr]').files[0];
      const art = selected
        ? URL.createObjectURL(selected)
        : (e?.slug ? (e.qr_image ? '/api/public/events/' + encodeURIComponent(e.slug) + '/qr-art' : '/api/public/events/' + encodeURIComponent(e.slug) + '/art') : '');
      const sample = await api('/api/qr-sample');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (art) {
        const bg = new Image();
        bg.src = art;
        await new Promise((ok, no) => { bg.onload = ok; bg.onerror = no; });
        const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
        const w = bg.width * scale, h = bg.height * scale;
        ctx.drawImage(bg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      }

      const qr = new Image();
      qr.src = sample.data;
      await new Promise((ok, no) => { qr.onload = ok; qr.onerror = no; });

      const size = canvas.width * (Number(form.querySelector('[name=qr_size]').value || 25) / 100);
      const cx = canvas.width * (Number(form.querySelector('[name=qr_x]').value || 50) / 100);
      const cy = canvas.height * (Number(form.querySelector('[name=qr_y]').value || 50) / 100);
      const x = Math.max(8, Math.min(canvas.width - size - 8, cx - size / 2));
      const y = Math.max(8, Math.min(canvas.height - size - 38, cy - size / 2));

      ctx.fillStyle = 'white';
      ctx.fillRect(x - 8, y - 8, size + 16, size + 46);
      ctx.drawImage(qr, x, y, size, size);
      ctx.font = '600 15px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'white';
      ctx.strokeText('Guest Name · 001', canvas.width / 2, Math.min(canvas.height - 10, y + size + 24), canvas.width - 20);
      ctx.fillStyle = '#111';
      ctx.fillText('Guest Name · 001', canvas.width / 2, Math.min(canvas.height - 10, y + size + 24), canvas.width - 20);
      canvas.hidden = false;
      m.querySelector('#previewHint').hidden = true;
      if (selected) URL.revokeObjectURL(art);
    } catch {
      toast(t('أضف صورة الدعوة أولاً لمعاينة موضع QR', 'Add an invitation image first, then preview the QR position.'));
    }
  };

  m.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    try {
      await api(e ? `/api/events/${e.id}` : '/api/events', { method: e ? 'PUT' : 'POST', body: fd });
      m.remove();
      home();
      toast(t('تم حفظ المناسبة بنجاح', 'Event saved'));
    } catch (x) {
      toast(x.message);
    }
  };
}

function usherForm(events) {
  if (!events.length) return toast(t('أنشئ مناسبة أولاً', 'Create an event first'));
  const m = modal('Add a reception login', `
    <div class="field">
      <label>Event</label>
      <select name="event_id">${events.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Username</label>
      <input name="username" required>
    </div>
    <div class="field">
      <label>Temporary password</label>
      <input name="password" type="password" minlength="8" required>
    </div>
  `, 'Create login');

  m.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/ushers', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget))) });
      m.remove();
      toast(t('تم إنشاء حساب الاستقبال بنجاح', 'Reception login created'));
    } catch (x) {
      toast(x.message);
    }
  };
}

async function eventView() {
  stopCamera();
  const ev = await api('/api/events/' + eventId);
  const branding = await api('/api/public/events/' + encodeURIComponent(ev.slug));
  setEventBrand(branding);
  shell('Guests', `
    <button class="secondary small" id="back">← Events</button>
    <button class="secondary small" id="scannerOpen">Door scanner</button>
    <button class="secondary small" id="logout">Sign out</button>
  `);
  $('#back').onclick = home;
  $('#logout').onclick = logout;
  $('#scannerOpen').onclick = scanner;
  await renderGuests();
}

async function renderGuests() {
  const v = $('#view');
  const [e, guests, stats] = await Promise.all([
    api(`/api/events/${eventId}`),
    api(`/api/events/${eventId}/guests?status=${activeFilter}`),
    api(`/api/events/${eventId}/stats`)
  ]);
  const needs = guests.filter(g => !g.phone && g.raw_phone).length;

  v.innerHTML = `
    <div class="row between">
      <div>
        <h1 class="section-title">${esc(e.name)}</h1>
        <p class="muted">${esc(e.date_time)} · ${esc(e.place)}</p>
      </div>
      <div class="row">
        <a class="badge" href="/api/events/${eventId}/export.xlsx">Export Excel</a>
        <a class="badge" href="/api/events/${eventId}/export.csv">Export CSV</a>
      </div>
    </div>
    <div class="grid toolbar">
      <div class="card"><span class="muted">Admitted</span><div class="stat">${stats.summary.admitted || 0} / ${stats.summary.total || 0}</div></div>
      <div class="card"><span class="muted">Waiting</span><div class="stat">${stats.summary.waiting || 0}</div></div>
      <div class="card"><span class="muted">Attendance</span><div class="stat">${stats.summary.total ? Math.round(100 * (stats.summary.admitted || 0) / stats.summary.total) : 0}%</div></div>
    </div>
    ${needs ? `
      <div class="banner">
        <b>${needs} guest(s) need a country.</b> WhatsApp sending is blocked until fixed.
        <div class="row" style="margin-top:10px">
          <select id="bulkCountry">
            <option value="">Choose country / اختر الدولة</option>
            ${['Egypt', 'Sudan', 'Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Jordan', 'Lebanon', 'Iraq', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Turkey', 'UK', 'USA', 'Canada'].map(x => `<option>${x}</option>`).join('')}
          </select>
          <button id="applyCountry">Apply to all</button>
        </div>
      </div>
    ` : ''}
    <div class="row between toolbar">
      <div class="row">
        <button id="addGuest">＋ Add guest</button>
        <button class="secondary" id="numbered">＋ Numbered passes</button>
        <button class="secondary" id="import">Import CSV / Excel</button>
        <button class="secondary" id="sendAll">Send to all waiting</button>
      </div>
    </div>
    <div class="tabs">
      ${[['', 'All'], ['Waiting', 'Not yet'], ['Admitted', 'Admitted'], ['not_sent', 'Not sent'], ['failed', 'Failed'], ['needs_country', 'Needs country']].map(([f, l]) => `
        <button class="${activeFilter === f ? '' : 'secondary'} small" data-filter="${f}">${l}</button>
      `).join('')}
    </div>
    <div class="row">
      <input id="search" placeholder="Search name, serial or number" value="${esc(new URLSearchParams(location.search).get('q') || '')}">
      <button class="secondary" id="searchBtn">Search</button>
    </div>
    <div class="card table-wrap" style="margin-top:16px">
      <table class="table">
        <thead>
          <tr>
            <th>Serial</th>
            <th>Name</th>
            <th>Host / side</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${guests.map(g => `
            <tr>
              <td>${esc(g.serial)}</td>
              <td>${esc(g.name || '—')}</td>
              <td>${esc(g.host || '—')}</td>
              <td>${esc(g.raw_phone || '—')} ${g.raw_phone && !g.phone ? '<span class="badge warn">Needs country</span>' : ''}</td>
              <td>
                <span class="badge ${g.status === 'Admitted' ? 'good' : ''}">${esc(g.status)}</span>
                ${g.send_status ? `<span class="badge ${g.send_status === 'Sent' ? 'good' : g.send_status === 'Failed' ? 'warn' : ''}">${esc(g.send_status)}</span>` : ''}
              </td>
              <td>
                <div class="row">
                  <button class="secondary small" data-editguest="${g.id}">Edit</button>
                  <a class="badge" target="_blank" href="/api/events/${eventId}/guests/${g.id}/pdf">PDF</a>
                  <button class="secondary small" data-wa="${g.id}" data-name="${esc(g.name)}">WhatsApp</button>
                  <button class="danger small" data-delguest="${g.id}">×</button>
                </div>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" class="muted">No guests match this filter.</td></tr>'}
        </tbody>
      </table>
    </div>
    <h2 class="serif" style="margin-top:26px">Latest entries</h2>
    <div class="card">
      ${stats.last.map(g => `
        <div class="row between">
          <span>${esc(g.name || g.serial)}</span>
          <span class="muted">${new Date(g.scanned_at).toLocaleString()} · ${esc(g.usher)}</span>
        </div>
      `).join('') || '<span class="muted">No entries yet.</span>'}
    </div>
    ${stats.byUsher?.length ? `
      <h2 class="serif" style="margin-top:20px">Per usher</h2>
      <div class="card">
        ${stats.byUsher.map(g => `
          <div class="row between">
            <span>${esc(g.usher)}</span>
            <span>${g.count}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  await refreshSendPanel();
  v.querySelector('#addGuest').onclick = () => guestForm();
  v.querySelector('#numbered').onclick = () => batchForm();
  v.querySelector('#import').onclick = () => importForm();
  v.querySelector('#applyCountry')?.addEventListener('click', async () => {
    try {
      const country = $('#bulkCountry').value;
      const d = await api(`/api/events/${eventId}/apply-country`, { method: 'POST', body: JSON.stringify({ country }) });
      toast(t(`تم تحديث ${d.fixed} رقم`, `Updated ${d.fixed} numbers`));
      renderGuests();
    } catch (x) {
      toast(x.message);
    }
  });
  v.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { activeFilter = b.dataset.filter; renderGuests(); });
  v.querySelector('#searchBtn').onclick = () => renderSearch();
  v.querySelectorAll('[data-editguest]').forEach(b => b.onclick = () => guestForm(guests.find(g => g.id === b.dataset.editguest)));
  v.querySelectorAll('[data-delguest]').forEach(b => b.onclick = async () => {
    if (confirm(t('هل تريد حذف هذا الضيف؟', 'Delete this guest?'))) {
      await api(`/api/events/${eventId}/guests/${b.dataset.delguest}`, { method: 'DELETE' });
      renderGuests();
    }
  });
  v.querySelectorAll('[data-wa]').forEach(b => b.onclick = async () => {
    const g = guests.find(x => x.id === b.dataset.wa);
    if (!g.phone) return toast(t('يرجى تحديد الدولة لرقم الهاتف أولاً', 'Add a country to this phone number first'));
    try {
      const d = await api(`/api/events/${eventId}/guests/${g.id}/share`);
      const msg = `أهلًا ${g.name || ''}، يسعدنا حضوركم. هذه دعوة المناسبة: ${d.url}`;
      open(`https://wa.me/${g.phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch (x) {
      toast(x.message);
    }
  });
}

async function refreshSendPanel() {
  const v = $('#view'), button = v && v.querySelector('#sendAll');
  if (!button) return;
  const cfg = await api('/api/config');
  button.hidden = !cfg.bulkEnabled;
  if (!cfg.bulkEnabled) return;

  button.onclick = async () => {
    button.disabled = true;
    try {
      const d = await api('/api/events/' + eventId + '/send-jobs', { method: 'POST', body: JSON.stringify({}) });
      toast(t(`تمت جدولة إرسال ${d.total} مجموعة واتساب`, `Queued ${d.total} WhatsApp groups`));
      await refreshSendPanel();
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  };

  const d = await api('/api/events/' + eventId + '/send-jobs');
  if (!d.job) return;
  v.querySelector('#sendPanel')?.remove();
  const done = (d.job.sent || 0) + (d.job.failed || 0);
  const p = document.createElement('div');
  p.id = 'sendPanel';
  p.className = 'card';
  p.style.margin = '14px 0';
  p.innerHTML = `
    <div class="row between">
      <b>WhatsApp sending · ${esc(d.job.state)}</b>
      <span>${done} of ${d.job.total} groups · ${d.job.sent || 0} sent · ${d.job.failed || 0} failed</span>
    </div>
    <p class="footnote">Sent means WhatsApp accepted the message; it does not confirm delivery.</p>
    <div class="progress" style="margin:12px 0">
      <span style="width:${Math.min(100, d.job.total ? (100 * done / d.job.total) : 0)}%"></span>
    </div>
    ${d.job.failed ? `<button class="secondary small" id="retryFailed">Retry failed (${d.job.failed})</button>` : ''}
    ${d.groups.some(g => g.state === 'Failed') ? `<p class="footnote">${esc(d.groups.filter(g => g.state === 'Failed').map(g => g.phone + ': ' + g.error).join(' · '))}</p>` : ''}
  `;
  v.querySelector('.tabs')?.before(p);
  p.querySelector('#retryFailed')?.addEventListener('click', async () => {
    try {
      const r = await api('/api/events/' + eventId + '/send-jobs/' + d.job.id + '/retry', { method: 'POST', body: JSON.stringify({}) });
      toast(t(`تمت إعادة جدولة ${r.total} مجموعة`, `Retry queued for ${r.total} groups`));
      refreshSendPanel();
    } catch (e) {
      toast(e.message);
    }
  });

  if (['Running', 'Queued'].includes(d.job.state)) {
    setTimeout(() => { if ($('#view') === v) refreshSendPanel(); }, 1300);
  }
}

async function renderSearch() {
  const q = $('#search').value;
  const d = await api(`/api/events/${eventId}/guests?q=${encodeURIComponent(q)}&status=${activeFilter}`);
  const box = $('.table tbody');
  box.innerHTML = d.map(g => `
    <tr>
      <td>${esc(g.serial)}</td>
      <td>${esc(g.name || '—')}</td>
      <td>${esc(g.host || '—')}</td>
      <td>${esc(g.raw_phone || '—')}</td>
      <td>${esc(g.status)}</td>
      <td>
        <button class="secondary small" data-editguest="${g.id}">Edit</button>
        <a class="badge" target="_blank" href="/api/events/${eventId}/guests/${g.id}/pdf">PDF</a>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">No matches</td></tr>';
  box.querySelectorAll('[data-editguest]').forEach(b => b.onclick = () => guestForm(d.find(g => g.id === b.dataset.editguest)));
}

function guestForm(g) {
  const m = modal(g ? 'Edit guest' : 'Add a guest', `
    <div class="formgrid">
      <div class="field">
        <label>Serial number</label>
        <input name="serial" value="${esc(g?.serial)}">
      </div>
      <div class="field">
        <label>Name · الاسم</label>
        <input name="name" value="${esc(g?.name)}">
      </div>
      <div class="field">
        <label>Host / side</label>
        <input name="host" value="${esc(g?.host)}">
      </div>
      <div class="field">
        <label>Phone / WhatsApp</label>
        <input name="phone" value="${esc(g?.raw_phone)}" dir="ltr">
      </div>
      <div class="field">
        <label>Country (optional)</label>
        <input name="country" value="${esc(g?.country)}" placeholder="Egypt or 20">
      </div>
    </div>
  `);

  m.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const body = JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget)));
    try {
      await api(g ? `/api/events/${eventId}/guests/${g.id}` : `/api/events/${eventId}/guests`, { method: g ? 'PUT' : 'POST', body });
      m.remove();
      toast(t('تم حفظ بيانات الضيف بنجاح', 'Guest saved'));
      renderGuests();
    } catch (x) {
      toast(x.message);
    }
  };
}

function batchForm() {
  const m = modal('Create numbered passes', `
    <div class="field">
      <label>Number of passes</label>
      <input name="count" type="number" min="1" max="1000" value="50" required>
    </div>
    <div class="field">
      <label>Host / side (optional)</label>
      <input name="host">
    </div>
  `, 'Create passes');

  m.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    try {
      const d = await api(`/api/events/${eventId}/guests/batch`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget))) });
      m.remove();
      toast(t(`تم إنشاء ${d.added} دعوة بنجاح`, `${d.added} passes created`));
      renderGuests();
    } catch (x) {
      toast(x.message);
    }
  };
}

function importForm() {
  const m = modal('Import guests', `
    <div class="drop">
      <p>Upload an Excel or CSV file · XLSX, CSV</p>
      <input type="file" name="file" accept=".xlsx,.xls,.csv" required>
    </div>
    <p class="footnote">Recognised English and Arabic columns: serial, name, host, phone, country. Incomplete rows are imported; empty rows are skipped.</p>
  `, 'Import file');

  m.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    try {
      const d = await api(`/api/events/${eventId}/import`, { method: 'POST', body: new FormData(ev.currentTarget) });
      m.remove();
      toast(t(`تمت إضافة ${d.added} وتخطي ${d.skipped}`, `${d.added} added, ${d.skipped} skipped`));
      renderGuests();
    } catch (x) {
      toast(x.message);
    }
  };
}

async function scanner() {
  stopCamera();
  shell('Door scanner', `
    <span class="connection" id="connection">Online</span>
    <button class="secondary small" id="back">${me.role === 'admin' ? '← Events' : 'Sign out'}</button>
  `);
  $('#back').onclick = me.role === 'admin' ? home : logout;

  const es = await api('/api/usher-events');
  const e = es.find(x => x.id === eventId) || es[0];
  eventId = e.id;
  setEventBrand(await api('/api/public/events/' + encodeURIComponent(e.slug)));
  const st = await api(`/api/events/${eventId}/stats`);

  $('#view').innerHTML = `
    <div class="row between">
      <div>
        <h1 class="section-title">${esc(e.name)}</h1>
        <p class="muted">${esc(me.username)} · <b id="admitCount">${st.summary.admitted || 0}</b> admitted</p>
      </div>
      <button class="secondary" id="flip">Flip camera</button>
    </div>
    <div class="scanner">
      <div>
        <video id="video" class="camera" autoplay playsinline></video>
        <p class="muted">Allow camera access, then point the camera at the guest’s QR code</p>
        <div class="row" style="justify-content:center">
          <button class="secondary" id="flash">Flash</button>
          <button class="secondary" id="searchGuest">Find guest</button>
        </div>
        <p id="cameraFallback" class="footnote"></p>
      </div>
    </div>
  `;

  $('#searchGuest').onclick = () => manualSearch();
  $('#flip').onclick = () => {
    cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    startCamera();
  };
  $('#flash').onclick = toggleFlash;

  window.removeEventListener('online', connection);
  window.removeEventListener('offline', connection);
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);

  await startCamera(false);
  connection();
}

function connection() {
  const n = $('#connection');
  if (!n) return;
  const type = navigator.connection?.effectiveType, weak = navigator.onLine && ['slow-2g', '2g', '3g'].includes(type);
  n.textContent = !navigator.onLine ? 'No connection — do not admit' : (weak ? 'Weak connection' : 'Online');
  n.className = 'connection ' + (!navigator.onLine ? 'offline' : (weak ? 'weak' : ''));
  if (!navigator.onLine) {
    stopCamera();
    showResult('offline', 'No connection', 'Do not admit anyone. Reconnect and retry.');
  }
}

async function startCamera() {
  stopCamera();
  if (!navigator.onLine) {
    connection();
    return;
  }
  if (!('BarcodeDetector' in window) && !window.jsQR) {
    if ($('#cameraFallback')) $('#cameraFallback').textContent = 'QR scanning is unavailable. Use Find guest to search manually.';
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacing }, audio: false });
    const video = $('#video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    video.srcObject = scanStream;
    await video.play();

    const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    scannerTimer = setInterval(async () => {
      if (!navigator.onLine) {
        stopCamera();
        connection();
        return;
      }
      try {
        let value = '';
        if (detector) {
          const codes = await detector.detect(video);
          if (codes.length) value = codes[0].rawValue;
        } else if (video.readyState >= 2 && window.jsQR) {
          // Scale down for mobile performance
          const maxDim = 480;
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const result = window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (result) value = result.data;
        }
        if (value) {
          stopCamera();
          verify(value);
        }
      } catch {}
    }, 350);

    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
  } catch {
    if ($('#cameraFallback')) $('#cameraFallback').textContent = 'Camera unavailable. Allow camera access or use Find guest.';
  }
}

function stopCamera() {
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = null;
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  const v = $('#video');
  if (v) v.srcObject = null;
}

async function toggleFlash() {
  const track = scanStream?.getVideoTracks()[0];
  if (!track) return toast(t('الكاميرا غير نشطة', 'Camera is not active'));
  try {
    const caps = track.getCapabilities();
    if (!caps.torch) return toast(t('الفلاش غير مدعوم في هذه الكاميرا', 'Flash is not available on this camera'));
    const on = !track.getSettings().torch;
    await track.applyConstraints({ advanced: [{ torch: on }] });
  } catch {
    toast(t('التحكم في الفلاش غير مدعوم', 'Flash control is not supported'));
  }
}

async function verify(pass, requestId) {
  if (!navigator.onLine) {
    showResult('offline', 'No connection', 'Do not admit anyone. Retry when online.');
    return;
  }
  const key = typeof pass === 'object' ? 'guest:' + pass.guest_id : String(pass);
  const stableId = requestId || pendingScanIds.get(key) || randomUUID();
  pendingScanIds.set(key, stableId);
  const payload = typeof pass === 'object' ? { ...pass, request_id: stableId } : { pass, request_id: stableId };

  try {
    const r = await Promise.race([
      api(`/api/events/${eventId}/scan`, { method: 'POST', body: JSON.stringify(payload) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
    pendingScanIds.delete(key);
    if (r.result === 'admitted') {
      showResult('admitted', 'Welcome', `${r.guest.name || 'Guest'} · ${r.guest.serial} · ${r.guest.host || ''}`);
      if ($('#admitCount')) $('#admitCount').textContent = Number($('#admitCount').textContent) + 1;
    } else if (r.result === 'duplicate') {
      showResult('duplicate', 'Already admitted', `${r.guest.name || 'Guest'} · ${r.guest.serial} · ${new Date(r.scanned_at).toLocaleTimeString()} · ${r.usher}`);
    } else {
      showResult('invalid', 'Not a valid pass', 'This QR does not belong to this event.');
    }
  } catch {
    showResult(
      navigator.onLine ? 'uncertain' : 'offline',
      navigator.onLine ? "Couldn't verify" : 'No connection',
      navigator.onLine ? 'Could not verify. Scan the same pass again; no green result was shown.' : 'Do not admit anyone.'
    );
  }
}

function showResult(type, title, details) {
  const old = $('.scanner-result');
  old?.remove();
  const n = document.createElement('div');
  n.className = `scanner-result ${type}`;
  n.innerHTML = `
    <div>
      <h1>${title}</h1>
      <p>${esc(details)}</p>
      <button class="secondary" id="resume">${type === 'offline' ? 'Retry' : 'Continue scanning'}</button>
    </div>
  `;
  document.body.append(n);
  navigator.vibrate?.(type === 'admitted' ? 180 : [100, 80, 100]);
  n.querySelector('#resume').onclick = () => {
    n.remove();
    startCamera(false);
  };
}

function manualSearch() {
  if (!navigator.onLine) {
    showResult('offline', 'No connection', 'Manual search and check-in need an internet connection.');
    return;
  }
  const m = modal('Find guest', `
    <div class="field">
      <label>Search by name, serial or phone</label>
      <input name="q" id="manualQ" placeholder="Start typing…">
    </div>
    <div id="matches"></div>
  `, 'Search');

  const input = m.querySelector('#manualQ'), matches = m.querySelector('#matches');
  input.oninput = async () => {
    if (input.value.length < 1) {
      matches.innerHTML = '';
      return;
    }
    try {
      const a = await api(`/api/events/${eventId}/guests?q=${encodeURIComponent(input.value)}`);
      matches.innerHTML = a.map(g => `
        <div class="row between card guest-detail">
          <span>${esc(g.name || 'Guest')} · ${esc(g.serial)} <small>${esc(g.phone)}</small></span>
          <button class="small" data-check="${g.id}">Check in</button>
        </div>
      `).join('') || '<p class="muted">No matches</p>';

      matches.querySelectorAll('[data-check]').forEach(b => b.onclick = async () => {
        const g = a.find(x => x.id === b.dataset.check);
        if (confirm(t(`تسجيل دخول ${g.name || g.serial}؟`, `Check in ${g.name || g.serial}?`))) {
          m.remove();
          await verify({ guest_id: g.id });
        }
      });
    } catch (e) {
      toast(e.message);
    }
  };
  m.querySelector('form').onsubmit = e => e.preventDefault();
}

function installButton() {
  if (!window.deferredInstall) return;
  const b = $('#install');
  if (b) {
    b.hidden = false;
    b.onclick = async () => {
      window.deferredInstall.prompt();
      await window.deferredInstall.userChoice;
      window.deferredInstall = null;
      b.hidden = true;
    };
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-language]')) setLanguage(language === 'ar' ? 'en' : 'ar');
});

new MutationObserver(m => {
  if (m.some(x => x.addedNodes.length)) translateDom();
}).observe(app, { childList: true, subtree: true });

translateDom();

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.deferredInstall = e;
  installButton();
});

api('/api/me').then(d => {
  me = d.user;
  boot();
}).catch(login);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
