import { timingSafeEqual } from "node:crypto";

export function isAuthorized(providedKey, configuredKey) {
  if (!configuredKey || typeof providedKey !== "string") {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const configured = Buffer.from(configuredKey);
  return (
    provided.length === configured.length &&
    timingSafeEqual(provided, configured)
  );
}
