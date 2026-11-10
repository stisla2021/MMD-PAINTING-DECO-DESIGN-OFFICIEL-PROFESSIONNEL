"use strict";
const installAppButton = document.getElementById("installAppButton");
const installAppStatus = document.getElementById("installAppStatus");
if (!(installAppButton instanceof HTMLButtonElement)) {
    throw new Error('The install button is missing the "#installAppButton" element.');
}
if (!(installAppStatus instanceof HTMLElement)) {
    throw new Error('The install status is missing the "#installAppStatus" element.');
}
const installStatusElement = installAppStatus;
let pendingInstallPrompt;
function showInstallStatus(message) {
    window.mmdSetTranslatedText(installStatusElement, message);
    installStatusElement.hidden = false;
}
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
        showInstallStatus("On Android in Chrome, open the menu and choose Install app or Add to Home screen.");
        return;
    }
    const installPrompt = pendingInstallPrompt;
    pendingInstallPrompt = undefined;
    installAppButton.disabled = true;
    try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") {
            showInstallStatus("Follow the browser prompt to finish installing MMD DECO.");
        }
    }
    catch (error) {
        console.error("Could not start app installation.", error);
        showInstallStatus("Installation could not start. Open the browser menu and choose Install app.");
    }
    finally {
        installAppButton.hidden = true;
        installAppButton.disabled = false;
    }
});
window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = undefined;
    installAppButton.hidden = true;
    showInstallStatus("MMD DECO was added to your home screen.");
});
