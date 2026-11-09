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

Requires a non-empty `name` (up to 100 characters) and `comment` (up to 2,000
characters). Returns `201 Created` after saving to `data/comments.json`.

```json
{
  "name": "Jordan Smith",
  "comment": "The crew did a great job on our home."
}
```

### `GET /api/comments`

Returns `{ "comments": [...] }`, newest first. Each comment has an `id`, `name`,
`comment`, and `createdAt`.

`GET /api/health` returns `{ "status": "ok" }`. API requests are limited to 100
per IP address per 15 minutes; JSON request bodies are limited to 10 KB.

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

## Display comments on the website

Add a comments container and form to the desired page:

```html
<form id="commentForm">
  <label>
    Name
    <input name="name" required maxlength="100">
  </label>
  <label>
    Comment
    <textarea name="comment" required maxlength="2000"></textarea>
  </label>
  <button type="submit">Leave a comment</button>
</form>
<p id="commentStatus" role="status"></p>
<section id="commentsList" aria-live="polite"></section>
```

In a frontend script, load and render comments with DOM methods so submitted
text is treated as text, not HTML:

```js
const commentsList = document.querySelector("#commentsList");
const commentStatus = document.querySelector("#commentStatus");
const commentForm = document.querySelector("#commentForm");

async function loadComments() {
  const response = await fetch("http://localhost:3000/api/comments");
  if (!response.ok) throw new Error(`Could not load comments (${response.status}).`);

  const { comments } = await response.json();
  commentsList.replaceChildren(
    ...comments.map((comment) => {
      const article = document.createElement("article");
      const author = document.createElement("h3");
      const text = document.createElement("p");
      author.textContent = comment.name;
      text.textContent = comment.comment;
      article.append(author, text);
      return article;
    }),
  );
}

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(commentForm);
    const response = await fetch("http://localhost:3000/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        comment: formData.get("comment"),
      }),
    });

    if (!response.ok) throw new Error("Could not submit your comment.");
    commentForm.reset();
    commentStatus.textContent = "Thank you for your comment.";
    await loadComments();
  } catch (error) {
    commentStatus.textContent = error.message;
  }
});

loadComments().catch((error) => {
  commentStatus.textContent = error.message;
});
```

Use the production API URL in place of `http://localhost:3000` after deployment,
and list the website's exact origin in `FRONTEND_ORIGINS`.

## Storage note

JSON files are convenient for development and small deployments. Run one
backend instance and make regular backups; for multiple instances or higher
traffic, use a database with durable concurrent writes.
