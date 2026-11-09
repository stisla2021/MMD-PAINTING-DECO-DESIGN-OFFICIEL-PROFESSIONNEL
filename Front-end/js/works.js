"use strict";
const worksApiUrl = window.mmdApiUrl("/api/works");
const worksGrid = document.getElementById("worksGrid");
const worksStatus = document.getElementById("worksStatus");
function isPaintingWork(value) {
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
function isWorksResponse(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return Array.isArray(record.works) && record.works.every(isPaintingWork);
}
function renderWorks(works) {
    if (!(worksGrid instanceof HTMLElement)) {
        return;
    }
    worksGrid.replaceChildren();
    for (const work of works) {
        const item = document.createElement("article");
        item.className = "portfolio-item";
        const image = document.createElement("img");
        image.src = window.mmdApiUrl(work.imageUrl);
        image.alt = work.title;
        image.loading = "lazy";
        image.setAttribute("translate", "no");
        const overlay = document.createElement("div");
        overlay.className = "portfolio-overlay";
        const title = document.createElement("h3");
        title.textContent = work.title;
        title.setAttribute("translate", "no");
        overlay.append(title);
        if (work.category) {
            const category = document.createElement("p");
            category.textContent = work.category;
            category.setAttribute("translate", "no");
            overlay.append(category);
        }
        if (work.description) {
            const description = document.createElement("p");
            description.textContent = work.description;
            description.setAttribute("translate", "no");
            overlay.append(description);
        }
        item.append(image, overlay);
        worksGrid.append(item);
    }
}
async function loadWorks() {
    if (!(worksGrid instanceof HTMLElement) || !(worksStatus instanceof HTMLElement)) {
        return;
    }
    try {
        const response = await fetch(worksApiUrl);
        if (!response.ok) {
            throw new Error(window.mmdTranslateText("The server returned {status}.", {
                status: response.status,
            }));
        }
        const result = await response.json();
        if (!isWorksResponse(result)) {
            throw new Error("The server returned recent work in an unexpected format.");
        }
        renderWorks(result.works);
        window.mmdSetTranslatedText(worksStatus, result.works.length === 0
            ? "Recent projects will appear here as they are added."
            : "");
    }
    catch (error) {
        console.error("Could not load recent work:", error);
        window.mmdSetTranslatedText(worksStatus, "Recent projects are temporarily unavailable. Please check back soon.");
    }
}
void loadWorks();
