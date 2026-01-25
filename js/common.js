/**
 * Shared utilities for LifeSteal SMP website
 * Provides caching, API loading, and common helper functions
 */

// Constants
const CACHE_TIMEOUT_MS = 60_000;
const API_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 2;

/**
 * Get cached data from localStorage with age validation
 * @param {string} key - Cache key
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {any|null} Cached value or null if expired/missing
 */
function getCached(key, maxAgeMs = CACHE_TIMEOUT_MS) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.t !== "number") return null;
    if (Date.now() - data.t > maxAgeMs) return null;
    return data.v;
  } catch (err) {
    console.warn(`Failed to get cache for key "${key}":`, err);
    return null;
  }
}

/**
 * Set cached data in localStorage with timestamp
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 */
function setCached(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch (err) {
    console.warn(`Failed to set cache for key "${key}":`, err);
  }
}

/**
 * Get stale cache data (ignoring age)
 * @param {string} key - Cache key
 * @returns {any|null} Stale cached value or null
 */
function getStaleCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.v || null;
  } catch (err) {
    console.warn(`Failed to get stale cache for key "${key}":`, err);
    return null;
  }
}

/**
 * Load player count from API with retry logic
 * @param {number} retries - Number of retries remaining
 */
async function loadPlayerCount(retries = MAX_RETRIES) {
  const pill = document.getElementById("online-pill");
  const el = document.getElementById("playercount");
  if (!pill || !el) return;

  const cached = getCached("ls_playercount_v1", CACHE_TIMEOUT_MS);
  if (cached && cached.text) {
    pill.dataset.state = cached.state || "unknown";
    el.textContent = cached.text;
    return;
  }

  // Show loading state (if pill supports it)
  if (pill.classList) {
    pill.classList.add("loading");
  }
  el.textContent = "Loading...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    
    try {
      const res = await fetch("https://api.mcsrvstat.us/2/lifestealsmp.com", { 
        cache: "no-store",
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data && data.online && data.players && typeof data.players.online === "number") {
        const text = `${data.players.online} online`;
        pill.dataset.state = "online";
        el.textContent = text;
        setCached("ls_playercount_v1", { text, state: "online" });
      } else {
        pill.dataset.state = "offline";
        el.textContent = "Offline";
        setCached("ls_playercount_v1", { text: "Offline", state: "offline" });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (retries > 0 && err.name !== "AbortError") {
        setTimeout(() => loadPlayerCount(retries - 1), RETRY_DELAY_MS);
        return;
      }
      
      // Fallback to stale cache
      pill.dataset.state = "unknown";
      const stale = getStaleCache("ls_playercount_v1");
      if (stale && stale.text) {
        pill.dataset.state = stale.state || "unknown";
        el.textContent = stale.text;
      } else {
        el.textContent = "Unavailable";
        if (el.classList) {
          el.classList.add("error-state");
        }
      }
    }
  } catch (outerErr) {
    console.error("Error in loadPlayerCount:", outerErr);
    pill.dataset.state = "unknown";
    el.textContent = "Unavailable";
  } finally {
    // Remove loading state
    if (pill.classList) {
      pill.classList.remove("loading");
    }
  }
}

/**
 * Load Discord member count from API with retry logic
 * @param {number} retries - Number of retries remaining
 */
async function loadDiscordMembers(retries = MAX_RETRIES) {
  const el = document.getElementById("discordcount");
  const sidebarEl = document.getElementById("sidebar-discordcount");
  if (!el && !sidebarEl) return;

  const cached = getCached("ls_discordcount_v1", CACHE_TIMEOUT_MS);
  if (cached && cached.text) {
    if (el) el.textContent = cached.text;
    if (sidebarEl) sidebarEl.textContent = cached.text;
    return;
  }

  if (el) el.textContent = "Loading...";
  if (sidebarEl) sidebarEl.textContent = "Loading...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    
    const res = await fetch("https://discord.com/api/v9/invites/lifestealsmp?with_counts=true", { 
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();

    if (data && typeof data.approximate_member_count === "number") {
      const countText = data.approximate_member_count.toLocaleString() + " members";
      if (el) el.textContent = countText;
      if (sidebarEl) sidebarEl.textContent = countText;
      setCached("ls_discordcount_v1", { text: countText });
    } else {
      const fallbackText = "Discord";
      if (el) el.textContent = fallbackText;
      if (sidebarEl) sidebarEl.textContent = fallbackText;
      setCached("ls_discordcount_v1", { text: fallbackText });
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      setTimeout(() => loadDiscordMembers(retries - 1), RETRY_DELAY_MS);
      return;
    }
    
    // Fallback to stale cache
    const stale = getStaleCache("ls_discordcount_v1");
    if (stale && stale.text) {
      if (el) el.textContent = stale.text;
      if (sidebarEl) sidebarEl.textContent = stale.text;
    } else {
      const fallbackText = "Discord";
      if (el) el.textContent = fallbackText;
      if (sidebarEl) sidebarEl.textContent = fallbackText;
    }
  }
}

/**
 * Initialize API calls with appropriate timing
 */
function initAPICalls() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      loadPlayerCount();
      loadDiscordMembers();
    }, { timeout: 2000 });
  } else {
    if (document.readyState === 'complete') {
      setTimeout(() => {
        loadPlayerCount();
        loadDiscordMembers();
      }, 500);
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => {
          loadPlayerCount();
          loadDiscordMembers();
        }, 500);
      });
    }
  }
}

/**
 * Render shared navbar across all pages
 * Detects current page and sets active link accordingly
 */
function renderNavbar() {
  const pathname = window.location.pathname;
  
  // Determine current page and base path
  let currentPage = 'home';
  let basePath = './';
  let logoPath = './logo.png';
  let brandHref = '?play=1'; // Main page: show ?play=1 on hover for consistency
  
  if (pathname.includes('/realm/')) {
    currentPage = 'realm';
    basePath = '../';
    logoPath = '../logo.png';
    brandHref = '../?play=1';
  } else if (pathname.includes('/vote/')) {
    currentPage = 'vote';
    basePath = '../';
    logoPath = '../logo.png';
    brandHref = '../?play=1';
  } else if (pathname.includes('/rgb/')) {
    currentPage = 'rgb';
    basePath = '../';
    logoPath = '../logo.png';
    brandHref = '../?play=1';
  }
  
  // Navigation links configuration
  const navLinks = [
    { id: 'home', label: 'Home', href: basePath === './' ? '#top' : basePath, title: 'Home' },
    { id: 'realm', label: 'Realm', href: `${basePath}realm/`, title: 'Join Bedrock Realm' },
    { id: 'vote', label: 'Vote', href: `${basePath}vote/`, title: 'Vote for LifeSteal SMP' },
    { id: 'rgb', label: 'RGB', href: `${basePath}rgb/`, title: 'RGB Gradient Generator' },
    { id: 'discord', label: 'Discord', href: 'https://discord.gg/lifestealsmp', title: 'Join LifeSteal SMP Discord Server', external: true },
    { id: 'store', label: 'Store', href: 'https://store.lifestealsmp.com', title: 'LifeSteal SMP Store', external: true, mobileOnly: true }
  ];
  
  // Generate navigation links HTML
  const navLinksHTML = navLinks.map(link => {
    // Skip mobile-only links on desktop (they'll be shown in nav-right)
    if (link.mobileOnly) {
      const externalIcon = link.external ? '<svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>' : '';
      return `<a href="${link.href}" ${link.title ? `title="${link.title}"` : ''} class="mobile-only" ${link.external ? 'target="_blank" rel="noreferrer noopener"' : ''}>${link.label}${externalIcon}</a>`;
    }
    
    const isActive = link.id === currentPage;
    const externalIcon = link.external ? '<svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>' : '';
    const attrs = [
      `href="${link.href}"`,
      link.title ? `title="${link.title}"` : '',
      isActive ? 'class="active" aria-current="page"' : '',
      link.external ? 'target="_blank" rel="noreferrer noopener"' : ''
    ].filter(Boolean).join(' ');
    
    return `<a ${attrs}>${link.label}${externalIcon}</a>`;
  }).join('\n            ');
  
  // Generate navbar HTML
  const navbarHTML = `
    <header>
      <div class="container">
        <div class="topbar">
          <a class="brand" href="${brandHref}" aria-label="LifeSteal SMP - Home" id="brand-link">
            <img class="logo" src="${logoPath}" alt="LifeSteal SMP - Competitive Minecraft Server Logo" width="34" height="34" loading="eager" decoding="async" fetchpriority="high" onerror="this.style.display='none'" />
            <span class="brandtext">
              <span class="brandtitle">LifeSteal SMP</span>
              <span class="brandsub">Java &amp; Bedrock</span>
            </span>
            <!-- Player count pill (clickable guide trigger) -->
            <span class="pill" id="online-pill" data-state="unknown" title="Online players" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="guide-text" aria-expanded="false">
              <svg class="pixel-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zM188.3 147.1c-7.6 4.2-12.3 12.3-12.3 20.9V344c0 8.7 4.7 16.7 12.3 20.9s16.8 4.1 24.3-.5l144-88c7.1-4.4 11.5-12.1 11.5-20.5s-4.4-16.1-11.5-20.5l-144-88c-7.4-4.5-16.7-4.7-24.3-.5z" />
              </svg>
              <span class="pill-text">
                <span class="pill-topline">
                  <span class="status-dot" aria-hidden="true"></span>
                  <span id="playercount">…</span>
                </span>
                <span class="pill-sub">Play Now</span>
              </span>
            </span>
          </a>
          <button class="menu-toggle" id="menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
            <svg class="hamburger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <nav class="nav-links" id="nav-links" aria-label="Main navigation">
            ${navLinksHTML}
            <div class="sidebar-actions">
              <a class="pill" id="sidebar-discord-pill" href="https://discord.gg/lifestealsmp" target="_blank" rel="noreferrer noopener" title="Join LifeSteal SMP Discord Server">
                <svg class="discord-icon" viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path fill="currentColor" d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6a447.848,447.848,0,0,0-134.426,0a309.541,309.541,0,0,0-15.135-30.6a1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588a321.173,321.173,0,0,1-45.868-21.853a1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126a301.407,301.407,0,0,1-45.89,21.83a1.875,1.875,0,0,0-1,2.611a391.055,391.055,0,0,0,30.014,48.815a1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z" />
                </svg>
                <span class="pill-text">
                  <span id="sidebar-discordcount">…</span>
                  <span class="pill-sub">Join Discord</span>
                </span>
              </a>
              <a class="btn btn-primary" href="https://store.lifestealsmp.com" target="_blank" rel="noreferrer noopener" title="LifeSteal SMP Store">Store</a>
            </div>
          </nav>
          <div class="nav-right">
            <a class="pill" id="discord-pill" href="https://discord.gg/lifestealsmp" target="_blank" rel="noreferrer noopener" title="Join LifeSteal SMP Discord Server">
              <svg class="discord-icon" viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6a447.848,447.848,0,0,0-134.426,0a309.541,309.541,0,0,0-15.135-30.6a1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588a321.173,321.173,0,0,1-45.868-21.853a1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126a301.407,301.407,0,0,1-45.89,21.83a1.875,1.875,0,0,0-1,2.611a391.055,391.055,0,0,0,30.014,48.815a1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z" />
              </svg>
              <span class="pill-text">
                <span id="discordcount">…</span>
                <span class="pill-sub">Join Discord</span>
              </span>
            </a>
            <a class="btn btn-primary" href="https://store.lifestealsmp.com" target="_blank" rel="noreferrer noopener" title="LifeSteal SMP Store">Store</a>
          </div>
        </div>
      </div>
    </header>
  `;
  
  // Find existing header and replace it, or insert before body content
  const existingHeader = document.querySelector('header');
  if (existingHeader) {
    existingHeader.outerHTML = navbarHTML.trim();
  } else {
    // Insert at the beginning of body
    const body = document.body;
    if (body.firstChild) {
      body.insertAdjacentHTML('afterbegin', navbarHTML.trim());
    } else {
      body.innerHTML = navbarHTML.trim() + body.innerHTML;
    }
  }
  
  // Initialize mobile menu toggle after navbar is rendered
  initMobileMenu();
  
  // Initialize online pill click handler for non-main pages
  initOnlinePillHandler();
}

/**
 * Initialize online pill click handler to redirect to main page with play parameter
 */
function initOnlinePillHandler() {
  const onlinePill = document.getElementById("online-pill");
  if (!onlinePill) return;
  
  const pathname = window.location.pathname;
  
  // Main page: trigger guide overlay
  if (!pathname.includes('/vote/') && !pathname.includes('/realm/') && !pathname.includes('/rgb/')) {
    // Set up handler, retrying if showGuide isn't available yet (max 10 retries = 500ms)
    let retryCount = 0;
    function setupMainPageHandler() {
      if (typeof window.showGuide === 'function') {
        onlinePill.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent event from bubbling to brand-link
          window.showGuide();
        });
        
        onlinePill.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          window.showGuide();
        });
      } else if (retryCount < 10) {
        // Retry after a short delay if showGuide isn't available yet
        retryCount++;
        setTimeout(setupMainPageHandler, 50);
      }
    }
    setupMainPageHandler();
  } else {
    // Non-main pages: redirect to main page with play parameter
    function goJoin() {
      // Redirect to main page with play parameter to trigger guide
      const basePath = '../';
      window.location.href = `${basePath}?play=1`;
    }
    
    onlinePill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent event from bubbling to brand-link
      goJoin();
    });
    
    onlinePill.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      goJoin();
    });
  }
}

/**
 * Initialize mobile menu toggle functionality
 */
function initMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  
  if (menuToggle && navLinks) {
    // Remove existing listeners by cloning
    const newToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(newToggle, menuToggle);
    const newNavLinks = navLinks.cloneNode(true);
    navLinks.parentNode.replaceChild(newNavLinks, navLinks);
    
    const toggle = newToggle;
    const nav = newNavLinks;
    
    // Create backdrop overlay
    let backdrop = document.getElementById('mobile-menu-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'mobile-menu-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }
    
    function updateMenuState(isOpen) {
      if (isOpen) {
        nav.classList.add('open');
        toggle.classList.add('active');
        backdrop.style.display = 'block';
        // Trigger reflow for animation
        requestAnimationFrame(() => {
          backdrop.style.opacity = '1';
          backdrop.style.visibility = 'visible';
        });
        document.body.style.overflow = 'hidden'; // Prevent body scroll when menu is open
      } else {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        backdrop.style.opacity = '0';
        backdrop.style.visibility = 'hidden';
        setTimeout(() => {
          backdrop.style.display = 'none';
        }, 300); // Match transition duration
        document.body.style.overflow = ''; // Restore body scroll
      }
      toggle.setAttribute('aria-expanded', isOpen);
    }
    
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !nav.classList.contains('open');
      updateMenuState(isOpen);
    });
    
    // Close menu when clicking backdrop
    backdrop.addEventListener('click', () => {
      updateMenuState(false);
    });
    
    // Close menu when clicking outside (but not on toggle)
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') && 
          !nav.contains(e.target) && 
          !toggle.contains(e.target) &&
          !backdrop.contains(e.target)) {
        updateMenuState(false);
      }
    });
    
    // Close menu when clicking a link
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        updateMenuState(false);
      });
    });
    
    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        updateMenuState(false);
      }
    });
  }
}

/**
 * Copy text to clipboard with fallback
 * @param {string} text - Text to copy
 * @returns {Promise} Promise that resolves when copy is complete
 */
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  
  // Fallback for older browsers
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch (err) {
    console.warn("Failed to copy text:", err);
  }
  document.body.removeChild(ta);
  return Promise.resolve();
}

/**
 * Initialize copy buttons with data-copy attribute
 * Automatically handles copy functionality and button state
 */
function initCopyButtons() {
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const el = document.getElementById(btn.dataset.copy);
      if (!el) return;
      
      const originalText = btn.textContent;
      btn.disabled = true;
      
      try {
        await copyToClipboard(el.textContent || "");
        btn.textContent = "Copied";
        
        // Show toast if available
        if (typeof showToast === 'function') {
          showToast("Copied to clipboard!", "success");
        }
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1200);
      } catch (err) {
        btn.textContent = "Error";
        
        // Show toast if available
        if (typeof showToast === 'function') {
          showToast("Failed to copy. Please try again.", "error");
        }
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1200);
      }
    });
  });
}

/**
 * Render shared footer across all pages
 * Same footer structure on all pages
 */
function renderFooter() {
  const currentYear = new Date().getFullYear();
  
  const footerHTML = `
    <footer role="contentinfo">
      <div class="footer-content">
        <div class="footer-left">
          <div class="footer-copyright">
            <div class="footer-copyright-text">
              <span>LifeSteal SMP <span id="current-year">${currentYear}</span></span>
            </div>
            <div class="footer-copyright-disclaimer">Not affiliated with Mojang.</div>
          </div>
        </div>
        <div class="footer-social" aria-label="Social media links">
          <a href="#" target="_blank" rel="noreferrer noopener" title="YouTube" aria-label="YouTube">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </a>
          <a href="#" target="_blank" rel="noreferrer noopener" title="TikTok" aria-label="TikTok">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.07 6.07 0 0 0-1-.05A6.67 6.67 0 0 0 5 20.1a6.67 6.67 0 0 0 11.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-2.04-.1z"/>
            </svg>
          </a>
          <a href="#" target="_blank" rel="noreferrer noopener" title="Instagram" aria-label="Instagram">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  `;
  
  // Find existing footer and replace it, or insert appropriately
  const existingFooter = document.querySelector('footer');
  if (existingFooter) {
    existingFooter.outerHTML = footerHTML.trim();
    return;
  }
  
  // Check if there's a .page-content wrapper (index.html structure)
  const pageContent = document.querySelector('.page-content');
  if (pageContent) {
    // Insert footer inside .page-content after main
    const main = pageContent.querySelector('main');
    if (main) {
      main.insertAdjacentHTML('afterend', footerHTML.trim());
    } else {
      pageContent.insertAdjacentHTML('beforeend', footerHTML.trim());
    }
  } else {
    // For vote/realm/rgb pages: insert footer inside main (since main is scrollable)
    const main = document.querySelector('main');
    if (main) {
      // Try to insert inside the last .container div, or at end of main
      const lastContainer = main.querySelector('.container:last-child');
      if (lastContainer) {
        lastContainer.insertAdjacentHTML('afterend', footerHTML.trim());
      } else {
        // Insert at the end of main content (inside main, before it closes)
        main.insertAdjacentHTML('beforeend', footerHTML.trim());
      }
    } else {
      // Fallback: append to body
      document.body.insertAdjacentHTML('beforeend', footerHTML.trim());
    }
  }
}

/**
 * Render skip link for accessibility
 */
function renderSkipLink() {
  // Check if skip link already exists
  const existingSkipLink = document.querySelector('.skip-link');
  if (existingSkipLink) {
    return; // Already exists
  }
  
  const skipLinkHTML = '<a href="#main-content" class="skip-link">Skip to main content</a>';
  const body = document.body;
  if (body.firstChild) {
    body.insertAdjacentHTML('afterbegin', skipLinkHTML);
  } else {
    body.innerHTML = skipLinkHTML + body.innerHTML;
  }
}

// Auto-initialize navbar, footer, skip link, copy buttons, and API calls when DOM is ready
function initSharedComponents() {
  renderNavbar();
  renderFooter();
  renderSkipLink(); // After navbar so skip link is first in DOM (a11y)
  initCopyButtons();
  initAPICalls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSharedComponents);
} else {
  initSharedComponents();
}
