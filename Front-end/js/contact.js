"use strict";
const quoteForm = document.getElementById("quoteForm");
if (!(quoteForm instanceof HTMLFormElement)) {
    throw new Error('The quote form is missing the "#quoteForm" element.');
}
const nameField = quoteForm.querySelector("#name");
const emailField = quoteForm.querySelector("#email");
const phoneField = quoteForm.querySelector("#phone");
const serviceField = quoteForm.querySelector("#service");
const messageField = quoteForm.querySelector("#message");
if (!nameField ||
    !emailField ||
    !phoneField ||
    !serviceField ||
    !messageField) {
    throw new Error("The quote form is missing one or more required fields.");
}
const submitButton = quoteForm.querySelector('button[type="submit"]');
quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = {
        name: nameField.value.trim(),
        email: emailField.value.trim(),
        phone: phoneField.value.trim(),
        service: serviceField.value,
        message: messageField.value.trim(),
    };
    if (!formData.name || !formData.email || !formData.service) {
        alert(window.mmdTranslateText("Please provide your name, email address, and the type of service."));
        return;
    }
    if (!emailField.validity.valid) {
        alert(window.mmdTranslateText("Please enter a valid email address."));
        emailField.focus();
        return;
    }
    if (submitButton) {
        submitButton.disabled = true;
    }
    try {
        const response = await fetch(window.mmdApiUrl("/api/quotes"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
        });
        if (!response.ok) {
            throw new Error(window.mmdTranslateText("The server returned {status}.", {
                status: response.status,
            }));
        }
        alert(window.mmdTranslateText("Thank you! Your quote request has been received. We will contact you soon."));
        quoteForm.reset();
    }
    catch (error) {
        console.error("Could not submit quote request:", error);
        alert(window.mmdTranslateText(error instanceof Error
            ? "We could not submit your request. {message} Please try again later."
            : "Could not submit your request. Please try again later.", error instanceof Error ? { message: error.message } : {}));
    }
    finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});
