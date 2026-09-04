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

  initValidation(form, fieldConfigs) {
    this.currentFieldConfigs = fieldConfigs;
    const inputs = form.querySelectorAll('input, textarea, select');

    const hasScoringSystem = fieldConfigs.some(fc => fc.weight);

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

    if (hasScoringSystem) {
      this.updateQualityScore(form);
    } else {
      this.updateSimpleValidation(form);
    }
  },

  // Feature-request forms have no field weights, so this just needs any
  // field filled in rather than a weighted score.
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

      if (value) {
        earnedPoints += baseWeight;

        // text/textarea fields can earn extra points for length, scaled
        // between detailBonus.min (0 bonus) and .ideal (full bonus)
        if (fieldConfig.detailBonus && (fieldConfig.type === 'text' || fieldConfig.type === 'textarea')) {
          const charCount = value.length;
          const bonus = fieldConfig.detailBonus;

          let detailPoints = 0;
          if (charCount >= bonus.ideal) {
            detailPoints = bonus.max;
          } else if (charCount >= bonus.min) {
            const progress = (charCount - bonus.min) / (bonus.ideal - bonus.min);
            detailPoints = progress * bonus.max;
          }

          earnedPoints += detailPoints;
          totalPossiblePoints += bonus.max;
        }
      } else if (fieldConfig.detailBonus) {
        totalPossiblePoints += fieldConfig.detailBonus.max;
      }
    });

    const qualityScore = totalPossiblePoints > 0 
      ? Math.round((earnedPoints / totalPossiblePoints) * 100)
      : 0;

    return qualityScore;
  },

  getQualityLevel(score) {
    // walk down from the highest threshold to find the level the score qualifies for
    for (let i = this.qualityLevels.length - 1; i >= 0; i--) {
      if (score >= this.qualityLevels[i].threshold) {
        return this.qualityLevels[i];
      }
    }
    return this.qualityLevels[0];
  },

  updateQualityScore(form) {
    const hasScoringSystem = this.currentFieldConfigs && this.currentFieldConfigs.some(fc => fc.weight);

    if (!hasScoringSystem) {
      this.updateSimpleValidation(form);
      return;
    }
    
    const score = this.calculateQualityScore(form);
    const qualityLevel = this.getQualityLevel(score);

    const barFill = document.getElementById('quality-bar-fill');
    const qualityText = document.getElementById('quality-text');

    if (barFill) {
      barFill.style.width = score + '%';
      barFill.className = 'quality-bar-fill';
      barFill.classList.add(qualityLevel.className);
    }

    if (qualityText) {
      qualityText.textContent = qualityLevel.label;
      qualityText.className = 'quality-text';
      qualityText.classList.add(qualityLevel.className);
    }

    this.updateSubmitButtons(score);
  },

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

  validateForm(form) {
    const score = this.calculateQualityScore(form);
    return score >= this.minimumQualityForSubmit;
  },

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

  showQualityIndicator() {
    const qualityEl = document.getElementById('quality-indicator-wrapper');
    if (qualityEl) {
      qualityEl.classList.remove('hidden');
    }
  },

  hideQualityIndicator() {
    const qualityEl = document.getElementById('quality-indicator-wrapper');
    if (qualityEl) {
      qualityEl.classList.add('hidden');
    }
  }
};
