/**
 * ============================================================
 *  ISSUES LIST — Fetch and display open issues from GitHub
 * ============================================================
 *  Fetches open issues for the current repo and displays them
 *  in a sidebar on the issue tracker form page.
 * ============================================================
 */

const IssuesList = {
  currentRepo: null,
  currentOwner: null,
  
  /**
   * Initialize the issues list for a specific repo
   * @param {string} owner - GitHub username
   * @param {string} repo - Repository name
   */
  async init(owner, repo) {
    this.currentOwner = owner;
    this.currentRepo = repo;
    
    const container = document.getElementById('issues-sidebar');
    if (!container) {
      console.warn('Issues sidebar container not found');
      return;
    }
    
    // Show loading state
    container.innerHTML = `
      <div class="issues-sidebar-header">
        <h3>Recent Issues</h3>
        <a href="https://github.com/${owner}/${repo}/issues" target="_blank" rel="noopener">
          View all →
        </a>
      </div>
      <div class="issues-loading">
        <div class="loading-spinner"></div>
        <p>Loading issues...</p>
      </div>
    `;
    
    try {
      const issues = await this.fetchIssues(owner, repo);
      this.renderIssues(issues, container);
    } catch (error) {
      console.error('Failed to fetch issues:', error);
      this.renderError(container, error);
    }
  },
  
  /**
   * Fetch open issues from GitHub API
   * @param {string} owner - GitHub username
   * @param {string} repo - Repository name
   * @returns {Promise<Array>} Array of issue objects
   */
  async fetchIssues(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
    const params = new URLSearchParams({
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: '30' // Fetch more to ensure we get pinned ones
    });
    
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }
    
    const issues = await response.json();
    
    // Filter out pull requests (they appear in issues endpoint)
    const filteredIssues = issues.filter(issue => !issue.pull_request);
    
    // Sort: pinned issues first (determined by labels or specific criteria)
    // GitHub doesn't have a native "pinned" flag in the API, but we can check for:
    // 1. Issues with "pinned" label
    // 2. Issues labeled as "announcement" or "important"
    const sortedIssues = filteredIssues.sort((a, b) => {
      const aIsPinned = this.isPinnedIssue(a);
      const bIsPinned = this.isPinnedIssue(b);
      
      // Pinned issues come first
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      
      // Otherwise sort by created date (newest first)
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    // Return top 10
    return sortedIssues.slice(0, 10);
  },
  
  /**
   * Check if an issue should be treated as pinned
   * @param {Object} issue - Issue object
   * @returns {boolean} True if issue is pinned
   */
  isPinnedIssue(issue) {
    if (!issue.labels || !Array.isArray(issue.labels)) return false;
    
    // Check for labels that indicate a pinned/important issue
    const pinnedLabels = ['pinned', 'announcement', 'important', 'sticky'];
    return issue.labels.some(label => 
      pinnedLabels.includes(label.name.toLowerCase())
    );
  },
  
  /**
   * Render issues list
   * @param {Array} issues - Array of issue objects
   * @param {HTMLElement} container - Container element
   */
  renderIssues(issues, container) {
    if (issues.length === 0) {
      container.innerHTML = `
        <div class="issues-sidebar-header">
          <h3>Recent Issues</h3>
          <a href="https://github.com/${this.currentOwner}/${this.currentRepo}/issues" target="_blank" rel="noopener">
            View all →
          </a>
        </div>
        <div class="issues-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <p>No open issues</p>
          <span>Be the first to report one!</span>
        </div>
      `;
      return;
    }
    
    const issuesList = issues.map(issue => this.renderIssueCard(issue)).join('');
    
    container.innerHTML = `
      <div class="issues-sidebar-header">
        <h3>Recent Issues</h3>
        <a href="https://github.com/${this.currentOwner}/${this.currentRepo}/issues" target="_blank" rel="noopener">
          View all →
        </a>
      </div>
      <div class="issues-list">
        ${issuesList}
      </div>
    `;
  },
  
  /**
   * Render a single issue card
   * @param {Object} issue - Issue object from GitHub API
   * @returns {string} HTML string
   */
  renderIssueCard(issue) {
    const createdDate = new Date(issue.created_at);
    const timeAgo = this.formatTimeAgo(createdDate);
    const isPinned = this.isPinnedIssue(issue);
    
    // Extract labels
    const labels = issue.labels
      .slice(0, 3) // Limit to 3 labels
      .map(label => {
        const color = `#${label.color}`;
        const isDark = this.isColorDark(label.color);
        return `<span class="issue-label" style="background-color: ${color}; color: ${isDark ? '#fff' : '#000'}">${this.escapeHtml(label.name)}</span>`;
      })
      .join('');
    
    // Determine issue type icon
    const isBug = issue.labels.some(l => l.name.toLowerCase().includes('bug'));
    const isFeature = issue.labels.some(l => l.name.toLowerCase().includes('enhancement') || l.name.toLowerCase().includes('feature'));
    
    let icon = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path>
        <path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path>
      </svg>
    `;
    
    if (isBug) {
      icon = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.47.22A.75.75 0 015 0h6a.75.75 0 01.53.22l.84.85c.2.2.2.5 0 .7L11.5 2.6a.75.75 0 01-1.06 0l-.47-.47V4.5a.75.75 0 01-1.5 0V2.13l-.47.47a.75.75 0 01-1.06 0L5.78 1.77a.5.5 0 010-.7l.84-.85zM3.75 7a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 3a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"></path>
        </svg>
      `;
    } else if (isFeature) {
      icon = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm1 11H7V7h2v4zm0-5H7V4h2v2z"></path>
        </svg>
      `;
    }
    
    // Pinned badge
    const pinnedBadge = isPinned ? '<span class="issue-pinned-badge" title="Pinned issue">📌</span>' : '';
    
    return `
      <a href="${issue.html_url}" target="_blank" rel="noopener" class="issue-card${isPinned ? ' issue-pinned' : ''}">
        <div class="issue-card-header">
          <div class="issue-icon">${icon}</div>
          <div class="issue-number">#${issue.number}</div>
          ${pinnedBadge}
        </div>
        <div class="issue-title">${this.escapeHtml(issue.title)}</div>
        ${labels ? `<div class="issue-labels">${labels}</div>` : ''}
        <div class="issue-meta">
          <span class="issue-author">${this.escapeHtml(issue.user.login)}</span>
          <span class="issue-time">${timeAgo}</span>
        </div>
      </a>
    `;
  },
  
  /**
   * Render error state
   * @param {HTMLElement} container - Container element
   * @param {Error} error - Error object
   */
  renderError(container, error) {
    container.innerHTML = `
      <div class="issues-sidebar-header">
        <h3>Recent Issues</h3>
        <a href="https://github.com/${this.currentOwner}/${this.currentRepo}/issues" target="_blank" rel="noopener">
          View all →
        </a>
      </div>
      <div class="issues-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Unable to load issues</p>
        <span>${this.escapeHtml(error.message)}</span>
      </div>
    `;
  },
  
  /**
   * Format time ago string
   * @param {Date} date - Date object
   * @returns {string} Time ago string
   */
  formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
  
  /**
   * Check if a hex color is dark
   * @param {string} hexColor - Hex color without #
   * @returns {boolean} True if color is dark
   */
  isColorDark(hexColor) {
    const r = parseInt(hexColor.substr(0, 2), 16);
    const g = parseInt(hexColor.substr(2, 2), 16);
    const b = parseInt(hexColor.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  },
  
  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
