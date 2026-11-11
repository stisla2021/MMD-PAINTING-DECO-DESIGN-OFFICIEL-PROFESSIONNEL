const verificationFile = "google-site-verification: google16df5d513870464f.html\n";
const verificationHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
};

export function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...verificationHeaders, Allow: "GET, HEAD" },
    });
  }

  return new Response(request.method === "HEAD" ? null : verificationFile, {
    headers: {
      ...verificationHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
