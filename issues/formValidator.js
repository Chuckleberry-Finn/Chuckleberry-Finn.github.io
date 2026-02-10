/**
 * ============================================================
 *  FORM VALIDATOR — Quality-based validation & scoring
 * ============================================================
 *  This module:
 *  - Calculates form quality score based on field weights
 *  - Awards bonus points for detailed text input
 *  - Updates quality indicator bar in real-time
 *  - Enables submit when quality threshold is met
 * ============================================================
 */

const FormValidator = {
  currentFieldConfigs: null,
  
  qualityLevels: [
    { threshold: 0,   label: 'Start filling out the form', className: 'terrible' },
    { threshold: 1,   label: 'Terrible - More info needed', className: 'terrible' },
    { threshold: 15,  label: 'Terrible - More info needed', className: 'terrible' },
    { threshold: 30,  label: 'Poor - Add more details', className: 'poor' },
    { threshold: 45,  label: 'Fair - Getting there', className: 'fair' },
    { threshold: 60,  label: 'Good - Looking solid', className: 'good' },
    { threshold: 75,  label: 'Great - Well detailed!', className: 'great' },
    { threshold: 90,  label: 'Excellent - Perfect report!', className: 'excellent' }
  ],

  minimumQualityForSubmit: 50,

  /**
   * Initialize validation for a form
   * @param {HTMLFormElement} form - The form to validate
   * @param {Array} fieldConfigs - Field configuration from CONFIG
   */
  initValidation(form, fieldConfigs) {
    this.currentFieldConfigs = fieldConfigs;
    const inputs = form.querySelectorAll('input, textarea, select');

    const hasScoringSystem = fieldConfigs.some(fc => fc.weight);

    // Add input listeners for real-time validation
    inputs.forEach(input => {
      const fieldConfig = fieldConfigs.find(fc => 'f-' + fc.id === input.id);
      const isRequired = fieldConfig && fieldConfig.required;
      const requiredMsg = document.getElementById(`${input.id}-required`);
      
      let hasBeenTouched = false;
      
      input.addEventListener('blur', () => {
        hasBeenTouched = true;
        input.classList.add('touched');
        
        if (isRequired && requiredMsg) {
          if (!input.value.trim()) {
            requiredMsg.classList.add('error');
          }
        }
        
        if (hasScoringSystem) {
          this.updateQualityScore(form);
        } else {
          this.updateSimpleValidation(form);
        }
      });
      
      input.addEventListener('focus', () => {
        if (isRequired && requiredMsg && requiredMsg.classList.contains('error')) {
        }
      });

      // Validate on input (as user types)
      input.addEventListener('input', () => {
        if (isRequired && requiredMsg && hasBeenTouched) {
          if (input.value.trim()) {
            requiredMsg.classList.remove('error');
          } else {
            requiredMsg.classList.add('error');
          }
        }
        
        if (hasScoringSystem) {
          this.updateQualityScore(form);
        } else {
          this.updateSimpleValidation(form);
        }
      });

      input.addEventListener('change', () => {
        if (isRequired && requiredMsg && hasBeenTouched) {
          if (input.value.trim()) {
            requiredMsg.classList.remove('error');
          } else {
            requiredMsg.classList.add('error');
          }
        }
        
        if (hasScoringSystem) {
          this.updateQualityScore(form);
        } else {
          this.updateSimpleValidation(form);
        }
      });
    });

    // Initial check
    if (hasScoringSystem) {
      this.updateQualityScore(form);
    } else {
      this.updateSimpleValidation(form);
    }
  },

  /**
   * Simple validation for forms without quality scoring (feature requests)
   * @param {HTMLFormElement} form
   */
  updateSimpleValidation(form) {
    let hasContent = false;
    const inputs = form.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      if (input.value.trim()) {
        hasContent = true;
      }
    });
    
    this.updateSubmitButtons(hasContent ? 100 : 0);
  },

  /**
   * Calculate quality score for the form
   * @param {HTMLFormElement} form
   * @returns {number} Quality score (0-100)
   */
  calculateQualityScore(form) {
    if (!this.currentFieldConfigs) return 0;

    let totalPossiblePoints = 0;
    let earnedPoints = 0;

    this.currentFieldConfigs.forEach(fieldConfig => {
      const fieldId = 'f-' + fieldConfig.id;
      const field = form.querySelector(`#${fieldId}`);
      
      if (!field) return;

      const baseWeight = fieldConfig.weight || 0;
      totalPossiblePoints += baseWeight;

      const value = field.value.trim();
      
      // Award points if field has content
      if (value) {
        // Base points for filling the field
        earnedPoints += baseWeight;

        // Bonus points for detailed text fields
        if (fieldConfig.detailBonus && (fieldConfig.type === 'text' || fieldConfig.type === 'textarea')) {
          const charCount = value.length;
          const bonus = fieldConfig.detailBonus;
          
          // Calculate detail bonus based on character count
          let detailPoints = 0;
          if (charCount >= bonus.ideal) {
            // At or above ideal length - full bonus
            detailPoints = bonus.max;
          } else if (charCount >= bonus.min) {
            // Between min and ideal - proportional bonus
            const progress = (charCount - bonus.min) / (bonus.ideal - bonus.min);
            detailPoints = progress * bonus.max;
          }
          // Below min - no bonus points
          
          earnedPoints += detailPoints;
          totalPossiblePoints += bonus.max;
        }
      } else if (fieldConfig.detailBonus) {
        // Field is empty but could have bonus points
        totalPossiblePoints += fieldConfig.detailBonus.max;
      }
    });

    // Calculate percentage
    const qualityScore = totalPossiblePoints > 0 
      ? Math.round((earnedPoints / totalPossiblePoints) * 100)
      : 0;

    return qualityScore;
  },

  /**
   * Get quality level info based on score
   * @param {number} score - Quality score (0-100)
   * @returns {Object} Quality level info
   */
  getQualityLevel(score) {
    // Find the highest threshold that the score meets
    for (let i = this.qualityLevels.length - 1; i >= 0; i--) {
      if (score >= this.qualityLevels[i].threshold) {
        return this.qualityLevels[i];
      }
    }
    return this.qualityLevels[0];
  },

  /**
   * Update quality indicator UI
   * @param {HTMLFormElement} form
   */
  updateQualityScore(form) {
    // Check if this form uses quality scoring
    const hasScoringSystem = this.currentFieldConfigs && this.currentFieldConfigs.some(fc => fc.weight);
    
    if (!hasScoringSystem) {
      // For non-scoring forms (feature requests), use simple validation
      this.updateSimpleValidation(form);
      return;
    }
    
    const score = this.calculateQualityScore(form);
    const qualityLevel = this.getQualityLevel(score);

    // Update progress bar
    const barFill = document.getElementById('quality-bar-fill');
    const qualityText = document.getElementById('quality-text');

    if (barFill) {
      barFill.style.width = score + '%';
      
      // Remove all quality classes
      barFill.className = 'quality-bar-fill';
      // Add current quality class
      barFill.classList.add(qualityLevel.className);
    }

    if (qualityText) {
      qualityText.textContent = qualityLevel.label;
      
      // Remove all quality classes
      qualityText.className = 'quality-text';
      // Add current quality class
      qualityText.classList.add(qualityLevel.className);
    }

    // Update submit buttons based on quality threshold
    this.updateSubmitButtons(score);
  },

  /**
   * Update submit button states based on quality score
   * @param {number} score - Quality score
   */
  updateSubmitButtons(score) {
    const githubBtn = document.getElementById('btn-github-submit');
    const steamBtn = document.getElementById('btn-steam-submit');
    
    const isQualityMet = score >= this.minimumQualityForSubmit;
    
    if (githubBtn) {
      githubBtn.disabled = !isQualityMet;
      if (isQualityMet) {
        githubBtn.classList.add('enabled');
      } else {
        githubBtn.classList.remove('enabled');
      }
    }
    
    if (steamBtn) {
      steamBtn.disabled = !isQualityMet;
      if (isQualityMet) {
        steamBtn.classList.add('enabled');
      } else {
        steamBtn.classList.remove('enabled');
      }
    }
  },

  /**
   * Validate entire form (for final submission check)
   * @param {HTMLFormElement} form
   * @returns {boolean} True if quality threshold is met
   */
  validateForm(form) {
    const score = this.calculateQualityScore(form);
    return score >= this.minimumQualityForSubmit;
  },

  /**
   * Clear validation states and reset quality indicator
   * @param {HTMLFormElement} form
   */
  clearValidation(form) {
    const barFill = document.getElementById('quality-bar-fill');
    const qualityText = document.getElementById('quality-text');

    if (barFill) {
      barFill.style.width = '0%';
      barFill.className = 'quality-bar-fill terrible';
    }

    if (qualityText) {
      qualityText.textContent = 'Start filling out the form';
      qualityText.className = 'quality-text terrible';
    }

    // Clear required field indicators
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.classList.remove('touched', 'invalid');
      const requiredMsg = document.getElementById(`${input.id}-required`);
      if (requiredMsg) {
        requiredMsg.classList.remove('error');
      }
    });

    this.updateSubmitButtons(0);
  },

  /**
   * Show quality indicator (for bug reports)
   */
  showQualityIndicator() {
    const qualityEl = document.getElementById('quality-indicator-wrapper');
    if (qualityEl) {
      qualityEl.classList.remove('hidden');
    }
  },

  /**
   * Hide quality indicator (for feature requests)
   */
  hideQualityIndicator() {
    const qualityEl = document.getElementById('quality-indicator-wrapper');
    if (qualityEl) {
      qualityEl.classList.add('hidden');
    }
  }
};
