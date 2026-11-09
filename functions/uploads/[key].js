export async function onRequest({ params, env }) {
  const key = params.key;
  if (typeof key !== "string" || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)) {
    return new Response("Not found.", { status: 404 });
  }
  if (!env.WORK_IMAGES) {
    return new Response("Image uploads are not configured.", { status: 503 });
  }

  const image = await env.WORK_IMAGES.get(key);
  if (!image) {
    return new Response("Not found.", { status: 404 });
  }

  return new Response(image.body, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": image.httpMetadata?.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
