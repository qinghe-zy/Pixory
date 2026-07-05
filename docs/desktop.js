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


  const videos = document.querySelectorAll('.hero-video');
  const switcherBtns = document.querySelectorAll('.switcher-btn');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  // Ensure the active video plays
  videos.forEach(v => {
    if (v.classList.contains('active')) {
      v.play().catch(() => {});
    }
    // Auto-resume if video was stalled and finally buffered
    v.addEventListener('canplay', () => {
      if (v.classList.contains('active') && v.paused) {
        v.play().catch(() => {});
      }
    });
  });

  // Browser autoplay policy workaround: play on first interaction
  document.addEventListener('click', () => {
    const activeVid = document.querySelector('.hero-video.active');
    if (activeVid && activeVid.paused) {
      activeVid.play().catch(() => {});
    }
  }, { once: true, passive: true });

  const textGroups = document.querySelectorAll('.hero-text-group');
  const contentLayer = document.getElementById('hero-content');
  // activeContentIndex tracks which text group is visible (0=English, 1-4=features)
  let activeContentIndex = 0;
  let isTransitioning = false;
  let autoplayTimer = null;
  let idleTimer = null;
  const IDLE_DELAY = 30000;   // 30s before first auto-play
  const SLIDE_INTERVAL = 20000; // 20s per slide
  const RESUME_DELAY = 20000;  // 20s after click to resume

  function showContent(nextContentIndex) {
    if (isTransitioning || nextContentIndex === activeContentIndex) return;
    isTransitioning = true;

    // Update text groups
    textGroups.forEach(g => g.classList.remove('active'));
    const nextGroup = document.querySelector(`[data-content="${nextContentIndex}"]`);
    if (nextGroup) nextGroup.classList.add('active');

    // Update fallback gradient background
    const heroSection = document.querySelector('.cinematic-hero');
    if (heroSection) {
      heroSection.className = `cinematic-hero scene-${nextContentIndex}`;
    }

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

    // Hero badge click (switch to English main)
    const heroBadge = document.querySelector('.hero-badge');
    if (heroBadge) {
      heroBadge.addEventListener('click', () => {
        showContent(0);
        scheduleResume(RESUME_DELAY);
      });
    }

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

  // --- Features Modal Logic ---
  const heroTextContainer = document.getElementById('hero-text-container');
  const featuresModal = document.getElementById('features-modal');
  const featuresModalClose = document.getElementById('features-modal-close');

  if (heroTextContainer && featuresModal && featuresModalClose) {
    heroTextContainer.addEventListener('click', (e) => {
      e.preventDefault();
      const activeGroup = heroTextContainer.querySelector('.hero-text-group.active');
      if (activeGroup) {
        const contentId = activeGroup.getAttribute('data-content');
        featuresModal.querySelectorAll('.feature-detail').forEach(detail => {
          detail.style.display = 'none';
        });
        const activeDetail = featuresModal.querySelector(`.feature-detail[data-feature-detail="${contentId}"]`);
        if (activeDetail) {
          activeDetail.style.display = 'block';
        }
      }
      featuresModal.classList.add('active');
    });

    featuresModalClose.addEventListener('click', () => {
      featuresModal.classList.remove('active');
    });

    // Close on clicking outside the content
    featuresModal.addEventListener('click', (e) => {
      if (e.target === featuresModal) {
        featuresModal.classList.remove('active');
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && featuresModal.classList.contains('active')) {
        featuresModal.classList.remove('active');
      }
    });
  }

  // --- Fetch Release Notes ---
  async function loadReleaseNotes() {
    const container = document.getElementById('release-notes-container');
    if (!container) return;
    
    try {
      const res = await fetch('https://api.github.com/repos/qinghe-zy/Pixory/releases?per_page=5');
      if (!res.ok) throw new Error('Failed to fetch releases');
      const releases = await res.json();
      
      let html = '';
      releases.forEach(r => {
        const date = new Date(r.published_at).toISOString().split('T')[0];
        const bodyHtml = typeof marked !== 'undefined' ? marked.parse(r.body) : r.body;
        
        html += `
          <div class="timeline-item" style="margin-bottom: 40px;">
            <div class="text-caption-caps" style="color: #fff; margin-bottom: 8px; opacity: 0.8;">${date}</div>
            <h3 style="margin-bottom: 24px; font-size: 24px; font-family: 'Instrument Serif', serif; font-weight: normal;">${r.name || r.tag_name}</h3>
            <div class="markdown-body" style="color: rgba(255,255,255,0.8); font-size: 14px; font-family: var(--font-body);">
              ${bodyHtml}
            </div>
          </div>
        `;
      });
      
      html += `
        <div style="text-align: center; margin-top: 40px;">
          <a href="https://github.com/qinghe-zy/Pixory/releases" target="_blank" rel="noreferrer" style="color: #fff; opacity: 0.7; text-decoration: none; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 2px;">访问 GitHub 查看完整记录</a>
        </div>
      `;
      
      container.innerHTML = html;
    } catch (e) {
      console.error('Error fetching release notes:', e);
      container.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 40px 0;">Failed to load release history.</div>';
    }
  }

  loadReleaseNotes();
});

/* --- Cinematic Click: Glass-Touch Ripple + Scene Particles --- */
(function() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Per-scene palettes [core, mid, outer]
  const palettes = {
    0: [[255,195,110],[255,165,80],[255,140,60]],
    1: [[255,185,170],[255,150,145],[240,120,130]],
    2: [[170,230,210],[130,210,180],[100,190,160]],
    3: [[195,225,245],[160,205,230],[130,190,220]],
    4: [[235,210,240],[215,185,225],[200,160,215]],
  };

  let effects = [];
  let running = false;

  function rgba(c, a) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${Math.max(0,Math.min(1,a))})`; }
  function rand(a, b) { return Math.random() * (b - a) + a; }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // =========================================================
  //  Scene-specific particle generators
  // =========================================================

  // Scene 0 & 1: Fireflies — warm glowing orbs that burst outward then drift
  function makeFireflies(x, y, pal, count) {
    const ps = [];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = rand(60, 180);
      ps.push({
        type: 'firefly',
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - rand(30, 80),
        size: rand(2, 4.5),
        life: 0, maxLife: rand(2.0, 4.0),
        delay: rand(0, 0.15),
        phase: rand(0, Math.PI * 2),
        pulseSpd: rand(3, 8),
        col: pal[Math.floor(rand(0, 3))],
        trail: [],
      });
    }
    return ps;
  }

  // Scene 2: Golden dust — sparkling specks that scatter wide
  function makeGoldenDust(x, y, pal, count) {
    const ps = [];
    const golds = [[255,215,140],[255,235,180],[240,200,100]];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = rand(80, 250);
      ps.push({
        type: 'dust',
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: rand(1, 3),
        life: 0, maxLife: rand(1.0, 2.5),
        delay: rand(0, 0.1),
        twinkleSpd: rand(6, 14),
        phase: rand(0, Math.PI * 2),
        col: golds[Math.floor(rand(0, 3))],
        drag: rand(0.96, 0.985),
      });
    }
    return ps;
  }

  // Scene 3: Snowflakes — hex-shaped flakes that burst then drift down
  function makeSnowflakes(x, y, pal, count) {
    const ps = [];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = rand(60, 180);
      ps.push({
        type: 'snow',
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: rand(3, 8),
        life: 0, maxLife: rand(2.5, 5.0),
        delay: rand(0, 0.12),
        spin: rand(-2, 2),
        wobbleSpd: rand(1.5, 4),
        wobbleAmp: rand(15, 40),
        phase: rand(0, Math.PI * 2),
        col: [rand(200,240)|0, rand(225,250)|0, 255],
        drag: rand(0.97, 0.993),
        branches: (Math.random() > 0.5) ? 6 : 4,
      });
    }
    return ps;
  }

  // Scene 4: Firework sparklers — bright streaks that arc outward with gravity
  function makeSparklers(x, y, pal, count) {
    const ps = [];
    const colors = [[255,230,180],[255,200,100],[255,180,220],[200,220,255],[255,255,220]];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = rand(180, 450);
      ps.push({
        type: 'sparkler',
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - rand(60, 160),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(1.0, 2.2),
        delay: rand(0, 0.05),
        col: colors[Math.floor(rand(0, colors.length))],
        drag: rand(0.97, 0.99),
        gravity: rand(120, 280),
        trail: [],
      });
    }
    return ps;
  }

  // =========================================================
  //  Spawn
  // =========================================================
  function spawn(x, y, scene) {
    const pal = palettes[scene] || palettes[0];
    const fx = {
      x, y, pal, scene,
      birth: performance.now(),
      waves: [],
      bloom: { maxR: 18, dur: 0.6 },
      motes: [],
      particles: [], // scene-specific
    };

    // Base ripple waves (4-6)
    const waveCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < waveCount; i++) {
      fx.waves.push({
        delay:    i * 0.08 + rand(0, 0.03),
        maxR:     50 + i * 18 + rand(0, 12),
        peakW:    6 - i * 0.7 + rand(0, 1.5),
        dur:      1.0 + i * 0.15 + rand(0, 0.1),
        colorIdx: Math.min(i < 2 ? 0 : i < 4 ? 1 : 2, 2),
      });
    }

    // Base motes (6-10)
    const moteCount = 6 + Math.floor(rand(0, 5));
    for (let i = 0; i < moteCount; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = 30 + rand(0, 80);
      fx.motes.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 20 - rand(0, 40),
        size: 1.2 + rand(0, 2),
        life: 0, maxLife: 1.5 + rand(0, 1.5),
        delay: 0.03 + rand(0, 0.12),
        phase: rand(0, Math.PI * 2),
        colorIdx: Math.floor(rand(0, 3)),
      });
    }

    // Scene-specific particles
    switch (scene) {
      case 0: fx.particles = makeFireflies(x, y, pal, 8 + (rand(0,5)|0)); break;
      case 1: fx.particles = makeFireflies(x, y, pal, 10 + (rand(0,5)|0)); break;
      case 2: fx.particles = makeGoldenDust(x, y, pal, 15 + (rand(0,8)|0)); break;
      case 3: fx.particles = makeSnowflakes(x, y, pal, 12 + (rand(0,6)|0)); break;
      case 4: fx.particles = makeSparklers(x, y, pal, 14 + (rand(0,8)|0)); break;
    }

    if (effects.length > 5) effects.shift(); // Limit max concurrent effects
    effects.push(fx);
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  // =========================================================
  //  Render
  // =========================================================
  let prev = 0;
  function tick(now) {
    if (!prev) prev = now;
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (let ei = effects.length - 1; ei >= 0; ei--) {
      const fx = effects[ei];
      const elapsed = (now - fx.birth) / 1000;
      let alive = false;

      // --- Central bloom ---
      const bt = elapsed / fx.bloom.dur;
      if (bt < 1) {
        alive = true;
        const br = fx.bloom.maxR * easeOutCubic(bt);
        const ba = bt < 0.15 ? bt / 0.15 : Math.pow(1 - (bt - 0.15) / 0.85, 2);
        const g1 = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, br * 2.5);
        g1.addColorStop(0, rgba(fx.pal[0], ba * 0.25));
        g1.addColorStop(0.5, rgba(fx.pal[1], ba * 0.08));
        g1.addColorStop(1, rgba(fx.pal[2], 0));
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, br * 2.5, 0, Math.PI * 2); ctx.fill();
        const g2 = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, br);
        g2.addColorStop(0, rgba([255,255,255], ba * 0.85));
        g2.addColorStop(0.4, rgba(fx.pal[0], ba * 0.5));
        g2.addColorStop(1, rgba(fx.pal[0], 0));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, br, 0, Math.PI * 2); ctx.fill();
      }

      // --- Ripple waves ---
      for (const w of fx.waves) {
        const wt = (elapsed - w.delay) / w.dur;
        if (wt < 0) { alive = true; continue; }
        if (wt >= 1) continue;
        alive = true;
        const r = w.maxR * easeOutQuart(wt);
        const width = w.peakW * (wt < 0.25 ? wt / 0.25 : 1 - (wt - 0.25) / 0.75);
        const alpha = wt < 0.1 ? wt / 0.1 : Math.pow(1 - (wt - 0.1) / 0.9, 1.8);
        const col = fx.pal[w.colorIdx];
        if (r > 0 && width > 0.2) {
          const inner = Math.max(0, r - width), outer = r + width;
          const g = ctx.createRadialGradient(fx.x, fx.y, inner, fx.x, fx.y, outer);
          g.addColorStop(0,    rgba(col, 0));
          g.addColorStop(0.2,  rgba(col, alpha * 0.15));
          g.addColorStop(0.45, rgba(col, alpha * 0.4));
          g.addColorStop(0.55, rgba([255,255,255], alpha * 0.2));
          g.addColorStop(0.7,  rgba(col, alpha * 0.3));
          g.addColorStop(0.9,  rgba(col, alpha * 0.08));
          g.addColorStop(1,    rgba(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, outer, 0, Math.PI * 2); ctx.fill();
        }
      }

      // --- Base motes ---
      for (const m of fx.motes) {
        const mt = elapsed - m.delay;
        if (mt < 0) { alive = true; continue; }
        m.life += dt; if (m.life >= m.maxLife) continue;
        alive = true;
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.vx *= 0.97; m.vy *= 0.97; m.vy -= 3 * dt;
        const mp = m.life / m.maxLife;
        const ma = (mp < 0.15 ? mp / 0.15 : 1) * (mp > 0.5 ? 1 - (mp - 0.5) / 0.5 : 1) * (0.6 + 0.4 * Math.sin(m.life * 8 + m.phase));
        const col = fx.pal[m.colorIdx], sz = m.size * (1 - mp * 0.3);
        const mg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, sz * 4);
        mg.addColorStop(0, rgba([255,255,255], ma * 0.6));
        mg.addColorStop(0.3, rgba(col, ma * 0.35));
        mg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(m.x, m.y, sz * 4, 0, Math.PI * 2); ctx.fill();
      }

      // --- Scene-specific particles ---
      for (const p of fx.particles) {
        const pt = elapsed - (p.delay || 0);
        if (pt < 0) { alive = true; continue; }
        p.life += dt; if (p.life >= p.maxLife) continue;
        alive = true;
        const t = p.life / p.maxLife;

        switch (p.type) {
          case 'firefly': drawFirefly(p, t, dt); break;
          case 'dust':    drawDust(p, t, dt);    break;
          case 'snow':    drawSnowflake(p, t, dt); break;
          case 'sparkler': drawSparkler(p, t, dt); break;
        }
      }

      if (!alive) effects.splice(ei, 1);
    }

    if (effects.length > 0) {
      requestAnimationFrame(tick);
    } else {
      running = false; prev = 0;
    }
  }

  // =========================================================
  //  Particle renderers
  // =========================================================

  // --- Firefly ---
  function drawFirefly(p, t, dt) {
    // Burst outward then organic drift
    p.vx += Math.sin(p.life * p.pulseSpd * 0.7 + p.phase) * 25 * dt;
    p.vy += Math.cos(p.life * p.pulseSpd * 0.5 + p.phase) * 18 * dt;
    p.vx *= 0.99; p.vy *= 0.99;
    p.vy -= 12 * dt; // float up
    p.x += p.vx * dt; p.y += p.vy * dt;

    // Store trail
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();

    const pulse = 0.4 + 0.6 * Math.pow(Math.sin(p.life * p.pulseSpd + p.phase) * 0.5 + 0.5, 2);
    const fadeIn = t < 0.1 ? t / 0.1 : 1;
    const fadeOut = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    const a = fadeIn * fadeOut * pulse;
    const sz = p.size * (1 - t * 0.3);

    // Trail glow
    if (p.trail.length > 2) {
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.strokeStyle = rgba(p.col, a * 0.15);
      ctx.lineWidth = sz * 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Core glow
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 5);
    g.addColorStop(0, rgba([255,255,255], a * 0.8));
    g.addColorStop(0.15, rgba(p.col, a * 0.6));
    g.addColorStop(0.5, rgba(p.col, a * 0.15));
    g.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, sz * 5, 0, Math.PI * 2); ctx.fill();
  }

  // --- Golden dust ---
  function drawDust(p, t, dt) {
    p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx * dt; p.y += p.vy * dt;

    const twinkle = 0.3 + 0.7 * Math.pow(Math.sin(p.life * p.twinkleSpd + p.phase) * 0.5 + 0.5, 3);
    const fadeIn = t < 0.1 ? t / 0.1 : 1;
    const fadeOut = t > 0.5 ? 1 - (t - 0.5) / 0.5 : 1;
    const a = fadeIn * fadeOut * twinkle;
    const sz = p.size;

    // Soft glow
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 3);
    g.addColorStop(0, rgba([255,255,255], a * 0.9));
    g.addColorStop(0.2, rgba(p.col, a * 0.7));
    g.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, sz * 3, 0, Math.PI * 2); ctx.fill();

    // Tiny cross sparkle at peak twinkle
    if (twinkle > 0.8) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.phase);
      ctx.strokeStyle = rgba([255,255,255], a * 0.5);
      ctx.lineWidth = 0.5;
      const sLen = sz * 5 * twinkle;
      ctx.beginPath(); ctx.moveTo(-sLen, 0); ctx.lineTo(sLen, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -sLen); ctx.lineTo(0, sLen); ctx.stroke();
      ctx.restore();
    }
  }

  // --- Snowflake ---
  function drawSnowflake(p, t, dt) {
    // Wobble
    p.vx += Math.sin(p.life * p.wobbleSpd + p.phase) * p.wobbleAmp * dt;
    p.vx *= p.drag; p.vy *= p.drag;
    p.vy += 15 * dt; // gentle gravity
    p.x += p.vx * dt; p.y += p.vy * dt;

    const fadeIn = t < 0.1 ? t / 0.1 : 1;
    const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const a = fadeIn * fadeOut;
    const sz = p.size * (1 - t * 0.2);
    const rot = p.life * p.spin;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rot);

    // Draw crystalline snowflake
    const br = p.branches;
    for (let i = 0; i < br; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / br) * i);

      // Main branch
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(sz, 0);
      ctx.strokeStyle = rgba(p.col, a * 0.7);
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Side branches
      const sideLen = sz * 0.4;
      const sidePos = sz * 0.55;
      ctx.beginPath();
      ctx.moveTo(sidePos, 0);
      ctx.lineTo(sidePos + sideLen * 0.7, -sideLen * 0.7);
      ctx.moveTo(sidePos, 0);
      ctx.lineTo(sidePos + sideLen * 0.7, sideLen * 0.7);
      ctx.strokeStyle = rgba(p.col, a * 0.5);
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Tiny tip branch
      const tipLen = sz * 0.2;
      const tipPos = sz * 0.3;
      ctx.beginPath();
      ctx.moveTo(tipPos, 0);
      ctx.lineTo(tipPos + tipLen * 0.6, -tipLen * 0.8);
      ctx.moveTo(tipPos, 0);
      ctx.lineTo(tipPos + tipLen * 0.6, tipLen * 0.8);
      ctx.strokeStyle = rgba(p.col, a * 0.35);
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.restore();
    }

    // Center glow
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 0.8);
    cg.addColorStop(0, rgba([255,255,255], a * 0.5));
    cg.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // --- Firework sparkler ---
  function drawSparkler(p, t, dt) {
    // Store trail
    p.trail.push({ x: p.x, y: p.y, a: 1 - t });
    if (p.trail.length > 10) p.trail.shift();

    p.vx *= p.drag; p.vy *= p.drag;
    p.vy += p.gravity * dt; // gravity pull
    p.x += p.vx * dt; p.y += p.vy * dt;

    const fadeIn = t < 0.05 ? t / 0.05 : 1;
    const fadeOut = t > 0.4 ? 1 - (t - 0.4) / 0.6 : 1;
    const a = fadeIn * fadeOut;

    // Trail
    if (p.trail.length > 2) {
      for (let i = 1; i < p.trail.length; i++) {
        const ta = (i / p.trail.length) * a * 0.6;
        const tw = (i / p.trail.length) * p.size;
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.strokeStyle = rgba(p.col, ta);
        ctx.lineWidth = tw;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Bright head
    const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
    hg.addColorStop(0, rgba([255,255,255], a * 0.9));
    hg.addColorStop(0.2, rgba(p.col, a * 0.7));
    hg.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2); ctx.fill();

    // Sub-sparkle at head (tiny cross)
    if (a > 0.3) {
      ctx.strokeStyle = rgba([255,255,255], a * 0.4);
      ctx.lineWidth = 0.5;
      const sL = p.size * 6 * a;
      ctx.beginPath(); ctx.moveTo(p.x - sL, p.y); ctx.lineTo(p.x + sL, p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - sL); ctx.lineTo(p.x, p.y + sL); ctx.stroke();
    }
  }

  // =========================================================
  //  Click handler (with throttling)
  // =========================================================
  let lastSpawn = 0;
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, .hero-text-container, .download-modal-overlay, .hero-video-switcher, .hero-nav')) return;
    const now = performance.now();
    if (now - lastSpawn < 150) return; // Throttle to prevent spam-click freezing
    lastSpawn = now;
    
    let idx = 0;
    const g = document.querySelector('.hero-text-group.active');
    if (g) idx = parseInt(g.getAttribute('data-content') || '0', 10);
    spawn(e.clientX, e.clientY, idx);
  });
})();

