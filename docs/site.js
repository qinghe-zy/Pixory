document.documentElement.classList.add("js-ready");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const progress = document.createElement("div");
progress.className = "scroll-progress";
progress.setAttribute("aria-hidden", "true");
document.body.append(progress);

function updateScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = max > 0 ? window.scrollY / max : 0;
  document.documentElement.style.setProperty("--scroll-progress", String(Math.min(1, Math.max(0, ratio))));
}

updateScrollProgress();
window.addEventListener("scroll", updateScrollProgress, { passive: true });
window.addEventListener("resize", updateScrollProgress);

const navToggle = document.querySelector("[data-menu-toggle]");
const navLinks = document.querySelector("[data-nav-links]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const currentPath = window.location.pathname.split("/").pop() || "index.html";
const navLinkItems = document.querySelectorAll("[data-nav-links] a");
navLinkItems.forEach((link) => {
  const href = link.getAttribute("href");
  if (href === currentPath || (currentPath === "" && href === "index.html")) {
    link.setAttribute("aria-current", "page");
  }

  link.addEventListener("click", () => {
    navLinks?.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

if (navLinks) {
  const indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  indicator.setAttribute("aria-hidden", "true");
  navLinks.prepend(indicator);

  const activeLink = () => navLinks.querySelector('a[aria-current="page"]') || navLinks.querySelector("a");
  const moveIndicator = (link) => {
    if (!link || window.innerWidth <= 980) return;
    navLinks.style.setProperty("--nav-indicator-width", `${link.offsetWidth}px`);
    navLinks.style.setProperty("--nav-indicator-x", `${link.offsetLeft}px`);
    navLinks.style.setProperty("--nav-indicator-opacity", "1");
  };

  requestAnimationFrame(() => moveIndicator(activeLink()));
  navLinkItems.forEach((link) => {
    link.addEventListener("mouseenter", () => moveIndicator(link));
    link.addEventListener("focus", () => moveIndicator(link));
  });
  navLinks.addEventListener("mouseleave", () => moveIndicator(activeLink()));
  window.addEventListener("resize", () => moveIndicator(activeLink()));
}

const revealTargets = document.querySelectorAll(".reveal, .reveal-stagger");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealTargets.forEach((target) => observer.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

document.querySelectorAll(".button").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (reduceMotion) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
});

const heroVisual = document.querySelector(".hero-visual");
const phone = document.querySelector(".phone");

if (heroVisual && !reduceMotion) {
  heroVisual.addEventListener("pointermove", (event) => {
    const rect = heroVisual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    heroVisual.style.setProperty("--glare-x", `${Math.round(x * 100)}%`);
    heroVisual.style.setProperty("--glare-y", `${Math.round(y * 100)}%`);
    heroVisual.style.setProperty("--parallax-x", `${(x - 0.5) * -12}px`);
    heroVisual.style.setProperty("--parallax-y", `${(y - 0.5) * -10}px`);
  });

  heroVisual.addEventListener("pointerleave", () => {
    heroVisual.style.setProperty("--glare-x", "68%");
    heroVisual.style.setProperty("--glare-y", "18%");
    heroVisual.style.setProperty("--parallax-x", "0px");
    heroVisual.style.setProperty("--parallax-y", "0px");
  });
}

if (phone && !reduceMotion) {
  phone.addEventListener("click", () => {
    phone.classList.remove("is-curating");
    void phone.offsetWidth;
    phone.classList.add("is-curating");
    window.setTimeout(() => phone.classList.remove("is-curating"), 900);
  });
}

document.querySelectorAll("[data-faq]").forEach((item) => {
  const button = item.querySelector(".faq-question");
  const answer = item.querySelector(".faq-answer");
  if (!button) return;

  // Initial ARIA state
  if (answer) {
    const id = `faq-answer-${Math.random().toString(36).slice(2, 7)}`;
    answer.id = id;
    button.setAttribute("aria-controls", id);
    answer.setAttribute("aria-hidden", button.getAttribute("aria-expanded") !== "true" ? "true" : "false");
  }

  button.addEventListener("click", () => {
    const isOpen = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
    if (answer) answer.setAttribute("aria-hidden", String(!isOpen));
  });
});

document.querySelectorAll('a[href]').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (reduceMotion || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target || link.hasAttribute("download")) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin || nextUrl.pathname === window.location.pathname) return;

    event.preventDefault();
    document.body.classList.add("is-leaving");
    window.setTimeout(() => {
      window.location.href = nextUrl.href;
    }, 180);
  });
});
