"use strict";
const installAppButton = document.getElementById("installAppButton");
if (!(installAppButton instanceof HTMLButtonElement)) {
    throw new Error('The install button is missing the "#installAppButton" element.');
}
let pendingInstallPrompt;
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker
            .register("/service-worker.js")
            .catch((error) => {
            console.error("Could not register the app service worker.", error);
        });
    });
}
window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    installAppButton.hidden = false;
});
installAppButton.addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
        return;
    }
    const installPrompt = pendingInstallPrompt;
    pendingInstallPrompt = undefined;
    installAppButton.disabled = true;
    try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
    }
    catch (error) {
        console.error("Could not start app installation.", error);
    }
    finally {
        installAppButton.hidden = true;
        installAppButton.disabled = false;
    }
});
window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = undefined;
    installAppButton.hidden = true;
});
