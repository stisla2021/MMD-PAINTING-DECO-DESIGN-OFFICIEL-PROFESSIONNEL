import { createHash } from "node:crypto";
import { Router } from "express";
import { isAuthorized } from "../lib/adminAuth.js";

const visitorIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedPaths = new Set([
  "/",
  "/about",
  "/service",
  "/portfolio",
  "/comments",
  "/contact",
  "/terms",
]);
const maximumStoredDays = 400;

function normalizePath(value) {
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("/")) {
    return null;
  }

  const path = value.split(/[?#]/, 1)[0].replace(/\.html$/, "");
  const normalizedPath = path === "/index" ? "/" : path;
  return allowedPaths.has(normalizedPath) ? normalizedPath : null;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readDateRange(query) {
  const { start, end } = query;
  if (!isValidDate(start) || !isValidDate(end)) {
    return { error: "Choose valid start and end dates." };
  }

  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  const today = new Date().toISOString().slice(0, 10);
  if (
    startTime > endTime ||
    endTime > Date.parse(`${today}T00:00:00.000Z`) ||
    Math.floor((endTime - startTime) / 86_400_000) + 1 > 365
  ) {
    return {
      error:
        "The date range must be within the last 365 days and end today or earlier.",
    };
  }
  return { start, end };
}

function createDailyRows(start, end, viewsByDay, visitorsByDay) {
  const daily = [];
  for (
    let date = new Date(`${start}T00:00:00.000Z`);
    date <= new Date(`${end}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    daily.push({
      date: day,
      pageViews: viewsByDay.get(day) ?? 0,
      uniqueVisitors: visitorsByDay.get(day)?.size ?? 0,
    });
  }
  return daily;
}

export function createAnalyticsRouter({ store, adminApiKey }) {
  const router = Router();

  router.post("/", (request, response) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response.status(400).json({ error: "Request body must be an object." });
    }

    const pagePath = normalizePath(body.path);
    if (!pagePath) {
      return response.status(400).json({ error: "Choose a valid public page path." });
    }

    const visitorId = body.visitorId ?? null;
    if (
      visitorId !== null &&
      (typeof visitorId !== "string" || !visitorIdPattern.test(visitorId))
    ) {
      return response
        .status(400)
        .json({ error: "The anonymous visitor ID is invalid." });
    }

    const visitorHash = visitorId
      ? createHash("sha256").update(visitorId).digest("hex")
      : null;
    const visitDay = new Date().toISOString().slice(0, 10);
    const retentionCutoff = new Date(
      Date.now() - (maximumStoredDays - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const retainedRecords = store
      .readAll()
      .filter((record) => record.date >= retentionCutoff);
    retainedRecords.push({
      date: visitDay,
      pagePath,
      visitorHash,
    });
    store.replaceAll(retainedRecords);
    return response.status(204).end();
  });

  router.get("/", (request, response) => {
    if (!adminApiKey) {
      return response.status(503).json({
        error: "Work management is not configured. Set ADMIN_API_KEY on the server.",
      });
    }
    if (!isAuthorized(request.get("x-admin-key"), adminApiKey)) {
      return response.status(401).json({ error: "A valid admin key is required." });
    }

    const range = readDateRange(request.query);
    if (range.error) {
      return response.status(400).json({ error: range.error });
    }

    const retentionCutoff = new Date(
      Date.now() - (maximumStoredDays - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const storedRecords = store.readAll();
    const retainedRecords = storedRecords.filter(
      (record) => record.date >= retentionCutoff,
    );
    if (retainedRecords.length !== storedRecords.length) {
      store.replaceAll(retainedRecords);
    }

    const records = retainedRecords.filter(
      (record) => record.date >= range.start && record.date <= range.end,
    );
    const viewsByDay = new Map();
    const visitorsByDay = new Map();
    const viewsByPath = new Map();
    const uniqueVisitors = new Set();
    for (const record of records) {
      viewsByDay.set(record.date, (viewsByDay.get(record.date) ?? 0) + 1);
      viewsByPath.set(
        record.pagePath,
        (viewsByPath.get(record.pagePath) ?? 0) + 1,
      );
      if (record.visitorHash) {
        uniqueVisitors.add(record.visitorHash);
        if (!visitorsByDay.has(record.date)) {
          visitorsByDay.set(record.date, new Set());
        }
        visitorsByDay.get(record.date).add(record.visitorHash);
      }
    }

    const pages = Array.from(viewsByPath, ([path, pageViews]) => ({
      path,
      pageViews,
    }))
      .sort((left, right) => right.pageViews - left.pageViews || left.path.localeCompare(right.path))
      .slice(0, 10);

    return response.json({
      startDate: range.start,
      endDate: range.end,
      totals: {
        pageViews: records.length,
        uniqueVisitors: uniqueVisitors.size,
      },
      daily: createDailyRows(
        range.start,
        range.end,
        viewsByDay,
        visitorsByDay,
      ),
      pages,
    });
  });

  return router;
}
