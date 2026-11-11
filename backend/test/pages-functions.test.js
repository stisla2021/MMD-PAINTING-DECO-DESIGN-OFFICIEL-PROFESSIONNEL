import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequest } from "../../functions/api/[[path]].js";
import { onRequest as serveGoogleVerificationFile } from "../../functions/google16df5d513870464f.html.js";
import { onRequest as serveUpload } from "../../functions/uploads/[key].js";

const adminApiKey = "test-admin-api-key-with-at-least-32-characters";
const sharedPhotoAvatar = `data:image/jpeg;base64,/9j/${"A".repeat(12_000)}`;

function createEnvironment() {
  const tables = {
    quotes: [],
    comments: [],
    works: [],
    analyticsViews: [],
    analyticsVisitors: [],
  };
  const rateLimits = new Map();
  const images = new Map();

  const database = {
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          const sql = query.replace(/\s+/g, " ").trim();
          const [
            first,
            second,
            third,
            fourth,
            fifth,
            sixth,
            seventh,
            eighth,
          ] = this.values;

          if (sql.startsWith("DELETE FROM api_rate_limits")) {
            for (const [key, count] of rateLimits) {
              const [, start] = key.split(":");
              if (Number(start) < first) {
                rateLimits.delete(key);
              }
            }
          } else if (sql.startsWith("INSERT INTO api_rate_limits")) {
            const key = `${first}:${second}`;
            rateLimits.set(key, (rateLimits.get(key) ?? 0) + 1);
          } else if (sql.startsWith("INSERT INTO quotes")) {
            tables.quotes.push({
              id: first,
              name: second,
              email: third,
              phone: fourth,
              service: fifth,
              message: sixth,
              created_at: seventh,
            });
          } else if (sql.startsWith("INSERT INTO comments")) {
            tables.comments.push({
              id: first,
              name: second,
              location: third,
              rating: fourth,
              avatar: fifth,
              comment: sixth,
              created_at: seventh,
              status: eighth,
            });
          } else if (sql.startsWith("UPDATE comments SET status")) {
            const review = tables.comments.find(
              (comment) =>
                comment.id === first && comment.status === "pending",
            );
            if (review) review.status = "approved";
          } else if (sql.startsWith("INSERT INTO works")) {
            tables.works.push({
              id: first,
              title: second,
              category: third,
              description: fourth,
              image_key: fifth,
              created_at: sixth,
            });
          } else if (sql.startsWith("DELETE FROM works")) {
            tables.works = tables.works.filter((work) => work.id !== first);
          } else if (sql.startsWith("INSERT INTO analytics_daily_views")) {
            const existing = tables.analyticsViews.find(
              (row) => row.visit_day === first && row.page_path === second,
            );
            if (existing) {
              existing.view_count += 1;
            } else {
              tables.analyticsViews.push({
                visit_day: first,
                page_path: second,
                view_count: 1,
              });
            }
          } else if (sql.startsWith("INSERT OR IGNORE INTO analytics_daily_visitors")) {
            const exists = tables.analyticsVisitors.some(
              (row) => row.visitor_hash === first && row.visit_day === second,
            );
            if (!exists) {
              tables.analyticsVisitors.push({
                visitor_hash: first,
                visit_day: second,
              });
            }
          } else if (sql.startsWith("DELETE FROM analytics_daily_views")) {
            tables.analyticsViews = tables.analyticsViews.filter(
              (row) => row.visit_day >= first,
            );
          } else if (sql.startsWith("DELETE FROM analytics_daily_visitors")) {
            tables.analyticsVisitors = tables.analyticsVisitors.filter(
              (row) => row.visit_day >= first,
            );
          } else {
            throw new Error(`Unexpected SQL in test: ${sql}`);
          }
          return { success: true };
        },
        async first() {
          const sql = query.replace(/\s+/g, " ").trim();
          if (sql.startsWith("INSERT INTO api_rate_limits")) {
            const key = `${this.values[0]}:${this.values[1]}`;
            const requestCount = (rateLimits.get(key) ?? 0) + 1;
            rateLimits.set(key, requestCount);
            return { request_count: requestCount };
          }
          if (sql.startsWith("SELECT id, image_key FROM works")) {
            return (
              tables.works.find((work) => work.id === this.values[0]) ?? null
            );
          }
          if (sql.startsWith("UPDATE comments SET status")) {
            const review = tables.comments.find(
              (comment) =>
                comment.id === this.values[0] && comment.status === "pending",
            );
            if (review) review.status = "approved";
            return review ? { id: review.id } : null;
          }
          if (sql.startsWith("DELETE FROM comments")) {
            const review = tables.comments.find(
              (comment) => comment.id === this.values[0],
            );
            if (review) {
              tables.comments = tables.comments.filter(
                (comment) => comment.id !== review.id,
              );
              return { id: review.id };
            }
            return null;
          }
          if (sql.startsWith("SELECT COALESCE(SUM(view_count)")) {
            return {
              page_views: tables.analyticsViews
                .filter(
                  (row) => row.visit_day >= this.values[0] && row.visit_day <= this.values[1],
                )
                .reduce((sum, row) => sum + row.view_count, 0),
            };
          }
          if (sql.startsWith("SELECT COUNT(DISTINCT visitor_hash)")) {
            return {
              unique_visitors: new Set(
                tables.analyticsVisitors
                  .filter(
                    (row) => row.visit_day >= this.values[0] && row.visit_day <= this.values[1],
                  )
                  .map((row) => row.visitor_hash),
              ).size,
            };
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
        async all() {
          const sql = query.replace(/\s+/g, " ").trim();
          const records = sql.startsWith("SELECT id, name, location")
            ? tables.comments.filter((comment) =>
                sql.includes("WHERE status = 'approved'")
                  ? comment.status === "approved"
                  : sql.includes("WHERE status = 'pending'")
                    ? comment.status === "pending"
                    : true,
              )
            : sql.startsWith("SELECT id, name, email, phone, service, message")
              ? tables.quotes
            : sql.startsWith("SELECT id, title, category")
              ? tables.works
              : sql.startsWith("SELECT visit_day, SUM(view_count)")
                ? Array.from(
                    tables.analyticsViews
                      .filter(
                        (row) =>
                          row.visit_day >= this.values[0] &&
                          row.visit_day <= this.values[1],
                      )
                      .reduce((days, row) => {
                        days.set(
                          row.visit_day,
                          (days.get(row.visit_day) ?? 0) + row.view_count,
                        );
                        return days;
                      }, new Map()),
                    ([visit_day, page_views]) => ({ visit_day, page_views }),
                  )
                : sql.startsWith("SELECT visit_day, COUNT(*)")
                  ? Array.from(
                      tables.analyticsVisitors
                        .filter(
                          (row) =>
                            row.visit_day >= this.values[0] &&
                            row.visit_day <= this.values[1],
                        )
                        .reduce((days, row) => {
                          days.set(row.visit_day, (days.get(row.visit_day) ?? 0) + 1);
                          return days;
                        }, new Map()),
                      ([visit_day, unique_visitors]) => ({
                        visit_day,
                        unique_visitors,
                      }),
                    )
                  : sql.startsWith("SELECT page_path, SUM(view_count)")
                    ? Array.from(
                        tables.analyticsViews
                          .filter(
                            (row) =>
                              row.visit_day >= this.values[0] &&
                              row.visit_day <= this.values[1],
                          )
                          .reduce((paths, row) => {
                            paths.set(
                              row.page_path,
                              (paths.get(row.page_path) ?? 0) + row.view_count,
                            );
                            return paths;
                          }, new Map()),
                        ([page_path, page_views]) => ({ page_path, page_views }),
                      )
              : null;
          if (!records) {
            throw new Error(`Unexpected SQL in test: ${sql}`);
          }
          return {
            results: [...records].sort((left, right) =>
              String(right.created_at ?? right.visit_day ?? "").localeCompare(
                String(left.created_at ?? left.visit_day ?? ""),
              ),
            ),
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  };

  return {
    DB: database,
    WORK_IMAGES: {
      async put(key, value, options) {
        images.set(key, {
          bytes: new Uint8Array(value),
          contentType: options.httpMetadata.contentType,
        });
      },
      async get(key) {
        const image = images.get(key);
        if (!image) {
          return null;
        }
        return {
          body: new Blob([image.bytes]).stream(),
          httpMetadata: { contentType: image.contentType },
        };
      },
      async delete(key) {
        images.delete(key);
      },
    },
    ADMIN_API_KEY: adminApiKey,
    tables,
    images,
  };
}

function makeRequest(path, init = {}) {
  return new Request(`https://mmd.example${path}`, {
    ...init,
    headers: {
      "CF-Connecting-IP": "192.0.2.10",
      ...init.headers,
    },
  });
}

function pngUpload() {
  const form = new FormData();
  form.set("title", "Test project");
  form.set("category", "Interior painting");
  form.set("description", "A test room");
  form.set(
    "image",
    new Blob(
      [
        Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
        ]),
      ],
      { type: "image/png" },
    ),
    "project.png",
  );
  return form;
}

test("serves the Google verification token directly at its required URL", async () => {
  const response = await serveGoogleVerificationFile({
    request: new Request(
      "https://example.com/google16df5d513870464f.html",
    ),
  });

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    "google-site-verification: google16df5d513870464f.html\n",
  );
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");

  const unsupportedMethod = await serveGoogleVerificationFile({
    request: new Request("https://example.com/google16df5d513870464f.html", {
      method: "POST",
    }),
  });
  assert.equal(unsupportedMethod.status, 405);
});

test("accepts valid quotes and serves the health endpoint", async () => {
  const env = createEnvironment();
  const health = await onRequest({
    request: makeRequest("/api/health"),
    env,
  });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const response = await onRequest({
    request: makeRequest("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Customer",
        email: "test@example.com",
        service: "interior",
      }),
    }),
    env,
  });
  assert.equal(response.status, 201);
  assert.equal(env.tables.quotes.length, 1);
  assert.equal(env.tables.quotes[0].email, "test@example.com");
  assert.equal((await response.json()).notificationSent, false);
});

test("records page views and returns protected anonymous visitor statistics", async () => {
  const env = createEnvironment();
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = new Date(`${today}T00:00:00.000Z`);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 6);
  const startDate = rangeStart.toISOString().slice(0, 10);
  const trackPageView = async (path, id = visitorId) =>
    onRequest({
      request: makeRequest("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, visitorId: id }),
      }),
      env,
    });

  assert.equal((await trackPageView("/contact.html")).status, 204);
  assert.equal((await trackPageView("/contact")).status, 204);
  assert.equal((await trackPageView("/terms.html", null)).status, 204);
  assert.equal(env.tables.analyticsViews.length, 2);
  assert.equal(env.tables.analyticsVisitors.length, 1);
  assert.notEqual(env.tables.analyticsVisitors[0].visitor_hash, visitorId);
  assert.match(env.tables.analyticsVisitors[0].visitor_hash, /^[a-f0-9]{64}$/);

  const unauthorized = await onRequest({
    request: makeRequest(`/api/analytics?start=${startDate}&end=${today}`),
    env,
  });
  assert.equal(unauthorized.status, 401);

  const authorized = await onRequest({
    request: makeRequest(`/api/analytics?start=${startDate}&end=${today}`, {
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(authorized.status, 200);
  const analytics = await authorized.json();
  assert.equal(analytics.startDate, startDate);
  assert.equal(analytics.endDate, today);
  assert.deepEqual(analytics.totals, { pageViews: 3, uniqueVisitors: 1 });
  assert.equal(analytics.daily.length, 7);
  assert.deepEqual(analytics.daily.slice(0, 6), Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      pageViews: 0,
      uniqueVisitors: 0,
    };
  }));
  assert.deepEqual(analytics.daily[6], {
    date: today,
    pageViews: 3,
    uniqueVisitors: 1,
  });
  assert.deepEqual(analytics.pages, [
    { path: "/contact", pageViews: 2 },
    { path: "/terms", pageViews: 1 },
  ]);
});

test("rejects invalid analytics paths, IDs, and date ranges", async () => {
  const env = createEnvironment();
  const invalidPath = await onRequest({
    request: makeRequest("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/admin",
        visitorId: "11111111-1111-4111-8111-111111111111",
      }),
    }),
    env,
  });
  assert.equal(invalidPath.status, 400);

  const invalidId = await onRequest({
    request: makeRequest("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", visitorId: "not-an-id" }),
    }),
    env,
  });
  assert.equal(invalidId.status, 400);

  const invalidRange = await onRequest({
    request: makeRequest("/api/analytics?start=2026-02-31&end=2026-03-01", {
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(invalidRange.status, 400);
});

test("sends a generic Resend alert without customer details", async () => {
  const env = createEnvironment();
  env.RESEND_API_KEY = "test-resend-key";
  env.QUOTE_ALERT_FROM = "MMD PAINTING <notifications@example.com>";
  let emailPayload;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    emailPayload = JSON.parse(init.body);
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await onRequest({
      request: makeRequest("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Private Customer",
          email: "private@example.com",
          service: "interior",
        }),
      }),
      env,
    });

    assert.equal(response.status, 201);
    assert.equal((await response.json()).notificationSent, true);
    assert.equal(emailPayload.to[0], "mustaphajallow534@gmail.com");
    assert.match(emailPayload.text, /\/admin/);
    assert.doesNotMatch(emailPayload.text, /Private Customer|private@example\.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("protects the quote inbox and returns saved requests to admins", async () => {
  const env = createEnvironment();
  env.tables.quotes.push({
    id: "quote-1",
    name: "Customer",
    email: "customer@example.com",
    phone: "+220 1234567",
    service: "interior",
    message: "Paint two rooms.",
    created_at: "2026-11-09T10:00:00.000Z",
  });

  const unauthorized = await onRequest({
    request: makeRequest("/api/quotes"),
    env,
  });
  assert.equal(unauthorized.status, 401);

  const authorized = await onRequest({
    request: makeRequest("/api/quotes", {
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    quotes: [
      {
        id: "quote-1",
        name: "Customer",
        email: "customer@example.com",
        phone: "+220 1234567",
        service: "interior",
        message: "Paint two rooms.",
        createdAt: "2026-11-09T10:00:00.000Z",
      },
    ],
  });
});

test("holds new reviews for admin approval and lets admins delete published reviews", async () => {
  const env = createEnvironment();
  const response = await onRequest({
    request: makeRequest("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Reviewer",
        location: "Banjul",
        rating: 5,
        avatar: sharedPhotoAvatar,
        comment: "Great work!",
      }),
    }),
    env,
  });
  assert.equal(response.status, 201);
  const { review } = await response.json();
  assert.equal(review.status, "pending");

  const publicBeforeApproval = await onRequest({
    request: makeRequest("/api/comments"),
    env,
  });
  const firstVisitorReviews = await publicBeforeApproval.json();
  assert.ok(
    !firstVisitorReviews.comments.some((entry) => entry.id === review.id),
  );

  const pendingWithoutKey = await onRequest({
    request: makeRequest("/api/comments/pending"),
    env,
  });
  assert.equal(pendingWithoutKey.status, 401);

  const manageableWithoutKey = await onRequest({
    request: makeRequest("/api/comments/manage"),
    env,
  });
  assert.equal(manageableWithoutKey.status, 401);

  const pendingForAdmin = await onRequest({
    request: makeRequest("/api/comments/manage", {
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  const pendingReview = (await pendingForAdmin.json()).comments.find(
    (entry) => entry.id === review.id,
  );
  assert.equal(pendingReview.status, "pending");

  const approved = await onRequest({
    request: makeRequest(`/api/comments/${review.id}/approve`, {
      method: "POST",
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(approved.status, 200);

  const approvedForAdmin = await onRequest({
    request: makeRequest("/api/comments/manage", {
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  const approvedReviewForAdmin = (
    await approvedForAdmin.json()
  ).comments.find((entry) => entry.id === review.id);
  assert.equal(approvedReviewForAdmin.status, "approved");

  const publicForLaterVisitor = await onRequest({
    request: makeRequest("/api/comments"),
    env,
  });
  const publishedReview = (await publicForLaterVisitor.json()).comments.find(
    (entry) => entry.id === review.id,
  );
  assert.ok(publishedReview);
  assert.equal(publishedReview.comment, "Great work!");
  assert.equal(publishedReview.location, "Banjul");
  assert.equal(publishedReview.rating, 5);
  assert.equal(publishedReview.avatar, sharedPhotoAvatar);

  const unauthorizedDelete = await onRequest({
    request: makeRequest(`/api/comments/${review.id}`, { method: "DELETE" }),
    env,
  });
  assert.equal(unauthorizedDelete.status, 401);

  const deleted = await onRequest({
    request: makeRequest(`/api/comments/${review.id}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(deleted.status, 204);
  const publicAfterDelete = await onRequest({
    request: makeRequest("/api/comments"),
    env,
  });
  assert.ok(
    !(await publicAfterDelete.json()).comments.some(
      (entry) => entry.id === review.id,
    ),
  );
});

test("blocks cross-origin API mutations and non-JSON submissions", async () => {
  const crossOrigin = await onRequest({
    request: makeRequest("/api/comments", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({
        name: "Cross-origin",
        rating: 5,
        comment: "Should not be accepted.",
      }),
    }),
    env: createEnvironment(),
  });
  assert.equal(crossOrigin.status, 403);

  const wrongContentType = await onRequest({
    request: makeRequest("/api/comments", {
      method: "POST",
      headers: {
        Origin: "https://mmd.example",
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({
        name: "Wrong content type",
        rating: 5,
        comment: "Should not be accepted.",
      }),
    }),
    env: createEnvironment(),
  });
  assert.equal(wrongContentType.status, 415);
});

test("applies security headers and no-store caching to API responses", async () => {
  const env = createEnvironment();
  const response = await onRequest({
    request: makeRequest("/api/comments"),
    env,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
});

test("rejects invalid reviews and validates review ratings", async () => {
  const env = createEnvironment();
  const invalid = await onRequest({
    request: makeRequest("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Reviewer",
        rating: 6,
        comment: "Great work!",
      }),
    }),
    env,
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(env.tables.comments, []);
});

test("protects work uploads and stores, serves, and deletes published images", async () => {
  const env = createEnvironment();
  const denied = await onRequest({
    request: makeRequest("/api/works", {
      method: "POST",
      body: pngUpload(),
    }),
    env,
  });
  assert.equal(denied.status, 401);

  const uploaded = await onRequest({
    request: makeRequest("/api/works", {
      method: "POST",
      headers: { "X-Admin-Key": adminApiKey },
      body: pngUpload(),
    }),
    env,
  });
  assert.equal(uploaded.status, 201);
  const { work } = await uploaded.json();
  assert.equal(env.tables.works.length, 1);
  assert.ok(env.images.has(work.imageUrl.slice("/uploads/".length)));

  const image = await serveUpload({
    params: { key: work.imageUrl.slice("/uploads/".length) },
    env,
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");

  const deleted = await onRequest({
    request: makeRequest(`/api/works/${work.id}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(deleted.status, 204);
  assert.equal(env.tables.works.length, 0);
  assert.equal(env.images.size, 0);
});

test("serves static recent-work photos and deletes them without an R2 bucket", async () => {
  const env = createEnvironment();
  env.tables.works.push({
    id: "11111111-1111-4111-8111-111111111101",
    title: "Interior Wall Preparation",
    category: "Surface Preparation",
    description: "Preparing decorative interior details.",
    image_key: "static:recent-wall-preparation.png",
    created_at: "2026-11-10T07:01:00.000Z",
  });
  delete env.WORK_IMAGES;

  const listed = await onRequest({
    request: makeRequest("/api/works"),
    env,
  });
  assert.equal(listed.status, 200);
  assert.equal(
    (await listed.json()).works[0].imageUrl,
    "/images/recent-wall-preparation.png",
  );

  const deleted = await onRequest({
    request: makeRequest("/api/works/11111111-1111-4111-8111-111111111101", {
      method: "DELETE",
      headers: { "X-Admin-Key": adminApiKey },
    }),
    env,
  });
  assert.equal(deleted.status, 204);
  assert.deepEqual(env.tables.works, []);
});

test("rejects images whose bytes do not match their declared type", async () => {
  const env = createEnvironment();
  const form = new FormData();
  form.set("title", "Not an image");
  form.set("image", new Blob(["not an image"], { type: "image/png" }), "bad.png");

  const response = await onRequest({
    request: makeRequest("/api/works", {
      method: "POST",
      headers: { "X-Admin-Key": adminApiKey },
      body: form,
    }),
    env,
  });
  assert.equal(response.status, 400);
});

test("reports disabled work uploads when the R2 binding is unavailable", async () => {
  const env = createEnvironment();
  delete env.WORK_IMAGES;

  const uploadResponse = await onRequest({
    request: makeRequest("/api/works", {
      method: "POST",
      headers: { "X-Admin-Key": adminApiKey },
      body: pngUpload(),
    }),
    env,
  });
  assert.equal(uploadResponse.status, 503);

  const imageResponse = await serveUpload({
    params: { key: "123e4567-e89b-12d3-a456-426614174000.png" },
    env,
  });
  assert.equal(imageResponse.status, 503);
});

test("limits API requests by client IP", async () => {
  const env = createEnvironment();
  let response;
  for (let requestNumber = 0; requestNumber < 101; requestNumber += 1) {
    response = await onRequest({
      request: makeRequest("/api/health"),
      env,
    });
  }
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});
