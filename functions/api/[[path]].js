const maximumImageSize = 6 * 1024 * 1024;
const maximumJsonSize = 10 * 1024;
const maximumReviewJsonSize = 48 * 1024;
const maximumAnalyticsJsonSize = 2 * 1024;
const maximumAvatarDataUrlLength = 32_000;
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaximum = 100;
const reviewAvatarChoices = new Set([
  "🙂",
  "😊",
  "😎",
  "🤗",
  "🎨",
  "🏠",
  "🌟",
]);
const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const allowedServices = new Set([
  "interior",
  "exterior",
  "both",
  "cabinets",
  "commercial",
  "other",
]);
const quoteAlertRecipient = "mustaphajallow534@gmail.com";
const quoteAdminUrl = "https://mmd-painting-deco-design.pages.dev/admin";
const apiSecurityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const analyticsVisitorIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const analyticsPaths = new Set([
  "/",
  "/about",
  "/service",
  "/portfolio",
  "/comments",
  "/contact",
  "/terms",
]);

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { ...apiSecurityHeaders, ...headers },
  });
}

function errorResponse(message, status, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}

function methodNotAllowed(allowed) {
  return errorResponse("Method not allowed.", 405, { Allow: allowed });
}

async function readJson(request, maximumSize = maximumJsonSize) {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      error: errorResponse("Content-Type must be application/json.", 415),
    };
  }

  const maximumSizeLabel = `${maximumSize / 1024} KB`;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumSize) {
    return {
      error: errorResponse(
        `Request body must be ${maximumSizeLabel} or smaller.`,
        413,
      ),
    };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumSize) {
    return {
      error: errorResponse(
        `Request body must be ${maximumSizeLabel} or smaller.`,
        413,
      ),
    };
  }

  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: errorResponse("Request body must be an object.", 400) };
    }
    return { body };
  } catch {
    return { error: errorResponse("Request body must be valid JSON.", 400) };
  }
}

function readText(value, field, { required = false, maxLength }) {
  if (typeof value !== "string") {
    return { error: `${field} must be a string.` };
  }
  const text = value.trim();
  if (required && !text) {
    return { error: `${field} is required.` };
  }
  if (text.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer.` };
  }
  return { value: text };
}

async function sendQuoteAlert(env) {
  if (!env.RESEND_API_KEY || !env.QUOTE_ALERT_FROM) {
    console.error(
      "Quote email alert is not configured; set RESEND_API_KEY and QUOTE_ALERT_FROM.",
    );
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.QUOTE_ALERT_FROM,
        to: [env.QUOTE_ALERT_TO || quoteAlertRecipient],
        subject: "New quote request | MMD PAINTING",
        text: `A new quote request was received. Open the protected admin inbox to review it: ${quoteAdminUrl}`,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(
        "Resend rejected the quote email alert.",
        response.status,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Could not send the quote email alert.", error);
    return false;
  }
}

async function isAuthorized(request, configuredKey) {
  const providedKey = request.headers.get("x-admin-key");
  if (!configuredKey || !providedKey) {
    return false;
  }

  const encoder = new TextEncoder();
  const [providedDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedKey)),
    crypto.subtle.digest("SHA-256", encoder.encode(configuredKey)),
  ]);
  const providedBytes = new Uint8Array(providedDigest);
  const configuredBytes = new Uint8Array(configuredDigest);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ configuredBytes[index];
  }
  return difference === 0;
}

async function authorize(request, env) {
  if (!env.ADMIN_API_KEY) {
    return errorResponse(
      "Work management is not configured. Set the ADMIN_API_KEY secret.",
      503,
    );
  }
  if (!(await isAuthorized(request, env.ADMIN_API_KEY))) {
    return errorResponse("A valid admin key is required.", 401);
  }
  return null;
}

async function enforceRateLimit(request, env) {
  const now = Date.now();
  const windowStart = Math.floor(now / rateLimitWindowMs) * rateLimitWindowMs;
  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  await env.DB.prepare(
    "DELETE FROM api_rate_limits WHERE window_start < ?",
  )
    .bind(windowStart)
    .run();

  const record = await env.DB.prepare(
    `INSERT INTO api_rate_limits (ip, window_start, request_count)
     VALUES (?, ?, 1)
     ON CONFLICT (ip, window_start)
     DO UPDATE SET request_count = request_count + 1
     RETURNING request_count`,
  )
    .bind(clientIp, windowStart)
    .first();

  if (record.request_count > rateLimitMaximum) {
    const retryAfter = Math.ceil(
      (windowStart + rateLimitWindowMs - now) / 1000,
    );
    return errorResponse("Too many requests. Please try again later.", 429, {
      "Retry-After": String(retryAfter),
    });
  }
  return null;
}

function hasImageSignature(bytes, mimeType) {
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function getQuotes(request, env) {
  if (request.method === "GET") {
    const authorizationError = await authorize(request, env);
    if (authorizationError) {
      return authorizationError;
    }

    const { results } = await env.DB.prepare(
      `SELECT id, name, email, phone, service, message, created_at
       FROM quotes
       ORDER BY created_at DESC, id DESC`,
    ).all();
    return jsonResponse({
      quotes: results.map(
        ({ id, name, email, phone, service, message, created_at }) => ({
          id,
          name,
          email,
          phone,
          service,
          message,
          createdAt: created_at,
        }),
      ),
    });
  }
  if (request.method !== "POST") {
    return methodNotAllowed("GET, POST");
  }
  const parsed = await readJson(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { body } = parsed;
  const name = readText(body.name, "Name", { required: true, maxLength: 100 });
  const email = readText(body.email, "Email", { required: true, maxLength: 254 });
  const phone = readText(body.phone ?? "", "Phone", { maxLength: 40 });
  const service = readText(body.service, "Service", {
    required: true,
    maxLength: 40,
  });
  const message = readText(body.message ?? "", "Message", { maxLength: 5000 });
  const invalidField = [name, email, phone, service, message].find(
    (field) => field.error,
  );
  if (invalidField) {
    return errorResponse(invalidField.error, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return errorResponse("Please provide a valid email address.", 400);
  }
  if (!allowedServices.has(service.value)) {
    return errorResponse("Please choose a valid service.", 400);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO quotes (id, name, email, phone, service, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name.value,
      email.value,
      phone.value,
      service.value,
      message.value,
      createdAt,
    )
    .run();

  const notificationSent = await sendQuoteAlert(env);
  return jsonResponse(
    {
      message: "Quote request received.",
      notificationSent,
      quote: { id, createdAt },
    },
    201,
  );
}

function normalizeAnalyticsPath(value) {
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("/")) {
    return null;
  }

  const path = value.split(/[?#]/, 1)[0].replace(/\.html$/, "");
  const normalizedPath = path === "/index" ? "/" : path;
  return analyticsPaths.has(normalizedPath) ? normalizedPath : null;
}

function isValidAnalyticsDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getAnalyticsDateRange(url) {
  const startDate = url.searchParams.get("start");
  const endDate = url.searchParams.get("end");
  if (
    !startDate ||
    !endDate ||
    !isValidAnalyticsDate(startDate) ||
    !isValidAnalyticsDate(endDate)
  ) {
    return { error: errorResponse("Choose valid start and end dates.", 400) };
  }

  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const currentDate = new Date().toISOString().slice(0, 10);
  if (
    start > end ||
    end > Date.parse(`${currentDate}T00:00:00.000Z`) ||
    Math.floor((end - start) / 86_400_000) + 1 > 365
  ) {
    return {
      error: errorResponse(
        "The date range must be within the last 365 days and end today or earlier.",
        400,
      ),
    };
  }

  return { startDate, endDate };
}

async function recordAnalyticsPageView(request, env) {
  if (request.method !== "POST") {
    return methodNotAllowed("GET, POST");
  }

  const parsed = await readJson(request, maximumAnalyticsJsonSize);
  if (parsed.error) {
    return parsed.error;
  }

  const pagePath = normalizeAnalyticsPath(parsed.body.path);
  if (!pagePath) {
    return errorResponse("Choose a valid public page path.", 400);
  }
  const visitorId = parsed.body.visitorId ?? null;
  if (
    visitorId !== null &&
    (typeof visitorId !== "string" ||
      !analyticsVisitorIdPattern.test(visitorId))
  ) {
    return errorResponse("The anonymous visitor ID is invalid.", 400);
  }

  const visitDay = new Date().toISOString().slice(0, 10);
  const retentionCutoff = new Date(Date.now() - 399 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const statements = [
    env.DB.prepare("DELETE FROM analytics_daily_views WHERE visit_day < ?").bind(
      retentionCutoff,
    ),
    env.DB.prepare(
      "DELETE FROM analytics_daily_visitors WHERE visit_day < ?",
    ).bind(retentionCutoff),
    env.DB.prepare(
      `INSERT INTO analytics_daily_views (visit_day, page_path, view_count)
       VALUES (?, ?, 1)
       ON CONFLICT (visit_day, page_path)
       DO UPDATE SET view_count = view_count + 1`,
    ).bind(visitDay, pagePath),
  ];

  if (visitorId) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(visitorId),
    );
    const visitorHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO analytics_daily_visitors (visitor_hash, visit_day)
         VALUES (?, ?)`,
      ).bind(visitorHash, visitDay),
    );
  }

  await env.DB.batch(statements);
  return new Response(null, { status: 204, headers: apiSecurityHeaders });
}

async function getAnalytics(request, env, url) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET, POST");
  }

  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }

  const range = getAnalyticsDateRange(url);
  if (range.error) {
    return range.error;
  }

  const retentionCutoff = new Date(Date.now() - 399 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM analytics_daily_views WHERE visit_day < ?").bind(
      retentionCutoff,
    ),
    env.DB.prepare(
      "DELETE FROM analytics_daily_visitors WHERE visit_day < ?",
    ).bind(retentionCutoff),
  ]);

  const { startDate, endDate } = range;
  const [totalViews, totalVisitors, dailyViews, dailyVisitors, pages] =
    await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(SUM(view_count), 0) AS page_views
         FROM analytics_daily_views WHERE visit_day BETWEEN ? AND ?`,
      )
        .bind(startDate, endDate)
        .first(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT visitor_hash) AS unique_visitors
         FROM analytics_daily_visitors WHERE visit_day BETWEEN ? AND ?`,
      )
        .bind(startDate, endDate)
        .first(),
      env.DB.prepare(
        `SELECT visit_day, SUM(view_count) AS page_views
         FROM analytics_daily_views WHERE visit_day BETWEEN ? AND ?
         GROUP BY visit_day ORDER BY visit_day`,
      )
        .bind(startDate, endDate)
        .all(),
      env.DB.prepare(
        `SELECT visit_day, COUNT(*) AS unique_visitors
         FROM analytics_daily_visitors WHERE visit_day BETWEEN ? AND ?
         GROUP BY visit_day ORDER BY visit_day`,
      )
        .bind(startDate, endDate)
        .all(),
      env.DB.prepare(
        `SELECT page_path, SUM(view_count) AS page_views
         FROM analytics_daily_views WHERE visit_day BETWEEN ? AND ?
         GROUP BY page_path ORDER BY page_views DESC, page_path LIMIT 10`,
      )
        .bind(startDate, endDate)
        .all(),
    ]);

  const viewsByDay = new Map(
    dailyViews.results.map((row) => [row.visit_day, Number(row.page_views)]),
  );
  const visitorsByDay = new Map(
    dailyVisitors.results.map((row) => [
      row.visit_day,
      Number(row.unique_visitors),
    ]),
  );
  const daily = [];
  for (
    let date = new Date(`${startDate}T00:00:00.000Z`);
    date <= new Date(`${endDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    daily.push({
      date: day,
      pageViews: viewsByDay.get(day) ?? 0,
      uniqueVisitors: visitorsByDay.get(day) ?? 0,
    });
  }

  return jsonResponse({
    startDate,
    endDate,
    totals: {
      pageViews: Number(totalViews?.page_views ?? 0),
      uniqueVisitors: Number(totalVisitors?.unique_visitors ?? 0),
    },
    daily,
    pages: pages.results.map((row) => ({
      path: row.page_path,
      pageViews: Number(row.page_views),
    })),
  });
}

async function getComments(request, env) {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, name, location, rating, avatar, comment, created_at
       FROM comments
       WHERE status = 'approved'
       ORDER BY created_at DESC, id DESC`,
    ).all();
    return jsonResponse({
      comments: results.map((comment) => ({
        id: comment.id,
        name: comment.name,
        location: comment.location,
        ...(comment.rating === null ? {} : { rating: comment.rating }),
        avatar: comment.avatar,
        comment: comment.comment,
        createdAt: comment.created_at,
      })),
    });
  }
  if (request.method !== "POST") {
    return methodNotAllowed("GET, POST");
  }
  const parsed = await readJson(request, maximumReviewJsonSize);
  if (parsed.error) {
    return parsed.error;
  }

  const name = readText(parsed.body.name, "Name", {
    required: true,
    maxLength: 100,
  });
  const location = readText(parsed.body.location ?? "", "Location", {
    maxLength: 100,
  });
  const comment = readText(parsed.body.comment, "Comment", {
    required: true,
    maxLength: 2000,
  });
  const invalidField = [name, location, comment].find((field) => field.error);
  if (invalidField) {
    return errorResponse(invalidField.error, 400);
  }

  const rating = parsed.body.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return errorResponse("Rating must be a whole number from 1 to 5.", 400);
  }

  const avatar = parsed.body.avatar ?? "🙂";
  if (
    typeof avatar !== "string" ||
    (!reviewAvatarChoices.has(avatar) &&
      (avatar.length > maximumAvatarDataUrlLength ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))
  ) {
    return errorResponse("Choose a valid emoji or resized JPEG avatar.", 400);
  }
  if (!reviewAvatarChoices.has(avatar)) {
    let photoBytes;
    try {
      photoBytes = Uint8Array.from(
        atob(avatar.slice("data:image/jpeg;base64,".length)),
        (character) => character.charCodeAt(0),
      );
    } catch {
      return errorResponse("Choose a valid emoji or resized JPEG avatar.", 400);
    }
    if (!hasImageSignature(photoBytes, "image/jpeg")) {
      return errorResponse("Choose a valid emoji or resized JPEG avatar.", 400);
    }
  }

  const entry = {
    id: crypto.randomUUID(),
    name: name.value,
    location: location.value,
    rating,
    avatar,
    comment: comment.value,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await env.DB.prepare(
    `INSERT INTO comments
     (id, name, location, rating, avatar, comment, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      entry.id,
      entry.name,
      entry.location,
      entry.rating,
      entry.avatar,
      entry.comment,
      entry.createdAt,
      entry.status,
    )
    .run();
  return jsonResponse(
    { message: "Review submitted for admin approval.", review: entry },
    201,
  );
}

async function getManageableComments(request, env) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, location, rating, avatar, comment, created_at, status
     FROM comments
     ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
              created_at DESC, id DESC`,
  ).all();
  return jsonResponse({
    comments: results.map((comment) => ({
      id: comment.id,
      name: comment.name,
      location: comment.location,
      ...(comment.rating === null ? {} : { rating: comment.rating }),
      avatar: comment.avatar,
      comment: comment.comment,
      createdAt: comment.created_at,
      status: comment.status,
    })),
  });
}

async function getPendingComments(request, env) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, location, rating, avatar, comment, created_at
     FROM comments
     WHERE status = 'pending'
     ORDER BY created_at ASC, id ASC`,
  ).all();
  return jsonResponse({
    comments: results.map((comment) => ({
      id: comment.id,
      name: comment.name,
      location: comment.location,
      ...(comment.rating === null ? {} : { rating: comment.rating }),
      avatar: comment.avatar,
      comment: comment.comment,
      createdAt: comment.created_at,
    })),
  });
}

async function approveComment(request, env, id) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }

  const updated = await env.DB.prepare(
    `UPDATE comments SET status = 'approved'
     WHERE id = ? AND status = 'pending'
     RETURNING id`,
  )
    .bind(id)
    .first();
  if (!updated) {
    return errorResponse("Pending review not found.", 404);
  }
  return jsonResponse({ message: "Review approved." });
}

async function deleteComment(request, env, id) {
  if (request.method !== "DELETE") {
    return methodNotAllowed("DELETE");
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }

  const deleted = await env.DB.prepare(
    "DELETE FROM comments WHERE id = ? RETURNING id",
  )
    .bind(id)
    .first();
  if (!deleted) {
    return errorResponse("Review not found.", 404);
  }
  return new Response(null, { status: 204, headers: apiSecurityHeaders });
}

async function getWorks(request, env) {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, category, description, image_key, created_at
       FROM works
       ORDER BY created_at DESC, id DESC`,
    ).all();
    return jsonResponse({
      works: results.map((work) => ({
        id: work.id,
        title: work.title,
        category: work.category,
        description: work.description,
        imageUrl: work.image_key.startsWith("static:")
          ? `/images/${work.image_key.slice("static:".length)}`
          : `/uploads/${work.image_key}`,
        createdAt: work.created_at,
      })),
    });
  }
  if (request.method !== "POST") {
    return methodNotAllowed("GET, POST");
  }

  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }
  if (!env.WORK_IMAGES) {
    return errorResponse(
      "Work uploads are not configured. Configure the WORK_IMAGES R2 binding.",
      503,
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumImageSize + 16 * 1024) {
    return errorResponse("Image files must be 6 MB or smaller.", 413);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Request must be valid multipart form data.", 400);
  }
  const titleValue = formData.get("title");
  const categoryValue = formData.get("category") ?? "";
  const descriptionValue = formData.get("description") ?? "";
  const imageValues = formData.getAll("image");
  if (
    typeof titleValue !== "string" ||
    !titleValue.trim() ||
    titleValue.trim().length > 120
  ) {
    return errorResponse("Title is required and must be 120 characters or fewer.", 400);
  }
  if (
    typeof categoryValue !== "string" ||
    categoryValue.length > 80 ||
    typeof descriptionValue !== "string" ||
    descriptionValue.length > 1000
  ) {
    return errorResponse("Category or description exceeds the allowed length.", 400);
  }
  if (imageValues.length !== 1 || typeof imageValues[0] === "string") {
    return errorResponse("Choose exactly one image to upload.", 400);
  }

  const image = imageValues[0];
  const extension = imageTypes.get(image.type);
  if (!extension) {
    return errorResponse("Upload a JPEG, PNG, or WebP image.", 400);
  }
  if (image.size > maximumImageSize) {
    return errorResponse("Image files must be 6 MB or smaller.", 413);
  }
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  if (!hasImageSignature(imageBytes, image.type)) {
    return errorResponse(
      "The uploaded file does not match its JPEG, PNG, or WebP type.",
      400,
    );
  }

  const id = crypto.randomUUID();
  const imageKey = `${id}${extension}`;
  const createdAt = new Date().toISOString();
  await env.WORK_IMAGES.put(imageKey, imageBytes, {
    httpMetadata: { contentType: image.type },
  });

  try {
    await env.DB.prepare(
      `INSERT INTO works
       (id, title, category, description, image_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        titleValue.trim(),
        categoryValue.trim(),
        descriptionValue.trim(),
        imageKey,
        createdAt,
      )
      .run();
  } catch (error) {
    try {
      await env.WORK_IMAGES.delete(imageKey);
    } catch (cleanupError) {
      console.error("Could not remove the image after a failed database write.", cleanupError);
    }
    throw error;
  }

  return jsonResponse(
    {
      work: {
        id,
        title: titleValue.trim(),
        category: categoryValue.trim(),
        description: descriptionValue.trim(),
        imageUrl: `/uploads/${imageKey}`,
        createdAt,
      },
    },
    201,
  );
}

async function deleteWork(request, env, encodedId) {
  if (request.method !== "DELETE") {
    return methodNotAllowed("DELETE");
  }
  const authorizationError = await authorize(request, env);
  if (authorizationError) {
    return authorizationError;
  }
  let id;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    return errorResponse("Work item not found.", 404);
  }
  const work = await env.DB.prepare(
    "SELECT id, image_key FROM works WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!work) {
    return errorResponse("Work item not found.", 404);
  }
  if (!work.image_key.startsWith("static:") && !env.WORK_IMAGES) {
    return errorResponse(
      "Work uploads are not configured. Configure the WORK_IMAGES R2 binding.",
      503,
    );
  }

  await env.DB.prepare("DELETE FROM works WHERE id = ?").bind(id).run();
  if (!work.image_key.startsWith("static:")) {
    await env.WORK_IMAGES.delete(work.image_key);
  }
  return new Response(null, { status: 204, headers: apiSecurityHeaders });
}

function validateMutationOrigin(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return null;
  }

  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return errorResponse("Cross-origin requests are not allowed.", 403);
  }
  return null;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  try {
    const originError = validateMutationOrigin(request);
    if (originError) {
      return originError;
    }
    const rateLimitResponse = await enforceRateLimit(request, env);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (url.pathname === "/api/health") {
      return request.method === "GET"
        ? jsonResponse({ status: "ok" })
        : methodNotAllowed("GET");
    }
    if (url.pathname === "/api/quotes") {
      return await getQuotes(request, env);
    }
    if (url.pathname === "/api/analytics") {
      return request.method === "POST"
        ? await recordAnalyticsPageView(request, env)
        : await getAnalytics(request, env, url);
    }
    if (url.pathname === "/api/comments") {
      return await getComments(request, env);
    }
    if (url.pathname === "/api/comments/pending") {
      return await getPendingComments(request, env);
    }
    if (url.pathname === "/api/comments/manage") {
      return await getManageableComments(request, env);
    }
    const commentApprovalMatch = url.pathname.match(
      /^\/api\/comments\/([^/]+)\/approve$/,
    );
    if (commentApprovalMatch) {
      return await approveComment(request, env, commentApprovalMatch[1]);
    }
    const commentMatch = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (commentMatch) {
      return await deleteComment(request, env, commentMatch[1]);
    }
    if (url.pathname === "/api/works") {
      return await getWorks(request, env);
    }
    if (url.pathname === "/api/works/verify") {
      if (request.method !== "POST") {
        return methodNotAllowed("POST");
      }
      const authorizationError = await authorize(request, env);
      return authorizationError ?? jsonResponse({ authenticated: true });
    }

    const workMatch = url.pathname.match(/^\/api\/works\/([^/]+)$/);
    if (workMatch) {
      return await deleteWork(request, env, workMatch[1]);
    }
    return errorResponse("Endpoint not found.", 404);
  } catch (error) {
    console.error("Cloudflare API request failed.", error);
    return errorResponse("An unexpected server error occurred.", 500);
  }
}
