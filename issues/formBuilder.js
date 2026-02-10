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

    // Label container with required indicator
    const labelContainer = document.createElement('div');
    labelContainer.className = 'label-container';
    
    const label = document.createElement('label');
    label.htmlFor = 'f-' + fieldConfig.id;
    label.textContent = fieldConfig.label;
    labelContainer.appendChild(label);
    
    if (fieldConfig.required) {
      const requiredMsg = document.createElement('span');
      requiredMsg.className = 'required-message';
      requiredMsg.id = `f-${fieldConfig.id}-required`;
      requiredMsg.textContent = 'Required';
      labelContainer.appendChild(requiredMsg);
    }
    
    fieldGroup.appendChild(labelContainer);

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
      case 'file':
        input = this.buildFileInput(fieldConfig);
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
  },

  /**
   * Build a file input field
   */
  buildFileInput(fieldConfig) {
    const container = document.createElement('div');
    container.className = 'file-input-container';
    
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'f-' + fieldConfig.id;
    input.name = fieldConfig.id;
    input.className = 'form-file-input';
    input.accept = fieldConfig.accept || '*';
    input.required = fieldConfig.required || false;
    input.dataset.required = fieldConfig.required || false;
    
    if (fieldConfig.maxSize) {
      input.dataset.maxSize = fieldConfig.maxSize;
    }
    
    // Create custom file input button
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.className = 'file-input-label';
    label.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span class="file-input-text">Choose file...</span>
    `;
    
    // File info display
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-input-info';
    fileInfo.id = `f-${fieldConfig.id}-info`;
    
    // Help text
    const helpText = document.createElement('div');
    helpText.className = 'file-input-help';
    const maxSizeMB = fieldConfig.maxSize ? (fieldConfig.maxSize / 1048576).toFixed(0) : 10;
    helpText.textContent = `Max ${maxSizeMB}MB. Supported: images, logs, text, zip files`;
    
    // Handle file selection
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const textSpan = label.querySelector('.file-input-text');
      
      if (file) {
        // Check file size
        const maxSize = fieldConfig.maxSize || 10485760; // 10MB default
        if (file.size > maxSize) {
          fileInfo.textContent = `⚠️ File too large (max ${(maxSize / 1048576).toFixed(0)}MB)`;
          fileInfo.className = 'file-input-info error';
          input.value = '';
          textSpan.textContent = 'Choose file...';
          return;
        }
        
        textSpan.textContent = file.name;
        const sizeMB = (file.size / 1048576).toFixed(2);
        fileInfo.textContent = `📎 ${file.name} (${sizeMB}MB)`;
        fileInfo.className = 'file-input-info success';
      } else {
        textSpan.textContent = 'Choose file...';
        fileInfo.textContent = '';
        fileInfo.className = 'file-input-info';
      }
    });
    
    container.appendChild(input);
    container.appendChild(label);
    container.appendChild(fileInfo);
    container.appendChild(helpText);
    
    return container;
  }
};
