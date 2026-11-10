interface QuoteFormData {
  name: string;
  email: string;
  phone: string;
  service: string;
  serviceLabel: string;
  message: string;
}

const whatsappContactUrl = "https://wa.me/qr/VEF7XDQ7XXDAD1";
const quoteForm = document.getElementById("quoteForm");

if (!(quoteForm instanceof HTMLFormElement)) {
  throw new Error('The quote form is missing the "#quoteForm" element.');
}

const nameField = quoteForm.querySelector<HTMLInputElement>("#name");
const emailField = quoteForm.querySelector<HTMLInputElement>("#email");
const phoneField = quoteForm.querySelector<HTMLInputElement>("#phone");
const serviceField = quoteForm.querySelector<HTMLSelectElement>("#service");
const messageField = quoteForm.querySelector<HTMLTextAreaElement>("#message");
const contactStatusElement = document.getElementById("quoteStatus");

if (
  !nameField ||
  !emailField ||
  !phoneField ||
  !serviceField ||
  !messageField ||
  !(contactStatusElement instanceof HTMLElement)
) {
  throw new Error("The quote form is missing one or more required fields.");
}

const submitButton = quoteForm.querySelector<HTMLButtonElement>(
  'button[type="submit"]',
);

function createWhatsAppLink(formData: QuoteFormData): HTMLAnchorElement {
  const message = [
    "New painting and decoration quote request",
    `Name: ${formData.name}`,
    `Email: ${formData.email}`,
    `Phone: ${formData.phone || "Not provided"}`,
    `Service: ${formData.serviceLabel}`,
    `Project details: ${formData.message || "Not provided"}`,
  ].join("\n");
  const link = document.createElement("a");
  const whatsappUrl = new URL(whatsappContactUrl);
  whatsappUrl.searchParams.set("text", message);
  link.href = whatsappUrl.toString();
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  window.mmdSetTranslatedText(link, "Open WhatsApp with your quote details");
  return link;
}

quoteForm.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();

  const formData: QuoteFormData = {
    name: nameField.value.trim(),
    email: emailField.value.trim(),
    phone: phoneField.value.trim(),
    service: serviceField.value,
    serviceLabel: serviceField.selectedOptions[0]?.textContent?.trim() ?? "",
    message: messageField.value.trim(),
  };

  if (!formData.name || !formData.email || !formData.service) {
    window.mmdSetTranslatedText(
      contactStatusElement,
      "Please provide your name, email address, and the type of service.",
    );
    return;
  }

  if (!emailField.validity.valid) {
    window.mmdSetTranslatedText(
      contactStatusElement,
      "Please enter a valid email address.",
    );
    emailField.focus();
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }
  window.mmdSetTranslatedText(
    contactStatusElement,
    "Sending your quote request...",
  );

  try {
    const response = await fetch(window.mmdApiUrl("/api/quotes"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        service: formData.service,
        message: formData.message,
      }),
    });

    if (!response.ok) {
      throw new Error(
        window.mmdTranslateText("The server returned {status}.", {
          status: response.status,
        }),
      );
    }

    const result: { notificationSent?: boolean } = await response.json();
    window.mmdSetTranslatedText(
      contactStatusElement,
      result.notificationSent === false
        ? "Your request was received, but we couldn't notify the team automatically. For a faster response, please use the WhatsApp link on this page or call +220 6240363."
        : "Thank you! Your quote request has been received. We will contact you soon.",
    );
    quoteForm.reset();
  } catch (error) {
    console.error("Could not submit quote request online:", error);
    contactStatusElement.replaceChildren();
    window.mmdSetTranslatedText(
      contactStatusElement,
      "We couldn't save your request online. You can send your details directly:",
    );
    contactStatusElement.append(" ", createWhatsAppLink(formData));
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});
