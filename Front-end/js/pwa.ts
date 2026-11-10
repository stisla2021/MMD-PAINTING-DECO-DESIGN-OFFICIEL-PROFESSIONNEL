interface AppInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const installAppButton = document.getElementById("installAppButton");
const installAppStatus = document.getElementById("installAppStatus");

if (!(installAppButton instanceof HTMLButtonElement)) {
  throw new Error('The install button is missing the "#installAppButton" element.');
}

if (!(installAppStatus instanceof HTMLElement)) {
  throw new Error('The install status is missing the "#installAppStatus" element.');
}

const installStatusElement: HTMLElement = installAppStatus;
let pendingInstallPrompt: AppInstallPromptEvent | undefined;

function showInstallStatus(message: string): void {
  window.mmdSetTranslatedText(installStatusElement, message);
  installStatusElement.hidden = false;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error: unknown) => {
        console.error("Could not register the app service worker.", error);
      });
  });
}

window.addEventListener("beforeinstallprompt", (event: Event) => {
  event.preventDefault();
  pendingInstallPrompt = event as AppInstallPromptEvent;
  installAppButton.hidden = false;
});

installAppButton.addEventListener("click", async () => {
  if (!pendingInstallPrompt) {
    showInstallStatus(
      "On Android in Chrome, open the menu and choose Install app or Add to Home screen.",
    );
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
  } catch (error) {
    console.error("Could not start app installation.", error);
    showInstallStatus(
      "Installation could not start. Open the browser menu and choose Install app.",
    );
  } finally {
    installAppButton.hidden = true;
    installAppButton.disabled = false;
  }
});

window.addEventListener("appinstalled", () => {
  pendingInstallPrompt = undefined;
  installAppButton.hidden = true;
  showInstallStatus("MMD DECO was added to your home screen.");
});
