// Reads from a pre-generated cache file (updated hourly by a GitHub
// Action) instead of hitting the GitHub API directly from the browser.
const IssuesList = {
  currentRepo: null,
  currentOwner: null,
  issuesCache: null,
  
  async init(owner, repo) {
    this.currentOwner = owner;
    this.currentRepo = repo;
    
    const container = document.getElementById('issues-sidebar');
    if (!container) {
      console.warn('Issues sidebar container not found');
      return;
    }
    
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
      if (!this.issuesCache) {
        await this.loadCache();
      }
      
      const issues = this.getIssuesForRepo(owner, repo);
      this.renderIssues(issues, container);
    } catch (error) {
      console.error('Failed to load issues:', error);
      this.renderError(container, error);
    }
  },
  
  async loadCache() {
    const cacheUrl = 'cache/issues_cache.json';
    const response = await fetch(cacheUrl + '?t=' + Date.now()); // bust any browser/CDN caching of the static file
    
    if (!response.ok) {
      throw new Error(`Failed to load issues cache (${response.status})`);
    }
    
    this.issuesCache = await response.json();
  },
  
  getIssuesForRepo(owner, repo) {
    if (!this.issuesCache) {
      return [];
    }
    
    const cacheKey = `${owner}/${repo}`;
    const repoCache = this.issuesCache[cacheKey];
    
    if (!repoCache) {
      console.warn(`No cached issues found for ${cacheKey}`);
      return [];
    }
    
    if (repoCache.error) {
      throw new Error(repoCache.error);
    }
    
    return repoCache.issues || [];
  },
  
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
  
  renderIssueCard(issue) {
    const createdDate = new Date(issue.created_at);
    const timeAgo = this.formatTimeAgo(createdDate);
    const isPinned = this.isPinnedIssue(issue);
    
    const labels = issue.labels
      .slice(0, 3)
      .map(label => {
        const color = `#${label.color}`;
        const isDark = this.isColorDark(label.color);
        return `<span class="issue-label" style="background-color: ${color}; color: ${isDark ? '#fff' : '#000'}">${this.escapeHtml(label.name)}</span>`;
      })
      .join('');
    
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
        <span>Cache may be updating</span>
      </div>
    `;
  },
  
  isPinnedIssue(issue) {
    if (!issue.labels || !Array.isArray(issue.labels)) return false;

    const pinnedLabels = ['pinned', 'announcement', 'important', 'sticky'];
    return issue.labels.some(label => 
      pinnedLabels.includes(label.name.toLowerCase())
    );
  },
  
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
  
  isColorDark(hexColor) {
    const r = parseInt(hexColor.substr(0, 2), 16);
    const g = parseInt(hexColor.substr(2, 2), 16);
    const b = parseInt(hexColor.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  },
  
  // relies on the browser's own HTML escaping via textContent
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
