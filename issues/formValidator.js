/**
 * ============================================================
 *  FORM VALIDATOR — Real-time validation & submit control
 * ============================================================
 *  This module:
 *  - Validates required fields in real-time
 *  - Enables/disables submit button based on form validity
 *  - Shows/hides error messages
 *  - Reads field requirements from config.js automatically
 * ============================================================
 */

const FormValidator = {
  /**
   * Initialize validation for a form
   * @param {HTMLFormElement} form - The form to validate
   */
  initValidation(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Add input listeners for real-time validation
    inputs.forEach(input => {
      // Validate on blur (when user leaves field)
      input.addEventListener('blur', () => {
        this.validateField(input);
        this.updateSubmitButton(form, submitBtn);
      });

      // Validate on input (as user types)
      input.addEventListener('input', () => {
        // Clear error message when user starts typing
        const errorMsg = document.getElementById(`${input.id}-error`);
        if (errorMsg) {
          errorMsg.textContent = '';
        }
        input.classList.remove('invalid');
        
        // Check if form is now valid
        this.updateSubmitButton(form, submitBtn);
      });

      // For select, validate on change
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => {
          this.validateField(input);
          this.updateSubmitButton(form, submitBtn);
        });
      }
    });

    // Initial check
    this.updateSubmitButton(form, submitBtn);
  },

  /**
   * Validate a single field
   * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} field
   * @returns {boolean} True if valid
   */
  validateField(field) {
    const isRequired = field.dataset.required === 'true' || field.required;
    const value = field.value.trim();
    const errorMsg = document.getElementById(`${field.id}-error`);

    // Check if required field is empty
    if (isRequired && !value) {
      field.classList.add('invalid');
      if (errorMsg) {
        errorMsg.textContent = 'This field is required';
      }
      return false;
    }

    // Field is valid
    field.classList.remove('invalid');
    if (errorMsg) {
      errorMsg.textContent = '';
    }
    return true;
  },

  /**
   * Check if all required fields are filled
   * @param {HTMLFormElement} form
   * @returns {boolean} True if form is valid
   */
  isFormValid(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    let isValid = true;

    inputs.forEach(input => {
      const isRequired = input.dataset.required === 'true' || input.required;
      const value = input.value.trim();

      if (isRequired && !value) {
        isValid = false;
      }
    });

    return isValid;
  },

  /**
   * Update submit button state based on form validity
   * @param {HTMLFormElement} form
   * @param {HTMLButtonElement} submitBtn
   */
  updateSubmitButton(form, submitBtn) {
    const isValid = this.isFormValid(form);
    submitBtn.disabled = !isValid;
    
    if (isValid) {
      submitBtn.classList.add('enabled');
    } else {
      submitBtn.classList.remove('enabled');
    }
  },

  /**
   * Validate entire form (for final submission check)
   * @param {HTMLFormElement} form
   * @returns {boolean} True if all validations pass
   */
  validateForm(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    let isValid = true;

    inputs.forEach(input => {
      if (!this.validateField(input)) {
        isValid = false;
      }
    });

    return isValid;
  },

  /**
   * Clear all validation states
   * @param {HTMLFormElement} form
   */
  clearValidation(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.classList.remove('invalid');
      const errorMsg = document.getElementById(`${input.id}-error`);
      if (errorMsg) {
        errorMsg.textContent = '';
      }
    });
  }
};
