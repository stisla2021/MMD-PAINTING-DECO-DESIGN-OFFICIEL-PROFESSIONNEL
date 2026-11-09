const hamburger = document.getElementById("hamburger");
const navLinks = document.getElementById("navLinks");

if (!(hamburger instanceof HTMLElement)) {
  throw new Error('The navigation menu is missing the "#hamburger" element.');
}

if (!(navLinks instanceof HTMLElement)) {
  throw new Error('The navigation menu is missing the "#navLinks" element.');
}

hamburger.addEventListener("click", () => {
  hamburger.classList.toggle("active");
  navLinks.classList.toggle("active");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    hamburger.classList.remove("active");
    navLinks.classList.remove("active");
  });
});
