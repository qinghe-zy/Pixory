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
      character: {
        title: "角色资产库", count: 248, tags: 18,
        assets: [
          { name: "Spring_look_041", meta: "Scene group · 12.4 MB · 原图已保留", thumb: "warm", subtitle: "Scene · favorite" },
          { name: "Expression_set", meta: "Character group · 8 tags · 最近查看", thumb: "teal", subtitle: "Character · tags" },
          { name: "Festival_keyart", meta: "Usage group · 已收藏 · 有备注", thumb: "amber", subtitle: "Usage · note" },
          { name: "Backup_ready", meta: "Manifest ready · SQLite + originals", thumb: "ink", subtitle: "Manifest · SQLite" }
        ]
      },
      brand: {
        title: "品牌视觉库", count: 96, tags: 12,
        assets: [
          { name: "Logo_Variants_Final", meta: "Brand assets · 4.2 MB", thumb: "ink", subtitle: "Logo · final" },
          { name: "Color_Palette_2026", meta: "Guidelines · 1.1 MB", thumb: "teal", subtitle: "Colors · core" },
          { name: "Typography_Scale", meta: "Guidelines · 2.8 MB", thumb: "amber", subtitle: "Type · spec" },
          { name: "Social_Banners", meta: "Exported · 18 MB", thumb: "warm", subtitle: "Social · active" }
        ]
      },
      moodboard: {
        title: "灵感情绪板", count: 37, tags: 9,
        assets: [
          { name: "Cyberpunk_Ref_01", meta: "Inspiration · 3.4 MB", thumb: "teal", subtitle: "Ref · cyberpunk" },
          { name: "Minimalist_UI", meta: "Inspiration · 1.2 MB", thumb: "ink", subtitle: "Ref · minimal" },
          { name: "Lighting_Study", meta: "Photography · 8.9 MB", thumb: "warm", subtitle: "Light · warm" },
          { name: "Texture_Pack", meta: "Assets · 24 MB", thumb: "amber", subtitle: "Texture · raw" }
        ]
      },
    };
    const title = mockup.querySelector("[data-mockup-title]");
    const count = mockup.querySelector("[data-mockup-count]");
    const tagCount = mockup.querySelector("[data-mockup-tags]");
    const selectedName = mockup.querySelector("[data-mockup-selection]");
    const selectedMeta = mockup.querySelector("[data-mockup-selection-meta]");
    const assetGrid = mockup.querySelector(".mockup-asset-grid");

    const attachCardListeners = () => {
      mockup.querySelectorAll(".mockup-asset-card").forEach(card => {
        card.addEventListener("click", () => {
          mockup.querySelectorAll(".mockup-asset-card").forEach(item => item.classList.remove("is-selected"));
          card.classList.add("is-selected");
          if (selectedName) selectedName.textContent = card.dataset.assetName || card.querySelector("strong")?.textContent || "Selected asset";
          if (selectedMeta) selectedMeta.textContent = card.dataset.assetMeta || card.querySelector("small")?.textContent || "Original preserved";
        });
      });
    };
    attachCardListeners();

    // Tabs
    const viewLibrary = document.getElementById("mockup-view-library");
    const viewChat = document.getElementById("mockup-view-chat");
    const archivesNav = document.getElementById("mockup-archives-nav");
    
    mockup.querySelectorAll("[data-mockup-tab]").forEach(tab => {
      tab.addEventListener("click", () => {
        mockup.querySelectorAll("[data-mockup-tab]").forEach(item => item.classList.remove("is-active"));
        tab.classList.add("is-active");
        
        if (tab.dataset.mockupTab === "chat") {
          if (viewLibrary) viewLibrary.style.display = "none";
          if (viewChat) {
            viewChat.style.display = "flex";
            if (typeof anime !== 'undefined') {
              anime({ targets: viewChat, opacity: [0, 1], translateY: [10, 0], duration: 400, easing: 'easeOutCubic' });
            }
          }
        } else {
          if (viewChat) viewChat.style.display = "none";
          if (viewLibrary) {
            viewLibrary.style.display = "flex";
            if (typeof anime !== 'undefined') {
              anime({ targets: viewLibrary, opacity: [0.8, 1], duration: 400, easing: 'easeOutCubic' });
            }
          }
        }
      });
    });

    // Chat Interactions
    const chatBackBtn = document.getElementById("mockup-chat-back");
    if (chatBackBtn) {
      chatBackBtn.addEventListener("click", () => {
        const libraryTab = mockup.querySelector('[data-mockup-tab="library"]');
        if (libraryTab) libraryTab.click();
      });
    }

    // Automated Loop Animation
    const chatThread = document.getElementById("mockup-chat-thread");
    
    window.playChatAnimation = async function() {
      if (!chatThread) return;
      
      while (true) {
        chatThread.innerHTML = "";

        async function showTypingIndicator() {
          const wrapper = document.createElement("div");
          wrapper.className = "chat-bubble-wrapper chat-bubble-ai-wrapper chat-bubble-enter";
          
          const iconDiv = document.createElement("div");
          iconDiv.style.flexShrink = "0";
          iconDiv.style.width = "36px";
          iconDiv.style.height = "36px";
          iconDiv.style.background = "#CD7154";
          iconDiv.style.borderRadius = "8px";
          iconDiv.style.display = "flex";
          iconDiv.style.alignItems = "center";
          iconDiv.style.justifyContent = "center";
          iconDiv.style.color = "white";
          iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 22c.2 0 .4-.1.5-.2l3.4-4.8c.3-.4.8-.6 1.3-.6h3.8c1.1 0 2-.9 2-2v-3.8c0-.5.2-1 .6-1.3l4.8-3.4c.3-.2.5-.5.5-.8s-.2-.6-.5-.8l-4.8-3.4c-.4-.3-.6-.8-.6-1.3V3.8c0-1.1-.9-2-2-2h-3.8c-.5 0-1-.2-1.3-.6L12.5.4c-.2-.3-.5-.4-.8-.4s-.6.1-.8.4L7.5 5.2c-.3.4-.8.6-1.3.6H2.4c-1.1 0-2 .9-2 2v3.8c0 .5-.2 1-.6 1.3L-5 16.3c-.3.2-.5.5-.5.8s.2.6.5.8l4.8 3.4c.4.3.6.8.6 1.3v3.8c0 1.1.9 2 2 2h3.8c.5 0 1 .2 1.3.6l3.4 4.8c.2.1.4.2.6.2z" fill="currentColor" transform="scale(0.8) translate(3,3)"/></svg>';

          const typingDiv = document.createElement("div");
          typingDiv.className = "typing-indicator";
          typingDiv.innerHTML = '<div class="ripple-dot"></div><div class="ripple-dot"></div><div class="ripple-dot"></div>';

          wrapper.appendChild(iconDiv);
          wrapper.appendChild(typingDiv);
          chatThread.appendChild(wrapper);
          
          chatThread.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' });
          return wrapper;
        }

        async function addAiBubble(text, delay) {
          await new Promise(r => setTimeout(r, delay / 2));
          
          const typingEl = await showTypingIndicator();
          await new Promise(r => setTimeout(r, delay));
          
          typingEl.remove();

          const aiWrapper = document.createElement("div");
          aiWrapper.className = "chat-bubble-wrapper chat-bubble-ai-wrapper chat-bubble-enter";

          const iconDiv = document.createElement("div");
          iconDiv.style.flexShrink = "0";
          iconDiv.style.width = "36px";
          iconDiv.style.height = "36px";
          iconDiv.style.background = "#CD7154";
          iconDiv.style.borderRadius = "8px";
          iconDiv.style.display = "flex";
          iconDiv.style.alignItems = "center";
          iconDiv.style.justifyContent = "center";
          iconDiv.style.color = "white";
          iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 22c.2 0 .4-.1.5-.2l3.4-4.8c.3-.4.8-.6 1.3-.6h3.8c1.1 0 2-.9 2-2v-3.8c0-.5.2-1 .6-1.3l4.8-3.4c.3-.2.5-.5.5-.8s-.2-.6-.5-.8l-4.8-3.4c-.4-.3-.6-.8-.6-1.3V3.8c0-1.1-.9-2-2-2h-3.8c-.5 0-1-.2-1.3-.6L12.5.4c-.2-.3-.5-.4-.8-.4s-.6.1-.8.4L7.5 5.2c-.3.4-.8.6-1.3.6H2.4c-1.1 0-2 .9-2 2v3.8c0 .5-.2 1-.6 1.3L-5 16.3c-.3.2-.5.5-.5.8s.2.6.5.8l4.8 3.4c.4.3.6.8.6 1.3v3.8c0 1.1.9 2 2 2h3.8c.5 0 1 .2 1.3.6l3.4 4.8c.2.1.4.2.6.2z" fill="currentColor" transform="scale(0.8) translate(3,3)"/></svg>';

          const contentDiv = document.createElement("div");
          contentDiv.className = "chat-bubble-content chat-bubble-ai-content";
          
          const shimmerDiv = document.createElement("div");
          shimmerDiv.className = "shimmer";
          
          const textSpan = document.createElement("span");
          textSpan.style.position = "relative";
          textSpan.style.zIndex = "4";
          textSpan.textContent = text;
          
          contentDiv.appendChild(shimmerDiv);
          contentDiv.appendChild(textSpan);

          aiWrapper.appendChild(iconDiv);
          aiWrapper.appendChild(contentDiv);
          chatThread.appendChild(aiWrapper);

          chatThread.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' });
        }

        function addUserBubble(text, delay) {
          return new Promise(resolve => {
            setTimeout(() => {
              const userWrapper = document.createElement("div");
              userWrapper.className = "chat-bubble-wrapper chat-bubble-user-wrapper chat-bubble-enter";

              const iconDiv = document.createElement("div");
              iconDiv.style.flexShrink = "0";
              iconDiv.style.width = "36px";
              iconDiv.style.height = "36px";
              iconDiv.style.background = "var(--surface-dark)";
              iconDiv.style.borderRadius = "8px";
              iconDiv.style.display = "flex";
              iconDiv.style.alignItems = "center";
              iconDiv.style.justifyContent = "center";
              iconDiv.style.color = "white";
              iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

              const contentDiv = document.createElement("div");
              contentDiv.className = "chat-bubble-content chat-bubble-user-content";
              contentDiv.textContent = text;
              
              userWrapper.appendChild(iconDiv);
              userWrapper.appendChild(contentDiv);
              chatThread.appendChild(userWrapper);
              
              chatThread.scrollTo({ top: chatThread.scrollHeight, behavior: 'smooth' });
              resolve();
            }, delay);
          });
        }

        await addUserBubble("这个角色后面还能接着聊吗？", 500);
        await addAiBubble("可以。Pixory 会保存角色卡、当前分支、记忆快照和上下文摘要，下一轮不会只剩一段孤立聊天。", 2000);
        await addUserBubble("SillyTavern 的角色卡能导进来吗？", 2000);
        await addAiBubble("能导入 PNG/JSON，也能导出兼容 PNG。记忆和上一轮上下文会整理成 Markdown，方便跨平台续聊。", 2000);
        await addUserBubble("资料和聊天内容会怎么保存？", 2000);
        await addAiBubble("本地 SQLite 保存聊天、角色、记忆和材料；请求模型时，只把本轮所需 prompt 发给你配置的供应商。", 2000);
        
        // Wait before restarting loop
        await new Promise(r => setTimeout(r, 4000));
      }
    };

    window.playChatAnimation();

    mockup.querySelectorAll("[data-mockup-preset]").forEach(item => {
      item.addEventListener("click", () => {
        const presetKey = item.dataset.mockupPreset;
        const preset = presets[presetKey];
        if (!preset) return;

        mockup.querySelectorAll("[data-mockup-preset]").forEach(nav => nav.classList.remove("is-active"));
        item.classList.add("is-active");

        if (title) title.textContent = preset.title;

        if (typeof anime !== 'undefined' && count && tagCount) {
          anime({
            targets: count,
            innerHTML: [parseInt(count.textContent) || 0, preset.count],
            round: 1,
            easing: 'easeOutExpo',
            duration: 800
          });
          anime({
            targets: tagCount,
            innerHTML: [parseInt(tagCount.textContent) || 0, preset.tags],
            round: 1,
            easing: 'easeOutExpo',
            duration: 800
          });
        } else {
          if (count) count.textContent = preset.count;
          if (tagCount) tagCount.textContent = preset.tags;
        }

        if (assetGrid) {
          assetGrid.innerHTML = preset.assets.map((asset, i) => `
            <button class="asset-sheen mockup-asset-card ${i === 0 ? 'is-selected' : ''}" type="button" data-asset-name="${asset.name}" data-asset-meta="${asset.meta}">
              <span class="asset-thumb asset-thumb-${asset.thumb}"></span>
              <strong>${asset.name}</strong>
              <small>${asset.subtitle}</small>
            </button>
          `).join('');

          attachCardListeners();

          if (selectedName) selectedName.textContent = preset.assets[0].name;
          if (selectedMeta) selectedMeta.textContent = preset.assets[0].meta;

          if (typeof anime !== 'undefined') {
            anime({
              targets: assetGrid.querySelectorAll('.mockup-asset-card'),
              translateY: [10, 0],
              opacity: [0, 1],
              delay: anime.stagger(50),
              duration: 400,
              easing: 'easeOutCubic'
            });
          }
        }
      });
    });

    mockup.querySelectorAll("[data-mockup-chip]").forEach(chip => {
      chip.addEventListener("click", () => {
        mockup.querySelectorAll("[data-mockup-chip]").forEach(item => item.classList.remove("is-active"));
        chip.classList.add("is-active");
        
        if (assetGrid && typeof anime !== 'undefined') {
          anime({
            targets: assetGrid.querySelectorAll('.mockup-asset-card'),
            scale: [0.95, 1],
            opacity: [0.5, 1],
            delay: anime.stagger(30),
            duration: 300,
            easing: 'easeOutQuad'
          });
        }
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
    // Auto-play the chat animation for promotional concept without user interaction
    setTimeout(() => {
      const chatTab = document.querySelector('[data-mockup-tab="chat"]');
      if (chatTab) chatTab.click();
    }, 1000);
  }
});

/* --- Cinematic Hero Interaction Logic --- */
document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('hero-mobile-menu');
  const menuLinks = document.querySelectorAll('#hero-mobile-menu a');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('open');
      mobileMenu.classList.toggle('open');
      if (mobileMenu.classList.contains('open')) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });

    menuLinks.forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // Video & Text Switcher with Auto-rotation
  const switcherBtns = document.querySelectorAll('.switcher-btn');
  const videos = document.querySelectorAll('.hero-video');
  const textGroups = document.querySelectorAll('.hero-text-group');
  const contentLayer = document.getElementById('hero-content');
  // activeContentIndex tracks which text group is visible (0=English, 1-4=features)
  let activeContentIndex = 0;
  let isTransitioning = false;
  let autoplayTimer = null;
  let idleTimer = null;
  const IDLE_DELAY = 10000;   // 10s before first auto-play
  const SLIDE_INTERVAL = 5000; // 5s per slide
  const RESUME_DELAY = 5000;  // 5s after click to resume

  function showContent(nextContentIndex) {
    if (isTransitioning || nextContentIndex === activeContentIndex) return;
    isTransitioning = true;

    // Update text groups
    textGroups.forEach(g => g.classList.remove('active'));
    const nextGroup = document.querySelector(`[data-content="${nextContentIndex}"]`);
    if (nextGroup) nextGroup.classList.add('active');

    // Update videos: content 0 uses video 0, content 1-4 maps to video 0-3
    const nextVideoIndex = nextContentIndex === 0 ? 0 : nextContentIndex - 1;
    const prevVideoIndex = activeContentIndex === 0 ? 0 : activeContentIndex - 1;
    if (nextVideoIndex !== prevVideoIndex) {
      // Pause old video
      if (videos[prevVideoIndex]) videos[prevVideoIndex].pause();
      videos.forEach(v => v.classList.remove('active'));
      // Play new video
      const nextVid = videos[nextVideoIndex];
      if (nextVid) {
        nextVid.classList.add('active');
        nextVid.play().catch(() => {});
      }
      // Preload the next video in sequence so it's ready
      const peekIndex = (nextVideoIndex + 1) % videos.length;
      if (videos[peekIndex] && videos[peekIndex].preload === 'none') {
        videos[peekIndex].preload = 'auto';
      }
    }

    // Update buttons: only highlight if content 1-4
    switcherBtns.forEach(b => b.classList.remove('active'));
    if (nextContentIndex >= 1) {
      const matchBtn = document.querySelector(`[data-vid="${nextContentIndex}"]`);
      if (matchBtn) matchBtn.classList.add('active');
    }

    activeContentIndex = nextContentIndex;
    setTimeout(() => { isTransitioning = false; }, 1000);
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      // Cycle through all 5 groups: 0 → 1 → 2 → 3 → 4 → 0 → ...
      const next = (activeContentIndex + 1) % 5;
      showContent(next);
    }, SLIDE_INTERVAL);
  }

  function stopAutoplay() {
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function scheduleResume(delay) {
    stopAutoplay();
    idleTimer = setTimeout(() => { startAutoplay(); }, delay);
  }

  if (switcherBtns.length > 0 && videos.length > 0) {
    // Button clicks
    switcherBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const nextIndex = parseInt(btn.getAttribute('data-vid'), 10);
        showContent(nextIndex);
        scheduleResume(RESUME_DELAY);
      });
    });

    // Start idle countdown on page load
    idleTimer = setTimeout(() => { startAutoplay(); }, IDLE_DELAY);

    // Pause video when page is hidden to save battery/CPU
    document.addEventListener('visibilitychange', () => {
      const activeVid = document.querySelector('.hero-video.active');
      if (activeVid) {
        if (document.hidden) {
          activeVid.pause();
        } else {
          activeVid.play().catch(() => {});
        }
      }
    });
  }

  // --- Download Modal Logic ---
  const downloadTriggers = document.querySelectorAll('.download-btn-trigger');
  const downloadModal = document.getElementById('download-modal');
  const modalClose = document.getElementById('download-modal-close');

  if (downloadModal && modalClose) {
    downloadTriggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        downloadModal.classList.add('active');
      });
    });

    modalClose.addEventListener('click', () => {
      downloadModal.classList.remove('active');
    });

    // Close on clicking outside the content
    downloadModal.addEventListener('click', (e) => {
      if (e.target === downloadModal) {
        downloadModal.classList.remove('active');
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && downloadModal.classList.contains('active')) {
        downloadModal.classList.remove('active');
      }
    });
  }

  // --- Updates Modal Logic ---
  const updatesTriggers = document.querySelectorAll('.updates-btn-trigger');
  const updatesModal = document.getElementById('updates-modal');
  const updatesModalClose = document.getElementById('updates-modal-close');

  if (updatesModal && updatesModalClose) {
    updatesTriggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        updatesModal.classList.add('active');
      });
    });

    updatesModalClose.addEventListener('click', () => {
      updatesModal.classList.remove('active');
    });

    // Close on clicking outside the content
    updatesModal.addEventListener('click', (e) => {
      if (e.target === updatesModal) {
        updatesModal.classList.remove('active');
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && updatesModal.classList.contains('active')) {
        updatesModal.classList.remove('active');
      }
    });
  }
});
