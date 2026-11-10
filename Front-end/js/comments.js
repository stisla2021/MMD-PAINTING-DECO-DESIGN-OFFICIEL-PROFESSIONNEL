"use strict";
const commentsApiUrl = window.mmdApiUrl("/api/comments");
const reviewStorageKey = "mmd-customer-reviews-v1";
const commentForm = document.getElementById("commentForm");
const commentsList = document.getElementById("commentsList");
const commentStatus = document.getElementById("commentStatus");
if (!(commentForm instanceof HTMLFormElement)) {
    throw new Error('The review form is missing the "#commentForm" element.');
}
if (!(commentsList instanceof HTMLElement)) {
    throw new Error('The review page is missing the "#commentsList" element.');
}
if (!(commentStatus instanceof HTMLElement)) {
    throw new Error('The review page is missing the "#commentStatus" element.');
}
const reviewList = commentsList;
const reviewStatus = commentStatus;
let displayedComments = [];
let onlineComments = [];
const reviewerName = commentForm.querySelector("#reviewerName");
const reviewerLocation = commentForm.querySelector("#reviewerLocation");
const commentText = commentForm.querySelector("#commentText");
const commentSubmitButton = commentForm.querySelector('button[type="submit"]');
if (!reviewerName || !reviewerLocation || !commentText) {
    throw new Error("The review form is missing a name, location, or comment field.");
}
function isCustomerComment(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (typeof record.id === "string" &&
        typeof record.name === "string" &&
        (record.location === undefined || typeof record.location === "string") &&
        (record.rating === undefined ||
            (typeof record.rating === "number" &&
                Number.isInteger(record.rating) &&
                record.rating >= 1 &&
                record.rating <= 5)) &&
        typeof record.comment === "string" &&
        typeof record.createdAt === "string");
}
function isCommentsResponse(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (Array.isArray(record.comments) &&
        record.comments.every(isCustomerComment));
}
function readStoredComments() {
    const stored = localStorage.getItem(reviewStorageKey);
    if (stored === null) {
        return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isCustomerComment)) {
        throw new Error("Saved reviews have an unexpected format.");
    }
    return parsed;
}
function renderComments(comments) {
    displayedComments = comments;
    reviewList.replaceChildren();
    if (comments.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "comments-empty";
        window.mmdSetTranslatedText(emptyMessage, "No reviews yet. Be the first to share your experience.");
        reviewList.append(emptyMessage);
        return;
    }
    for (const comment of comments) {
        const card = document.createElement("article");
        card.className = "testimonial-card";
        card.setAttribute("translate", "no");
        if (comment.rating !== undefined) {
            const rating = document.createElement("p");
            rating.className = "review-rating";
            rating.textContent = `${"★".repeat(comment.rating)}${"☆".repeat(5 - comment.rating)}`;
            rating.setAttribute("aria-label", window.mmdTranslateText("Rating: {rating} out of 5", {
                rating: comment.rating,
            }));
            card.append(rating);
        }
        const text = document.createElement("p");
        text.textContent = comment.comment;
        const author = document.createElement("div");
        author.className = "client";
        const details = document.createElement("div");
        const name = document.createElement("h3");
        name.textContent = comment.name;
        const byline = document.createElement("span");
        byline.className = "review-location";
        const parsedDate = new Date(comment.createdAt);
        const date = Number.isNaN(parsedDate.getTime())
            ? ""
            : parsedDate.toLocaleDateString(window.mmdLanguage() === "fr" ? "fr-FR" : "en-US");
        byline.textContent = [comment.location, date].filter(Boolean).join(" · ");
        details.append(name, byline);
        author.append(details);
        card.append(text, author);
        reviewList.append(card);
    }
}
async function loadComments() {
    window.mmdSetTranslatedText(reviewStatus, "Loading reviews...");
    let browserComments = [];
    try {
        browserComments = readStoredComments();
        renderComments(browserComments);
    }
    catch (error) {
        console.error("Could not read reviews saved in this browser:", error);
        window.mmdSetTranslatedText(reviewStatus, "Could not read reviews saved in this browser.");
    }
    try {
        const response = await fetch(commentsApiUrl);
        if (!response.ok) {
            throw new Error(window.mmdTranslateText("Could not load reviews (server returned {status}).", { status: response.status }));
        }
        const result = await response.json();
        if (!isCommentsResponse(result)) {
            throw new Error("The server returned reviews in an unexpected format.");
        }
        onlineComments = result.comments;
        renderComments([...browserComments, ...onlineComments]);
        window.mmdSetTranslatedText(reviewStatus, "");
    }
    catch (error) {
        console.error("Could not load online reviews:", error);
        renderComments(browserComments);
        window.mmdSetTranslatedText(reviewStatus, "Online reviews are unavailable. Reviews submitted here will only be saved in this browser.");
    }
}
commentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = reviewerName.value.trim();
    const location = reviewerLocation.value.trim();
    const ratingField = commentForm.querySelector('input[name="rating"]:checked');
    const rating = ratingField ? Number(ratingField.value) : NaN;
    const comment = commentText.value.trim();
    if (!name ||
        !comment ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5) {
        window.mmdSetTranslatedText(reviewStatus, "Please enter your name, select a rating, and write a review.");
        return;
    }
    if (commentSubmitButton) {
        commentSubmitButton.disabled = true;
    }
    window.mmdSetTranslatedText(reviewStatus, "Saving your review on this device...");
    try {
        const savedComments = readStoredComments();
        const newComment = {
            id: `local-${crypto.randomUUID()}`,
            name,
            ...(location ? { location } : {}),
            rating,
            comment,
            createdAt: new Date().toISOString(),
        };
        const updatedComments = [newComment, ...savedComments];
        localStorage.setItem(reviewStorageKey, JSON.stringify(updatedComments));
        commentForm.reset();
        renderComments([...updatedComments, ...onlineComments]);
        window.mmdSetTranslatedText(reviewStatus, "Your review is saved on this device. Other visitors will not see it.");
    }
    catch (error) {
        console.error("Could not save review in this browser:", error);
        window.mmdSetTranslatedText(reviewStatus, "Could not save your review in this browser. Check storage availability and try again.");
    }
    finally {
        if (commentSubmitButton) {
            commentSubmitButton.disabled = false;
        }
    }
});
void loadComments();
window.addEventListener("mmd-language-change", () => {
    renderComments(displayedComments);
});
