interface CustomerComment {
  id: string;
  name: string;
  location?: string;
  rating?: number;
  comment: string;
  createdAt: string;
}

interface CommentsResponse {
  comments: CustomerComment[];
}

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

const reviewList: HTMLElement = commentsList;
const reviewStatus: HTMLElement = commentStatus;
let displayedComments: CustomerComment[] = [];
let onlineComments: CustomerComment[] = [];
const reviewerName = commentForm.querySelector<HTMLInputElement>("#reviewerName");
const reviewerLocation =
  commentForm.querySelector<HTMLInputElement>("#reviewerLocation");
const commentText = commentForm.querySelector<HTMLTextAreaElement>("#commentText");
const commentSubmitButton =
  commentForm.querySelector<HTMLButtonElement>('button[type="submit"]');

if (!reviewerName || !reviewerLocation || !commentText) {
  throw new Error("The review form is missing a name, location, or comment field.");
}

function isCustomerComment(value: unknown): value is CustomerComment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    (record.location === undefined || typeof record.location === "string") &&
    (record.rating === undefined ||
      (typeof record.rating === "number" &&
        Number.isInteger(record.rating) &&
        record.rating >= 1 &&
        record.rating <= 5)) &&
    typeof record.comment === "string" &&
    typeof record.createdAt === "string"
  );
}

function isCommentsResponse(value: unknown): value is CommentsResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.comments) &&
    record.comments.every(isCustomerComment)
  );
}

function readStoredComments(): CustomerComment[] {
  const stored = localStorage.getItem(reviewStorageKey);
  if (stored === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isCustomerComment)) {
    throw new Error("Saved reviews have an unexpected format.");
  }
  return parsed;
}

function renderComments(comments: CustomerComment[]): void {
  displayedComments = comments;
  reviewList.replaceChildren();

  if (comments.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "comments-empty";
    window.mmdSetTranslatedText(
      emptyMessage,
      "No reviews yet. Be the first to share your experience.",
    );
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
      rating.setAttribute(
        "aria-label",
        window.mmdTranslateText("Rating: {rating} out of 5", {
          rating: comment.rating,
        }),
      );
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
      : parsedDate.toLocaleDateString(
          window.mmdLanguage() === "fr" ? "fr-FR" : "en-US",
        );
    byline.textContent = [comment.location, date].filter(Boolean).join(" · ");

    details.append(name, byline);
    author.append(details);
    card.append(text, author);
    reviewList.append(card);
  }
}

async function loadComments(): Promise<void> {
  window.mmdSetTranslatedText(reviewStatus, "Loading reviews...");

  let browserComments: CustomerComment[] = [];
  try {
    browserComments = readStoredComments();
    renderComments(browserComments);
  } catch (error) {
    console.error("Could not read reviews saved in this browser:", error);
    window.mmdSetTranslatedText(
      reviewStatus,
      "Could not read reviews saved in this browser.",
    );
  }

  try {
    const response = await fetch(commentsApiUrl);
    if (!response.ok) {
      throw new Error(
        window.mmdTranslateText(
          "Could not load reviews (server returned {status}).",
          { status: response.status },
        ),
      );
    }

    const result: unknown = await response.json();
    if (!isCommentsResponse(result)) {
      throw new Error("The server returned reviews in an unexpected format.");
    }

    onlineComments = result.comments;
    renderComments([...browserComments, ...onlineComments]);
    window.mmdSetTranslatedText(reviewStatus, "");
  } catch (error) {
    console.error("Could not load online reviews:", error);
    renderComments(browserComments);
    window.mmdSetTranslatedText(
      reviewStatus,
      "Online reviews are unavailable. Reviews submitted here will only be saved in this browser.",
    );
  }
}

commentForm.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();

  const name = reviewerName.value.trim();
  const location = reviewerLocation.value.trim();
  const ratingField =
    commentForm.querySelector<HTMLInputElement>('input[name="rating"]:checked');
  const rating = ratingField ? Number(ratingField.value) : NaN;
  const comment = commentText.value.trim();

  if (
    !name ||
    !comment ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    window.mmdSetTranslatedText(
      reviewStatus,
      "Please enter your name, select a rating, and write a review.",
    );
    return;
  }

  if (commentSubmitButton) {
    commentSubmitButton.disabled = true;
  }
  window.mmdSetTranslatedText(reviewStatus, "Saving your review on this device...");

  try {
    const savedComments = readStoredComments();
    const newComment: CustomerComment = {
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
    window.mmdSetTranslatedText(
      reviewStatus,
      "Your review is saved on this device. Other visitors will not see it.",
    );
  } catch (error) {
    console.error("Could not save review in this browser:", error);
    window.mmdSetTranslatedText(
      reviewStatus,
      "Could not save your review in this browser. Check storage availability and try again.",
    );
  } finally {
    if (commentSubmitButton) {
      commentSubmitButton.disabled = false;
    }
  }
});

void loadComments();

window.addEventListener("mmd-language-change", () => {
  renderComments(displayedComments);
});
