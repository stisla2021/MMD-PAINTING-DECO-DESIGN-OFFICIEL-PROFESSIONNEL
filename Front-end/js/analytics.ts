interface AnalyticsVisitorRecord {
  id: string;
  expiresAt: number;
}

const analyticsVisitorStorageKey = "mmd-analytics-visitor";
const analyticsVisitorIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const analyticsVisitorLifetimeMs = 400 * 24 * 60 * 60 * 1000;

function getAnalyticsVisitorId(): string | null {
  try {
    const savedValue = localStorage.getItem(analyticsVisitorStorageKey);
    if (savedValue) {
      const savedRecord: unknown = JSON.parse(savedValue);
      if (
        typeof savedRecord === "object" &&
        savedRecord !== null &&
        "id" in savedRecord &&
        "expiresAt" in savedRecord &&
        typeof savedRecord.id === "string" &&
        analyticsVisitorIdPattern.test(savedRecord.id) &&
        typeof savedRecord.expiresAt === "number" &&
        savedRecord.expiresAt > Date.now()
      ) {
        const refreshedRecord: AnalyticsVisitorRecord = {
          id: savedRecord.id,
          expiresAt: Date.now() + analyticsVisitorLifetimeMs,
        };
        try {
          localStorage.setItem(
            analyticsVisitorStorageKey,
            JSON.stringify(refreshedRecord),
          );
        } catch (error) {
          console.warn("Could not refresh the anonymous analytics ID.", error);
        }
        return refreshedRecord.id;
      }
    }

    const record: AnalyticsVisitorRecord = {
      id: crypto.randomUUID(),
      expiresAt: Date.now() + analyticsVisitorLifetimeMs,
    };
    localStorage.setItem(analyticsVisitorStorageKey, JSON.stringify(record));
    return record.id;
  } catch (error) {
    console.warn("Could not store an anonymous analytics ID.", error);
    return null;
  }
}

function recordAnalyticsPageView(): void {
  const body = JSON.stringify({
    path: window.location.pathname,
    visitorId: getAnalyticsVisitorId(),
  });
  const endpoint = window.mmdApiUrl("/api/analytics");
  const payload = new Blob([body], { type: "application/json" });

  if (
    new URL(endpoint).origin !== window.location.origin ||
    typeof navigator.sendBeacon !== "function" ||
    !navigator.sendBeacon(endpoint, payload)
  ) {
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn("Could not record this page view.", error);
    });
  }
}

recordAnalyticsPageView();
