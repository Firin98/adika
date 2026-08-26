/* --------------------------------------------------------------------------
   Instant colour switching for the product colour group.

   Browser prerendering (Speculation Rules) does not activate on this
   storefront - Shopify serves product pages with "Cache-Control: no-store",
   and navigation timing showed activationStart = 0 after a real hover. The
   switch is therefore done here: the target is fetched and swapped in.

   What is fetched matters more than how often. Measured on this shop:
     full product page ...... 563 KB
     main section only ....... 51 KB   (?section_id=...)
   The rest of the page below the product (a fixed featured collection) is
   byte-for-byte identical between products, so only the main section is
   fetched and swapped. That is what makes warming up every sibling colour
   affordable: five of them cost less than half of one full page.

   Preloading policy:
     - "hover": on intent only - hover with a delay, pointer down, focus.
     - "idle": the above, plus a sequential warm-up of every sibling once the
       page has finished loading and the browser reports idle time. One
       request at a time, never in parallel with the page's own loading.
   Both modes: each URL is fetched at most once, a hard per-page cap, skipped
   on Save-Data, on 2g and on tiny devices, low priority, abort timeout.
   -------------------------------------------------------------------------- */
(function () {
  var LINK_SELECTOR = '.product-color-group__link';
  var HOVER_DELAY = 70;
  var MAX_PREFETCH = 6;
  var FETCH_TIMEOUT = 10000;
  var IDLE_DELAY = 1200;

  var cache = new Map();
  var prefetchCount = 0;
  var hoverTimer = null;
  var swapping = false;
  var warmedUp = false;

  function groupElement() {
    return document.querySelector('.product-color-group[data-instant="ajax"]');
  }

  function instantEnabled() {
    return Boolean(groupElement());
  }

  function preloadMode() {
    var group = groupElement();
    return (group && group.dataset.preload) || 'idle';
  }

  function currentSectionId() {
    var productInfo = document.querySelector('product-info[data-section]');
    return productInfo ? productInfo.dataset.section : null;
  }

  function connectionAllows() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
    if (!connection) return true;
    if (connection.saveData) return false;
    if (/(^|-)2g$/.test(connection.effectiveType || '')) return false;
    return true;
  }

  /* ---------------- fetching ---------------- */

  function request(url, sectionId) {
    var target = sectionId ? url + (url.indexOf('?') === -1 ? '?' : '&') + 'section_id=' + encodeURIComponent(sectionId) : url;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, FETCH_TIMEOUT);

    return fetch(target, { signal: controller.signal, credentials: 'same-origin', priority: 'low' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        clearTimeout(timer);
        // a sibling on a different template returns something without the
        // product markup - fall back to the full document in that case
        if (sectionId && text.indexOf('<product-info') === -1) {
          return request(url, null).then(function (payload) {
            return payload;
          });
        }
        return { kind: sectionId ? 'section' : 'full', html: text };
      })
      .catch(function (error) {
        clearTimeout(timer);
        throw error;
      });
  }

  function prefetch(url) {
    if (!url) return null;
    if (cache.has(url)) return cache.get(url);
    if (prefetchCount >= MAX_PREFETCH || !connectionAllows()) return null;

    prefetchCount++;
    var pending = request(url, currentSectionId());
    pending.catch(function () {
      cache.delete(url);
    });
    cache.set(url, pending);
    return pending;
  }

  /* ---------------- idle warm-up ---------------- */

  function siblingLinks() {
    return Array.prototype.slice.call(document.querySelectorAll(LINK_SELECTOR));
  }

  function warmUpSequentially(links, index) {
    if (index >= links.length) return;
    if (document.visibilityState !== 'visible') return;

    var pending = prefetch(links[index].href);
    if (!pending) return; // cap reached or the connection said no
    pending
      .catch(function () {})
      .then(function () {
        // strictly one at a time: the next request starts only when the
        // previous one is done, so the warm-up never competes with itself
        warmUpSequentially(links, index + 1);
      });
  }

  function scheduleWarmUp() {
    if (warmedUp || !instantEnabled() || preloadMode() !== 'idle') return;
    if (!connectionAllows()) return;

    var links = siblingLinks();
    if (!links.length) return;
    warmedUp = true;

    var start = function () {
      setTimeout(function () {
        if (document.visibilityState !== 'visible') return;
        warmUpSequentially(links, 0);
      }, IDLE_DELAY);
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(start, { timeout: 4000 });
    } else {
      start();
    }
  }

  /* ---------------- head metadata ---------------- */

  function titleSuffix() {
    var parts = document.title.split(' – ');
    return parts.length > 1 ? ' – ' + parts.slice(1).join(' – ') : '';
  }

  function syncHeadFromSection(root, url) {
    var productTitle = root.querySelector('.product__title h1, .product__title');
    var name = productTitle ? productTitle.textContent.trim() : '';
    if (name) document.title = name + titleSuffix();

    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(url, location.href).href;

    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', new URL(url, location.href).href);

    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && name) ogTitle.setAttribute('content', name);

    var image = root.querySelector('.product__media img');
    var ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && image && image.currentSrc) ogImage.setAttribute('content', image.currentSrc);
  }

  function syncHeadFromDocument(doc) {
    if (doc.title) document.title = doc.title;

    var pairs = [
      ['link[rel="canonical"]', 'href'],
      ['meta[property="og:title"]', 'content'],
      ['meta[property="og:description"]', 'content'],
      ['meta[property="og:url"]', 'content'],
      ['meta[property="og:image"]', 'content'],
      ['meta[name="description"]', 'content'],
    ];
    pairs.forEach(function (pair) {
      var source = doc.querySelector(pair[0]);
      var target = document.querySelector(pair[0]);
      if (source && target) target.setAttribute(pair[1], source.getAttribute(pair[1]));
    });
  }

  /* ---------------- re-initialisation ---------------- */

  function reinit(root) {
    root.querySelectorAll('.shopify-section').forEach(function (section) {
      section.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
    });
    if (root.classList && root.classList.contains('shopify-section')) {
      root.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
    }

    if (typeof window.initProductMediaGalleries === 'function') {
      window.initProductMediaGalleries(root);
    }

    try {
      if (window.WishListHero_SDK && typeof window.WishListHero_SDK.InitializeAddToWishListButton === 'function') {
        root.querySelectorAll('.wishlist-hero-custom-button').forEach(function (node) {
          window.WishListHero_SDK.InitializeAddToWishListButton(node);
        });
      }
    } catch (e) {
      // the app is optional - never let it break the switch
    }

    document.dispatchEvent(new CustomEvent('product-color-group:swapped', { detail: { root: root } }));
  }

  /* ---------------- the swap ---------------- */

  function setBusy(link, busy) {
    if (!link) return;
    link.classList.toggle('product-color-group__link--loading', busy);
    if (busy) link.setAttribute('aria-busy', 'true');
    else link.removeAttribute('aria-busy');
  }

  function applySection(html, url) {
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    var incoming = parsed.querySelector('.shopify-section') || parsed.body.firstElementChild;
    var productInfo = document.querySelector('product-info[data-section]');
    var current = productInfo ? productInfo.closest('.shopify-section') : null;
    if (!incoming || !current) return false;

    current.innerHTML = incoming.innerHTML;
    syncHeadFromSection(current, url);
    reinit(current);
    return true;
  }

  function applyFullPage(html, url) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var incoming = doc.getElementById('MainContent');
    var current = document.getElementById('MainContent');
    if (!incoming || !current) return false;

    current.innerHTML = incoming.innerHTML;
    syncHeadFromDocument(doc);
    reinit(current);
    return true;
  }

  function swap(url, options) {
    var settings = options || {};
    if (swapping) return;
    swapping = true;
    setBusy(settings.link, true);

    var pending = cache.get(url) || prefetch(url) || request(url, currentSectionId());

    return pending
      .then(function (payload) {
        var ok = payload.kind === 'section' ? applySection(payload.html, url) : applyFullPage(payload.html, url);
        if (!ok) throw new Error('unexpected markup');

        if (settings.push !== false) {
          history.pushState({ productColorGroup: true, url: url }, '', url);
        }
        window.scrollTo(0, 0);

        // the new colour has its own siblings - warm them up too
        warmedUp = false;
        scheduleWarmUp();
      })
      .catch(function () {
        window.location.href = url;
      })
      .finally(function () {
        swapping = false;
        setBusy(settings.link, false);
      });
  }

  /* ---------------- intent listeners ---------------- */

  function linkFrom(event) {
    var target = event.target;
    if (!target || !target.closest) return null;
    return target.closest(LINK_SELECTOR);
  }

  document.addEventListener(
    'pointerenter',
    function (event) {
      if (!instantEnabled()) return;
      var link = linkFrom(event);
      if (!link || event.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        prefetch(link.href);
      }, HOVER_DELAY);
    },
    true
  );

  document.addEventListener(
    'pointerleave',
    function () {
      clearTimeout(hoverTimer);
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    function (event) {
      if (!instantEnabled()) return;
      var link = linkFrom(event);
      if (link) prefetch(link.href);
    },
    true
  );

  document.addEventListener('focusin', function (event) {
    if (!instantEnabled()) return;
    var link = linkFrom(event);
    if (link) prefetch(link.href);
  });

  document.addEventListener('click', function (event) {
    if (!instantEnabled()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var link = linkFrom(event);
    if (!link || !link.href) return;
    if (new URL(link.href, location.href).origin !== location.origin) return;

    event.preventDefault();
    swap(link.href, { link: link });
  });

  window.addEventListener('popstate', function (event) {
    if (!instantEnabled()) return;
    if (!event.state || !event.state.productColorGroup) return;
    swap(location.href, { push: false });
  });

  if (document.readyState === 'complete') {
    scheduleWarmUp();
  } else {
    window.addEventListener('load', scheduleWarmUp);
  }
})();
