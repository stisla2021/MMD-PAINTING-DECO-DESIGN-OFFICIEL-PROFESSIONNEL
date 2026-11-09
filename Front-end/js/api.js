"use strict";
const configuredApiBaseUrl = document.querySelector('meta[name="api-base-url"]')?.content.trim();
const isLocalFrontend = window.location.protocol === "http:" &&
    ["8000", "5500"].includes(window.location.port);
const apiBaseUrl = configuredApiBaseUrl ||
    (isLocalFrontend
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : window.location.origin);
window.mmdApiUrl = (path) => new URL(path, apiBaseUrl).toString();
