/**
 * ============================================================
 *  FORM HANDLER — Form submission & GitHub API interaction
 * ============================================================
 *  This module handles:
 *  - Form submission
 *  - Formatting issue body from form data
 *  - Communication with Cloudflare Worker
 *  - Success/error messaging
 * ============================================================
 */

const FormHandler = {
  /**
   * Initialize form submission handler
   * @param {HTMLFormElement} form
   * @param {Object} selectedMod
   * @param {Object} issueTypeConfig
   */
  initSubmission(form, selectedMod, issueTypeConfig) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Final validation check
      if (!FormValidator.validateForm(form)) {
        this.showStatus('Please fill in all required fields', 'error');
        return;
      }

      // Get form data
      const formData = this.getFormData(form);
      
      // Format issue body
      const issueBody = this.formatIssueBody(formData, issueTypeConfig, selectedMod);
      
      // Submit to GitHub
      await this.submitIssue(
        formData.title,
        issueBody,
        issueTypeConfig.githubLabel,
        selectedMod
      );
    });
  },

  /**
   * Get all form data as an object
   * @param {HTMLFormElement} form
   * @returns {Object} Form data
   */
  getFormData(form) {
    const formData = {};
    const inputs = form.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      formData[input.name] = input.value.trim();
    });
    
    return formData;
  },

  /**
   * Format issue body from form data
   * @param {Object} formData
   * @param {Object} issueTypeConfig
   * @param {Object} selectedMod
   * @returns {string} Formatted markdown body
   */
  formatIssueBody(formData, issueTypeConfig, selectedMod) {
    let body = '';

    // Add mod info header
    body += `**Mod:** ${selectedMod.name}\n`;
    body += `**Steam Workshop:** ${selectedMod.steam_url}\n\n`;
    body += '---\n\n';

    // Add each field (except title, which goes in the issue title)
    issueTypeConfig.fields.forEach(field => {
      if (field.id === 'title') return; // Skip title field
      
      const value = formData[field.id];
      if (!value) return; // Skip empty optional fields
      
      body += `### ${field.label}\n`;
      body += `${value}\n\n`;
    });

    // Add metadata footer
    body += '---\n\n';
    body += `*Submitted via Issue Tracker*\n`;
    body += `*Date: ${new Date().toISOString().split('T')[0]}*\n`;

    return body;
  },

  /**
   * Submit issue to GitHub via Cloudflare Worker
   * @param {string} title
   * @param {string} body
   * @param {string} label
   * @param {Object} selectedMod
   */
  async submitIssue(title, body, label, selectedMod) {
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    try {
      // Show loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      // Get session info
      const sessionData = this.getSessionData();
      
      // Extract repo name from repo URL
      const repoMatch = selectedMod.repo_url.match(/github\.com\/[^\/]+\/([^\/]+)/);
      const repoName = repoMatch ? repoMatch[1] : null;
      
      if (!repoName) {
        throw new Error('Could not determine repository name');
      }

      // Call worker API
      const response = await fetch(`${CONFIG.worker.url}/api/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          labels: [label],
          repo: repoName,
          session_token: sessionData.token,
          steam_id: sessionData.steamId,
          steam_name: sessionData.steamName,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create issue');
      }

      // Success!
      this.showStatus(
        `Issue created successfully! <a href="${result.issue_url}" target="_blank">View issue #${result.issue_number}</a>`,
        'success'
      );

      // Reset form
      document.querySelector('form').reset();
      FormValidator.clearValidation(document.querySelector('form'));
      
      // Hide form after a delay
      setTimeout(() => {
        document.getElementById('formContainer').style.display = 'none';
        document.getElementById('issueTypeSection').style.display = 'block';
      }, 3000);

    } catch (error) {
      console.error('Submission error:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  },

  /**
   * Get session data from URL or localStorage
   * @returns {Object} Session data
   */
  getSessionData() {
    // Try URL parameters first (from Steam callback)
    const params = new URLSearchParams(window.location.search);
    const steamId = params.get('steam_id') || localStorage.getItem('steam_id');
    const steamName = params.get('steam_name') || localStorage.getItem('steam_name');
    const token = params.get('session_token') || localStorage.getItem('session_token');

    return { steamId, steamName, token };
  },

  /**
   * Show status message to user
   * @param {string} message
   * @param {string} type - 'success' or 'error'
   */
  showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.innerHTML = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    // Auto-hide after 5 seconds for success, keep errors visible
    if (type === 'success') {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 5000);
    }
  }
};
