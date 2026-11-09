"use strict";
const commentsApiUrl = window.mmdApiUrl("/api/comments");
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
const reviewerName = commentForm.querySelector("#reviewerName");
const commentText = commentForm.querySelector("#commentText");
const commentSubmitButton = commentForm.querySelector('button[type="submit"]');
if (!reviewerName || !commentText) {
    throw new Error("The review form is missing its name or comment field.");
}
function isCustomerComment(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (typeof record.id === "string" &&
        typeof record.name === "string" &&
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
function isCommentResponse(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    return isCustomerComment(value.comment);
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
        const text = document.createElement("p");
        text.textContent = comment.comment;
        const author = document.createElement("div");
        author.className = "client";
        const details = document.createElement("div");
        const name = document.createElement("h3");
        name.textContent = comment.name;
        const date = document.createElement("span");
        const parsedDate = new Date(comment.createdAt);
        date.textContent = Number.isNaN(parsedDate.getTime())
            ? ""
            : parsedDate.toLocaleDateString(window.mmdLanguage() === "fr" ? "fr-FR" : "en-US");
        details.append(name, date);
        author.append(details);
        card.append(text, author);
        reviewList.append(card);
    }
}
async function loadComments() {
    window.mmdSetTranslatedText(reviewStatus, "Loading reviews...");
    const response = await fetch(commentsApiUrl);
    if (!response.ok) {
        throw new Error(window.mmdTranslateText("Could not load reviews (server returned {status}).", { status: response.status }));
    }
    const result = await response.json();
    if (!isCommentsResponse(result)) {
        throw new Error("The server returned reviews in an unexpected format.");
    }
    renderComments(result.comments);
    window.mmdSetTranslatedText(reviewStatus, "");
}
commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = reviewerName.value.trim();
    const comment = commentText.value.trim();
    if (!name || !comment) {
        window.mmdSetTranslatedText(reviewStatus, "Please enter your name and review.");
        return;
    }
    if (commentSubmitButton) {
        commentSubmitButton.disabled = true;
    }
    window.mmdSetTranslatedText(reviewStatus, "Submitting your review...");
    try {
        const response = await fetch(commentsApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, comment }),
        });
        if (!response.ok) {
            throw new Error(window.mmdTranslateText("Could not submit review (server returned {status}).", { status: response.status }));
        }
        const result = await response.json();
        if (!isCommentResponse(result)) {
            throw new Error("The server returned a review in an unexpected format.");
        }
        commentForm.reset();
        await loadComments();
        window.mmdSetTranslatedText(reviewStatus, "Thank you for sharing your review.");
    }
    catch (error) {
        console.error("Could not submit review:", error);
        if (error instanceof Error) {
            window.mmdSetTranslatedText(reviewStatus, "Could not submit your review. Details: {details}", { details: error.message });
        }
        else {
            window.mmdSetTranslatedText(reviewStatus, "Could not submit your review. Please try again later.");
        }
    }
    finally {
        if (commentSubmitButton) {
            commentSubmitButton.disabled = false;
        }
    }
});
void loadComments().catch((error) => {
    console.error("Could not load reviews:", error);
    if (error instanceof Error) {
        window.mmdSetTranslatedText(reviewStatus, "Could not load reviews. Details: {details}", { details: error.message });
    }
    else {
        window.mmdSetTranslatedText(reviewStatus, "Could not load reviews. Please try again later.");
    }
});
window.addEventListener("mmd-language-change", () => {
    renderComments(displayedComments);
});
