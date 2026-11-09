import { randomUUID } from "node:crypto";
import { Router } from "express";
import { isAuthorized } from "../lib/adminAuth.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedServices = new Set([
  "interior",
  "exterior",
  "both",
  "cabinets",
  "commercial",
  "other",
]);
const quoteAlertRecipient = "mustaphajallow534@gmail.com";
const quoteAdminUrl = "https://mmd-painting-deco-design.pages.dev/admin";

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

async function sendQuoteAlert(emailConfig) {
  if (!emailConfig.RESEND_API_KEY || !emailConfig.QUOTE_ALERT_FROM) {
    console.error(
      "Quote email alert is not configured; set RESEND_API_KEY and QUOTE_ALERT_FROM.",
    );
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailConfig.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailConfig.QUOTE_ALERT_FROM,
        to: [emailConfig.QUOTE_ALERT_TO || quoteAlertRecipient],
        subject: "New quote request | MMD PAINTING",
        text: `A new quote request was received. Open the protected admin inbox to review it: ${quoteAdminUrl}`,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(
        "Resend rejected the quote email alert.",
        response.status,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Could not send the quote email alert.", error);
    return false;
  }
}

export function createQuotesRouter({
  store,
  adminApiKey,
  emailConfig = process.env,
}) {
  const router = Router();

  router.get("/", (request, response) => {
    if (!adminApiKey) {
      return response.status(503).json({
        error: "Work management is not configured. Set ADMIN_API_KEY on the server.",
      });
    }
    if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
      return response.status(401).json({ error: "A valid admin key is required." });
    }

    const quotes = store
      .readAll()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return response.json({ quotes });
  });

  router.post("/", async (request, response) => {
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
    const notificationSent = await sendQuoteAlert(emailConfig);
    return response.status(201).json({
      message: "Quote request received.",
      notificationSent,
      quote: { id: quote.id, createdAt: quote.createdAt },
    });
  });

  return router;
}
