document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollProgress = document.querySelector(".scroll-progress");

  const updateScrollProgress = () => {
    if (!scrollProgress) return;

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
    scrollProgress.style.transform = `scaleX(${progress})`;
  };

  updateScrollProgress();
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);

  const createRipple = (event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.8;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    button.style.setProperty("--ripple-size", `${size}px`);
    button.style.setProperty("--ripple-x", `${x}px`);
    button.style.setProperty("--ripple-y", `${y}px`);
    button.classList.remove("is-rippling");
    void button.offsetWidth;
    button.classList.add("is-rippling");
    window.setTimeout(() => button.classList.remove("is-rippling"), 540);
  };

  // Mobile Nav
  const menuToggle = document.querySelector(".menu-toggle");
  const mobileNav = document.querySelector(".mobile-nav-overlay");

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", !isExpanded);
      if (!isExpanded) {
        mobileNav.classList.add("is-active");
        document.body.style.overflow = "hidden";
      } else {
        mobileNav.classList.remove("is-active");
        document.body.style.overflow = "";
      }
    });

    const mobileLinks = mobileNav.querySelectorAll("a");
    mobileLinks.forEach(link => {
      link.addEventListener("click", () => {
        menuToggle.setAttribute("aria-expanded", "false");
        mobileNav.classList.remove("is-active");
        document.body.style.overflow = "";
      });
    });
  }

  document.querySelectorAll(".btn").forEach(button => {
    button.addEventListener("click", createRipple);
  });

  const mockup = document.querySelector("[data-product-mockup]");
  if (mockup) {
    const presets = {
      character: { title: "角色资产库", count: "248", tags: "18" },
      brand: { title: "品牌视觉库", count: "96", tags: "12" },
      moodboard: { title: "灵感情绪板", count: "37", tags: "9" },
    };
    const title = mockup.querySelector("[data-mockup-title]");
    const count = mockup.querySelector("[data-mockup-count]");
    const tagCount = mockup.querySelector("[data-mockup-tags]");
    const selectedName = mockup.querySelector("[data-mockup-selection]");
    const selectedMeta = mockup.querySelector("[data-mockup-selection-meta]");

    mockup.querySelectorAll("[data-mockup-preset]").forEach(item => {
      item.addEventListener("click", () => {
        const preset = presets[item.dataset.mockupPreset];
        if (!preset) return;

        mockup.querySelectorAll("[data-mockup-preset]").forEach(nav => nav.classList.remove("is-active"));
        item.classList.add("is-active");
        if (title) title.textContent = preset.title;
        if (count) count.textContent = preset.count;
        if (tagCount) tagCount.textContent = preset.tags;
      });
    });

    mockup.querySelectorAll("[data-mockup-chip]").forEach(chip => {
      chip.addEventListener("click", () => {
        mockup.querySelectorAll("[data-mockup-chip]").forEach(item => item.classList.remove("is-active"));
        chip.classList.add("is-active");
      });
    });

    mockup.querySelectorAll(".mockup-asset-card").forEach(card => {
      card.addEventListener("click", () => {
        mockup.querySelectorAll(".mockup-asset-card").forEach(item => item.classList.remove("is-selected"));
        card.classList.add("is-selected");
        if (selectedName) selectedName.textContent = card.dataset.assetName || card.querySelector("strong")?.textContent || "Selected asset";
        if (selectedMeta) selectedMeta.textContent = card.dataset.assetMeta || card.querySelector("small")?.textContent || "Original preserved";
      });
    });

    mockup.querySelectorAll("[data-mockup-command]").forEach(command => {
      command.addEventListener("click", () => {
        const originalText = command.textContent;
        command.classList.add("is-done");
        command.textContent = command.dataset.mockupCommand === "backup" ? "已入清单" : "已记录";
        window.setTimeout(() => {
          command.classList.remove("is-done");
          command.textContent = originalText;
        }, 1200);
      });
    });
  }

  // Check if Anime.js is loaded
  if (typeof anime !== 'undefined' && !prefersReducedMotion) {

    // 1. Initial Hero Timeline Animation
    const heroTimeline = anime.timeline({
      easing: "easeOutExpo",
    });

    const heroElements = document.querySelectorAll(".hero-reveal");
    if (heroElements.length > 0) {
      heroElements.forEach(el => { el.style.visibility = "visible"; });
      heroTimeline.add({
        targets: ".hero-reveal",
        translateY: [44, 0],
        opacity: [0, 1],
        duration: 900,
        delay: anime.stagger(130),
      }).add({
        targets: ".hero-mockup .mockup-dot",
        scale: [0.4, 1],
        opacity: [0, 1],
        duration: 420,
        delay: anime.stagger(80),
      }, "-=420").add({
        targets: ".mockup-sidebar > *, .mockup-tags > span, .mockup-tags > button, .mockup-metrics > div, .asset-sheen, .mockup-inspector, .mockup-toolbar > *",
        translateY: [18, 0],
        opacity: [0, 1],
        duration: 720,
        delay: anime.stagger(55),
      });
    }

    // 2. Intersection Observer with Anime.js for Scroll Elements
    const scrollRevealGroups = document.querySelectorAll("[data-anime-group]");

    if ("IntersectionObserver" in window) {
      const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const group = entry.target;
            const elements = group.querySelectorAll(".anime-reveal");

            elements.forEach(el => { el.style.visibility = "visible"; });

            anime({
              targets: elements,
              translateY: [30, 0],
              opacity: [0, 1],
              easing: "easeOutExpo",
              duration: 760,
              delay: anime.stagger(100),
            });

            observer.unobserve(group);
          }
        });
      }, {
        root: null,
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.1
      });

      scrollRevealGroups.forEach(group => scrollObserver.observe(group));
    } else {
      // Fallback
      document.querySelectorAll(".anime-reveal").forEach(el => {
        el.style.opacity = 1;
        el.style.visibility = "visible";
      });
    }

    // 3. Interactive Feedback (Buttons)
    const buttons = document.querySelectorAll(".btn, .feature-card");
    buttons.forEach(btn => {
      btn.addEventListener("mousedown", () => {
        anime({
          targets: btn,
          scale: 0.95,
          duration: 120,
          easing: "easeOutQuad"
        });
      });
      btn.addEventListener("mouseup", () => {
        anime({
          targets: btn,
          scale: 1,
          duration: 260,
          easing: "easeOutExpo"
        });
      });
      btn.addEventListener("mouseleave", () => {
        anime({
          targets: btn,
          scale: 1,
          duration: 260,
          easing: "easeOutExpo"
        });
      });

      if(btn.classList.contains('feature-card') || btn.classList.contains('mockup-card-dark')) {
        btn.addEventListener("mouseenter", () => {
          anime({
            targets: btn,
            translateY: -4,
            boxShadow: '0 14px 34px -18px rgba(20,20,19,0.22)',
            duration: 280,
            easing: "easeOutCubic"
          });
        });
        btn.addEventListener("mouseleave", () => {
          anime({
            targets: btn,
            translateY: 0,
            boxShadow: '0 0px 0px 0px rgba(0,0,0,0)',
            duration: 280,
            easing: "easeOutCubic"
          });
        });
      }
    });

  } else {
    // Fallback if anime.js fails to load
    document.querySelectorAll(".anime-reveal, .hero-reveal").forEach(el => {
      el.style.opacity = 1;
      el.style.visibility = "visible";
      el.style.transform = "none";
    });
  }
});
