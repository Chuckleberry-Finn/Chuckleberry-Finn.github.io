#!/usr/bin/env python3
"""
Generate issues cache for GitHub Pages
Runs via GitHub Action, caches issues as JSON files
"""

import json
import os
import requests
from datetime import datetime

# Read mods.json to get all repos
with open('mods.json', 'r') as f:
    mods = json.load(f)

# GitHub token from environment (for higher rate limits in Actions)
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')

headers = {
    'Accept': 'application/vnd.github.v3+json'
}
if GITHUB_TOKEN:
    headers['Authorization'] = f'token {GITHUB_TOKEN}'

# Create issues cache directory
os.makedirs('issues/cache', exist_ok=True)

issues_cache = {}

for mod in mods:
    repo_url = mod.get('repo_url', '')
    if not repo_url or 'github.com' not in repo_url:
        continue
    
    # Extract owner and repo from URL
    parts = repo_url.replace('https://github.com/', '').replace('.git', '').split('/')
    if len(parts) < 2:
        continue
    
    owner, repo = parts[0], parts[1]
    cache_key = f"{owner}/{repo}"
    
    print(f"Fetching issues for {cache_key}...")
    
    try:
        # Fetch open issues
        url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        params = {
            'state': 'open',
            'sort': 'created',
            'direction': 'desc',
            'per_page': 30
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        issues = response.json()
        
        # Filter out pull requests
        issues = [issue for issue in issues if 'pull_request' not in issue]
        
        # Sort: pinned issues first
        def is_pinned(issue):
            if not issue.get('labels'):
                return False
            pinned_labels = ['pinned', 'announcement', 'important', 'sticky']
            return any(label['name'].lower() in pinned_labels for label in issue['labels'])
        
        issues.sort(key=lambda x: (not is_pinned(x), -int(datetime.fromisoformat(x['created_at'].replace('Z', '+00:00')).timestamp())))
        
        # Keep top 10
        issues = issues[:10]
        
        # Simplify data (only keep what we need)
        simplified_issues = []
        for issue in issues:
            simplified_issues.append({
                'number': issue['number'],
                'title': issue['title'],
                'html_url': issue['html_url'],
                'created_at': issue['created_at'],
                'user': {
                    'login': issue['user']['login']
                },
                'labels': [
                    {
                        'name': label['name'],
                        'color': label['color']
                    }
                    for label in issue.get('labels', [])
                ][:3]  # Only keep first 3 labels
            })
        
        issues_cache[cache_key] = {
            'issues': simplified_issues,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
        print(f"  ✓ Found {len(simplified_issues)} issues")
        
    except Exception as e:
        print(f"  ✗ Error fetching {cache_key}: {e}")
        issues_cache[cache_key] = {
            'issues': [],
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'error': str(e)
        }

# Write cache file
cache_file = 'issues/cache/issues_cache.json'
with open(cache_file, 'w') as f:
    json.dump(issues_cache, f, indent=2)

print(f"\n✓ Cached issues for {len(issues_cache)} repos")
print(f"✓ Cache written to {cache_file}")
