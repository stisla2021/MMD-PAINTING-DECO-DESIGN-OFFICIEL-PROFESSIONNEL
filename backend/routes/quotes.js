import { randomUUID } from "node:crypto";
import { Router } from "express";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedServices = new Set([
  "interior",
  "exterior",
  "both",
  "cabinets",
  "commercial",
  "other",
]);

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

export function createQuotesRouter(store) {
  const router = Router();

  router.post("/", (request, response) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Request body must be an object." });
    }

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
      return response.status(400).json({ error: invalidField.error });
    }

    if (!emailPattern.test(email.value)) {
      return response.status(400).json({ error: "Please provide a valid email address." });
    }
    if (!allowedServices.has(service.value)) {
      return response.status(400).json({ error: "Please choose a valid service." });
    }

    const quote = {
      id: randomUUID(),
      name: name.value,
      email: email.value,
      phone: phone.value,
      service: service.value,
      message: message.value,
      createdAt: new Date().toISOString(),
    };

    store.append(quote);
    return response.status(201).json({
      message: "Quote request received.",
      quote: { id: quote.id, createdAt: quote.createdAt },
    });
  });

  return router;
}
