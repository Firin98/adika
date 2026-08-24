if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        // Size starts unselected on the product page (see
        // product-variant-options.liquid). The hidden variant id still points
        // at the default variant, so the form must not submit until the
        // visitor actually picks a size.
        if (this.sizeSelectionMissing()) {
          this.showSizeRequiredPopup();
          return;
        }

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        const variantId = formData.get('id');
        const quantity = parseInt(formData.get('quantity')) || 1;
        const linesUpdateDeferred = this.createCartLinesUpdateEvent(variantId, quantity);

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: variantId,
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);
              this.dispatchCartErrorEvent(response.description || response.message, 'INVALID');
              linesUpdateDeferred?.reject(new Error(response.description || response.message));

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              this.resolveCartLinesUpdate(linesUpdateDeferred);
              window.location = window.routes.cart_url;
              return;
            }

            this.resolveCartLinesUpdate(linesUpdateDeferred);

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: variantId,
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
            }
          })
          .catch((e) => {
            console.error(e);
            this.dispatchCartErrorEvent(e.message || 'Network error', 'SERVICE_UNAVAILABLE');
            linesUpdateDeferred?.reject(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      createCartLinesUpdateEvent(variantId, quantity) {
        const { CartLinesUpdateEvent } = window.StandardEvents || {};
        if (!CartLinesUpdateEvent) return null;

        const deferred = CartLinesUpdateEvent.createPromise();
        this.dispatchEvent(
          new CartLinesUpdateEvent({
            action: 'add',
            context: 'product',
            lines: [{ merchandiseId: variantId, quantity }],
            promise: deferred.promise,
          })
        );
        return deferred;
      }

      resolveCartLinesUpdate(deferred) {
        if (!deferred) return;
        const { CartLinesUpdateEvent } = window.StandardEvents || {};
        if (!CartLinesUpdateEvent) return;

        const pendingCartDataPromise = typeof CartItems !== 'undefined'
          ? CartItems.fetchCartData()
          : fetch(`${routes.cart_url}.json`).then((response) => response.json());

        pendingCartDataPromise
          .then((cart) => {
            if (!cart?.currency) return deferred.reject(new Error('Missing currency in cart response'));
            deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart) });
          })
          .catch((e) => deferred.reject(e));
      }

      dispatchCartErrorEvent(message, code) {
        const { CartErrorEvent } = window.StandardEvents || {};
        if (!CartErrorEvent) return;
        this.dispatchEvent(new CartErrorEvent({ error: message, code }));
      }

      sizeSelectionMissing() {
        const scope = this.closest('product-info') || document;
        const variantSelects = scope.querySelector('variant-selects');
        if (!variantSelects) return false;

        let hasSizeGroup = false;
        let hasCheckedSize = false;
        variantSelects.querySelectorAll('fieldset input[type="radio"]').forEach((input) => {
          const optionName = (input.dataset.optionName || input.name || '').toLowerCase();
          if (!optionName.includes('size') && !optionName.includes('\u05de\u05d9\u05d3')) return;
          hasSizeGroup = true;
          if (input.checked) hasCheckedSize = true;
        });
        return hasSizeGroup && !hasCheckedSize;
      }

      showSizeRequiredPopup() {
        let modal = document.getElementById('SizeRequiredPopup');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'SizeRequiredPopup';
          modal.className = 'size-required-popup';
          modal.setAttribute('role', 'alertdialog');
          modal.setAttribute('aria-modal', 'true');
          modal.setAttribute('aria-labelledby', 'SizeRequiredPopupText');
          const text = (window.variantStrings && window.variantStrings.sizeRequired) || '\u05d0\u05e0\u05d0 \u05d1\u05d7\u05e8\u05d5 \u05de\u05d9\u05d3\u05d4';
          const buttonText = (window.variantStrings && window.variantStrings.sizeRequiredButton) || '\u05d0\u05d9\u05e9\u05d5\u05e8';
          modal.innerHTML =
            '<div class="size-required-popup__overlay" data-size-popup-close></div>' +
            '<div class="size-required-popup__box">' +
            '<p id="SizeRequiredPopupText" class="size-required-popup__text">' + text + '</p>' +
            '<button type="button" class="button size-required-popup__button" data-size-popup-close>' + buttonText + '</button>' +
            '</div>';
          modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-size-popup-close]')) this.hideSizeRequiredPopup();
          });
          document.body.appendChild(modal);
        }
        this._sizePopupKeyHandler = (event) => {
          if (event.key === 'Escape') this.hideSizeRequiredPopup();
        };
        document.addEventListener('keydown', this._sizePopupKeyHandler);
        modal.classList.add('is-open');
        const button = modal.querySelector('.size-required-popup__button');
        if (button) button.focus();
      }

      hideSizeRequiredPopup() {
        const modal = document.getElementById('SizeRequiredPopup');
        if (modal) modal.classList.remove('is-open');
        if (this._sizePopupKeyHandler) {
          document.removeEventListener('keydown', this._sizePopupKeyHandler);
          this._sizePopupKeyHandler = null;
        }
        // Bring the size row into view so the visitor sees what to fix
        const scope = this.closest('product-info') || document;
        const sizeInput = Array.from(scope.querySelectorAll('variant-selects fieldset input[type="radio"]')).find(
          (input) => {
            const optionName = (input.dataset.optionName || input.name || '').toLowerCase();
            return optionName.includes('size') || optionName.includes('\u05de\u05d9\u05d3');
          }
        );
        const fieldset = sizeInput && sizeInput.closest('fieldset');
        if (fieldset) {
          fieldset.scrollIntoView({ behavior: 'smooth', block: 'center' });
          fieldset.classList.add('size-required-highlight');
          setTimeout(() => fieldset.classList.remove('size-required-highlight'), 1600);
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
