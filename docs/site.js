document.documentElement.classList.add("js-ready");

// Handle Mobile Navigation
const navToggle = document.querySelector(".menu-toggle");
const navOverlay = document.querySelector(".mobile-nav-overlay");
const navLinks = document.querySelectorAll(".mobile-nav-overlay a");

if (navToggle && navOverlay) {
  navToggle.addEventListener("click", () => {
    const isActive = navOverlay.classList.toggle("is-active");
    navToggle.setAttribute("aria-expanded", String(isActive));

    // Toggle menu icon between hamburger and close
    if (isActive) {
      navToggle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      document.body.style.overflow = "hidden";
    } else {
      navToggle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
      document.body.style.overflow = "";
    }
  });

  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      navOverlay.classList.remove("is-active");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
      document.body.style.overflow = "";
    });
  });
}

// Active link highlighting
const currentPath = window.location.pathname.split("/").pop() || "index.html";
const allNavLinks = document.querySelectorAll(".nav-links a, .mobile-nav-overlay a");

allNavLinks.forEach((link) => {
  const href = link.getAttribute("href");
  if (href === currentPath || (currentPath === "" && href === "index.html")) {
    link.classList.add("active");
  }
});

// Intersection Observer for Reveal Animations
const revealTargets = document.querySelectorAll(".reveal");

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
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );

  revealTargets.forEach((target) => observer.observe(target));
} else {
  // Fallback for older browsers
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;

    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      e.preventDefault();
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});
