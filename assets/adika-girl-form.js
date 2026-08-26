/* --------------------------------------------------------------------------
   Adika Girl registration form.

   Native constraint validation stays enabled (required / type / pattern), so
   the form is still blocked when JavaScript is unavailable. This script only
   replaces the browser's validation bubbles with inline messages taken from
   the section settings, and normalizes the Instagram value before submit.
   -------------------------------------------------------------------------- */
(function () {
  function fieldWrap(input) {
    return input.closest(".adika-girl__field, .adika-girl__consent");
  }

  function errorNode(input) {
    var wrap = fieldWrap(input);
    return wrap ? wrap.querySelector(".adika-girl__error") : null;
  }

  function messageSource(form) {
    var container = form.closest(".adika-girl");
    return container ? container.dataset : form.dataset;
  }

  function messageFor(form, input) {
    var data = messageSource(form);
    var validity = input.validity;

    if (validity.valueMissing) {
      if (input.type !== "checkbox") return data.messageRequired;
      return input.hasAttribute("data-marketing-input") ? data.messageMarketing : data.messageConsent;
    }
    if (validity.customError) {
      return input.validationMessage;
    }
    if (validity.typeMismatch && input.type === "email") {
      return data.messageEmail;
    }
    if (validity.patternMismatch || validity.tooShort || validity.typeMismatch) {
      return input.dataset.errorMessage || data.messageRequired;
    }
    return input.validationMessage || data.messageRequired;
  }

  function showError(form, input) {
    var wrap = fieldWrap(input);
    if (wrap) {
      wrap.classList.add(
        input.type === "checkbox" ? "adika-girl__consent--invalid" : "adika-girl__field--invalid"
      );
    }
    var node = errorNode(input);
    if (node) {
      node.textContent = messageFor(form, input);
      node.hidden = false;
    }
    input.setAttribute("aria-invalid", "true");
    if (node && node.id) input.setAttribute("aria-describedby", node.id);
  }

  function clearError(input) {
    var wrap = fieldWrap(input);
    if (wrap) {
      wrap.classList.remove("adika-girl__field--invalid", "adika-girl__consent--invalid");
    }
    var node = errorNode(input);
    if (node) {
      node.textContent = "";
      node.hidden = true;
    }
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }

  /* The pattern attribute alone is not dependable: browsers compile it with the
     RegExp "v" flag, where some escapes are rejected and the whole constraint is
     then dropped silently. The digit count is therefore checked here and pushed
     back into native validation through setCustomValidity. */
  function validatePhone(form, input) {
    if (!input || input.type !== "tel") return;
    var value = (input.value || "").trim();
    var digits = value.replace(/[^0-9]/g, "");
    var invalid = value !== "" && (digits.length < 7 || digits.length > 15);
    var message = input.dataset.errorMessage || messageSource(form).messagePhone || "";
    input.setCustomValidity(invalid ? message : "");
  }

  /* Customer-target transport: the newsletter form accepts no phone, Instagram
     or age field, so those values are pushed into contact[tags]. A Shopify Flow
     copies the prefixed tags into customer metafields and deletes them after.
     Commas are the tag separator, so they are stripped from every value. */
  function instagramHandle(value) {
    return (value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/^@+/, "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/^instagram\.com\//i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  }

  /* A prefix is always followed by exactly one space ("phone: +972..."). The
     space is added here rather than stored in the setting, because the theme
     editor trims trailing whitespace when a setting is saved. */
  function joinTag(prefix, value) {
    prefix = (prefix || "").trim();
    if (!value) return "";
    return prefix ? prefix + " " + value : value;
  }

  /* Kept in international form: a leading 0 is swapped for the configured
     country code, separators are dropped, an explicit + is honoured. */
  function formatPhone(raw, countryCode) {
    var value = (raw || "").trim();
    var hasPlus = value.charAt(0) === "+";
    var digits = value.replace(/[^0-9]/g, "");
    if (!digits) return "";
    if (hasPlus) return "+" + digits;

    var cc = (countryCode || "").replace(/[^0-9]/g, "");
    if (!cc) return digits;
    if (digits.charAt(0) === "0") return "+" + cc + digits.slice(1);
    if (digits.indexOf(cc) === 0) return "+" + digits;
    return "+" + cc + digits;
  }

  function buildTags(form) {
    var tagsInput = form.querySelector("[data-tags-input]");
    if (!tagsInput) return;

    var data = messageSource(form);
    var tags = [];

    function push(value) {
      value = (value || "").toString().replace(/,/g, " ").replace(/\s{2,}/g, " ").trim();
      if (value) tags.push(value);
    }

    function valueOf(selector) {
      var el = form.querySelector(selector);
      return el ? el.value : "";
    }

    push(data.tagBase);
    push(joinTag(data.tagPrefixFirst, valueOf("[data-first-name-input]").trim()));
    push(joinTag(data.tagPrefixLast, valueOf("[data-last-name-input]").trim()));
    push(joinTag(data.tagPrefixEmail, valueOf("[data-email-input]").trim()));
    push(joinTag(data.tagPrefixPhone, formatPhone(valueOf("[data-phone-input]"), data.tagPhoneCountryCode)));

    var handle = instagramHandle(valueOf("[data-instagram-input]"));
    push(joinTag(data.tagPrefixInstagram, handle ? "@" + handle : ""));

    var consent = form.querySelector("[data-consent-input]");
    if (consent && consent.checked) push(data.tagConsent);

    tagsInput.value = tags.join(",");
  }

  // "@name", "name", "instagram.com/name" -> a full profile URL
  function normalizeInstagram(input) {
    var value = (input.value || "").trim().replace(/\s+/g, "");
    if (!value) return;
    value = value.replace(/^@+/, "");
    if (!/^https?:\/\//i.test(value)) {
      if (/^(www\.)?instagram\.com\//i.test(value)) {
        value = "https://" + value.replace(/^www\./i, "");
      } else {
        value = "https://www.instagram.com/" + value.replace(/^\/+/, "");
      }
    }
    input.value = value;
  }

  function initForm(form) {
    if (form.dataset.adikaGirlReady === "true") return;
    form.dataset.adikaGirlReady = "true";

    var pendingFocus = null;

    // "invalid" does not bubble - listen in the capture phase
    form.addEventListener(
      "invalid",
      function (event) {
        // suppress the native bubble, keep the blocked submit
        event.preventDefault();
        var input = event.target;
        showError(form, input);
        if (!pendingFocus) {
          pendingFocus = input;
          setTimeout(function () {
            if (!pendingFocus) return;
            try {
              pendingFocus.focus({ preventScroll: false });
            } catch (e) {
              pendingFocus.focus();
            }
            pendingFocus = null;
          }, 0);
        }
      },
      true
    );

    form.addEventListener("input", function (event) {
      var input = event.target;
      if (!input.willValidate) return;
      validatePhone(form, input);
      clearError(input);
    });

    // validity.valid is read directly: checkValidity() would fire another
    // "invalid" event and pull focus away while the customer is still typing
    form.addEventListener("change", function (event) {
      var input = event.target;
      if (!input.willValidate) return;
      validatePhone(form, input);
      if (input.validity.valid) clearError(input);
    });

    form.addEventListener("submit", function () {
      // only reached once every constraint passes
      buildTags(form);

      // the visible value is rewritten only when it is actually submitted
      // (contact target); in customer mode the handle already went into a tag
      var instagram = form.querySelector("[data-instagram-input]");
      if (instagram && instagram.name) normalizeInstagram(instagram);

      var button = form.querySelector(".adika-girl__submit");
      if (button) {
        button.setAttribute("aria-busy", "true");
        button.classList.add("loading");
        var spinner = button.querySelector(".loading__spinner");
        if (spinner) spinner.classList.remove("hidden");
      }
    });
  }

  function initAll(root) {
    (root || document).querySelectorAll("form.adika-girl__form").forEach(initForm);
  }

  if (document.readyState !== "loading") {
    initAll(document);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      initAll(document);
    });
  }

  // customizer: re-init when the section is re-rendered
  document.addEventListener("shopify:section:load", function (event) {
    initAll(event.target);
  });
})();
