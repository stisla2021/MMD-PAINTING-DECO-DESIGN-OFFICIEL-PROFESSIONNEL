import { randomUUID } from "node:crypto";
import { Router } from "express";

function readText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${field} is required.` };
  }

  const text = value.trim();
  if (text.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer.` };
  }

  return { value: text };
}

export function createCommentsRouter(store) {
  const router = Router();

  router.get("/", (_request, response) => {
    const comments = store
      .readAll()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return response.json({ comments });
  });

  router.post("/", (request, response) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Request body must be an object." });
    }

    const name = readText(body.name, "Name", 100);
    const comment = readText(body.comment, "Comment", 2000);
    const invalidField = [name, comment].find((field) => field.error);

    if (invalidField) {
      return response.status(400).json({ error: invalidField.error });
    }

    const entry = {
      id: randomUUID(),
      name: name.value,
      comment: comment.value,
      createdAt: new Date().toISOString(),
    };

    store.append(entry);
    return response.status(201).json({
      message: "Comment received.",
      comment: entry,
    });
  });

  return router;
}
