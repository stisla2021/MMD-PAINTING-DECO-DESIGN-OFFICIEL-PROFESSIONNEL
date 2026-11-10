import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);
const port = Number(process.env.FRONTEND_PORT ?? 8000);
const host = process.env.FRONTEND_HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("FRONTEND_PORT must be an integer between 1 and 65535.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(frontendDirectory, `.${relativePath}`);
    const localPath = path.relative(frontendDirectory, filePath);

    if (
      localPath === ".." ||
      localPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(localPath)
    ) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const contentType = contentTypes.get(path.extname(filePath).toLowerCase());
    if (!contentType) {
      response.writeHead(404).end("Not found");
      return;
    }

    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileInfo.size,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const fileStream = createReadStream(filePath);
    fileStream.on("error", (error) => {
      console.error("Could not read frontend file:", error);
      if (!response.headersSent) {
        response.writeHead(500).end("Could not read file");
      } else {
        response.destroy(error);
      }
    });
    fileStream.pipe(response);
  } catch (error) {
    if (error instanceof URIError) {
      response.writeHead(400).end("Invalid URL");
    } else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      response.writeHead(404).end("Not found");
    } else {
      console.error("Could not serve frontend request:", error);
      response.writeHead(500).end("Unexpected server error");
    }
  }
});

server.on("error", (error) => {
  console.error("Frontend development server failed:", error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Frontend development server listening on http://localhost:${port}`);
});
