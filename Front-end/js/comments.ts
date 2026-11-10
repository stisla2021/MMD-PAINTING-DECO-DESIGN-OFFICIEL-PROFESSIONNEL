interface CustomerComment {
  id: string;
  name: string;
  location?: string;
  avatar?: string;
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
const reviewAvatarChoices = ["🙂", "😊", "😎", "🤗", "🎨", "🏠", "🌟"];
const maximumAvatarPhotoSize = 5 * 1024 * 1024;
const maximumAvatarDataUrlLength = 32_000;

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
const reviewerPhoto =
  commentForm.querySelector<HTMLInputElement>("#reviewerPhoto");
const commentText = commentForm.querySelector<HTMLTextAreaElement>("#commentText");
const commentSubmitButton =
  commentForm.querySelector<HTMLButtonElement>('button[type="submit"]');

if (!reviewerName || !reviewerLocation || !reviewerPhoto || !commentText) {
  throw new Error(
    "The review form is missing a name, location, photo, or comment field.",
  );
}

function isReviewAvatar(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  if (reviewAvatarChoices.includes(value)) {
    return true;
  }
  return (
    value.length <= maximumAvatarDataUrlLength &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function resizeAvatarPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > maximumAvatarPhotoSize) {
    return Promise.reject(
      new Error("Could not use that photo. Choose an image up to 5 MB."),
    );
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    const releaseObjectUrl = (): void => URL.revokeObjectURL(objectUrl);

    image.addEventListener(
      "load",
      () => {
        releaseObjectUrl();
        try {
          const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
          if (
            cropSize < 1 ||
            image.naturalWidth * image.naturalHeight > 25_000_000
          ) {
            throw new Error("The selected photo has invalid dimensions.");
          }

          const canvas = document.createElement("canvas");
          canvas.width = 96;
          canvas.height = 96;
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Could not prepare the selected photo.");
          }

          context.drawImage(
            image,
            (image.naturalWidth - cropSize) / 2,
            (image.naturalHeight - cropSize) / 2,
            cropSize,
            cropSize,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const avatar = canvas.toDataURL("image/jpeg", 0.72);
          if (avatar.length > maximumAvatarDataUrlLength) {
            throw new Error("The resized photo is still too large.");
          }
          resolve(avatar);
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        releaseObjectUrl();
        reject(
          new Error("Could not use that photo. Choose an image up to 5 MB."),
        );
      },
      { once: true },
    );
    image.src = objectUrl;
  });
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
    (record.avatar === undefined || isReviewAvatar(record.avatar)) &&
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

    const avatar = document.createElement("span");
    avatar.className = "review-avatar";
    avatar.setAttribute("aria-hidden", "true");
    if (comment.avatar?.startsWith("data:image/jpeg;base64,")) {
      const photo = document.createElement("img");
      photo.src = comment.avatar;
      photo.alt = "";
      avatar.append(photo);
    } else {
      avatar.textContent = isReviewAvatar(comment.avatar)
        ? comment.avatar
        : reviewAvatarChoices[0];
    }

    details.append(name, byline);
    author.append(avatar, details);
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
      "Online reviews are temporarily unavailable. Please try again later.",
    );
  }
}

commentForm.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();

  const name = reviewerName.value.trim();
  const location = reviewerLocation.value.trim();
  const ratingField =
    commentForm.querySelector<HTMLInputElement>('input[name="rating"]:checked');
  const rating = ratingField ? Number(ratingField.value) : NaN;
  const comment = commentText.value.trim();
  const selectedAvatar =
    commentForm.querySelector<HTMLInputElement>('input[name="avatar"]:checked');
  const photoFile = reviewerPhoto.files?.[0];

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

  if (commentSubmitButton) commentSubmitButton.disabled = true;
  let preparingPhoto = false;
  try {
    let avatar = selectedAvatar?.value ?? reviewAvatarChoices[0];
    if (photoFile) {
      preparingPhoto = true;
      window.mmdSetTranslatedText(reviewStatus, "Preparing your photo...");
      avatar = await resizeAvatarPhoto(photoFile);
      preparingPhoto = false;
    }

    if (!isReviewAvatar(avatar)) {
      throw new Error("The selected avatar is invalid.");
    }
    window.mmdSetTranslatedText(reviewStatus, "Submitting your review...");
    const response = await fetch(commentsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        location,
        avatar,
        rating,
        comment,
      }),
    });
    if (!response.ok) {
      let message = window.mmdTranslateText(
        "Could not submit your review (server returned {status}).",
        { status: response.status },
      );
      try {
        const result: unknown = await response.json();
        if (
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
        ) {
          message = result.error;
        }
      } catch (error) {
        console.error("Could not read the review submission error:", error);
      }
      throw new Error(message);
    }

    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("review" in result)
    ) {
      throw new Error("The server returned a review in an unexpected format.");
    }

    const submittedReview = result.review;
    if (!isCustomerComment(submittedReview)) {
      throw new Error("The server returned a review in an unexpected format.");
    }

    onlineComments = [
      submittedReview,
      ...onlineComments.filter((entry) => entry.id !== submittedReview.id),
    ];
    commentForm.reset();
    renderComments([
      ...displayedComments.filter((entry) => entry.id.startsWith("local-")),
      ...onlineComments,
    ]);
    window.mmdSetTranslatedText(
      reviewStatus,
      "Thank you. Your review has been published.",
    );
  } catch (error) {
    console.error("Could not submit the review:", error);
    window.mmdSetTranslatedText(
      reviewStatus,
      preparingPhoto
        ? "Could not use that photo. Choose an image up to 5 MB."
        : error instanceof Error
          ? error.message
          : "Could not submit your review. Please try again.",
    );
  } finally {
    if (commentSubmitButton) commentSubmitButton.disabled = false;
  }
});

void loadComments();

window.addEventListener("mmd-language-change", () => {
  renderComments(displayedComments);
});
