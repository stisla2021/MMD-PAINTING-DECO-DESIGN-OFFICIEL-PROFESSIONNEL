"use strict";
const keyForm = document.getElementById("adminKeyForm");
const keyInput = document.getElementById("adminKey");
const adminPanel = document.getElementById("adminPanel");
const keyStatus = document.getElementById("keyStatus");
const workForm = document.getElementById("workForm");
const workStatus = document.getElementById("workStatus");
const adminWorksList = document.getElementById("adminWorksList");
const logoutButton = document.getElementById("adminLogout");
const adminApiUrl = window.mmdApiUrl("/api/works");
let currentAdminKey = "";
if (!(keyForm instanceof HTMLFormElement)) {
    throw new Error('The admin page is missing the "#adminKeyForm" form.');
}
if (!(keyInput instanceof HTMLInputElement)) {
    throw new Error('The admin page is missing the "#adminKey" field.');
}
if (!(adminPanel instanceof HTMLElement)) {
    throw new Error('The admin page is missing the "#adminPanel" section.');
}
if (!(keyStatus instanceof HTMLElement)) {
    throw new Error('The admin page is missing the "#keyStatus" status area.');
}
if (!(workForm instanceof HTMLFormElement)) {
    throw new Error('The admin page is missing the "#workForm" form.');
}
if (!(workStatus instanceof HTMLElement)) {
    throw new Error('The admin page is missing the "#workStatus" status area.');
}
if (!(adminWorksList instanceof HTMLElement)) {
    throw new Error('The admin page is missing the "#adminWorksList" list.');
}
if (!(logoutButton instanceof HTMLButtonElement)) {
    throw new Error('The admin page is missing the "#adminLogout" button.');
}
const adminKeyForm = keyForm;
const adminKeyInput = keyInput;
const adminPanelElement = adminPanel;
const adminKeyStatus = keyStatus;
const adminWorkForm = workForm;
const adminWorkStatus = workStatus;
const adminWorksContainer = adminWorksList;
const adminLogoutButton = logoutButton;
const workImage = adminWorkForm.querySelector("#workImage");
const uploadButton = adminWorkForm.querySelector('button[type="submit"]');
if (!workImage) {
    throw new Error("The recent-work form is missing its photo field.");
}
function isAdminWork(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (typeof record.id === "string" &&
        typeof record.title === "string" &&
        typeof record.category === "string" &&
        typeof record.description === "string" &&
        typeof record.imageUrl === "string" &&
        typeof record.createdAt === "string");
}
function isAdminWorksResponse(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return Array.isArray(record.works) && record.works.every(isAdminWork);
}
function getAdminKey() {
    return currentAdminKey;
}
function setAuthenticated(isAuthenticated) {
    adminKeyForm.hidden = isAuthenticated;
    adminPanelElement.hidden = !isAuthenticated;
    if (isAuthenticated) {
        window.mmdSetTranslatedText(adminKeyStatus, "");
    }
}
async function requestJson(url, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("X-Admin-Key", getAdminKey());
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        let message = window.mmdTranslateText("The server returned {status}.", {
            status: response.status,
        });
        try {
            const payload = await response.json();
            if (typeof payload === "object" &&
                payload !== null &&
                "error" in payload &&
                typeof payload.error === "string") {
                message = payload.error;
            }
        }
        catch (error) {
            console.error("Could not read the API error response:", error);
        }
        if (response.status === 401) {
            currentAdminKey = "";
            setAuthenticated(false);
        }
        throw new Error(message);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
function renderAdminWorks(works) {
    adminWorksContainer.replaceChildren();
    if (works.length === 0) {
        const empty = document.createElement("p");
        window.mmdSetTranslatedText(empty, "No recent work has been posted yet.");
        adminWorksContainer.append(empty);
        return;
    }
    for (const work of works) {
        const item = document.createElement("article");
        item.className = "admin-work-item";
        const image = document.createElement("img");
        image.src = window.mmdApiUrl(work.imageUrl);
        image.alt = work.title;
        image.loading = "lazy";
        image.setAttribute("translate", "no");
        const details = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = work.title;
        title.setAttribute("translate", "no");
        const category = document.createElement("p");
        category.textContent = work.category;
        category.setAttribute("translate", "no");
        details.append(title, category);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-danger";
        window.mmdSetTranslatedText(removeButton, "Delete");
        removeButton.addEventListener("click", async () => {
            if (!window.confirm(window.mmdTranslateText('Delete "{title}" from recent work?', {
                title: work.title,
            }))) {
                return;
            }
            removeButton.disabled = true;
            window.mmdSetTranslatedText(adminWorkStatus, "Deleting project...");
            try {
                await requestJson(`${adminApiUrl}/${encodeURIComponent(work.id)}`, {
                    method: "DELETE",
                });
                await loadAdminWorks();
                window.mmdSetTranslatedText(adminWorkStatus, "Project deleted.");
            }
            catch (error) {
                console.error("Could not delete recent work:", error);
                window.mmdSetTranslatedText(adminWorkStatus, error instanceof Error ? error.message : "Could not delete the project.");
            }
            finally {
                removeButton.disabled = false;
            }
        });
        item.append(image, details, removeButton);
        adminWorksContainer.append(item);
    }
}
async function loadAdminWorks() {
    const result = await requestJson(adminApiUrl);
    if (!isAdminWorksResponse(result)) {
        throw new Error("The server returned recent work in an unexpected format.");
    }
    renderAdminWorks(result.works);
}
adminKeyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = adminKeyInput.value.trim();
    if (!key) {
        window.mmdSetTranslatedText(adminKeyStatus, "Enter the admin key configured on the backend.");
        return;
    }
    currentAdminKey = key;
    window.mmdSetTranslatedText(adminKeyStatus, "Checking admin key...");
    try {
        await requestJson(`${adminApiUrl}/verify`, { method: "POST" });
        await loadAdminWorks();
        setAuthenticated(true);
    }
    catch (error) {
        console.error("Admin access could not be verified:", error);
        currentAdminKey = "";
        window.mmdSetTranslatedText(adminKeyStatus, error instanceof Error ? error.message : "Could not verify the admin key.");
    }
});
adminLogoutButton.addEventListener("click", () => {
    currentAdminKey = "";
    adminKeyInput.value = "";
    setAuthenticated(false);
});
adminWorkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const images = Array.from(workImage.files ?? []);
    if (images.length === 0) {
        window.mmdSetTranslatedText(adminWorkStatus, "Choose at least one project photo to upload.");
        return;
    }
    if (uploadButton) {
        uploadButton.disabled = true;
    }
    let uploadedCount = 0;
    try {
        for (const [index, image] of images.entries()) {
            window.mmdSetTranslatedText(adminWorkStatus, "Uploading photo {current} of {total}...", { current: index + 1, total: images.length });
            const formData = new FormData();
            const title = image.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) ||
                "Recent project";
            formData.set("title", title);
            formData.set("category", "");
            formData.set("description", "");
            formData.set("image", image);
            await requestJson(adminApiUrl, { method: "POST", body: formData });
            uploadedCount += 1;
        }
        await loadAdminWorks();
        workForm.reset();
        window.mmdSetTranslatedText(adminWorkStatus, uploadedCount === 1
            ? "{count} photo published on the home page."
            : "{count} photos published on the home page.", { count: uploadedCount });
    }
    catch (error) {
        console.error("Could not publish recent work:", error);
        const message = error instanceof Error
            ? error.message
            : "Could not publish the photos. Please try again.";
        window.mmdSetTranslatedText(adminWorkStatus, uploadedCount > 0
            ? "{uploaded} of {total} photos uploaded before an error: {message}"
            : message, { uploaded: uploadedCount, total: images.length, message });
    }
    finally {
        if (uploadButton) {
            uploadButton.disabled = false;
        }
    }
});
