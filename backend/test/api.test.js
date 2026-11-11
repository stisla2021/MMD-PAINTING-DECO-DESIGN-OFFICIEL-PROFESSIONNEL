import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "mmd-deco-api-"));
const uploadsDirectory = path.join(dataDirectory, "uploads");
const adminApiKey = "test-admin-api-key-with-at-least-32-characters";
const app = createApp({ dataDirectory, uploadsDirectory, adminApiKey });
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  rmSync(dataDirectory, { recursive: true, force: true });
});

test("accepts and persists a valid quote request", async () => {
  const response = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Customer",
      email: "test@example.com",
      service: "interior",
      phone: "",
      message: "Two rooms",
    }),
  });

  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.message, "Quote request received.");
  assert.ok(saved.quote.id);
});

test("keeps a quote saved when Resend cannot send the alert", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    QUOTE_ALERT_FROM: process.env.QUOTE_ALERT_FROM,
    QUOTE_ALERT_TO: process.env.QUOTE_ALERT_TO,
  };
  let emailPayload;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.QUOTE_ALERT_FROM = "MMD PAINTING <notifications@example.com>";
  process.env.QUOTE_ALERT_TO = "alerts@example.com";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    emailPayload = JSON.parse(init.body);
    return new Response("Resend unavailable", { status: 503 });
  };

  try {
    const response = await originalFetch(`${baseUrl}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Saved Customer",
        email: "saved@example.com",
        service: "interior",
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).notificationSent, false);
    assert.doesNotMatch(emailPayload.text, /Saved Customer|saved@example\.com/);

    const inbox = await originalFetch(`${baseUrl}/api/quotes`, {
      headers: { "X-Admin-Key": adminApiKey },
    });
    const { quotes } = await inbox.json();
    assert.ok(quotes.some((quote) => quote.email === "saved@example.com"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("lists quote requests only for an authorized admin", async () => {
  const postResponse = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Inbox Customer",
      email: "inbox@example.com",
      service: "exterior",
      phone: "+220 1234567",
      message: "Paint the outside walls.",
    }),
  });
  assert.equal(postResponse.status, 201);

  const unauthorized = await fetch(`${baseUrl}/api/quotes`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/api/quotes`, {
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(authorized.status, 200);
  const listed = await authorized.json();
  const savedQuote = listed.quotes.find(
    (quote) => quote.email === "inbox@example.com",
  );
  assert.ok(savedQuote);
  assert.equal(savedQuote.service, "exterior");
});

test("rejects invalid quote input", async () => {
  const response = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Customer",
      email: "not-an-email",
      service: "interior",
    }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid email/i);
});

test("tracks anonymous website visits and protects the analytics dashboard data", async () => {
  const visitorId = "22222222-2222-4222-8222-222222222222";
  const today = new Date().toISOString().slice(0, 10);
  for (const [pagePath, id] of [
    ["/contact.html", visitorId],
    ["/contact", visitorId],
    ["/terms.html", null],
  ]) {
    const response = await fetch(`${baseUrl}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pagePath, visitorId: id }),
    });
    assert.equal(response.status, 204);
  }

  const unauthorized = await fetch(
    `${baseUrl}/api/analytics?start=${today}&end=${today}`,
  );
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(
    `${baseUrl}/api/analytics?start=${today}&end=${today}`,
    { headers: { "X-Admin-Key": adminApiKey } },
  );
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    startDate: today,
    endDate: today,
    totals: { pageViews: 3, uniqueVisitors: 1 },
    daily: [{ date: today, pageViews: 3, uniqueVisitors: 1 }],
    pages: [
      { path: "/contact", pageViews: 2 },
      { path: "/terms", pageViews: 1 },
    ],
  });

  const storedAnalytics = readFileSync(
    path.join(dataDirectory, "analytics.json"),
    "utf8",
  );
  assert.doesNotMatch(storedAnalytics, new RegExp(visitorId));
  assert.match(storedAnalytics, /visitorHash/);
});

test("holds new reviews for admin approval and lets admins delete published reviews", async () => {
  const postResponse = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Reviewer",
      location: "Banjul",
      rating: 5,
      avatar: "data:image/jpeg;base64,/9j/AA==",
      comment: "Great work!",
    }),
  });

  assert.equal(postResponse.status, 201);
  const saved = await postResponse.json();
  assert.equal(saved.review.comment, "Great work!");
  assert.equal(saved.review.status, "pending");

  const firstVisitorResponse = await fetch(`${baseUrl}/api/comments`);
  assert.equal(firstVisitorResponse.status, 200);
  const firstVisitorReviews = await firstVisitorResponse.json();
  assert.ok(
    !firstVisitorReviews.comments.some(
      (review) => review.id === saved.review.id,
    ),
  );

  const pendingWithoutKey = await fetch(`${baseUrl}/api/comments/pending`);
  assert.equal(pendingWithoutKey.status, 401);

  const pendingForAdmin = await fetch(`${baseUrl}/api/comments/manage`, {
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(pendingForAdmin.status, 200);
  assert.equal(
    (await pendingForAdmin.json()).comments.find(
      (review) => review.id === saved.review.id,
    ).status,
    "pending",
  );

  const approved = await fetch(
    `${baseUrl}/api/comments/${saved.review.id}/approve`,
    {
      method: "POST",
      headers: { "X-Admin-Key": adminApiKey },
    },
  );
  assert.equal(approved.status, 200);

  const approvedForAdmin = await fetch(`${baseUrl}/api/comments/manage`, {
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(
    (await approvedForAdmin.json()).comments.find(
      (review) => review.id === saved.review.id,
    ).status,
    "approved",
  );

  const laterVisitorResponse = await fetch(`${baseUrl}/api/comments`);
  const laterVisitorReviews = await laterVisitorResponse.json();
  const publishedReview = laterVisitorReviews.comments.find(
    (review) => review.id === saved.review.id,
  );
  assert.ok(publishedReview);
  assert.equal(publishedReview.id, saved.review.id);
  assert.equal(publishedReview.location, "Banjul");
  assert.equal(publishedReview.rating, 5);
  assert.equal(publishedReview.avatar, "data:image/jpeg;base64,/9j/AA==");

  const unauthorizedDelete = await fetch(
    `${baseUrl}/api/comments/${saved.review.id}`,
    { method: "DELETE" },
  );
  assert.equal(unauthorizedDelete.status, 401);

  const deleted = await fetch(`${baseUrl}/api/comments/${saved.review.id}`, {
    method: "DELETE",
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(deleted.status, 204);
  const afterDelete = await fetch(`${baseUrl}/api/comments`);
  assert.ok(
    !(await afterDelete.json()).comments.some(
      (review) => review.id === saved.review.id,
    ),
  );
});

test("does not publish invalid reviews and validates ratings", async () => {
  const invalid = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Reviewer",
      rating: 0,
      comment: "Invalid rating must not persist.",
    }),
  });
  assert.equal(invalid.status, 400);

  const publicReviews = await fetch(`${baseUrl}/api/comments`);
  assert.ok(
    !(await publicReviews.json()).comments.some(
      (review) => review.comment === "Invalid rating must not persist.",
    ),
  );
});

test("rejects comment submissions without required fields", async () => {
  const response = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Reviewer", comment: "  " }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /comment is required/i);
});

test("allows configured local frontend origins and rejects unknown origins", async () => {
  const allowedResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "http://127.0.0.1:8000" },
  });
  assert.equal(
    allowedResponse.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:8000",
  );

  const rejectedResponse = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(rejectedResponse.status, 403);
});

test("supports the admin header in CORS preflight", async () => {
  const response = await fetch(`${baseUrl}/api/works`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:8000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-admin-key",
    },
  });

  test("sets security headers and prevents caching API responses", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-powered-by"), null);
  });

  assert.equal(response.status, 204);
  assert.match(
    response.headers.get("access-control-allow-headers"),
    /x-admin-key/i,
  );
});

test("requires admin authorization to upload project photos", async () => {
  const formData = new FormData();
  formData.set("title", "Test project");
  formData.set("image", new Blob([Buffer.from("not an image")], { type: "image/png" }), "test.png");

  const response = await fetch(`${baseUrl}/api/works`, {
    method: "POST",
    body: formData,
  });

  assert.equal(response.status, 401);
});

test("validates the admin key through the protected verification endpoint", async () => {
  const unauthorized = await fetch(`${baseUrl}/api/works/verify`, {
    method: "POST",
    headers: { "X-Admin-Key": "incorrect" },
  });
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/api/works/verify`, {
    method: "POST",
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { authenticated: true });
});

test("publishes and deletes authorized recent work", async () => {
  const formData = new FormData();
  formData.set("title", "Test project");
  formData.set("category", "Interior painting");
  formData.set("description", "Freshly painted room");
  formData.set(
    "image",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r8cAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "project.png",
  );

  const postResponse = await fetch(`${baseUrl}/api/works`, {
    method: "POST",
    headers: { "X-Admin-Key": adminApiKey },
    body: formData,
  });
  assert.equal(postResponse.status, 201);

  const { work } = await postResponse.json();
  assert.equal(work.title, "Test project");
  assert.match(work.imageUrl, /^\/uploads\/[a-f0-9-]+\.png$/);

  const imageResponse = await fetch(`${baseUrl}${work.imageUrl}`);
  assert.equal(imageResponse.status, 200);

  const deleteResponse = await fetch(`${baseUrl}/api/works/${work.id}`, {
    method: "DELETE",
    headers: { "X-Admin-Key": adminApiKey },
  });
  assert.equal(deleteResponse.status, 204);

  const listResponse = await fetch(`${baseUrl}/api/works`);
  assert.deepEqual((await listResponse.json()).works, []);
  assert.equal((await fetch(`${baseUrl}${work.imageUrl}`)).status, 404);
});

test("rejects files that do not match their claimed image type", async () => {
  const formData = new FormData();
  formData.set("title", "Not an image");
  formData.set(
    "image",
    new Blob(["not an image"], { type: "image/png" }),
    "not-an-image.png",
  );

  const response = await fetch(`${baseUrl}/api/works`, {
    method: "POST",
    headers: { "X-Admin-Key": adminApiKey },
    body: formData,
  });

  assert.equal(response.status, 400);
});
