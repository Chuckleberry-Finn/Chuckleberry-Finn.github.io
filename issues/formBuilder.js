/**
 * ============================================================
 *  FORM BUILDER — Dynamically generates forms from config
 * ============================================================
 *  This module reads CONFIG.issueTypes and builds HTML forms.
 *  To add/remove/modify fields, edit config.js only.
 * ============================================================
 */

const FormBuilder = {

  /**
   * Build a single form field
   * @param {Object} fieldConfig - Field configuration from CONFIG
   * @returns {HTMLDivElement} The field group element
   */
  buildField(fieldConfig) {
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'form-group';
    if (fieldConfig.required) {
      fieldGroup.classList.add('required');
    }

    // Label
    const label = document.createElement('label');
    label.htmlFor = 'f-' + fieldConfig.id;
    label.textContent = fieldConfig.label;
    if (fieldConfig.required) {
      const requiredSpan = document.createElement('span');
      requiredSpan.className = 'required-indicator';
      requiredSpan.textContent = ' *';
      label.appendChild(requiredSpan);
    }
    fieldGroup.appendChild(label);

    // Input element
    let input;
    switch (fieldConfig.type) {
      case 'text':
        input = this.buildTextInput(fieldConfig);
        break;
      case 'textarea':
        input = this.buildTextarea(fieldConfig);
        break;
      case 'select':
        input = this.buildSelect(fieldConfig);
        break;
      default:
        console.warn(`Unknown field type: ${fieldConfig.type}`);
        input = this.buildTextInput(fieldConfig);
    }

    fieldGroup.appendChild(input);

    // Error message placeholder
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.id = `f-${fieldConfig.id}-error`;
    fieldGroup.appendChild(errorMsg);

    return fieldGroup;
  },

  /**
   * Build a text input field
   */
  buildTextInput(fieldConfig) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'f-' + fieldConfig.id;
    input.name = fieldConfig.id;
    input.className = 'form-input';
    input.placeholder = fieldConfig.placeholder || '';
    input.required = fieldConfig.required || false;
    input.dataset.required = fieldConfig.required || false;
    return input;
  },

  /**
   * Build a textarea field
   */
  buildTextarea(fieldConfig) {
    const textarea = document.createElement('textarea');
    textarea.id = 'f-' + fieldConfig.id;
    textarea.name = fieldConfig.id;
    textarea.className = 'form-input';
    textarea.placeholder = fieldConfig.placeholder || '';
    textarea.required = fieldConfig.required || false;
    textarea.dataset.required = fieldConfig.required || false;
    textarea.rows = 5;
    return textarea;
  },

  /**
   * Build a select dropdown field
   */
  buildSelect(fieldConfig) {
    const select = document.createElement('select');
    select.id = 'f-' + fieldConfig.id;
    select.name = fieldConfig.id;
    select.className = 'form-select';
    select.required = fieldConfig.required || false;
    select.dataset.required = fieldConfig.required || false;

    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = `Select ${fieldConfig.label.toLowerCase()}...`;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    // Add options
    if (fieldConfig.options && Array.isArray(fieldConfig.options)) {
      fieldConfig.options.forEach(optionText => {
        const option = document.createElement('option');
        option.value = optionText;
        option.textContent = optionText;
        select.appendChild(option);
      });
    }

    return select;
  }
};
