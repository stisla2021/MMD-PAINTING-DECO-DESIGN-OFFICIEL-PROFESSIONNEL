const uploadSecurityHeaders = {
  "Cache-Control": "public, max-age=86400",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
};
const uploadContentTypes = new Map([
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

function uploadResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      ...uploadSecurityHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function onRequest({ params, env }) {
  const key = params.key;
  const keyMatch =
    typeof key === "string" &&
    key.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/,
    );
  if (!keyMatch) {
    return uploadResponse("Not found.", 404);
  }
  if (!env.WORK_IMAGES) {
    return uploadResponse("Image uploads are not configured.", 503);
  }

  const image = await env.WORK_IMAGES.get(key);
  if (!image) {
    return uploadResponse("Not found.", 404);
  }

  return new Response(image.body, {
    headers: {
      ...uploadSecurityHeaders,
      "Content-Type": uploadContentTypes.get(keyMatch[1]),
    },
  });
}
