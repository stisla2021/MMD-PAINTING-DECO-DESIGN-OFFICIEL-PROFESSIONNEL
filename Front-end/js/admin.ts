interface AdminWork {
  id: string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  createdAt: string;
}

interface AdminWorksResponse {
  works: AdminWork[];
}

interface AdminQuote {
  id: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  createdAt: string;
}

interface AdminQuotesResponse {
  quotes: AdminQuote[];
}

interface AdminReview {
  id: string;
  name: string;
  location?: string;
  rating?: number;
  avatar: string;
  comment: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
}

interface AdminReviewsResponse {
  comments: AdminReview[];
}

const keyForm = document.getElementById("adminKeyForm");
const keyInput = document.getElementById("adminKey");
const adminPanel = document.getElementById("adminPanel");
const keyStatus = document.getElementById("keyStatus");
const workForm = document.getElementById("workForm");
const workStatus = document.getElementById("workStatus");
const adminWorksList = document.getElementById("adminWorksList");
const adminQuotesList = document.getElementById("adminQuotesList");
const quoteStatus = document.getElementById("quoteStatus");
const adminReviewsList = document.getElementById("adminReviewsList");
const pendingReviewStatusElement = document.getElementById("reviewStatus");
const logoutButton = document.getElementById("adminLogout");
const refreshQuotesButton = document.getElementById("refreshQuotes");
const refreshReviewsButton = document.getElementById("refreshReviews");
const adminApiUrl = window.mmdApiUrl("/api/works");
const adminQuotesApiUrl = window.mmdApiUrl("/api/quotes");
const adminReviewsApiUrl = window.mmdApiUrl("/api/comments");
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
if (!(adminQuotesList instanceof HTMLElement)) {
  throw new Error('The admin page is missing the "#adminQuotesList" list.');
}
if (!(quoteStatus instanceof HTMLElement)) {
  throw new Error('The admin page is missing the "#quoteStatus" status area.');
}
if (!(adminReviewsList instanceof HTMLElement)) {
  throw new Error('The admin page is missing the "#adminReviewsList" list.');
}
if (!(pendingReviewStatusElement instanceof HTMLElement)) {
  throw new Error('The admin page is missing the "#reviewStatus" status area.');
}
if (!(logoutButton instanceof HTMLButtonElement)) {
  throw new Error('The admin page is missing the "#adminLogout" button.');
}
if (!(refreshQuotesButton instanceof HTMLButtonElement)) {
  throw new Error('The admin page is missing the "#refreshQuotes" button.');
}
if (!(refreshReviewsButton instanceof HTMLButtonElement)) {
  throw new Error('The admin page is missing the "#refreshReviews" button.');
}

const adminKeyForm: HTMLFormElement = keyForm;
const adminKeyInput: HTMLInputElement = keyInput;
const adminPanelElement: HTMLElement = adminPanel;
const adminKeyStatus: HTMLElement = keyStatus;
const adminWorkForm: HTMLFormElement = workForm;
const adminWorkStatus: HTMLElement = workStatus;
const adminWorksContainer: HTMLElement = adminWorksList;
const adminQuotesContainer: HTMLElement = adminQuotesList;
const adminQuoteStatus: HTMLElement = quoteStatus;
const adminReviewsContainer: HTMLElement = adminReviewsList;
const adminReviewStatus: HTMLElement = pendingReviewStatusElement;
const adminLogoutButton: HTMLButtonElement = logoutButton;
const adminRefreshQuotesButton: HTMLButtonElement = refreshQuotesButton;
const adminRefreshReviewsButton: HTMLButtonElement = refreshReviewsButton;

const workImage = adminWorkForm.querySelector<HTMLInputElement>("#workImage");
const uploadButton = adminWorkForm.querySelector<HTMLButtonElement>(
  'button[type="submit"]',
);

if (!workImage) {
  throw new Error("The recent-work form is missing its photo field.");
}

function isAdminWork(value: unknown): value is AdminWork {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.category === "string" &&
    typeof record.description === "string" &&
    typeof record.imageUrl === "string" &&
    typeof record.createdAt === "string"
  );
}

function isAdminWorksResponse(value: unknown): value is AdminWorksResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.works) && record.works.every(isAdminWork);
}

function isAdminQuote(value: unknown): value is AdminQuote {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.email === "string" &&
    typeof record.phone === "string" &&
    typeof record.service === "string" &&
    typeof record.message === "string" &&
    typeof record.createdAt === "string"
  );
}

function isAdminQuotesResponse(value: unknown): value is AdminQuotesResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.quotes) && record.quotes.every(isAdminQuote);
}

function isAdminReview(value: unknown): value is AdminReview {
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
    typeof record.avatar === "string" &&
    (["🙂", "😊", "😎", "🤗", "🎨", "🏠", "🌟"].includes(record.avatar) ||
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(record.avatar)) &&
    typeof record.comment === "string" &&
    typeof record.createdAt === "string" &&
    (record.status === "pending" ||
      record.status === "approved" ||
      record.status === "rejected")
  );
}

function isAdminReviewsResponse(value: unknown): value is AdminReviewsResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.comments) && record.comments.every(isAdminReview);
}

function getAdminKey(): string {
  return currentAdminKey;
}

function setAuthenticated(isAuthenticated: boolean): void {
  adminKeyForm.hidden = isAuthenticated;
  adminPanelElement.hidden = !isAuthenticated;
  if (isAuthenticated) {
    window.mmdSetTranslatedText(adminKeyStatus, "");
  }
}

async function requestJson(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set("X-Admin-Key", getAdminKey());
  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let message = window.mmdTranslateText("The server returned {status}.", {
      status: response.status,
    });
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        message = payload.error;
      }
    } catch (error) {
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

function renderAdminWorks(works: AdminWork[]): void {
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
      if (
        !window.confirm(
          window.mmdTranslateText('Delete "{title}" from recent work?', {
            title: work.title,
          }),
        )
      ) {
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
      } catch (error) {
        console.error("Could not delete recent work:", error);
        window.mmdSetTranslatedText(
          adminWorkStatus,
          error instanceof Error ? error.message : "Could not delete the project.",
        );
      } finally {
        removeButton.disabled = false;
      }
    });

    item.append(image, details, removeButton);
    adminWorksContainer.append(item);
  }
}

async function loadAdminWorks(): Promise<void> {
  const result = await requestJson(adminApiUrl);
  if (!isAdminWorksResponse(result)) {
    throw new Error("The server returned recent work in an unexpected format.");
  }
  renderAdminWorks(result.works);
}

function renderAdminQuotes(quotes: AdminQuote[]): void {
  adminQuotesContainer.replaceChildren();

  if (quotes.length === 0) {
    const empty = document.createElement("p");
    window.mmdSetTranslatedText(empty, "No quote requests yet.");
    adminQuotesContainer.append(empty);
    return;
  }

  const serviceLabels: Record<string, string> = {
    interior: "Interior House Painting",
    exterior: "Exterior House Painting",
    both: "Interior + Exterior",
    cabinets: "Cabinet / Trim Painting",
    commercial: "Commercial Painting",
    other: "Other",
  };

  for (const quote of quotes) {
    const item = document.createElement("article");
    item.className = "admin-quote-item";

    const heading = document.createElement("div");
    heading.className = "admin-quote-heading";
    const name = document.createElement("h3");
    name.textContent = quote.name;
    name.setAttribute("translate", "no");

    const received = document.createElement("time");
    received.dateTime = quote.createdAt;
    const parsedDate = new Date(quote.createdAt);
    const displayDate = Number.isNaN(parsedDate.getTime())
      ? quote.createdAt
      : parsedDate.toLocaleString();
    window.mmdSetTranslatedText(received, "Received {date}", {
      date: displayDate,
    });
    heading.append(name, received);

    const email = document.createElement("p");
    window.mmdSetTranslatedText(email, "Email: {email}", {
      email: quote.email,
    });
    const phone = document.createElement("p");
    if (quote.phone) {
      window.mmdSetTranslatedText(phone, "Phone: {phone}", {
        phone: quote.phone,
      });
    }

    const service = document.createElement("p");
    const serviceTitle = document.createElement("strong");
    window.mmdSetTranslatedText(serviceTitle, "Service:");
    const serviceLabel = serviceLabels[quote.service] ?? quote.service;
    const serviceValue = document.createElement("span");
    window.mmdSetTranslatedText(serviceValue, serviceLabel);
    service.append(serviceTitle, " ", serviceValue);

    item.append(heading, email);
    if (quote.phone) {
      item.append(phone);
    }
    item.append(service);

    if (quote.message) {
      const message = document.createElement("p");
      message.className = "admin-quote-message";
      window.mmdSetTranslatedText(message, "Project details: {message}", {
        message: quote.message,
      });
      item.append(message);
    }

    adminQuotesContainer.append(item);
  }
}

async function loadAdminQuotes(): Promise<void> {
  adminRefreshQuotesButton.disabled = true;
  window.mmdSetTranslatedText(adminQuoteStatus, "Loading quote requests...");

  try {
    const result = await requestJson(adminQuotesApiUrl);
    if (!isAdminQuotesResponse(result)) {
      throw new Error("The server returned quote requests in an unexpected format.");
    }
    renderAdminQuotes(result.quotes);
    window.mmdSetTranslatedText(adminQuoteStatus, "");
  } catch (error) {
    console.error("Could not load quote requests:", error);
    window.mmdSetTranslatedText(adminQuoteStatus, "Could not load quote requests. {message}", {
      message: error instanceof Error ? error.message : "Please try again.",
    });
  } finally {
    adminRefreshQuotesButton.disabled = false;
  }
}

function renderAdminReviews(reviews: AdminReview[]): void {
  adminReviewsContainer.replaceChildren();

  if (reviews.length === 0) {
    const empty = document.createElement("p");
    window.mmdSetTranslatedText(empty, "No customer reviews to manage.");
    adminReviewsContainer.append(empty);
    return;
  }

  for (const review of reviews) {
    const item = document.createElement("article");
    item.className = "admin-quote-item admin-review-item";

    const heading = document.createElement("div");
    heading.className = "admin-review-heading";
    const avatar = document.createElement("span");
    avatar.className = "admin-review-avatar";
    avatar.setAttribute("aria-hidden", "true");
    if (review.avatar.startsWith("data:image/jpeg;base64,")) {
      const photo = document.createElement("img");
      photo.src = review.avatar;
      photo.alt = "";
      avatar.append(photo);
    } else {
      avatar.textContent = review.avatar;
    }

    const name = document.createElement("h3");
    name.textContent = review.name;
    name.setAttribute("translate", "no");
    const received = document.createElement("time");
    received.dateTime = review.createdAt;
    const parsedDate = new Date(review.createdAt);
    const displayDate = Number.isNaN(parsedDate.getTime())
      ? review.createdAt
      : parsedDate.toLocaleString();
    window.mmdSetTranslatedText(received, "Received {date}", {
      date: displayDate,
    });
    const status = document.createElement("span");
    status.className = `admin-review-status ${review.status}`;
    window.mmdSetTranslatedText(
      status,
      review.status === "pending"
        ? "Pending approval"
        : review.status === "approved"
          ? "Published"
          : "Rejected",
    );
    heading.append(avatar, name, status, received);

    const rating = document.createElement("p");
    rating.className = "review-rating";
    if (review.rating !== undefined) {
      rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
      rating.setAttribute(
        "aria-label",
        window.mmdTranslateText("Rating: {rating} out of 5", {
          rating: review.rating,
        }),
      );
    }

    const location = document.createElement("p");
    if (review.location) {
      window.mmdSetTranslatedText(location, "Location: {location}", {
        location: review.location,
      });
    }
    const comment = document.createElement("p");
    comment.className = "admin-quote-message";
    comment.textContent = review.comment;

    const actions = document.createElement("div");
    actions.className = "admin-review-actions";
    if (review.status === "pending") {
      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.className = "btn";
      window.mmdSetTranslatedText(approveButton, "Approve");
      approveButton.addEventListener("click", () => {
        void moderateReview(review, approveButton, true);
      });
      actions.append(approveButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-danger";
    window.mmdSetTranslatedText(deleteButton, "Delete");
    deleteButton.addEventListener("click", () => {
      void moderateReview(review, deleteButton, false);
    });
    actions.append(deleteButton);

    item.append(heading, rating);
    if (review.location) {
      item.append(location);
    }
    item.append(comment, actions);
    adminReviewsContainer.append(item);
  }
}

async function loadAdminReviews(): Promise<void> {
  adminRefreshReviewsButton.disabled = true;
  window.mmdSetTranslatedText(adminReviewStatus, "Loading customer reviews...");

  try {
    const result = await requestJson(`${adminReviewsApiUrl}/manage`);
    if (!isAdminReviewsResponse(result)) {
      throw new Error("The server returned customer reviews in an unexpected format.");
    }
    renderAdminReviews(result.comments);
    window.mmdSetTranslatedText(adminReviewStatus, "");
  } catch (error) {
    console.error("Could not load customer reviews:", error);
    window.mmdSetTranslatedText(
      adminReviewStatus,
      "Could not load customer reviews. {message}",
      {
        message: error instanceof Error ? error.message : "Please try again.",
      },
    );
  } finally {
    adminRefreshReviewsButton.disabled = false;
  }
}

async function moderateReview(
  review: AdminReview,
  button: HTMLButtonElement,
  approve: boolean,
): Promise<void> {
  if (
    !approve &&
    !window.confirm(
      window.mmdTranslateText('Delete "{name}"\'s review?', {
        name: review.name,
      }),
    )
  ) {
    return;
  }

  button.disabled = true;
  window.mmdSetTranslatedText(
    adminReviewStatus,
    approve ? "Approving review..." : "Deleting review...",
  );
  try {
    await requestJson(
      `${adminReviewsApiUrl}/${encodeURIComponent(review.id)}${approve ? "/approve" : ""}`,
      { method: approve ? "POST" : "DELETE" },
    );
    await loadAdminReviews();
    window.mmdSetTranslatedText(
      adminReviewStatus,
      approve ? "Review approved and published." : "Review deleted.",
    );
  } catch (error) {
    console.error("Could not moderate the review:", error);
    window.mmdSetTranslatedText(
      adminReviewStatus,
      error instanceof Error ? error.message : "Could not update the review.",
    );
  } finally {
    button.disabled = false;
  }
}

adminKeyForm.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();
  const key = adminKeyInput.value.trim();
  if (!key) {
    window.mmdSetTranslatedText(
      adminKeyStatus,
      "Enter the admin key configured on the backend.",
    );
    return;
  }

  currentAdminKey = key;
  window.mmdSetTranslatedText(adminKeyStatus, "Checking admin key...");

  try {
    await requestJson(`${adminApiUrl}/verify`, { method: "POST" });
    await loadAdminWorks();
    setAuthenticated(true);
    await loadAdminQuotes();
    await loadAdminReviews();
  } catch (error) {
    console.error("Admin access could not be verified:", error);
    currentAdminKey = "";
    window.mmdSetTranslatedText(
      adminKeyStatus,
      error instanceof Error ? error.message : "Could not verify the admin key.",
    );
  }
});

adminLogoutButton.addEventListener("click", () => {
  currentAdminKey = "";
  adminKeyInput.value = "";
  adminQuotesContainer.replaceChildren();
  window.mmdSetTranslatedText(adminQuoteStatus, "");
  adminReviewsContainer.replaceChildren();
  window.mmdSetTranslatedText(adminReviewStatus, "");
  setAuthenticated(false);
});

adminRefreshQuotesButton.addEventListener("click", () => {
  void loadAdminQuotes();
});

adminRefreshReviewsButton.addEventListener("click", () => {
  void loadAdminReviews();
});

adminWorkForm.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();
  const images = Array.from(workImage.files ?? []);
  if (images.length === 0) {
    window.mmdSetTranslatedText(
      adminWorkStatus,
      "Choose at least one project photo to upload.",
    );
    return;
  }

  if (uploadButton) {
    uploadButton.disabled = true;
  }
  let uploadedCount = 0;

  try {
    for (const [index, image] of images.entries()) {
      window.mmdSetTranslatedText(
        adminWorkStatus,
        "Uploading photo {current} of {total}...",
        { current: index + 1, total: images.length },
      );
      const formData = new FormData();
      const title =
        image.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) ||
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
    window.mmdSetTranslatedText(
      adminWorkStatus,
      uploadedCount === 1
        ? "{count} photo published on the home page."
        : "{count} photos published on the home page.",
      { count: uploadedCount },
    );
  } catch (error) {
    console.error("Could not publish recent work:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Could not publish the photos. Please try again.";
    window.mmdSetTranslatedText(
      adminWorkStatus,
      uploadedCount > 0
        ? "{uploaded} of {total} photos uploaded before an error: {message}"
        : message,
      { uploaded: uploadedCount, total: images.length, message },
    );
  } finally {
    if (uploadButton) {
      uploadButton.disabled = false;
    }
  }
});
