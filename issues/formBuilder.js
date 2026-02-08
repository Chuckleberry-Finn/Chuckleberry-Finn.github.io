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
   * Build a complete form from issue type config
   * @param {Object} issueTypeConfig - The issue type configuration from CONFIG
   * @param {string} issueTypeName - The name of the issue type (e.g., 'bug', 'feature')
   * @returns {HTMLFormElement} The generated form element
   */
  buildForm(issueTypeConfig, issueTypeName) {
    const form = document.createElement('form');
    form.className = 'issue-form';
    form.id = `${issueTypeName}-form`;
    form.dataset.issueType = issueTypeName;

    // Add form title
    const title = document.createElement('h2');
    title.textContent = issueTypeConfig.label;
    title.className = 'form-title';
    form.appendChild(title);

    // Build each field
    issueTypeConfig.fields.forEach(fieldConfig => {
      const fieldGroup = this.buildField(fieldConfig);
      form.appendChild(fieldGroup);
    });

    // Add submit button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'form-actions';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'submit-btn';
    submitBtn.textContent = 'Submit ' + issueTypeConfig.label;
    submitBtn.disabled = true; // Start disabled
    submitBtn.id = `${issueTypeName}-submit`;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      form.reset();
      document.getElementById('formContainer').style.display = 'none';
      document.getElementById('issueTypeSection').style.display = 'block';
    };

    buttonContainer.appendChild(submitBtn);
    buttonContainer.appendChild(cancelBtn);
    form.appendChild(buttonContainer);

    return form;
  },

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
    label.htmlFor = fieldConfig.id;
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
    errorMsg.id = `${fieldConfig.id}-error`;
    fieldGroup.appendChild(errorMsg);

    return fieldGroup;
  },

  /**
   * Build a text input field
   */
  buildTextInput(fieldConfig) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = fieldConfig.id;
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
    textarea.id = fieldConfig.id;
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
    select.id = fieldConfig.id;
    select.name = fieldConfig.id;
    select.className = 'form-input';
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
