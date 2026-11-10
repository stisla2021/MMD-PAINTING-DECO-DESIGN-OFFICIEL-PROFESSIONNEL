const verificationFile = "google-site-verification: google16df5d513870464f.html\n";

export function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  return new Response(request.method === "HEAD" ? null : verificationFile, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
