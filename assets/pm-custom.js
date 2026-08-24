function initProductCardSliders(root) {
  if (!window.Swiper) {
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll("[data-product-card-slider]:not(.swiper-initialized)");

  sliders.forEach(sliderElement => {
    const nextButton = sliderElement.querySelector(".swiper-button-next");
    const prevButton = sliderElement.querySelector(".swiper-button-prev");
    const paginationElement = sliderElement.querySelector(".swiper-pagination");
  

    const swiperInstance = new Swiper(sliderElement, {
      slidesPerView: 1,
      spaceBetween: 0,
      navigation: {
        nextEl: nextButton,
        prevEl: prevButton,
      },
      pagination: {
        el: paginationElement,
        type: "progressbar",
      },
      grabCursor: true,
      on: {
        init: function () {
          if (this.slides.length < 2) {
            this.el.classList.add("disabled");
          }
        },
      },
    });

    // expose instance for later control (some versions attach automatically, but ensure availability)
    try {
      sliderElement.swiper = sliderElement.swiper || swiperInstance;
      sliderElement._cardSwiper = swiperInstance;
    } catch (e) {
      // ignore
    }

    initCardHoverScrub(sliderElement, swiperInstance);
  });
}

/* --------------------------------------------------------------------------
   Листание слайдов карточки движением мыши (только десктоп).
   Ширина карточки делится на N зон по числу слайдов; наведение на зону
   показывает соответствующий слайд. Витрина на иврите, поэтому отсчёт идёт
   справа налево: крайняя правая зона — первый слайд, движение влево листает
   вперёд. Прогресс-бар Swiper обновляется сам.
   -------------------------------------------------------------------------- */

// Больше шести зон на карточке шириной ~260px превращается в дрожь курсора:
// остальные слайды остаются доступны свайпом и стрелками.
var CARD_HOVER_SCRUB_MAX_ZONES = 6;

function cardHoverScrubSupported() {
  // Ширина в условии — страховка: часть Android-браузеров и WebView ошибочно
  // рапортуют (hover: hover) и (pointer: fine). Без неё на таком телефоне
  // включился бы ховер-режим, который выключает allowTouchMove, и слайды
  // в карточке перестали бы свайпаться совсем.
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.matchMedia("(min-width: 990px)").matches
  );
}

function initCardHoverScrub(sliderElement, swiper) {
  if (!sliderElement || !swiper) return;
  if (sliderElement.dataset.hoverScrubReady === "true") return;
  if (!cardHoverScrubSupported()) return;

  var slideCount = swiper.slides ? swiper.slides.length : 0;
  if (slideCount < 2) return;

  sliderElement.dataset.hoverScrubReady = "true";

  // На десктопе ховер заменяет перетаскивание мышью: иначе после драга
  // любое движение курсора отбрасывало бы слайдер обратно.
  try {
    swiper.allowTouchMove = false;
    if (swiper.params) {
      swiper.params.allowTouchMove = false;
      swiper.params.grabCursor = false;
    }
    if (typeof swiper.unsetGrabCursor === "function") swiper.unsetGrabCursor();
  } catch (e) {
    // ignore
  }

  var zones = Math.min(slideCount, CARD_HOVER_SCRUB_MAX_ZONES);
  var currentZone = -1;
  var restIndex = swiper.activeIndex || 0;
  var pendingX = null;
  var rafId = null;
  var imagesPrimed = false;

  // Слайды после первого помечены loading="lazy" и лежат вне вьюпорта:
  // без этого первый проход мышью показывал бы пустые кадры.
  // Грузим их по первому наведению, а не при загрузке страницы, иначе
  // коллекция из 48 карточек утащит за собой десятки лишних запросов.
  function primeImages() {
    if (imagesPrimed) return;
    imagesPrimed = true;
    var lazyImages = sliderElement.querySelectorAll('img[loading="lazy"]');
    for (var i = 0; i < lazyImages.length; i++) {
      lazyImages[i].loading = "eager";
    }
  }

  function applyZone(clientX) {
    // rect читаем каждый кадр: он привязан к вьюпорту и устаревает при скролле
    var rect = sliderElement.getBoundingClientRect();
    if (!rect.width) return;

    var fromRight = rect.right - clientX;
    var zone = Math.floor((fromRight / rect.width) * zones);
    if (zone < 0) zone = 0;
    if (zone > zones - 1) zone = zones - 1;

    if (zone === currentZone) return;
    currentZone = zone;
    swiper.slideTo(zone, 0);
  }

  function scheduleFrame() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(function () {
      rafId = null;
      if (pendingX === null) return;
      var x = pendingX;
      pendingX = null;
      applyZone(x);
    });
  }

  function onEnter(event) {
    restIndex = swiper.activeIndex || 0;
    currentZone = -1;
    primeImages();
    sliderElement.classList.add("is-hover-scrub");
    pendingX = event.clientX;
    scheduleFrame();
  }

  function onMove(event) {
    pendingX = event.clientX;
    scheduleFrame();
  }

  function onLeave() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    pendingX = null;
    currentZone = -1;
    sliderElement.classList.remove("is-hover-scrub");
    // Возвращаемся туда, где слайдер стоял до наведения, а не жёстко на первый
    // слайд: иначе ховер сбрасывал бы выбор цвета через свотч.
    swiper.slideTo(restIndex, 0);
  }

  sliderElement.addEventListener("mouseenter", onEnter);
  sliderElement.addEventListener("mousemove", onMove, { passive: true });
  sliderElement.addEventListener("mouseleave", onLeave);
}

function initFeaturedCollectionSwipers(root) {
  if (!window.Swiper) {
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll("[data-featured-collection-swiper]:not(.swiper-initialized)");

  sliders.forEach(sliderElement => {
    const sectionRoot = sliderElement.closest(".featured-collection-swiper-wrap");
    if (!sectionRoot) {
      return;
    }

    const nextButton = sectionRoot.querySelector(".featured-collection-swiper-next");
    const prevButton = sectionRoot.querySelector(".featured-collection-swiper-prev");
    const paginationElement = sliderElement.querySelector(".featured-collection-swiper-pagination");

    new Swiper(sliderElement, {
      slidesPerView: 2,
      slidesPerGroup: 2,
      spaceBetween: 11,
      watchOverflow: true,
      grabCursor: true,
      grid: {
        rows: 2,
        fill: "row",
      },
      navigation:
        nextButton && prevButton
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
      pagination: {
        el: paginationElement,
        type: "progressbar",
      },
      breakpoints: {
        750: {
          slidesPerView: 2,
          slidesPerGroup: 2,
          spaceBetween: 11,
          grid: {
            rows: 2,
            fill: "row",
          },
          allowTouchMove: true,
          pagination: {
            enabled: true,
          },
          navigation: {
            enabled: true,
          },
        },
        990: {
          slidesPerView: 4,
          slidesPerGroup: 4,
          spaceBetween: 0,
          grid: {
            rows: 1,
            fill: "row",
          },
          allowTouchMove: false,
          pagination: {
            enabled: false,
          },
          navigation: {
            enabled: false,
          },
        },
      },
      on: {
        init: function () {
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        resize: function () {
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        breakpoint: function () {
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
      },
    });
  });
}

function updateFeaturedCollectionSenseaGridHeight(swiper) {
  const isDesktop = window.matchMedia("(min-width: 990px)").matches;

  if (!isDesktop) {
    swiper.el.style.removeProperty("height");
    return;
  }

  const rows = swiper.params.grid?.rows || 1;
  if (rows < 2 || !swiper.slides.length) {
    return;
  }

  swiper.el.style.removeProperty("height");
  swiper.update();

  requestAnimationFrame(() => {
    const slideHeight = swiper.slides[0]?.clientHeight || 0;
    if (!slideHeight) {
      return;
    }

    const spaceBetween = swiper.params.spaceBetween || 0;
    // Temporary disable fixed swiper height.
    // swiper.el.style.height = `${slideHeight * rows + spaceBetween * (rows - 1)}px`;
    swiper.update();
  });
}

function initFeaturedCollectionSenseaSwipers(root) {
  if (!window.Swiper) {
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll("[data-featured-collection-sensea-swiper]:not(.swiper-initialized)");

  sliders.forEach(sliderElement => {
    const sectionRoot = sliderElement.closest(".featured-collection-sensea-swiper-wrap");
    if (!sectionRoot) {
      return;
    }

    const nextButton = sectionRoot.querySelector(".featured-collection-sensea-swiper-next");
    const prevButton = sectionRoot.querySelector(".featured-collection-sensea-swiper-prev");
    const paginationElement = sectionRoot.querySelector(
      ".featured-collection-sensea-swiper-pagination"
    );
    const hasPagination = Boolean(paginationElement);
    const isRtl =
      sliderElement.getAttribute("dir") === "rtl" ||
      window.getComputedStyle(sliderElement).direction === "rtl";

    const swiperInstance = new Swiper(sliderElement, {
      slidesPerView: 2,
      // slidesPerGroup: 2,
      spaceBetween: 11,
      watchOverflow: true,
      grabCursor: true,
      grid: {
          rows: 2,
          fill: 'row',
      },
      navigation:
        nextButton && prevButton
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
      pagination: hasPagination
        ? {
            el: paginationElement,
            type: "progressbar",
          }
        : undefined,
      breakpoints: {
        750: {
          slidesPerView: 2,
          // slidesPerGroup: 2,
          spaceBetween: 11,
          grid: {
            rows: 2,
            fill: 'row',
          },
          allowTouchMove: true,
          pagination: {
            enabled: true,
          },
          navigation: {
            enabled: true,
          },
        },
        990: {
          slidesPerView: 3,
          // slidesPerGroup: 6,
          spaceBetween: 20,
          grid: {
            rows: 2,
            fill: 'row',
          },
          allowTouchMove: true,
          pagination: {
            enabled: true,
          },
          navigation: {
            enabled: false,
          },
        },
      },
      on: {
        init: function () {
          updateFeaturedCollectionSenseaGridHeight(this);
          setTimeout(() => updateFeaturedCollectionSenseaGridHeight(this), 300);
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        resize: function () {
          updateFeaturedCollectionSenseaGridHeight(this);
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        breakpoint: function () {
          updateFeaturedCollectionSenseaGridHeight(this);
          if (window.matchMedia("(min-width: 990px)").matches) {
            this.slideTo(0, 0);
          }
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
      },
    });

    if (isRtl && typeof swiperInstance.changeLanguageDirection === "function") {
      swiperInstance.changeLanguageDirection("rtl");
      swiperInstance.update();
    }
  });
}

function initFeaturedCollectionSensea1RowSwipers(root) {
  if (!window.Swiper) {
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll(
    "[data-featured-collection-sensea-1-row-swiper]:not(.swiper-initialized)"
  );

  sliders.forEach(sliderElement => {
    const sectionRoot = sliderElement.closest(".featured-collection-sensea-swiper-wrap");
    if (!sectionRoot) {
      return;
    }

    const nextButton = sectionRoot.querySelector(".featured-collection-sensea-swiper-next");
    const prevButton = sectionRoot.querySelector(".featured-collection-sensea-swiper-prev");
    const paginationElement = sectionRoot.querySelector(
      ".featured-collection-sensea-swiper-pagination"
    );
    const hasPagination = Boolean(paginationElement);
    const isRtl =
      sliderElement.getAttribute("dir") === "rtl" ||
      window.getComputedStyle(sliderElement).direction === "rtl";

    const swiperInstance = new Swiper(sliderElement, {
      slidesPerView: 2,
      slidesPerGroup: 1,
      spaceBetween: 11,
      watchOverflow: true,
      grabCursor: true,
      grid: {
        rows: 2,
        fill: "row",
      },
      navigation:
        nextButton && prevButton
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
      pagination: hasPagination
        ? {
            el: paginationElement,
            type: "progressbar",
          }
        : undefined,
      breakpoints: {
        750: {
          slidesPerView: 2,
          slidesPerGroup: 1,
          spaceBetween: 11,
          grid: {
            rows: 1,
            fill: "row",
          },
          allowTouchMove: true,
          pagination: {
            enabled: true,
          },
          navigation: {
            enabled: true,
          },
        },
        990: {
          slidesPerView: 3,
          slidesPerGroup: 1,
          spaceBetween: 20,
          grid: {
            rows: 1,
            fill: "row",
          },
          allowTouchMove: true,
          pagination: {
            enabled: true,
          },
          navigation: {
            enabled: false,
          },
        },
      },
      on: {
        init: function () {
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        resize: function () {
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
        breakpoint: function () {
          sectionRoot.classList.toggle("is-locked", this.isLocked);
        },
      },
    });

    if (isRtl && typeof swiperInstance.changeLanguageDirection === "function") {
      swiperInstance.changeLanguageDirection("rtl");
      swiperInstance.update();
    }
  });
}

/**
 * If Swiper script loads after our initial DOM handlers, retry initialization a few times.
 * callback should be one of the init* functions that accept a root parameter.
 */
function waitForSwiperAvailable(callback, root, attempts = 20, delay = 100) {
  if (window.Swiper) {
    try {
      callback(root);
    } catch (e) {
      // swallow — the called init has its own try/catch where needed
      console.error('swiper init callback error', e);
    }
    return;
  }

  if (attempts <= 0) {
    return;
  }

  setTimeout(function () {
    waitForSwiperAvailable(callback, root, attempts - 1, delay);
  }, delay);
}

function initFeaturedCollectionWithImageSwipers(root) {
  if (!window.Swiper) {
    // Swiper might be loaded after DOMContentLoaded; retry initialization a few times
    waitForSwiperAvailable(initFeaturedCollectionWithImageSwipers, root);
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll(
    "[data-featured-collection-with-image-swiper]:not(.swiper-initialized)"
  );

  sliders.forEach(sliderElement => {
    const sectionRoot = sliderElement.closest(".featured-collection-swiper-wrap");
    if (!sectionRoot) {
      return;
    }

    const nextButton = sectionRoot.querySelector(".featured-collection-swiper-next");
    const prevButton = sectionRoot.querySelector(".featured-collection-swiper-prev");
    const paginationElement = sliderElement.querySelector(".featured-collection-swiper-pagination");
    const hasNavigation = Boolean(nextButton && prevButton);

    const updateFeaturedCollectionWithImageLockState = swiperInstance => {
      const shouldLock = Boolean(swiperInstance.isLocked);

      sectionRoot.classList.toggle("is-locked", shouldLock);

      if (nextButton) {
        nextButton.classList.toggle("swiper-button-lock", shouldLock);
        nextButton.disabled = shouldLock;
      }

      if (prevButton) {
        prevButton.classList.toggle("swiper-button-lock", shouldLock);
        prevButton.disabled = shouldLock;
      }

      swiperInstance.allowTouchMove = !shouldLock;
    };

    try {
      new Swiper(sliderElement, {
        slidesPerView: 2,
        slidesPerGroup: 1,
        spaceBetween: 10,
        allowTouchMove: true,
        simulateTouch: true,
        watchOverflow: false,
        grabCursor: false,
        navigation: hasNavigation
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
        pagination: {
          el: paginationElement,
          type: "progressbar",
          enabled: true,
        },
        breakpoints: {
          750: {
            slidesPerView: 2,
            slidesPerGroup: 1,
            spaceBetween: 10,
            allowTouchMove: true,
            pagination: {
              enabled: true,
            },
            ...(hasNavigation
              ? {
                  navigation: {
                    enabled: true,
                  },
                }
              : {}),
          },
          990: {
            slidesPerView: 3,
            slidesPerGroup: 1,
            spaceBetween: 18,
            allowTouchMove: true,
            pagination: {
              enabled: true,
            },
            ...(hasNavigation
              ? {
                  navigation: {
                    enabled: true,
                  },
                }
              : {}),
          },
          1200: {
            slidesPerView: 3,
            slidesPerGroup: 1,
            spaceBetween: 18,
            allowTouchMove: true,
            pagination: {
              enabled: true,
            },
            ...(hasNavigation
              ? {
                  navigation: {
                    enabled: true,
                  },
                }
              : {}),
          },
        },
        on: {
          init: function () {
            if (window.matchMedia("(min-width: 990px)").matches) {
              this.slideTo(0, 0);
            }
            updateFeaturedCollectionWithImageLockState(this);
          },
          resize: function () {
            if (window.matchMedia("(min-width: 990px)").matches) {
              this.slideTo(0, 0);
            }
            updateFeaturedCollectionWithImageLockState(this);
          },
          breakpoint: function () {
            if (window.matchMedia("(min-width: 990px)").matches) {
              this.slideTo(0, 0);
            }
            updateFeaturedCollectionWithImageLockState(this);
          },
        },
      });
    } catch (error) {
      console.error("Failed to initialize featured collection with image swiper", error);
    }
  });
}

window.initFeaturedCollectionWithImageSwipers = initFeaturedCollectionWithImageSwipers;

function initCollectionHeroLinksSwipers(root) {
  if (!window.Swiper) {
    waitForSwiperAvailable(initCollectionHeroLinksSwipers, root);
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll(
    "[data-collection-hero-links-swiper]:not(.swiper-initialized)"
  );

  sliders.forEach(sliderElement => {
    const navRoot = sliderElement.closest(".collection-hero__links");
    if (!navRoot) {
      return;
    }

    const nextButton = navRoot.querySelector(".collection-hero__links-swiper-next");
    const prevButton = navRoot.querySelector(".collection-hero__links-swiper-prev");
    const paginationElement = sliderElement.querySelector(".collection-hero__links-swiper-pagination");
    const hasNavigation = Boolean(nextButton && prevButton);

    const updateLockState = swiperInstance => {
      const shouldLock = Boolean(swiperInstance.isLocked);

      navRoot.classList.toggle("is-locked", shouldLock);

      if (nextButton) {
        nextButton.classList.toggle("swiper-button-lock", shouldLock);
        nextButton.disabled = shouldLock;
      }

      if (prevButton) {
        prevButton.classList.toggle("swiper-button-lock", shouldLock);
        prevButton.disabled = shouldLock;
      }

      swiperInstance.allowTouchMove = !shouldLock;
    };

    try {
      new Swiper(sliderElement, {
        slidesPerView: "auto",
        slidesPerGroup: 1,
        spaceBetween: 1,
        watchOverflow: true,
        grabCursor: true,
        navigation: hasNavigation
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
        pagination: {
          el: paginationElement,
          type: "progressbar",
        },
        breakpoints: {
          750: {
            spaceBetween: 2,
          },
        },
        on: {
          init: function () {
            updateLockState(this);
          },
          resize: function () {
            updateLockState(this);
          },
          breakpoint: function () {
            updateLockState(this);
          },
        },
      });
    } catch (error) {
      console.error("Failed to initialize collection hero links swiper", error);
    }
  });
}

window.initCollectionHeroLinksSwipers = initCollectionHeroLinksSwipers;

function initComplementaryProductsSwipers(root) {
  if (!window.Swiper) {
    waitForSwiperAvailable(initComplementaryProductsSwipers, root);
    return;
  }

  const scope = root || document;
  const sliders = scope.querySelectorAll(
    "[data-complementary-products-swiper]:not(.swiper-initialized)"
  );

  sliders.forEach(sliderElement => {
    const wrapElement = sliderElement.closest(".complementary-products-swiper-wrap");
    if (!wrapElement) {
      return;
    }

    const nextButton = wrapElement.querySelector(".complementary-products-swiper-next");
    const prevButton = wrapElement.querySelector(".complementary-products-swiper-prev");
    const paginationElement = sliderElement.querySelector(".complementary-products-swiper-pagination");
    const buttonsRoot = wrapElement.querySelector(".complementary-products-swiper-buttons");
    const hasNavigation = Boolean(nextButton && prevButton);

    const updateLockState = swiperInstance => {
      const shouldLock = Boolean(swiperInstance.isLocked);

      wrapElement.classList.toggle("is-locked", shouldLock);

      if (buttonsRoot) {
        buttonsRoot.classList.toggle("is-locked", shouldLock);
      }

      if (nextButton) {
        nextButton.classList.toggle("swiper-button-lock", shouldLock);
        nextButton.disabled = shouldLock;
      }

      if (prevButton) {
        prevButton.classList.toggle("swiper-button-lock", shouldLock);
        prevButton.disabled = shouldLock;
      }

      if (paginationElement) {
        paginationElement.classList.toggle("swiper-pagination-lock", shouldLock);
      }

      swiperInstance.allowTouchMove = !shouldLock;
    };

    try {
      new Swiper(sliderElement, {
        slidesPerView: 'auto',
        slidesPerGroup: 1,
        spaceBetween: 15,
        watchOverflow: true,
        grabCursor: true,
        navigation: hasNavigation
          ? {
              nextEl: nextButton,
              prevEl: prevButton,
            }
          : undefined,
        pagination: paginationElement
          ? {
              el: paginationElement,
              type: "progressbar",
            }
          : undefined,
        breakpoints: {
          750: {
            spaceBetween: 30,
          },
        },
        on: {
          init: function () {
            updateLockState(this);
          },
          resize: function () {
            updateLockState(this);
          },
          breakpoint: function () {
            updateLockState(this);
          },
        },
      });
    } catch (error) {
      console.error("Failed to initialize complementary products swiper", error);
    }
  });
}

window.initComplementaryProductsSwipers = initComplementaryProductsSwipers;

function initProductMediaGalleries(root) {
  if (!window.Swiper) {
    return;
  }

  const scope = root || document;
  const galleries = scope.querySelectorAll(
    "[data-product-media-gallery-slider]:not([data-slider-initialized])"
  );

  const bindMobileVideoFirstTap = galleryElement => {
    if (!window.matchMedia("(max-width: 749px)").matches) {
      return;
    }

    galleryElement
      .querySelectorAll(
        ".slider--main .product__modal-opener--video button.product__media-toggle, .slider--main .product__modal-opener--external_video button.product__media-toggle"
      )
      .forEach(button => {
        if (button.dataset.videoTapBound === "true") {
          return;
        }

        button.dataset.videoTapBound = "true";
        button.addEventListener(
          "click",
          function (event) {
            const mediaContainer = this.closest(".product-media-container");
            const deferredMedia =
              mediaContainer && mediaContainer.querySelector(".deferred-media");
            const modalOpener =
              mediaContainer && mediaContainer.querySelector(".product__modal-opener");

            if (!deferredMedia) {
              return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            if (modalOpener) {
              modalOpener.style.visibility = "hidden";
              modalOpener.style.pointerEvents = "none";
            }

            deferredMedia.style.setProperty("display", "block", "important");
            deferredMedia.style.setProperty("width", "100%", "important");
            deferredMedia.style.setProperty("position", "absolute", "important");
            deferredMedia.style.setProperty("top", "0", "important");
            deferredMedia.style.setProperty("left", "0", "important");
            deferredMedia.style.setProperty("right", "0", "important");
            deferredMedia.style.setProperty("bottom", "0", "important");
            deferredMedia.style.setProperty("z-index", "3", "important");
            deferredMedia.style.setProperty("pointer-events", "auto", "important");

            if (typeof deferredMedia.loadContent === "function") {
              deferredMedia.loadContent(false);
            } else {
              const poster = deferredMedia.querySelector('[id^="Deferred-Poster-"]');
              if (poster) {
                poster.click();
              }
            }

            const video = deferredMedia.querySelector("video");
            if (video) {
              video.play().catch(() => {});
            }
          },
          true
        );
      });
  };

  galleries.forEach(galleryElement => {
    const mainSliderElement = galleryElement.querySelector("[data-product-media-main-slider]");
    if (!mainSliderElement) {
      return;
    }

    bindMobileVideoFirstTap(galleryElement);

    const isQuickAddGallery = Boolean(galleryElement.closest("quick-add-modal"));
    const nextButton = galleryElement.querySelector("[data-product-media-next]");
    const prevButton = galleryElement.querySelector("[data-product-media-prev]");
    const paginationElement = galleryElement.querySelector("[data-product-media-pagination]");
    const thumbsSliderElement = galleryElement.querySelector("[data-product-media-thumbs-slider]");
    const shouldInitThumbs =
      !isQuickAddGallery && thumbsSliderElement && galleryElement.dataset.hasThumbs === "true";
    const hasMainNavigation = Boolean(nextButton && prevButton);
    const mainNavigation = {
      enabled: hasMainNavigation,
      nextEl: nextButton || null,
      prevEl: prevButton || null,
    };

    let thumbsSwiper;

    if (shouldInitThumbs) {
      thumbsSwiper = new Swiper(thumbsSliderElement, {
        direction: "vertical",
        slidesPerView: "auto",
        spaceBetween: 6,
        loop: false,
        navigation:
          galleryElement.querySelector("[data-product-media-thumbs-next]") &&
          galleryElement.querySelector("[data-product-media-thumbs-prev]")
            ? {
                nextEl: galleryElement.querySelector("[data-product-media-thumbs-next]"),
                prevEl: galleryElement.querySelector("[data-product-media-thumbs-prev]"),
              }
            : undefined,
        breakpoints: {
          0: {
            slidesPerView: 4,
            direction: "horizontal",
            spaceBetween: 6,
          },
          1200: {
            slidesPerView: "auto",
            direction: "vertical",
            spaceBetween: 10,
          },
        },
      });
    }

    const mainSwiper = new Swiper(mainSliderElement, {
      spaceBetween: isQuickAddGallery ? 12 : 0,
      slidesPerView: isQuickAddGallery ? 1.6 : 1,
      loop: false,
      grabCursor: false,
      // watchSlidesVisibility: true,
      navigation: mainNavigation,
      pagination: paginationElement
        ? {
            el: paginationElement,
            clickable: true,
            enabled: true,
            type: "bullets",
          }
        : {
            enabled: false,
          },
      thumbs: thumbsSwiper
        ? {
            swiper: thumbsSwiper,
          }
        : undefined,
      breakpoints: isQuickAddGallery
        ? {
            750: {
              slidesPerView: 1,
              spaceBetween: 15,
              centeredSlides: false,
              initialSlide: 0,
              navigation: {
                enabled: hasMainNavigation,
              },
              pagination: {
                enabled: Boolean(paginationElement),
              },
            },
          }
        : {
            750: {
              slidesPerView: 1,
              spaceBetween: 15,
              centeredSlides: false,
              initialSlide: 0,
              navigation: {
                enabled: hasMainNavigation,
              },
              pagination: {
                enabled: Boolean(paginationElement),
              },
            },
            990: {
              slidesPerView: 1,
              spaceBetween: 15,
              centeredSlides: false,
              navigation: {
                enabled: hasMainNavigation,
              },
              pagination: {
                enabled: Boolean(paginationElement),
              },
            },
            1200: {
              slidesPerView: 1,
              spaceBetween: 15,
              centeredSlides: false,
              initialSlide: 0,
              navigation: {
                enabled: hasMainNavigation,
              },
              pagination: {
                enabled: Boolean(paginationElement),
              },
            },
          },
    });

    galleryElement.dataset.sliderInitialized = "true";
    galleryElement.productMediaMainSwiper = mainSwiper;
    if (thumbsSwiper) {
      galleryElement.productMediaThumbsSwiper = thumbsSwiper;
    }
  });
}

window.initProductMediaGalleries = initProductMediaGalleries;

function syncCardSliderWithSwatch() {
  document.addEventListener("change", event => {
    const input = event.target;
    if (!input || !input.classList || !input.classList.contains("swatch-input__input")) {
      return;
    }

    const mediaId = input.dataset.variantFeaturedMediaId;

    const card = input.closest(".card-wrapper");
    if (!card) {
      return;
    }

    const sliderElement = card.querySelector("[data-product-card-slider]");
    if (!sliderElement) return;

    const swiper = sliderElement.swiper || sliderElement._cardSwiper || sliderElement.productMediaMainSwiper;
    if (!swiper) return;
    let targetIndex = -1;
    if (mediaId) {
      targetIndex = Array.from(swiper.slides).findIndex(
        slide => String(slide.dataset.mediaId) === String(mediaId)
      );
    }

    if (targetIndex === -1 && swiper.slides.length > 0) {
      targetIndex = 0;
    }

    if (targetIndex > -1 && targetIndex !== swiper.activeIndex) {
      swiper.slideTo(targetIndex);
    }
  });
}

/* --------------------------------------------------------------------------
   Полоска размеров в карточке товара.

   Что чинится:
   1. Раньше у fieldset[data-card-size-picker] не было ни одного обработчика —
      радиокнопки были чисто декоративными.
   2. Тап по размеру на мобильном добавляет вариант в корзину через тот же
      /cart/add.js и ту же перерисовку cart-drawer, что и product-form.js.
   3. Размеры, недоступные в выбранном цвете, помечаются классом disabled —
      стиль для input.disabled + label в теме уже был.
   -------------------------------------------------------------------------- */

function cardSizePickerVariants(fieldset) {
  if (fieldset._variants) return fieldset._variants;
  var raw = fieldset.getAttribute("data-variants");
  var parsed = [];
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = [];
  }
  fieldset._variants = parsed;
  return parsed;
}

function cardSizePickerSelectedColor(wrapper, fieldset) {
  var name = fieldset.getAttribute("data-color-input-name");
  if (!name) return null;
  var checked = wrapper.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : null;
}

function cardSizePickerFindVariant(wrapper, fieldset, sizeValue) {
  var variants = cardSizePickerVariants(fieldset);
  var sizeIndex = parseInt(fieldset.getAttribute("data-size-position"), 10) - 1;
  var colorPosition = fieldset.getAttribute("data-color-position");
  var colorIndex = colorPosition ? parseInt(colorPosition, 10) - 1 : -1;
  var color = cardSizePickerSelectedColor(wrapper, fieldset);

  for (var i = 0; i < variants.length; i++) {
    var v = variants[i];
    if (!v || !v.o) continue;
    if (String(v.o[sizeIndex]) !== String(sizeValue)) continue;
    if (colorIndex > -1 && color !== null && String(v.o[colorIndex]) !== String(color)) continue;
    return v;
  }
  return null;
}

// Гасим размеры, которых нет в выбранном цвете
function cardSizePickerRefresh(wrapper, fieldset) {
  var inputs = fieldset.querySelectorAll(".card-size-preview__input");
  for (var i = 0; i < inputs.length; i++) {
    var variant = cardSizePickerFindVariant(wrapper, fieldset, inputs[i].value);
    var available = !!(variant && variant.a);
    inputs[i].classList.toggle("disabled", !available);
    inputs[i].disabled = !available;
  }
}

function cardSizeSetBusy(wrapper, toggle, busy) {
  if (wrapper) {
    if (busy) {
      wrapper.dataset.cartBusy = "true";
    } else {
      delete wrapper.dataset.cartBusy;
    }
    // Крутилка в самой полоске — единственный индикатор на десктопе,
    // где кнопка-корзина скрыта медиазапросом.
    var stripSpinner = wrapper.querySelector(".card__sizes-spinner");
    if (stripSpinner) stripSpinner.classList.toggle("hidden", !busy);

    var fieldset = wrapper.querySelector("[data-card-size-picker]");
    if (fieldset) fieldset.setAttribute("aria-busy", busy ? "true" : "false");
  }

  if (!toggle) return;
  toggle.classList.toggle("loading", busy);
  toggle.disabled = busy;
  toggle.setAttribute("aria-busy", busy ? "true" : "false");
  var spinner = toggle.querySelector(".loading__spinner");
  if (spinner) spinner.classList.toggle("hidden", !busy);
}

function cardSizePickerAddToCart(wrapper, toggle, variantId) {
  var cart = document.querySelector("cart-notification") || document.querySelector("cart-drawer");
  var formData = new FormData();
  formData.append("id", variantId);
  formData.append("quantity", 1);

  if (cart && typeof cart.getSectionsToRender === "function") {
    formData.append(
      "sections",
      cart.getSectionsToRender().map(function (section) {
        return section.id;
      })
    );
    formData.append("sections_url", window.location.pathname);
    if (typeof cart.setActiveElement === "function") {
      cart.setActiveElement(document.activeElement);
    }
  }

  var config = typeof fetchConfig === "function" ? fetchConfig("javascript") : { method: "POST", headers: {} };
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  delete config.headers["Content-Type"];
  config.body = formData;

  // Полоску убираем сразу, чтобы вернувшаяся кнопка показала крутилку,
  // а не крутилась под уехавшим элементом.
  wrapper.classList.remove("is-sizes-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");

  cardSizeSetBusy(wrapper, toggle, true);

  return fetch(window.routes ? window.routes.cart_add_url : "/cart/add.js", config)
    .then(function (response) {
      return response.json();
    })
    .then(function (response) {
      if (response.status) {
        // товар кончился между рендером страницы и тапом — обновляем доступность
        var fieldset = wrapper.querySelector("[data-card-size-picker]");
        if (fieldset) cardSizePickerRefresh(wrapper, fieldset);
        return;
      }
      if (cart && typeof cart.renderContents === "function") {
        cart.renderContents(response);
      }
    })
    .catch(function () {
      /* молча: карточка остаётся в прежнем состоянии */
    })
    .finally(function () {
      cardSizeSetBusy(wrapper, toggle, false);
    });
}

function initCardSizePickers(root) {
  var scope = root || document;
  var fieldsets = scope.querySelectorAll("[data-card-size-picker]:not([data-size-picker-ready])");

  Array.prototype.forEach.call(fieldsets, function (fieldset) {
    var wrapper = fieldset.closest(".card-wrapper");
    if (!wrapper) return;

    fieldset.setAttribute("data-size-picker-ready", "true");

    var toggle = wrapper.querySelector("[data-card-sizes-toggle]");

    cardSizePickerRefresh(wrapper, fieldset);

    if (toggle) {
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (wrapper.dataset.cartBusy === "true") return;
        var open = !wrapper.classList.contains("is-sizes-open");
        // одновременно открыта только одна карточка
        var others = document.querySelectorAll(".card-wrapper.is-sizes-open");
        Array.prototype.forEach.call(others, function (other) {
          if (other === wrapper) return;
          other.classList.remove("is-sizes-open");
          var otherToggle = other.querySelector("[data-card-sizes-toggle]");
          if (otherToggle) otherToggle.setAttribute("aria-expanded", "false");
        });
        cardSizePickerRefresh(wrapper, fieldset);
        wrapper.classList.toggle("is-sizes-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    fieldset.addEventListener("click", function (event) {
      var label = event.target.closest("label");
      if (!label) return;
      if (wrapper.dataset.cartBusy === "true") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      var input = fieldset.querySelector("#" + CSS.escape(label.getAttribute("for")));
      if (!input || input.disabled) {
        event.preventDefault();
        return;
      }

      // не даём сработать ссылке-оверлею карточки
      event.preventDefault();
      event.stopPropagation();
      input.checked = true;

      var variant = cardSizePickerFindVariant(wrapper, fieldset, input.value);
      if (!variant || !variant.a) {
        cardSizePickerRefresh(wrapper, fieldset);
        return;
      }
      cardSizePickerAddToCart(wrapper, toggle, variant.id);
    });

    // смена цвета меняет набор доступных размеров
    var colorName = fieldset.getAttribute("data-color-input-name");
    if (colorName) {
      wrapper.addEventListener("change", function (event) {
        if (!event.target || event.target.name !== colorName) return;
        cardSizePickerRefresh(wrapper, fieldset);
      });
    }
  });
}

// тап вне открытой карточки закрывает полоску
if (!window.__cardSizeOutsideBound) {
  window.__cardSizeOutsideBound = true;
  document.addEventListener("click", function (event) {
    var open = document.querySelectorAll(".card-wrapper.is-sizes-open");
    Array.prototype.forEach.call(open, function (wrapper) {
      if (wrapper.contains(event.target)) return;
      wrapper.classList.remove("is-sizes-open");
      var toggle = wrapper.querySelector("[data-card-sizes-toggle]");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initCollectionGridEnhancements(root) {
  const scope = root || document;

  initProductCardSliders(scope);
  initImageSwatchMobileSync(scope);
  initCardSizePickers(scope);
}

function watchCollectionGridUpdates(root) {
  const scope = root || document;
  const collectionGridContainer =
    scope.id === "ProductGridContainer"
      ? scope
      : scope.querySelector?.("#ProductGridContainer") || document.getElementById("ProductGridContainer");

  if (!collectionGridContainer) {
    return;
  }

  if (window.__collectionGridObserverTarget === collectionGridContainer) {
    return;
  }

  if (window.__collectionGridObserver) {
    window.__collectionGridObserver.disconnect();
  }

  const relevantSelector =
    "[data-product-card-slider], .product-card-wrapper, .product-form__input--image-swatch";

  const observer = new MutationObserver(mutations => {
    const hasRelevantAddition = mutations.some(mutation =>
      Array.from(mutation.addedNodes).some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return false;
        }

        return node.matches?.(relevantSelector) || node.querySelector?.(relevantSelector);
      })
    );

    if (!hasRelevantAddition) {
      return;
    }

    requestAnimationFrame(() => {
      initCollectionGridEnhancements(collectionGridContainer);
    });
  });

  observer.observe(collectionGridContainer, {
    childList: true,
    subtree: true,
  });

  window.__collectionGridObserver = observer;
  window.__collectionGridObserverTarget = collectionGridContainer;
}

/* --------------------------------------------------------------------------
   Bottom badges in the product gallery.

   On desktop the gallery is a grid of N rows, and the badge containers are
   absolutely positioned against the whole <slider-component>. bottom: 5px
   therefore meant "bottom of the last row" - with ten rows of photos the
   bottom badges were only visible after scrolling the entire gallery.

   This pins the bottom-corner containers to the bottom edge of the FIRST
   media item instead, via an inline `top`. A ResizeObserver keeps it correct
   while images load, the viewport resizes, or a variant swap changes media.
   -------------------------------------------------------------------------- */
function initGalleryBadgeAnchor(root) {
  var scope = root || document;

  scope.querySelectorAll("media-gallery slider-component").forEach(function (component) {
    if (component.dataset.badgeAnchorReady === "true") return;

    var bottomContainers = component.querySelectorAll(
      ".card__badges--bottom-left, .card__badges--bottom-right"
    );
    if (!bottomContainers.length) return;

    component.dataset.badgeAnchorReady = "true";

    var update = function () {
      var firstItem = component.querySelector(".product__media-item");
      if (!firstItem) return;
      var componentRect = component.getBoundingClientRect();
      var itemRect = firstItem.getBoundingClientRect();
      if (!itemRect.height) return;
      var firstRowBottom = itemRect.bottom - componentRect.top;

      bottomContainers.forEach(function (container) {
        container.style.bottom = "auto";
        // 10px gap above the first row's bottom edge (5px read as glued to the photo)
        container.style.top = firstRowBottom - container.offsetHeight - 10 + "px";
      });
    };

    if (typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(update);
      observer.observe(component);
      var firstItem = component.querySelector(".product__media-item");
      if (firstItem) observer.observe(firstItem);
    }
    window.addEventListener("resize", update);
    // images defining the row height may not be loaded yet
    window.addEventListener("load", update);
    update();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initGalleryBadgeAnchor(document);
  initCollectionGridEnhancements(document);
  initFeaturedCollectionSwipers(document);
  initFeaturedCollectionSenseaSwipers(document);
  initFeaturedCollectionSensea1RowSwipers(document);
  initFeaturedCollectionWithImageSwipers(document);
  initCollectionHeroLinksSwipers(document);
  initComplementaryProductsSwipers(document);
  initProductMediaGalleries(document);
  syncCardSliderWithSwatch();
  watchCollectionGridUpdates(document);
});

if (document.readyState !== "loading") {
  initCollectionGridEnhancements(document);
  initFeaturedCollectionSwipers(document);
  initFeaturedCollectionSenseaSwipers(document);
  initFeaturedCollectionSensea1RowSwipers(document);
  initFeaturedCollectionWithImageSwipers(document);
  initCollectionHeroLinksSwipers(document);
  initComplementaryProductsSwipers(document);
  initProductMediaGalleries(document);
  watchCollectionGridUpdates(document);
}

document.addEventListener("shopify:section:load", function (event) {
  initCollectionGridEnhancements(event.target);
  initFeaturedCollectionSwipers(event.target);
  initFeaturedCollectionSenseaSwipers(event.target);
  initFeaturedCollectionSensea1RowSwipers(event.target);
  initFeaturedCollectionWithImageSwipers(event.target);
  initCollectionHeroLinksSwipers(event.target);
  initComplementaryProductsSwipers(event.target);
  initProductMediaGalleries(event.target);
  watchCollectionGridUpdates(event.target);
});

if (document.readyState !== "loading") {
  initImageSwatchMobileSync(document);
}

if (
  typeof subscribe === "function" &&
  typeof PUB_SUB_EVENTS !== "undefined" &&
  !window.__imageSwatchMobileVariantChangeBound
) {
  window.__imageSwatchMobileVariantChangeBound = true;

  subscribe(PUB_SUB_EVENTS.variantChange, function (event) {
    var sectionId = event && event.data && event.data.sectionId;
    var root = sectionId
      ? document.querySelector('product-info[data-section="' + sectionId + '"]')
      : document;

    initImageSwatchMobileSync(root || document);
  });
}

/**
 * Image swatch mobile dropdown sync.
 *
 * Radio inputs remain the source of truth for variant selection.
 * Mobile JS builds a custom dropdown UI from those radios, while the hidden select
 * stays as a no-JS fallback and is kept in sync for viewport changes.
 */
function getImageSwatchLabelFallback(label) {
  return (label || "").trim().slice(0, 3).toUpperCase();
}

function getImageSwatchRadioData(radio) {
  return {
    id: radio.id,
    value: radio.value,
    label: radio.dataset.imageSwatchLabel || radio.value,
    image: radio.dataset.imageSwatchImage || "",
    imageAlt: radio.dataset.imageSwatchImageAlt || radio.dataset.imageSwatchLabel || radio.value,
    hasImage: radio.dataset.imageSwatchHasImage === "true",
    disabled: radio.disabled || radio.classList.contains("disabled"),
  };
}

function setImageSwatchSummaryMedia(container, data) {
  var summaryImage = container.querySelector("[data-image-swatch-selected-image]");
  var summaryPlaceholder = container.querySelector("[data-image-swatch-selected-placeholder]");

  if (summaryImage) {
    if (data.hasImage && data.image) {
      summaryImage.src = data.image;
      summaryImage.alt = data.imageAlt;
      summaryImage.hidden = false;
    } else {
      summaryImage.removeAttribute("src");
      summaryImage.hidden = true;
    }
  }

  if (summaryPlaceholder) {
    summaryPlaceholder.textContent = getImageSwatchLabelFallback(data.label);
    summaryPlaceholder.hidden = data.hasImage && Boolean(data.image);
  }
}

function closeImageSwatchDropdown(container) {
  var dropdown = container.querySelector("[data-image-swatch-dropdown]");
  var toggle = container.querySelector("[data-image-swatch-toggle]");
  var menu = container.querySelector("[data-image-swatch-menu]");

  if (dropdown) {
    dropdown.classList.remove("is-open");
  }

  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
  }

  if (menu) {
    menu.hidden = true;
  }
}

function syncImageSwatchMobileUI(container) {
  var checkedRadio =
    container.querySelector(".image-swatch__input:checked") ||
    container.querySelector(".image-swatch__input");
  var select = container.querySelector("[data-image-swatch-select]");
  var selectedValue = container.querySelector("[data-selected-value]");
  var selectedLabel = container.querySelector("[data-image-swatch-selected-label]");

  if (!checkedRadio) {
    return;
  }

  var data = getImageSwatchRadioData(checkedRadio);

  if (select) {
    select.value = checkedRadio.value;
  }

  if (selectedValue) {
    selectedValue.textContent = data.label;
  }

  if (selectedLabel) {
    selectedLabel.textContent = data.label;
  }

  setImageSwatchSummaryMedia(container, data);

  container.querySelectorAll(".image-swatch__mobile-option").forEach(function (option) {
    var isSelected = option.dataset.radioId === checkedRadio.id;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

function buildImageSwatchMobileMenu(container) {
  var menu = container.querySelector("[data-image-swatch-menu]");

  if (!menu) {
    return;
  }

  menu.innerHTML = "";

  container.querySelectorAll(".image-swatch__input").forEach(function (radio) {
    var data = getImageSwatchRadioData(radio);
    var option = document.createElement("button");
    var label = document.createElement("span");
    var media = document.createElement("span");

    option.type = "button";
    option.className = "image-swatch__mobile-option";
    option.dataset.radioId = data.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", radio.checked ? "true" : "false");

    if (data.disabled) {
      option.classList.add("is-disabled");
      option.disabled = true;
    }

    label.className = "image-swatch__mobile-option-label";
    label.textContent = data.label;

    media.className = "image-swatch__mobile-option-media";

    if (data.hasImage && data.image) {
      var image = document.createElement("img");
      image.className = "image-swatch__mobile-option-image";
      image.src = data.image;
      image.alt = data.imageAlt;
      image.width = 44;
      image.height = 44;
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      var placeholder = document.createElement("span");
      placeholder.className = "image-swatch__mobile-option-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = getImageSwatchLabelFallback(data.label);
      media.appendChild(placeholder);
    }

    option.appendChild(label);
    option.appendChild(media);
    menu.appendChild(option);
  });
}

function initImageSwatchMobileSync(root) {
  var scope = root || document;

  scope.querySelectorAll(".product-form__input--image-swatch").forEach(function (container) {
    var select = container.querySelector("[data-image-swatch-select]");
    var toggle = container.querySelector("[data-image-swatch-toggle]");
    var menu = container.querySelector("[data-image-swatch-menu]");
    var dropdown = container.querySelector("[data-image-swatch-dropdown]");
    var fieldset = container.querySelector(".image-swatch__fieldset");

    if (!menu || !toggle || !dropdown || !fieldset) {
      return;
    }

    buildImageSwatchMobileMenu(container);
    syncImageSwatchMobileUI(container);

    if (container.dataset.imageSwatchEnhanced === "true") {
      return;
    }

    container.dataset.imageSwatchEnhanced = "true";

    if (select) {
      select.addEventListener("change", function (e) {
        var matchedRadio = null;

        e.stopImmediatePropagation();

        container.querySelectorAll(".image-swatch__input").forEach(function (radio) {
          if (!matchedRadio && radio.value === select.value) {
            matchedRadio = radio;
          }
        });

        if (!matchedRadio) {
          return;
        }

        matchedRadio.checked = true;
        matchedRadio.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (!menu.children.length) {
        buildImageSwatchMobileMenu(container);
        syncImageSwatchMobileUI(container);
      }

      var isOpen = dropdown.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menu.hidden = !isOpen;
    });

    menu.addEventListener("click", function (event) {
      var option = event.target.closest(".image-swatch__mobile-option");
      var radio;

      if (!option || option.disabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      radio = document.getElementById(option.dataset.radioId);
      if (!radio) {
        return;
      }

      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        syncImageSwatchMobileUI(container);
      }

      closeImageSwatchDropdown(container);
    });

    fieldset.addEventListener("change", function (e) {
      if (!e.target.matches(".image-swatch__input")) {
        return;
      }

      syncImageSwatchMobileUI(container);
      closeImageSwatchDropdown(container);
    });
  });

  if (window.__imageSwatchMobileHandlersBound) {
    return;
  }

  window.__imageSwatchMobileHandlersBound = true;

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-image-swatch-toggle]");
    var option = event.target.closest(".image-swatch__mobile-option");

    if (toggle) {
      var toggleContainer = toggle.closest(".product-form__input--image-swatch");
      var toggleDropdown =
        toggleContainer && toggleContainer.querySelector("[data-image-swatch-dropdown]");
      var toggleMenu = toggleContainer && toggleContainer.querySelector("[data-image-swatch-menu]");

      if (toggleContainer && toggleDropdown && toggleMenu) {
        event.preventDefault();

        if (!toggleMenu.children.length) {
          buildImageSwatchMobileMenu(toggleContainer);
        }

        syncImageSwatchMobileUI(toggleContainer);

        document
          .querySelectorAll("[data-image-swatch-dropdown].is-open")
          .forEach(function (dropdown) {
            if (dropdown !== toggleDropdown) {
              closeImageSwatchDropdown(dropdown.closest(".product-form__input--image-swatch"));
            }
          });

        var isOpen = toggleDropdown.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        toggleMenu.hidden = !isOpen;
      }

      return;
    }

    if (option) {
      var optionContainer = option.closest(".product-form__input--image-swatch");
      var radio = document.getElementById(option.dataset.radioId);

      if (optionContainer && radio && !option.disabled) {
        event.preventDefault();

        if (!radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          syncImageSwatchMobileUI(optionContainer);
        }

        closeImageSwatchDropdown(optionContainer);
      }

      return;
    }

    document.querySelectorAll("[data-image-swatch-dropdown].is-open").forEach(function (dropdown) {
      if (!dropdown.contains(event.target)) {
        closeImageSwatchDropdown(dropdown.closest(".product-form__input--image-swatch"));
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }

    document.querySelectorAll("[data-image-swatch-dropdown].is-open").forEach(function (dropdown) {
      closeImageSwatchDropdown(dropdown.closest(".product-form__input--image-swatch"));
    });
  });
}

window.initImageSwatchMobileSync = initImageSwatchMobileSync;

(function () {
  function syncLockedCollectionLinks(root) {
    var scope = root || document;

    scope.querySelectorAll(".js-locked-collection-link[data-locked-href]").forEach(function (link) {
      var lockedHref = link.getAttribute("data-locked-href");
      if (!lockedHref) {
        return;
      }

      if (link.getAttribute("href") !== lockedHref) {
        link.setAttribute("href", lockedHref);
      }
    });
  }

  function shouldBypassLockedClick(event) {
    return (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    syncLockedCollectionLinks(document);
  });

  document.addEventListener("shopify:section:load", function (event) {
    syncLockedCollectionLinks(event.target || document);
  });

  document.addEventListener(
    "click",
    function (event) {
      var link = event.target.closest(".js-locked-collection-link[data-locked-href]");
      if (!link || shouldBypassLockedClick(event)) {
        return;
      }

      var lockedHref = link.getAttribute("data-locked-href");
      if (!lockedHref) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(lockedHref);
    },
    true
  );

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      var target = mutations[i].target;
      if (
        !target ||
        !target.matches ||
        !target.matches(".js-locked-collection-link[data-locked-href]")
      ) {
        continue;
      }

      var lockedHref = target.getAttribute("data-locked-href");
      if (lockedHref && target.getAttribute("href") !== lockedHref) {
        target.setAttribute("href", lockedHref);
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "data-locked-href"],
  });
})();




 