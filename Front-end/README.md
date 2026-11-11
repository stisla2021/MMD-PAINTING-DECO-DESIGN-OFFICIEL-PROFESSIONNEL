## Build the TypeScript

The site scripts are in `js/` and compile to `js/*.js`, which the HTML pages load.
Install TypeScript if needed, then run this from the `front-end` folder:

```sh
npx tsc
```

Re-run the compiler after editing the TypeScript files.

## Website Languages

The language selector lets visitors choose English or French on every page.
The first visit follows the browser language when it is French; otherwise it
starts in English. A visitor's selection is saved in that browser and carries
across pages. Update translations in `js/language.ts`, then recompile.

## How to Run Locally

From the project root, install the backend dependencies once and start both
servers:

```powershell
npm --prefix backend install
npm run dev
```

Open `http://localhost:8000`. The frontend runs on port 8000 and the API runs on
port 3000. Press `Ctrl+C` to stop both servers. To view the site on a phone on
the same Wi-Fi, use the computer's LAN address and configure
`FRONTEND_ORIGINS` in `backend/.env` as described in `../backend/README.md`.

## Pages Overview

| Page          | Purpose                              |
|---------------|--------------------------------------|
| Home          | Hero and calls to action                 |
| About         | Company story and values             |
| Services      | Detailed list of painting services   |
| Reviews       | View and submit customer reviews (`comments.html`) |
| Contact       | Quote request form                   |
| Terms         | Business service terms and customer guidelines (`terms.html`) |
| Admin         | View quote requests, moderate reviews, and manage project photos (`admin.html`) |

The header and footer logo is `images/mmd-deco-logo.svg`, with
`images/favicon.svg` and `images/apple-touch-icon.png` used as site icons. All
image assets are kept in the `images/` folder. The home-page Recent Projects
gallery includes six recent project photos and is loaded from the backend. The
admin page can publish additional photos that appear there.
Six Pexels stock photos are also kept in `images/` for possible future use;
they are not currently shown on the site and must not be presented as MMD DECO
projects. Pexels permits free commercial use without requiring attribution:
[interior painting](https://www.pexels.com/photo/woman-holding-a-paint-roller-6474472/),
[exterior painting](https://www.pexels.com/photo/two-men-in-white-work-uniforms-using-ladder-to-repaint-a-wooden-wall-16734519/),
[commercial painting](https://www.pexels.com/photo/construction-workers-renovating-a-house-5493654/),
[cabinet renovation](https://www.pexels.com/photo/men-working-inside-a-house-under-repairs-15124970/),
[surface preparation](https://www.pexels.com/photo/repairman-polishing-wall-with-construction-tool-5767957/),
and [color consultation](https://www.pexels.com/photo/a-spread-of-paint-color-swatches-6583367/).
Cloudflare Pages Functions entrypoints remain in the project-root `functions/`
folder, as required by Pages. Supporting backend code, D1 migrations, and
Cloudflare Function tests are organized under the project-root `backend/`
folder. `wrangler.jsonc` points D1 migrations at `backend/migrations/`.

Cloudflare Pages security response headers are configured in `_headers`;
review its content security policy if adding external scripts, fonts, embeds,
or API hosts.
Social-profile icons in the public-page footers link to WhatsApp, Facebook,
Instagram, and TikTok. Update those footer links if a profile changes.

The full supplied design image is preserved as `images/mmd-deco-brand-poster.png`.

## Backend API

The Node.js API in the project-root `backend` folder is used for local
development. See `../backend/README.md` for setup. Cloudflare deployment uses
the Pages Functions in the project-root `functions` folder, with D1 for records
and R2 for project images.

### Current behavior
- The contact form validates and submits name, email, phone, service, and
  project details to `/api/quotes`. If the API is unavailable, the form offers
  a direct WhatsApp chat link with the entered details prefilled. WhatsApp
  buttons and the downloadable QR code open `https://wa.me/2206240363`.
- New quote requests trigger a generic email alert through Resend when
  `RESEND_API_KEY` and `QUOTE_ALERT_FROM` are configured. The alert links to the
  protected admin inbox and does not include customer details. Requests are
  still saved if the alert cannot be sent, and the contact page offers a
  WhatsApp fallback.
- The form shows a confirmation and resets after a saved request, or reports an
  error if the API is unavailable
- Existing online comments are read from `/api/comments`. New reviews include a
  name, optional location, 1-5 star rating, comment, and an emoji or optional
  photo avatar. New reviews are saved as pending and appear publicly only after
  an admin approves them. The protected admin page can approve or delete reviews.
- The protected admin page lists quote requests and manages recent-work photos;
  enter the `ADMIN_API_KEY` configured in `../backend/.env` for local use or
  Cloudflare Pages secrets for production

## Deploy to Cloudflare's free tier

The site is configured for Cloudflare Pages, Pages Functions, and D1. R2 is
optional and is only needed for admin photo uploads. Static pages use the
`pages.dev` address, and API requests use that same origin. Pages serves static
files without invoking a Function; only `/api/*` and `/uploads/*` are routed
through Functions. The current Wrangler release needs Node.js 22 or newer for
Cloudflare deployment commands; local `npm run dev` still works with the
Node.js 20 minimum documented for the Express backend.

1. Create a Cloudflare account and sign in to Wrangler from the project root:

   ```powershell
   npm install
   npx wrangler login
   ```

2. Create the D1 database:

   ```powershell
   npm run cloudflare:db:create
   ```

   Copy the D1 database ID printed by the create command into the existing
   `DB` entry's `database_id` in `../wrangler.jsonc`; do not add another
   `d1_databases` entry. Admin photo uploads stay disabled until R2 is activated.
   To enable them later, activate R2 in the Cloudflare dashboard, create the
   bucket with `npm run cloudflare:r2:create`, and add the `WORK_IMAGES` R2
   binding to `../wrangler.jsonc`. R2 may require a payment method; usage beyond
   the included monthly allowance is billed.

3. Create a Pages project named `mmd-painting-deco-design`, or use the existing
   Git-connected project. For Git setup, use the repository root, no build
   command, and `Front-end` as the output directory. Apply the database
   migration and set the admin key as a Cloudflare secret:

   ```powershell
   npm run cloudflare:migrate
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   npx wrangler pages secret put ADMIN_API_KEY --project-name mmd-painting-deco-design
   ```

   Copy the generated key into the secret prompt and keep a private copy for
   unlocking `admin.html`. Never put it in this repository or frontend code.

   To receive email alerts for quote requests, add `RESEND_API_KEY` as a Pages
   secret and set `QUOTE_ALERT_FROM` to a sender address verified in Resend.
   `QUOTE_ALERT_TO` is optional and defaults to the company email configured in
   the quote API. The alert contains only a notification and a link to the
   protected admin inbox, not customer details. Set the same values in
   `backend/.env` for local development.

4. Deploy the site:

   ```powershell
   npm run cloudflare:deploy
   ```

   The site will be available at
   `https://mmd-painting-deco-design.pages.dev`. The project is also set up for
   local development with `npm run dev`, which continues to use the Express
   backend on port 3000.

Cloudflare has free allowances, not unlimited database and image storage. The
current Free plan includes 100,000 Pages Function requests per day, D1 usage
limits, and R2's monthly free storage and operation allowances; check the
Cloudflare dashboard and current [Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/), and
[R2](https://developers.cloudflare.com/r2/pricing/) pricing before enabling
paid upgrades.