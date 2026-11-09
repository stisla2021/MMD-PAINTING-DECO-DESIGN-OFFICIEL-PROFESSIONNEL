import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJsonStore } from "./lib/jsonStore.js";
import { createCommentsRouter } from "./routes/comments.js";
import { createQuotesRouter } from "./routes/quotes.js";
import { createWorksRouter } from "./routes/works.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  dataDirectory = path.join(backendDirectory, "data"),
  uploadsDirectory = path.join(backendDirectory, "uploads"),
  adminApiKey = process.env.ADMIN_API_KEY,
} = {}) {
  const app = express();
  mkdirSync(uploadsDirectory, { recursive: true });
  const developmentOrigins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];
  const allowedOrigins = new Set(
    process.env.FRONTEND_ORIGINS === undefined
      ? process.env.NODE_ENV === "production"
        ? []
        : developmentOrigins
      : process.env.FRONTEND_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        const error = new Error("Origin is not allowed by CORS.");
        error.status = 403;
        return callback(error);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Admin-Key"],
    }),
  );
  app.use(express.json({ limit: "10kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.use(
    "/uploads",
    express.static(uploadsDirectory, {
      dotfiles: "deny",
      index: false,
      maxAge: "1d",
    }),
  );
  app.use(
    "/api/quotes",
    createQuotesRouter({
      store: createJsonStore(path.join(dataDirectory, "quotes.json")),
      adminApiKey,
      emailConfig: process.env,
    }),
  );
  app.use(
    "/api/comments",
    createCommentsRouter(createJsonStore(path.join(dataDirectory, "comments.json"))),
  );
  app.use(
    "/api/works",
    createWorksRouter({
      store: createJsonStore(path.join(dataDirectory, "works.json")),
      adminApiKey,
      uploadsDirectory,
    }),
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "Endpoint not found." });
  });

  app.use((error, _request, response, _next) => {
    const status =
      Number.isInteger(error.status)
        ? error.status
        : error.code === "LIMIT_FILE_SIZE"
          ? 413
          : error.code?.startsWith("LIMIT_")
            ? 400
            : 500;
    if (status >= 500) {
      console.error(error);
    }

    response.status(status).json({
      error:
        status >= 500
          ? "An unexpected server error occurred."
          : status === 413
            ? "Image files must be 6 MB or smaller."
            : error.message,
    });
  });

  return app;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  createApp().listen(port, () => {
    console.log(`MMD DECO Design API listening on http://localhost:${port}`);
  });
}
