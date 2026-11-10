# MMD DECO Design Official API

This Express API is for local development. The Cloudflare deployment uses the
Pages Functions in the project-root `functions` folder, with D1 and R2; setup
instructions are in `../Front-end/README.md`.

The backend accepts quote requests and reviews and stores records in JSON files
inside `data/`. Admin-uploaded project images are stored in `uploads/`. It
requires Node.js 20 or newer.

## Install and run

From the project root:

```powershell
cd backend
npm install
Copy-Item .env.example .env
$key = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
(Get-Content .env) -replace '^ADMIN_API_KEY=.*$', "ADMIN_API_KEY=$key" | Set-Content .env
npm start
```

The API listens on `http://localhost:3000`. For automatic restarts during
development, use `npm run dev`. The checked-in `.env.example` allows the local
frontend origins on ports 8000 and 5500; update `FRONTEND_ORIGINS` in `.env` to
the exact local origin(s) where the frontend is hosted. The generated admin key
is private: get it from your local `backend/.env` and enter it on
`Front-end/admin.html`. Never publish the `.env` file or put this key in
frontend code.

Serve the frontend over HTTP (for example, open `Front-end` in VS Code Live
Server). Opening HTML directly as a `file://` URL is not supported by the CORS
configuration.

## API

All responses are JSON. Request bodies must use `Content-Type: application/json`.

### `POST /api/quotes`

Required: `name`, valid `email`, and `service` (`interior`, `exterior`, `both`,
`cabinets`, `commercial`, or `other`). `phone` and `message` are optional.

```json
{
  "name": "Jordan Smith",
  "email": "jordan@example.com",
  "phone": "(555) 123-4567",
  "service": "interior",
  "message": "Please quote two bedrooms."
}
```

Returns `201 Created` after saving the request in `data/quotes.json`.
When Resend is configured with `RESEND_API_KEY` and `QUOTE_ALERT_FROM`, the API
also sends a generic alert to `QUOTE_ALERT_TO` (the company email by default).
The alert contains no customer details; it links to the protected admin inbox.
If sending fails, the request remains saved and the response includes
`"notificationSent": false`; check the server log and Resend configuration.

### `GET /api/quotes`

Returns saved quote requests newest first. This endpoint requires the configured
`ADMIN_API_KEY` in the `X-Admin-Key` header.

### `POST /api/comments`

Requires `name` (up to 100 characters), `rating` (an integer from 1 to 5), and
`comment` (up to 2,000 characters). `location` is optional (up to 100
characters), and `avatar` may be one of the site's emoji choices or a resized
JPEG photo. Returns `201 Created`; new reviews are saved with `approved` status
and shown publicly as soon as they are submitted.

```json
{
  "name": "Jordan Smith",
  "location": "Banjul",
  "rating": 5,
  "avatar": "🙂",
  "comment": "The crew did a great job on our home."
}
```

### `GET /api/comments`

Returns published reviews newest first.

The protected `GET /api/comments/pending` endpoint and approval/rejection
routes remain available for any reviews already awaiting moderation. Use the
`X-Admin-Key` header for these endpoints. These controls are available on
`Front-end/admin.html`.

The public review form resizes photos to small JPEG avatars before submission.
On Cloudflare, review records (including the compact avatar data) are stored in
D1; local development stores them in `data/comments.json`.

`GET /api/health` returns `{ "status": "ok" }`. API requests are limited to 100
per IP address per 15 minutes; JSON request bodies are limited to 48 KB.

### Recent work and admin uploads

`GET /api/works` returns `{ "works": [...] }` with the latest project first.
Anyone may view these published projects.

The unlinked, no-index admin page at `Front-end/admin.html` uploads one or more
JPEG, PNG, or WebP photos (up to 6 MB each). Enter the private admin key
configured as `ADMIN_API_KEY` in `backend/.env`, then choose photos from the
phone or computer. Each project title is generated from the photo's filename.
`POST /api/works` accepts multipart form data with fields `title`, `category`,
`description`, and `image`; it requires the `X-Admin-Key` header. The protected
`DELETE /api/works/:id` endpoint removes a published project and its image.
Only image files with matching file signatures are accepted. Images are served
from `/uploads/` and appear in the home-page Recent Projects gallery.

To manage work, open `admin.html` on the site and unlock it with the key in
`backend/.env`. By default, the API uses the same hostname as the website on
port 3000. For phone access on the same Wi-Fi, open the site using the
computer's LAN address and add the frontend's exact LAN origin to
`FRONTEND_ORIGINS` in `backend/.env`. If the API uses a different host or port,
set the `api-base-url` meta tag in `admin.html` and `index.html` to its origin.
For deployment, set those meta tags to the deployed API origin. The page is
not linked from public navigation and asks for the private key; no-index is
only a crawler hint, so the backend key check is what protects uploads. Use
HTTPS for both website and API in production so the admin key is encrypted in
transit.

## Connect the contact form

The `Front-end/js/contact.ts` handler uses the shared API URL helper. When the
frontend runs on port 8000 or 5500, it connects to the local API on port 3000.
Recompile the frontend TypeScript after changing it:

```powershell
cd ..\Front-end
npx tsc --project tsconfig.json
```

For local development on a phone, the backend must allow the frontend's exact
LAN origin in `FRONTEND_ORIGINS`. Cloudflare Pages serves its Functions from the
same origin as the static site, so the deployed site does not use this Express
server or its CORS settings.

The recent-project gallery and admin uploader use the same API URL helper.
Cloudflare stores project records in D1 and uploaded images in R2; the admin key
is configured as a Pages secret and is never included in the frontend.

## Storage note

The local JSON stores are for development only; run one backend instance and
make regular backups. Production review/work records use D1 and project photos
use R2 when that optional binding is configured. Review avatars are deliberately
resized and capped before being stored. The public review and work endpoints
currently return the full published lists; add cursor pagination and move
avatars to object storage if the archive grows enough to affect response size
or page loading.
