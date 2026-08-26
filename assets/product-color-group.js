/* --------------------------------------------------------------------------
   Instant colour switching for the product colour group.

   Browser prerendering (Speculation Rules) turned out not to activate on this
   storefront - Shopify serves product pages with "Cache-Control: no-store",
   and the navigation timing showed activationStart = 0 after a real hover.
   So the switch is done here instead: the target page is fetched on intent,
   kept in memory, and #MainContent is replaced on click.

   Prefetching is deliberately restrained, so it cannot look like scraping:
     - it starts on intent only (hover with a delay, pointer down, focus),
       never on page load;
     - every URL is fetched at most once and reused from a Map;
     - a hard cap per page view;
     - skipped on Save-Data and on 2g connections;
     - low request priority and an abort timeout.
   -------------------------------------------------------------------------- */
(function () {
  var LINK_SELECTOR = '.product-color-group__link';
  var HOVER_DELAY = 70;
  var MAX_PREFETCH = 6;
  var FETCH_TIMEOUT = 10000;

  var cache = new Map();
  var prefetchCount = 0;
  var hoverTimer = null;
  var swapping = false;

  function instantEnabled() {
    var group = document.querySelector('.product-color-group[data-instant="ajax"]');
    return Boolean(group);
  }

  function connectionAllows() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true;
    if (connection.saveData) return false;
    if (/(^|-)2g$/.test(connection.effectiveType || '')) return false;
    return true;
  }

  function prefetch(url) {
    if (!url) return null;
    if (cache.has(url)) return cache.get(url);
    if (prefetchCount >= MAX_PREFETCH || !connectionAllows()) return null;

    prefetchCount++;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, FETCH_TIMEOUT);

    var request = fetch(url, {
      signal: controller.signal,
      credentials: 'same-origin',
      priority: 'low',
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (text) {
        clearTimeout(timer);
        return text;
      })
      .catch(function (error) {
        clearTimeout(timer);
        cache.delete(url);
        throw error;
      });

    cache.set(url, request);
    return request;
  }

  /* ---------------- head metadata ---------------- */

  function syncHead(doc) {
    if (doc.title) document.title = doc.title;

    var canonicalSource = doc.querySelector('link[rel="canonical"]');
    var canonicalTarget = document.querySelector('link[rel="canonical"]');
    if (canonicalSource && canonicalTarget) canonicalTarget.href = canonicalSource.href;

    ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:secure_url'].forEach(function (property) {
      var source = doc.querySelector('meta[property="' + property + '"]');
      var target = document.querySelector('meta[property="' + property + '"]');
      if (source && target) target.setAttribute('content', source.getAttribute('content'));
    });

    var descSource = doc.querySelector('meta[name="description"]');
    var descTarget = document.querySelector('meta[name="description"]');
    if (descSource && descTarget) descTarget.setAttribute('content', descSource.getAttribute('content'));

    // product structured data lives in the main section and travels with it,
    // but a copy in <head> would go stale otherwise
    var ldSource = doc.querySelector('head script[type="application/ld+json"]');
    var ldTarget = document.querySelector('head script[type="application/ld+json"]');
    if (ldSource && ldTarget) ldTarget.textContent = ldSource.textContent;
  }

  /* ---------------- re-initialisation ---------------- */

  function reinit(root) {
    // theme sections: pm-custom.js and others listen for this
    root.querySelectorAll('.shopify-section').forEach(function (section) {
      section.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
    });

    if (typeof window.initProductMediaGalleries === 'function') {
      window.initProductMediaGalleries(root);
    }

    // Wishlist Hero hydrates new nodes through its arrive watcher, but ask
    // explicitly in case the watcher missed a batched innerHTML replacement
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

  function swap(url, options) {
    var settings = options || {};
    if (swapping) return;
    swapping = true;
    setBusy(settings.link, true);

    var pending = cache.get(url) || prefetch(url);
    if (!pending) {
      // cap reached or a slow connection: still fetch, just without caching
      pending = fetch(url, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      });
    }

    return pending
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var incoming = doc.getElementById('MainContent');
        var current = document.getElementById('MainContent');
        if (!incoming || !current) throw new Error('MainContent not found');

        current.innerHTML = incoming.innerHTML;
        syncHead(doc);

        if (settings.push !== false) {
          history.pushState({ productColorGroup: true, url: url }, '', url);
        }

        reinit(current);
        window.scrollTo(0, 0);
      })
      .catch(function () {
        // any failure falls back to a normal navigation
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

  // touch and pen: the gap between pressing and releasing is the head start
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
    // let the browser handle new-tab / download / modified clicks
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
})();
