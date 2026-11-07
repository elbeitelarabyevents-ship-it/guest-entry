# Guest Entry

Guest Entry is a mobile-first event guest list and QR door-entry application. It supports multiple events, organizer and event-scoped usher accounts, invitation PDFs, guest imports, QR check-in, exports, and a Progressive Web App shell.

## Requirements

- Node.js 18 or newer and npm
- HTTPS for camera access outside localhost

## Run locally

```sh
npm install
cp .env.example .env
# Set SEED_ADMIN_PASSWORD to a private password before first seed
npm run seed
npm start
```

Open `http://localhost:3000`. The seed account is `admin`. Set `SEED_ADMIN_PASSWORD` before seeding, or the seed script generates a random one and prints it once. Remove the demo data before using the app for a real event. The first run creates a demo event and guest list.

The SQLite database and uploaded invitation artwork live in `data/`. Back up that directory regularly. Set `DATA_DIR` to a persistent volume when deploying.

## Docker

Copy `.env.example` to `.env`, replace the seed password, then run:

```sh
docker compose up --build -d
```

Put a TLS reverse proxy such as Caddy or nginx in front of port 3000. Camera access requires HTTPS. Restrict direct access to the app port when the proxy is configured.

## Accounts and use

- Sign in as the organizer to create events, invite staff, manage guests and export attendance.
- Create event-scoped usher accounts from the events page. Ushers land directly on their event scanner and cannot query another event.
- A pass is a random token in its QR code. Guests do not get accounts. Share the public PDF invitation link using WhatsApp from a guest row.
- Phone values are normalized per guest. Numbers without a country remain marked as needing a country and are excluded from WhatsApp links until corrected.
- Each event has a distinct staff URL at `/e/<event-name>`. It opens an event-branded sign-in page; event-scoped staff go directly to that event's scanner after sign-in. Copy the link from the organizer's event card.
- The interface starts in Arabic and has an Arabic/English switch. Arabic uses right-to-left layout.
- Manual WhatsApp opens a prefilled message in WhatsApp. With `WA_TOKEN`, `WA_PHONE_ID`, `WA_TEMPLATE`, and `WA_LANG` set, the organizer can queue bulk document-template messages, monitor progress after reload, and retry failed phone groups. `Sent` means the API accepted the message, not that the guest received it. The Graph API version defaults to `v27.0`; override with `WA_GRAPH_VERSION` if needed.

## Imports and exports

Import `.xlsx`, `.xls`, or `.csv` with an English or Arabic header row. Supported fields are serial, name, host/side, phone/mobile/WhatsApp, and country. Empty rows are skipped; incomplete rows are retained. CSV and Excel exports contain the guest list and current admission status.

## PWA and network behavior

The service worker caches only the static app shell, not API responses, guest records, invitations, or scan results. Door admission is online-only and is committed by SQLite on the server. If the device loses connectivity, the scanner stops and displays a red no-connection state. Install through the browser's Add to Home Screen option. On iPhone, open the site in Safari, tap Share, then Add to Home Screen; on Android Chrome, use the browser menu and Install app. The 192px and 512px PNG install icons are generated at server startup.

## Security and production notes

Passwords use bcrypt. Cookies are HttpOnly and SameSite Strict; cookies are marked Secure in production. Login is rate-limited, endpoint access is role-checked, and usher accounts are event-scoped. Keep `NODE_ENV=production`, deploy only behind HTTPS, restrict upload access, and back up the database and `data/uploads` together. Sessions are currently held in process memory, so a server restart requires users to sign in again. Configure a persistent session store before running multiple server instances.

## Current delivery scope

The application includes event and guest administration, distinct event-name staff URLs, invitation-art event backgrounds, Arabic/English UI, serial allocation, CSV/XLSX import, normalized phone numbers and bulk country fixes, grouped invitation PDFs, public unguessable invitation links, manual WhatsApp links, a persisted Cloud API send queue with failed-group retries, live attendance summaries and per-usher counts, CSV/XLSX exports, event-scoped reception accounts, QR scanning, atomic online check-in, duplicate detection and app-shell offline caching.

Optional WhatsApp delivery/read webhooks, an image-based QR placement preview, and detailed scan-history export remain follow-up work. The PDF uses the supplied invitation artwork, draws QR codes, and renders guest labels with full Arabic shaping and RTL support.
