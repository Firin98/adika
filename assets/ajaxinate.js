"use strict";

// Маркер: если этой строки нет в консоли — грузится НЕ этот файл (кэш/CDN/не тот asset).
console.log("[ajaxinate] файл загружен", new Date().toISOString());

/**
 * Ajaxinate — бесшовный бесконечный скролл.
 * - следующая страница префетчится в кэш заранее → вставка мгновенная, лоадер не виден;
 * - observer не умирает на ошибке: повтор с задержкой;
 * - ничего не крашится на null: если в ответе нет грида/пагинации — понятный warn, а не смерть скролла;
 * - offset односторонний (только вниз) и умеренный, чтобы не грузить всё залпом.
 */

var Ajaxinate = function (t) {
    var e = t || {};
    this.settings = Object.assign({
        pagination: "#pagination-wrapper",
        method: "scroll",
        container: "#product-grid",
        // триггер за ~1.5 экрана до конца списка
        offset: Math.round(window.innerHeight * 1.5),
        loadingText: "טוען...",
        async: true,
        callback: null,
        debug: false // true → печатает URL/наличие грида в консоль
    }, e);

    this.addScrollListeners = this.addScrollListeners.bind(this);
    this.addClickListener = this.addClickListener.bind(this);
    this.onPaginationVisible = this.onPaginationVisible.bind(this);
    this.stopMultipleClicks = this.stopMultipleClicks.bind(this);
    this.destroy = this.destroy.bind(this);

    this.containerElement = document.querySelector(this.settings.container);
    this.paginationElement = document.querySelector(this.settings.pagination);

    this.isLoading = false;
    this.cache = null;        // { url, promise }
    this.nextPageUrl = null;
    this.observer = null;
    this.retryTimer = null;
    this.retries = 0;

    this.initialize();
};

Ajaxinate.prototype.log = function () {
    if (this.settings.debug) console.log.apply(console, ["[ajaxinate]"].concat([].slice.call(arguments)));
};

Ajaxinate.prototype.initialize = function () {
    if (!this.containerElement) return;
    var fn = { click: this.addClickListener, scroll: this.addScrollListeners }[this.settings.method];
    if (fn) fn();
};

// ---------- SCROLL ----------

Ajaxinate.prototype.addScrollListeners = function () {
    if (!this.paginationElement) return;

    this.updateNextPageUrl();
    this.prefetchNext(); // греем первую следующую страницу заранее

    this.observer = new IntersectionObserver(this.onPaginationVisible, {
        rootMargin: "0px 0px " + this.settings.offset + "px 0px" // расширяем зону только вниз
    });
    this.observer.observe(this.paginationElement);
};

Ajaxinate.prototype.onPaginationVisible = function (entries) {
    if (this.isLoading) return;
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    this.updateNextPageUrl();
    if (this.nextPageUrl) this.loadMore();
};

Ajaxinate.prototype.updateNextPageUrl = function () {
    // ищем следующую ссылку внутри пагинации, а если .infinite_next — это сам <a>, берём его href
    var link = this.paginationElement && this.paginationElement.querySelector("a");
    if (!link && this.paginationElement && this.paginationElement.tagName === "A") {
        link = this.paginationElement;
    }
    this.nextPageUrl = link ? link.href : null;
    this.log("nextPageUrl →", this.nextPageUrl);
};

// пере-вешиваем observer, чтобы получить следующий триггер
Ajaxinate.prototype.reobserve = function () {
    if (!this.observer || !this.paginationElement) return;
    this.observer.disconnect();
    this.observer.observe(this.paginationElement);
};

// ---------- CLICK (fallback) ----------

Ajaxinate.prototype.addClickListener = function () {
    if (!this.paginationElement) return;
    this.nextPageLinkElement = this.paginationElement.querySelector("a");
    this.clickActive = true;
    if (this.nextPageLinkElement) {
        this.nextPageLinkElement.addEventListener("click", this.stopMultipleClicks);
    }
};

Ajaxinate.prototype.stopMultipleClicks = function (t) {
    t.preventDefault();
    if (!this.clickActive) return;
    this.nextPageLinkElement.innerHTML = this.settings.loadingText;
    this.nextPageUrl = this.nextPageLinkElement.href;
    this.clickActive = false;
    this.loadMore();
};

// ---------- Загрузка через кэш ----------

Ajaxinate.prototype.fetchPage = function (url) {
    if (this.cache && this.cache.url === url) return this.cache.promise;

    var self = this;
    var entry = {
        url: url,
        promise: fetch(url, { credentials: "same-origin" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status + " → " + url);
            return r.text();
        })
    };
    entry.promise.catch(function () { if (self.cache === entry) self.cache = null; });
    this.cache = entry;
    return entry.promise;
};

// префетч следующей страницы: греет кэш, ошибки гасит молча
Ajaxinate.prototype.prefetchNext = function () {
    if (!this.nextPageUrl) return;
    this.fetchPage(this.nextPageUrl).catch(function () {});
};

// когда страниц больше нет — аккуратно выключаемся
Ajaxinate.prototype.finish = function () {
    var wrap = document.querySelector("#pagination-wrapper");
    if (wrap) wrap.style.display = "none";
    window.blockLoadMore = true;
    this.nextPageUrl = null;
    this.removeScrollListener();
};

Ajaxinate.prototype.loadMore = async function () {
    if (this.isLoading || !this.nextPageUrl) return;
    if (this.containerElement.children.length === 0) return;

    this.isLoading = true;
    var urlToLoad = this.nextPageUrl;

    try {
        const html = await this.fetchPage(urlToLoad); // мгновенно, если прогрето
        const doc = new DOMParser().parseFromString(html, "text/html");
        const containerContent = doc.querySelector(this.settings.container);
        const paginationContent = doc.querySelector(this.settings.pagination);

        this.log("URL:", urlToLoad, "| grid:", !!containerContent, "| pagination:", !!paginationContent);

        // Ответ без грида — не крашимся. Один понятный warn и повтор.
        if (!containerContent) {
            console.warn(
                "[ajaxinate] В ответе нет '" + this.settings.container + "'. URL:", urlToLoad,
                "| id верхнего уровня в ответе:",
                [].map.call(doc.querySelectorAll("[id]"), function (n) { return "#" + n.id; }).slice(0, 15)
            );
            this.scheduleRetry();
            return;
        }

        this.retries = 0;
        this.containerElement.insertAdjacentHTML("beforeend", containerContent.innerHTML);

        if (window.initJsSlideProduct) window.initJsSlideProduct();

        if (!paginationContent) {
            this.finish(); // последняя страница
        } else {
            var wrapShow = document.querySelector("#pagination-wrapper");
            if (wrapShow) wrapShow.style.display = "block";

            this.paginationElement.innerHTML = paginationContent.innerHTML;
            this.updateNextPageUrl();
            this.prefetchNext(); // греем страницу вперёд

            if (typeof this.settings.callback === "function") this.settings.callback(doc);

            this.reobserve();
        }
    } catch (error) {
        console.error("[ajaxinate] Ошибка при загрузке:", error);
        this.scheduleRetry(); // observer жив — пробуем снова
    } finally {
        this.isLoading = false;
    }
};

// повтор с ограничением, чтобы не долбить сервер бесконечно
Ajaxinate.prototype.scheduleRetry = function () {
    if (this.retries >= 5) {
        console.warn("[ajaxinate] 5 неудачных попыток подряд — останавливаюсь.");
        return;
    }
    this.retries++;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(this.reobserve.bind(this), 2000);
};

// ---------- Очистка ----------

Ajaxinate.prototype.removeClickListener = function () {
    if (this.nextPageLinkElement) {
        this.nextPageLinkElement.removeEventListener("click", this.stopMultipleClicks);
    }
};

Ajaxinate.prototype.removeScrollListener = function () {
    clearTimeout(this.retryTimer);
    if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
    }
};

Ajaxinate.prototype.destroy = function () {
    if (this.settings.method === "click") this.removeClickListener();
    else this.removeScrollListener();
    clearTimeout(this.retryTimer);
    this.nextPageUrl = null;
    this.cache = null;
    return this;
};

// ---------- Инициализация / перезапуск при смене фильтра ----------

function initAjaxinateObserver() {
    const targetNode = document.querySelector(".product-grid-container");
    if (!targetNode) {
        console.error("[ajaxinate] Контейнер .product-grid-container не найден");
        return;
    }

    // Селектор пагинации — ОДИН и тот же для проверки наличия и для инстанса.
    const PAGINATION = ".infinite_next";

    const restartAjaxinate = (attempt) => {
        attempt = attempt || 0;

        if (window.blockLoadMore) {
            window.blockLoadMore = false;
            return false;
        }

        const pagination = document.querySelector(PAGINATION);

        // Холодная загрузка сверху: секция ещё не отрендерена, пагинации в DOM нет.
        // Не бросаем инициализацию — повторяем каждые 250мс до ~5 сек, пока не появится.
        if (!pagination) {
            if (attempt < 20) setTimeout(function () { restartAjaxinate(attempt + 1); }, 250);
            return;
        }

        if (window.ajaxinateInstance) window.ajaxinateInstance.destroy();

        const wrap = document.querySelector("#pagination-wrapper");
        if (wrap) wrap.style.display = "block";

        window.ajaxinateInstance = new Ajaxinate({
            container: "#product-grid",
            pagination: PAGINATION,
            offset: Math.round(window.innerHeight * 1.5),
            debug: true // временно ВКЛ: пришли мне строку [ajaxinate] URL: ... из консоли
        });

        if (window.initProductCardSliders) window.initProductCardSliders();
    };

    // Дебаунс: и стартовый рендер, и всплеск мутаций при смене фильтра
    // схлопываются в ОДИН перезапуск → нет двойной инициализации и двойного префетча.
    let restartTimer = null;
    const scheduleRestart = () => {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(function () { restartAjaxinate(); }, 150);
    };

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                scheduleRestart();
                break;
            }
        }
    });

    observer.observe(targetNode, { childList: true });
    scheduleRestart();
}

// Запуск с учётом того, что DOM мог уже распарситься к моменту загрузки скрипта.
// Иначе addEventListener("DOMContentLoaded") вешается на уже прошедшее событие → тишина.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAjaxinateObserver);
} else {
    initAjaxinateObserver();
}