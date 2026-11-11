import { randomUUID } from "node:crypto";
import { Router } from "express";
import { isAuthorized } from "../lib/adminAuth.js";

const avatarChoices = new Set([
  "🙂",
  "😊",
  "😎",
  "🤗",
  "🎨",
  "🏠",
  "🌟",
]);
const maximumAvatarDataUrlLength = 32_000;

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

function isValidAvatar(value) {
  if (avatarChoices.has(value)) {
    return true;
  }
  if (
    typeof value !== "string" ||
    value.length > maximumAvatarDataUrlLength ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return false;
  }

  const bytes = Buffer.from(
    value.slice("data:image/jpeg;base64,".length),
    "base64",
  );
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function requireAdmin(request, response, adminApiKey) {
  if (!adminApiKey) {
    response.status(503).json({
      error:
        "Review management is not configured. Set ADMIN_API_KEY on the server.",
    });
    return false;
  }
  if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
    response.status(401).json({ error: "A valid admin key is required." });
    return false;
  }
  return true;
}

export function createCommentsRouter({ store, adminApiKey }) {
  const router = Router();

  router.get("/pending", (request, response) => {
    if (!requireAdmin(request, response, adminApiKey)) {
      return;
    }

    const comments = store
      .readAll()
      .filter((comment) => comment.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return response.json({ comments });
  });

  router.get("/manage", (request, response) => {
    if (!requireAdmin(request, response, adminApiKey)) {
      return;
    }

    const comments = store
      .readAll()
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "pending" ? -1 : 1;
        }
        return right.createdAt.localeCompare(left.createdAt);
      })
      .map((comment) => ({
        ...comment,
        location: comment.location ?? "",
        ...(comment.rating == null ? { rating: undefined } : {}),
        avatar: comment.avatar ?? "🙂",
        status: ["pending", "approved", "rejected"].includes(comment.status)
          ? comment.status
          : "approved",
      }));
    return response.json({ comments });
  });

  router.get("/", (_request, response) => {
    const comments = store
      .readAll()
      .filter((comment) => comment.status === "approved")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return response.json({ comments });
  });

  router.post("/", (request, response) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Request body must be an object." });
    }

    const name = readText(body.name, "Name", {
      required: true,
      maxLength: 100,
    });
    const location = readText(body.location ?? "", "Location", {
      maxLength: 100,
    });
    const comment = readText(body.comment, "Comment", {
      required: true,
      maxLength: 2000,
    });
    const invalidField = [name, location, comment].find((field) => field.error);
    if (invalidField) {
      return response.status(400).json({ error: invalidField.error });
    }

    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return response.status(400).json({
        error: "Rating must be a whole number from 1 to 5.",
      });
    }

    const avatar = body.avatar ?? "🙂";
    if (!isValidAvatar(avatar)) {
      return response.status(400).json({
        error: "Choose a valid emoji or resized JPEG avatar.",
      });
    }

    const review = {
      id: randomUUID(),
      name: name.value,
      location: location.value,
      rating: body.rating,
      avatar,
      comment: comment.value,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    store.append(review);
    return response.status(201).json({
      message: "Review submitted for admin approval.",
      review,
    });
  });

  router.post("/:id/approve", (request, response) => {
    if (!requireAdmin(request, response, adminApiKey)) {
      return;
    }

    const comments = store.readAll();
    const reviewIndex = comments.findIndex(
      (comment) =>
        comment.id === request.params.id && comment.status === "pending",
    );
    if (reviewIndex === -1) {
      return response.status(404).json({ error: "Pending review not found." });
    }

    comments[reviewIndex] = { ...comments[reviewIndex], status: "approved" };
    store.replaceAll(comments);
    return response.json({ message: "Review approved." });
  });

  router.delete("/:id", (request, response) => {
    if (!requireAdmin(request, response, adminApiKey)) {
      return;
    }

    const comments = store.readAll();
    const remainingComments = comments.filter(
      (comment) => comment.id !== request.params.id,
    );
    if (remainingComments.length === comments.length) {
      return response.status(404).json({ error: "Review not found." });
    }

    store.replaceAll(remainingComments);
    return response.status(204).end();
  });

  return router;
}
