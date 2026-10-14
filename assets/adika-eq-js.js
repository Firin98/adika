(function () {
  'use strict';
  if (window.__adikaEqualityFixes) return;
  window.__adikaEqualityFixes = true;

  var host = location.hostname.replace(/^www\./, '');
  var focusable =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  var clean = function (v) {
    return (v || '').replace(/\s+/g, ' ').trim();
  };
  var visible = function (el) {
    if (!el || !document.contains(el)) return false;
    var s = getComputedStyle(el),
      r = el.getBoundingClientRect();
    return (
      s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      s.opacity !== '0' &&
      r.width > 0 &&
      r.height > 0
    );
  };
  var text = function (el) {
    return clean(
      el && (el.getAttribute('aria-label') || el.innerText || el.textContent),
    );
  };
  var linkLabel = function (link) {
    var value = text(link),
      image,
      parent,
      heading;
    if (!value && (image = link.querySelector('img[alt]')))
      value = clean(image.alt);
    if (
      !value &&
      (parent = link.closest(
        '.card-wrapper,.card,.product-card-wrapper,.banner,.footer-block,li',
      )) &&
      (heading = parent.querySelector(
        'h1,h2,h3,h4,h5,h6,.banner__heading,.card__heading',
      ))
    )
      value = text(heading);
    return value || 'קישור';
  };
  var linkTitle = function (link) {
    var raw = (link.getAttribute('href') || '').trim(),
      lower = raw.toLowerCase(),
      value = linkLabel(link),
      external = false;
    if (lower.indexOf('mailto:') === 0)
      return (
        'שליחת דואר אלקטרוני ל-' +
        raw.slice(7).split('?')[0] +
        ' - נפתח בתוכנה נפרדת'
      );
    if (lower.indexOf('tel:') === 0)
      return (
        'התקשרות למספר ' +
        raw.slice(4).replace(/%20/g, ' ') +
        ' - נפתח בתוכנה נפרדת'
      );
    if (/facebook\.com/i.test(raw)) value = 'קישור לפייסבוק';
    else if (/instagram\.com/i.test(raw)) value = 'קישור לאינסטגרם';
    else if (/tiktok\.com/i.test(raw)) value = 'קישור לטיקטוק';
    try {
      external =
        raw &&
        new URL(raw, location.href).hostname.replace(/^www\./, '') !== host;
    } catch (e) {}
    if (external) value += ' - מוביל לאתר חיצוני';
    if (link.target && link.target.toLowerCase() === '_blank')
      value += ' - נפתח בכרטיסיה חדשה';
    return value;
  };

  function addStyle() {
    if (document.getElementById('adika-eq-style')) return;
    var style = document.createElement('style');
    style.id = 'adika-eq-style';
    style.textContent =
      '.adika-eq-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.adika-eq-skip{position:fixed;top:8px;right:8px;z-index:2147483647;padding:8px 12px;background:#fff;color:#000;border:2px solid #000;font:700 16px Arial;direction:rtl;transform:translateY(-150%)}.adika-eq-skip:focus{transform:none}.adika-eq-focus:focus-visible,.adika-eq-focus:focus{outline:3px solid #000!important;outline-offset:3px}.adika-eq-focus-panel{outline:3px solid #000!important;outline-offset:-3px}';
    document.head.appendChild(style);
  }

  function addSkiplinks() {
    if (document.querySelector('.adika-eq-skip-wrap')) return;
    var wrap = document.createElement('nav');
    wrap.className = 'adika-eq-skip-wrap';
    wrap.setAttribute('aria-label', 'קישורי דילוג');
    [
      ['header', 'לראש הדף'],
      ['#MainContent', 'לתוכן הדף'],
      ['footer', 'לתחתית הדף'],
    ].forEach(function (item) {
      var target = document.querySelector(item[0]);
      if (!target) return;
      if (!target.id) target.id = 'adika-eq-' + item[1];
      var link = document.createElement('a');
      link.className = 'adika-eq-skip';
      link.href = '#' + target.id;
      link.title = item[1];
      link.textContent = item[1];
      link.addEventListener('click', function () {
        setTimeout(function () {
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }, 0);
      });
      wrap.appendChild(link);
    });
    document.body.prepend(wrap);
  }

  function fixContent() {
    document.documentElement.lang = 'he-IL';
    if (!document.querySelector('main h1, body h1')) {
      var h1 = document.createElement('h1');
      h1.className = 'adika-eq-visually-hidden';
      h1.textContent =
        clean(document.title).replace(/\s*[|–-].*$/, '') || 'Adikastyle';
      document.body.insertBefore(h1, document.body.firstChild);
    }
    document.querySelectorAll('img').forEach(function (img) {
      var src = (
        img.currentSrc ||
        img.src ||
        img.getAttribute('data-src') ||
        ''
      ).toLowerCase();
      var parent = img.closest(
        '.banner,.card-wrapper,.card,.product-card-wrapper,.footer-block,a,section',
      );
      var heading =
        parent &&
        parent.querySelector(
          'h1,h2,h3,h4,h5,h6,.banner__heading,.card__heading',
        );
      if (!clean(img.alt) && /logo[_\-.]/i.test(src) && img.alt !== 'לוגו האתר')
        img.alt = 'לוגו האתר';
      if (!clean(img.alt) && heading && img.alt !== text(heading))
        img.alt = text(heading);
      if (
        !clean(img.alt) &&
        !img.getAttribute('aria-hidden') &&
        img.alt !== 'תמונה'
      )
        img.alt = 'תמונה';
    });
    document.querySelectorAll('a[href]').forEach(function (link) {
      var raw = (link.getAttribute('href') || '').trim();
      var title =
        raw === '/search' || /\/search(?:\?|$)/i.test(raw)
          ? 'חיפוש באתר'
          : raw === '/cart' || /\/cart(?:\?|$)/i.test(raw)
            ? 'עגלת הקניות'
            : link.closest('.header__heading,.header__heading-logo-wrapper')
              ? 'לוגו האתר - מוביל לדף הבית'
              : linkTitle(link);
      if (link.title !== title) link.title = title;
      if (!link.classList.contains('adika-eq-focus'))
        link.classList.add('adika-eq-focus');
    });
    document
      .querySelectorAll('button,input,select,textarea,summary')
      .forEach(function (control) {
        if (!control.getAttribute('aria-label')) {
          var label = control.labels && control.labels[0],
            value =
              clean(label && label.innerText) ||
              clean(control.placeholder) ||
              clean(control.name);
          if (value) control.setAttribute('aria-label', value);
        }
        if (!control.classList.contains('adika-eq-focus'))
          control.classList.add('adika-eq-focus');
      });
  }

  function focusPanel(panel, opener) {
    if (!panel || panel.dataset.adikaEqOpen === '1') return;
    panel.dataset.adikaEqOpen = '1';
    panel._adikaEqOpener = opener && opener !== document.body ? opener : null;
    var items = Array.from(panel.querySelectorAll(focusable)).filter(visible);
    if (!items.length) {
      panel.tabIndex = -1;
      items = [panel];
    }
    setTimeout(function () {
      items[0].focus();
    }, 0);
  }

  function closePanel(panel) {
    if (!panel || panel.dataset.adikaEqOpen !== '1') return;
    panel.dataset.adikaEqOpen = '0';
    var opener = panel._adikaEqOpener;
    if (opener && document.contains(opener))
      setTimeout(function () {
        opener.focus();
      }, 50);
  }

  function updatePanels() {
    var details = document.querySelector(
        '#Details-menu-drawer-container[open]',
      ),
      menu = details && details.querySelector('#menu-drawer');
    if (menu) focusPanel(menu, document.activeElement);
    else closePanel(document.getElementById('menu-drawer'));
    var cart = document.querySelector('cart-drawer'),
      cartPanel = cart && cart.querySelector('.drawer__inner');
    if (
      cartPanel &&
      visible(cartPanel) &&
      (cart.classList.contains('active') ||
        cart.hasAttribute('open') ||
        cartPanel.getAttribute('aria-hidden') !== 'true')
    )
      focusPanel(cartPanel, document.activeElement);
    else closePanel(cartPanel);
  }

  function keyboard(event) {
    var panel =
      event.target.closest &&
      event.target.closest('#menu-drawer,.drawer__inner');
    if (!panel || panel.dataset.adikaEqOpen !== '1') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      var close = panel.querySelector(
        '.drawer__close,.menu-drawer__close-button',
      );
      if (close) close.click();
      closePanel(panel);
      return;
    }
    if (event.key !== 'Tab') return;
    var items = Array.from(panel.querySelectorAll(focusable)).filter(visible);
    if (!items.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === items[items.length - 1]
    ) {
      event.preventDefault();
      items[0].focus();
    }
  }

  function run() {
    addStyle();
    addSkiplinks();
    fixContent();
    updatePanels();
    if (!document.documentElement.dataset.adikaEqEvents) {
      document.documentElement.dataset.adikaEqEvents = '1';
      document.addEventListener('keydown', keyboard, true);
    }
    if (!document.documentElement.dataset.adikaEqObserver) {
      document.documentElement.dataset.adikaEqObserver = '1';
      var timer;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          fixContent();
          updatePanels();
        }, 120);
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'open', 'aria-hidden', 'style'],
      });
    }
  }
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
})();
