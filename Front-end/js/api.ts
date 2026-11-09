interface Window {
  mmdApiUrl: (path: string) => string;
}

const configuredApiBaseUrl =
  document.querySelector<HTMLMetaElement>('meta[name="api-base-url"]')?.content.trim();
const isLocalFrontend =
  window.location.protocol === "http:" &&
  ["8000", "5500"].includes(window.location.port);
const apiBaseUrl =
  configuredApiBaseUrl ||
  (isLocalFrontend
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin);

window.mmdApiUrl = (path: string): string =>
  new URL(path, apiBaseUrl).toString();
