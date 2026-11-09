const maximumImageSize = 6 * 1024 * 1024;
const maximumJsonSize = 10 * 1024;
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaximum = 100;
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

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers });
}

function errorResponse(message, status, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}

function methodNotAllowed(allowed) {
  return errorResponse("Method not allowed.", 405, { Allow: allowed });
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumJsonSize) {
    return { error: errorResponse("Request body must be 10 KB or smaller.", 413) };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumJsonSize) {
    return { error: errorResponse("Request body must be 10 KB or smaller.", 413) };
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
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
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

  return jsonResponse(
    { message: "Quote request received.", quote: { id, createdAt } },
    201,
  );
}

async function getComments(request, env) {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, name, comment, created_at
       FROM comments
       ORDER BY created_at DESC, id DESC`,
    ).all();
    return jsonResponse({
      comments: results.map(({ id, name, comment, created_at }) => ({
        id,
        name,
        comment,
        createdAt: created_at,
      })),
    });
  }
  if (request.method !== "POST") {
    return methodNotAllowed("GET, POST");
  }
  const parsed = await readJson(request);
  if (parsed.error) {
    return parsed.error;
  }

  const name = readText(parsed.body.name, "Name", {
    required: true,
    maxLength: 100,
  });
  const comment = readText(parsed.body.comment, "Comment", {
    required: true,
    maxLength: 2000,
  });
  const invalidField = [name, comment].find((field) => field.error);
  if (invalidField) {
    return errorResponse(invalidField.error, 400);
  }

  const entry = {
    id: crypto.randomUUID(),
    name: name.value,
    comment: comment.value,
    createdAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    "INSERT INTO comments (id, name, comment, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(entry.id, entry.name, entry.comment, entry.createdAt)
    .run();
  return jsonResponse({ message: "Comment received.", comment: entry }, 201);
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
        imageUrl: `/uploads/${work.image_key}`,
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
  if (!env.WORK_IMAGES) {
    return errorResponse(
      "Work uploads are not configured. Configure the WORK_IMAGES R2 binding.",
      503,
    );
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

  await env.DB.prepare("DELETE FROM works WHERE id = ?").bind(id).run();
  await env.WORK_IMAGES.delete(work.image_key);
  return new Response(null, { status: 204 });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  try {
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
    if (url.pathname === "/api/comments") {
      return await getComments(request, env);
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
