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
          // Instead of hiding library and collapsing height, we just show the full-width chat overlay.
          if (viewChat) viewChat.style.display = "flex";
          if (archivesNav) archivesNav.style.opacity = "0.3";
          if (typeof anime !== 'undefined' && viewChat) {
            anime({ targets: viewChat, opacity: [0, 1], translateY: [10, 0], duration: 400, easing: 'easeOutCubic' });
          }
        } else {
          // Hide chat overlay
          if (viewChat) viewChat.style.display = "none";
          if (archivesNav) archivesNav.style.opacity = "1";
          if (typeof anime !== 'undefined' && viewLibrary) {
            anime({ targets: viewLibrary, opacity: [0.8, 1], duration: 400, easing: 'easeOutCubic' });
          }
        }
      });
    });

    // Chat Interactions
    const chatThread = document.getElementById("mockup-chat-thread");
    const chatBackBtn = document.getElementById("mockup-chat-back");
    if (chatBackBtn) {
      chatBackBtn.addEventListener("click", () => {
        const libraryTab = mockup.querySelector('[data-mockup-tab="library"]');
        if (libraryTab) libraryTab.click();
      });
    }
    mockup.querySelectorAll("[data-mockup-chat-prompt]").forEach(btn => {
      btn.addEventListener("click", () => {
        const promptText = btn.dataset.mockupChatPrompt;
        const btnParent = btn.parentElement;
        if (btnParent) btnParent.style.display = 'none'; // hide suggestions
        
        // Add User Bubble
        const userBubble = document.createElement("div");
        userBubble.className = "chat-bubble chat-bubble-user";
        userBubble.textContent = promptText;
        if (chatThread) chatThread.appendChild(userBubble);
        
        if (typeof anime !== 'undefined') {
          anime({ targets: userBubble, opacity: [0, 1], translateY: [10, 0], duration: 300, easing: 'easeOutQuad' });
        }
        
        // Simulate AI Thinking
        setTimeout(() => {
          const aiWrapper = document.createElement("div");
          aiWrapper.className = "chat-bubble-ai";
          aiWrapper.style.display = "flex";
          aiWrapper.style.gap = "12px";
          aiWrapper.style.maxWidth = "100%";
          
          const iconDiv = document.createElement("div");
          iconDiv.style.flexShrink = "0";
          iconDiv.style.width = "28px";
          iconDiv.style.height = "28px";
          iconDiv.style.background = "var(--primary)";
          iconDiv.style.borderRadius = "6px";
          iconDiv.style.display = "flex";
          iconDiv.style.alignItems = "center";
          iconDiv.style.justifyContent = "center";
          iconDiv.style.color = "white";
          iconDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>';
          
          const contentDiv = document.createElement("div");
          contentDiv.style.flex = "1";
          contentDiv.style.minWidth = "0";
          
          const textP = document.createElement("p");
          textP.style.margin = "0";
          textP.style.color = "var(--ink)";
          textP.style.lineHeight = "1.6";
          
          contentDiv.appendChild(textP);
          aiWrapper.appendChild(iconDiv);
          aiWrapper.appendChild(contentDiv);
          
          if (chatThread) chatThread.appendChild(aiWrapper);
          
          let responseText = "";
          let imagesHtml = "";
          if (promptText.includes("赛博朋克")) {
            responseText = "好的，已在本地图库中搜索 标签: 'CyberPunk' 且 导入时间: 上个月 的素材。为您找到 142 张匹配图片。";
            imagesHtml = `<br><br><div style="display: flex; gap: 8px; margin-top: 8px;">
              <span class="asset-thumb asset-thumb-teal" style="width: 40px; height: 40px;"></span>
              <span class="asset-thumb asset-thumb-warm" style="width: 40px; height: 40px;"></span>
              <span class="asset-thumb asset-thumb-amber" style="width: 40px; height: 40px;"></span>
            </div>`;
          } else {
            responseText = "已生成快照备份。相关清单及原图已保存至 /exports/backup_202606。您可以随时在其他设备上读取。";
          }
          
          let i = 0;
          const typeInterval = setInterval(() => {
            textP.textContent = responseText.substring(0, i);
            i++;
            if (i > responseText.length) {
              clearInterval(typeInterval);
              if (imagesHtml) contentDiv.innerHTML += imagesHtml;
              
              // Scroll to bottom
              const chatView = document.getElementById("mockup-view-chat");
              if (chatView) {
                 const scrollArea = chatView.querySelector('div[style*="overflow-y: auto"]');
                 if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
              }
            }
          }, 30);
          
        }, 600);
      });
    });

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
  }
});
