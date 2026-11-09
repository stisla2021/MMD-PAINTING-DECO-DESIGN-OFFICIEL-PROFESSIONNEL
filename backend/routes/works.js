import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { isAuthorized } from "../lib/adminAuth.js";

const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const maximumImageSize = 6 * 1024 * 1024;

function removeUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function imageHasValidSignature(filePath, mimeType) {
  const file = readFileSync(filePath);

  if (mimeType === "image/png") {
    return (
      file.length >= 8 &&
      file.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (mimeType === "image/jpeg") {
    return (
      file.length >= 3 &&
      file[0] === 0xff &&
      file[1] === 0xd8 &&
      file[2] === 0xff
    );
  }
  if (mimeType === "image/webp") {
    return (
      file.length >= 12 &&
      file.toString("ascii", 0, 4) === "RIFF" &&
      file.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

export function createWorksRouter({ store, adminApiKey, uploadsDirectory }) {
  const router = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDirectory,
      filename(_request, file, callback) {
        callback(null, `${randomUUID()}${imageTypes.get(file.mimetype)}`);
      },
    }),
    limits: { fileSize: maximumImageSize, files: 1 },
    fileFilter(_request, file, callback) {
      if (!imageTypes.has(file.mimetype)) {
        const error = new Error("Upload a JPEG, PNG, or WebP image.");
        error.status = 400;
        callback(error);
        return;
      }

      callback(null, true);
    },
  });

  router.get("/", (_request, response) => {
    const works = store
      .readAll()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    response.json({ works });
  });

  router.post("/verify", (request, response) => {
    if (!adminApiKey) {
      response.status(503).json({
        error: "Work management is not configured. Set ADMIN_API_KEY on the server.",
      });
      return;
    }
    if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
      response.status(401).json({ error: "A valid admin key is required." });
      return;
    }

    response.json({ authenticated: true });
  });

  router.post("/", (request, response, next) => {
    if (!adminApiKey) {
      response.status(503).json({
        error: "Work uploads are not configured. Set ADMIN_API_KEY on the server.",
      });
      return;
    }
    if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
      response.status(401).json({ error: "A valid admin key is required." });
      return;
    }

    upload.single("image")(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }

      const { title, category = "", description = "" } = request.body ?? {};
      if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
        removeUploadedFile(request.file?.path);
        response.status(400).json({
          error: "Title is required and must be 120 characters or fewer.",
        });
        return;
      }
      if (
        typeof category !== "string" ||
        category.length > 80 ||
        typeof description !== "string" ||
        description.length > 1000
      ) {
        removeUploadedFile(request.file?.path);
        response.status(400).json({
          error: "Category or description exceeds the allowed length.",
        });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: "Choose an image to upload." });
        return;
      }
      if (!imageHasValidSignature(request.file.path, request.file.mimetype)) {
        removeUploadedFile(request.file.path);
        response.status(400).json({
          error: "The uploaded file does not match its JPEG, PNG, or WebP type.",
        });
        return;
      }

      const work = {
        id: randomUUID(),
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        imageUrl: `/uploads/${path.basename(request.file.filename)}`,
        createdAt: new Date().toISOString(),
      };

      try {
        store.append(work);
      } catch (storeError) {
        removeUploadedFile(request.file.path);
        next(storeError);
        return;
      }

      response.status(201).json({ work });
    });
  });

  router.delete("/:id", (request, response) => {
    if (!adminApiKey) {
      response.status(503).json({
        error: "Work management is not configured. Set ADMIN_API_KEY on the server.",
      });
      return;
    }
    if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
      response.status(401).json({ error: "A valid admin key is required." });
      return;
    }

    const works = store.readAll();
    const work = works.find((entry) => entry.id === request.params.id);
    if (!work) {
      response.status(404).json({ error: "Work item not found." });
      return;
    }

    store.replaceAll(works.filter((entry) => entry.id !== work.id));
    removeUploadedFile(
      path.join(uploadsDirectory, path.basename(work.imageUrl)),
    );
    response.status(204).end();
  });

  return router;
}

export { maximumImageSize };
