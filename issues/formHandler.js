/**
 * ============================================================
 *  FORM HANDLER — Helper functions for form data
 * ============================================================
 */

const FormHandler = {
  /**
   * Get all form data as an object
   * @param {HTMLFormElement} form
   * @returns {Object} Form data
   */
  getFormData(form) {
    const formData = {};
    const inputs = form.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      if (input.name) {
        formData[input.name] = input.value.trim();
      }
    });
    
    return formData;
  }
};
