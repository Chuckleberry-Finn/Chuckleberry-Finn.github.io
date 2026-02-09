import os
import requests
import json
import re
import time
from bs4 import BeautifulSoup
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from collections import deque

# CONFIG
GITHUB_USERNAME = "Chuckleberry-Finn"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUTPUT_FILE = "mods.json"
QUEUE_FILE = "github_stats_queue.json"

# GitHub API Rate Limiting
GITHUB_API_LIMIT = 55  # Conservative limit (actual is 60/hour)

# Detect if running in GitHub Actions
IS_GITHUB_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"

# Concurrency settings
STEAM_MAX_WORKERS = 1  # For Steam requests (rate limited)

# Rate limiting - PROACTIVE from the start
STEAM_REQUESTS_PER_MINUTE = 9
RATE_WINDOW = 60  # seconds

# GitHub Actions logging helpers
def gh_group(title):
    """Start a collapsible group in GitHub Actions"""
    if IS_GITHUB_ACTIONS:
        print(f"::group::{title}")
    else:
        print(f"\n{'='*60}")
        print(f"=== {title} ===")
        print(f"{'='*60}")

def gh_endgroup():
    """End a collapsible group in GitHub Actions"""
    if IS_GITHUB_ACTIONS:
        print("::endgroup::")

def gh_notice(message):
    """Print a notice in GitHub Actions"""
    if IS_GITHUB_ACTIONS:
        print(f"::notice::{message}")
    else:
        print(f"ℹ {message}")

def gh_warning(message):
    """Print a warning in GitHub Actions"""
    if IS_GITHUB_ACTIONS:
        print(f"::warning::{message}")
    else:
        print(f"! {message}")

def gh_error(message):
    """Print an error in GitHub Actions"""
    if IS_GITHUB_ACTIONS:
        print(f"::error::{message}")
    else:
        print(f"✗ {message}")

class RateLimiter:
    """Thread-safe rate limiter using sliding window"""
    def __init__(self, max_requests, window_seconds):
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests = deque()
        self.lock = Lock()
    
    def acquire(self):
        """Wait until we can make a request within rate limits"""
        with self.lock:
            now = time.time()
            
            # Remove requests outside the window
            while self.requests and now - self.requests[0] >= self.window:
                self.requests.popleft()
            
            # If at capacity, wait for the oldest request to age out
            if len(self.requests) >= self.max_requests:
                sleep_time = self.window - (now - self.requests[0]) + 0.1
                if sleep_time > 0:
                    if IS_GITHUB_ACTIONS:
                        print(f"⏱ Rate limit: waiting {sleep_time:.1f}s... ({len(self.requests)}/{self.max_requests} requests in window)")
                    else:
                        print(f"⏱ Rate limit: waiting {sleep_time:.1f}s...")
                    time.sleep(sleep_time)
                    # Clean up again after sleeping
                    now = time.time()
                    while self.requests and now - self.requests[0] >= self.window:
                        self.requests.popleft()
            
            # Record this request
            self.requests.append(time.time())

# Global rate limiter - always active
steam_limiter = RateLimiter(STEAM_REQUESTS_PER_MINUTE, RATE_WINDOW)

# ============================================================
# QUEUE MANAGEMENT
# ============================================================

def load_existing_stats():
    """Load existing GitHub stats from mods.json"""
    stats_cache = {}
    
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                existing_mods = json.load(f)
                for mod in existing_mods:
                    repo_url = mod.get('repo_url')
                    github_stats = mod.get('github')
                    if repo_url and github_stats:
                        stats_cache[repo_url] = github_stats
        except Exception as e:
            gh_warning(f"Could not load existing stats: {e}")
    
    return stats_cache

def load_queue():
    """Load the queue of repos pending stats fetch"""
    if not os.path.exists(QUEUE_FILE):
        return [], None
    
    try:
        with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            pending = data.get('pending', [])
            timestamp = data.get('timestamp')
            return pending, timestamp
    except Exception as e:
        gh_warning(f"Could not load queue: {e}")
        return [], None

def save_queue(pending_repos):
    """Save the queue of repos that still need stats"""
    queue_data = {
        'pending': pending_repos,
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
        json.dump(queue_data, f, indent=2, ensure_ascii=False)

# ============================================================
# GITHUB API - Stats Fetching
# ============================================================

def get_github_stats(repo):
    """
    Fetch GitHub stats for a repository
    Returns dict with openIssues, stars, forks
    """
    owner = repo.get('owner', {}).get('login', GITHUB_USERNAME)
    name = repo.get('name')
    
    if not name:
        return None
    
    url = f"https://api.github.com/repos/{owner}/{name}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"} if GITHUB_TOKEN else {}
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        
        if r.status_code == 200:
            data = r.json()
            return {
                'openIssues': data.get('open_issues_count', 0),
                'stars': data.get('stargazers_count', 0),
                'forks': data.get('forks_count', 0)
            }
        elif r.status_code == 404:
            gh_warning(f"Repo not found: {owner}/{name}")
            return None
        else:
            gh_warning(f"GitHub API error for {owner}/{name}: {r.status_code}")
            return None
            
    except Exception as e:
        gh_error(f"Failed to fetch stats for {owner}/{name}: {e}")
        return None

# ============================================================
# GITHUB REPO FETCHING
# ============================================================

def get_repos():
    url = f"https://api.github.com/users/{GITHUB_USERNAME}/repos"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"} if GITHUB_TOKEN else {}
    repos = []
    page = 1

    while True:
        r = requests.get(url, headers=headers, params={
            "page": page,
            "per_page": 100,
            "type": "all",
            "sort": "updated"
        })
        if r.status_code != 200:
            raise Exception("GitHub API error:", r.text)
        page_repos = r.json()
        if not page_repos:
            break
        repos.extend(page_repos)
        page += 1

    return [repo for repo in repos if not repo.get("archived") and not repo.get("private")]

# ============================================================
# WORKSHOP.TXT FETCHING
# ============================================================

def get_workshop_id_from_repo(repo):
    """
    Fetch workshop.txt from repo and extract workshop ID
    Returns (workshop_id, is_highlight, steam_url) tuple
    """
    # Check if repo has homepage with Steam URL (these are highlights)
    homepage = repo.get("homepage", "")
    is_highlight = homepage and "steamcommunity.com" in homepage
    
    # If homepage has Steam URL, extract ID and use the full URL directly
    if is_highlight:
        match = re.search(r'id=(\d+)', homepage)
        if match:
            return (match.group(1), True, homepage)
    
    # Otherwise, try to fetch workshop.txt from repo
    raw_url = f"https://raw.githubusercontent.com/{GITHUB_USERNAME}/{repo['name']}/main/workshop.txt"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"} if GITHUB_TOKEN else {}
    
    try:
        r = requests.get(raw_url, headers=headers, timeout=10)
        if r.status_code == 200:
            for line in r.text.split('\n'):
                line = line.strip()
                if line.startswith('id='):
                    workshop_id = line.split('=', 1)[1].strip()
                    return (workshop_id, False, None)
    except Exception:
        pass
    
    # Try master branch as fallback
    raw_url_master = f"https://raw.githubusercontent.com/{GITHUB_USERNAME}/{repo['name']}/master/workshop.txt"
    try:
        r = requests.get(raw_url_master, headers=headers, timeout=10)
        if r.status_code == 200:
            for line in r.text.split('\n'):
                line = line.strip()
                if line.startswith('id='):
                    workshop_id = line.split('=', 1)[1].strip()
                    return (workshop_id, False, None)
    except Exception:
        pass
    
    return (None, False, None)

# ============================================================
# STEAM WORKSHOP SCRAPING
# ============================================================

def get_workshop_title(soup):
    title_div = soup.find("div", class_="workshopItemTitle")
    if title_div:
        return title_div.text.strip()
    return None

def get_workshop_image(soup):
    img = soup.find("img", {"id": "previewImageMain"})
    if img and img.get("src"):
        return img["src"]
    return None

def extract_youtube_videos(steam_url):
    try:
        r = requests.get(steam_url, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        video_ids = set()
        for script in soup.find_all("script"):
            if not script.string:
                continue
            matches = re.findall(r'YOUTUBE_VIDEO_ID\s*:\s*"([a-zA-Z0-9_-]{11})"', script.string)
            for vid in matches:
                video_ids.add(f"https://www.youtube.com/watch?v={vid}")
        return list(video_ids)
    except Exception:
        return []

def get_workshop_data(steam_url, max_retries=3):
    """Fetch workshop data with proactive rate limiting"""
    for attempt in range(max_retries):
        try:
            # ALWAYS rate limit before making request
            steam_limiter.acquire()
            
            headers = {
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "en-US,en;q=0.9"
            }
            r = requests.get(steam_url, headers=headers, timeout=15)
            
            if r.status_code == 429:
                # If we still get rate limited, back off exponentially
                wait_time = 30 * (attempt + 1)
                gh_warning(f"Got 429 despite rate limiting, backing off {wait_time}s...")
                time.sleep(wait_time)
                continue
                
            if r.status_code != 200:
                if attempt < max_retries - 1:
                    time.sleep(5 * (attempt + 1))
                    continue
                return "?", None, None, None

            soup = BeautifulSoup(r.text, "html.parser")

            sub_count = "?"
            for table in soup.find_all("table", class_="stats_table"):
                for row in table.find_all("tr"):
                    cols = row.find_all("td")
                    if len(cols) == 2 and "Subscribers" in cols[1].text:
                        sub_count = cols[0].text.strip().replace(",", "")
                        break

            title = get_workshop_title(soup)
            image = get_workshop_image(soup)
            video_links = extract_youtube_videos(steam_url)

            return sub_count, title, image, video_links

        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
    
    return "?", None, None, None

# ============================================================
# PROCESS SINGLE MOD
# ============================================================

def process_mod(repo, is_second_pass=False):
    """Process a single mod - used for concurrent execution"""
    workshop_id, is_highlight, steam_url = get_workshop_id_from_repo(repo)
    
    if not workshop_id:
        return None
    
    if not steam_url:
        steam_url = f"https://steamcommunity.com/sharedfiles/filedetails/?id={workshop_id}"
    
    github_url = repo["html_url"]
    repo_name = repo["name"]
    
    subs_str, title, banner, video_links = get_workshop_data(steam_url)
    
    # For highlights, always include
    if is_highlight:
        project_name = title if title else repo_name
        mod_data = {
            "name": project_name,
            "steam_url": steam_url,
            "repo_url": github_url,
            "banner": banner or "",
            "videos": video_links or [],
            "highlight": True,
            "workshop_id": workshop_id,
            "repo_obj": repo  # Store for GitHub stats fetching
        }
        
        if subs_str != "?" and title and banner:
            try:
                mod_data["subs"] = int(subs_str)
            except ValueError:
                pass
        
        return mod_data
    
    # For non-highlights, validate
    if not title:
        return None
    
    mod_data = {
        "name": title,
        "steam_url": steam_url,
        "repo_url": github_url,
        "banner": banner or "",
        "videos": video_links or [],
        "highlight": False,
        "workshop_id": workshop_id,
        "repo_obj": repo  # Store for GitHub stats fetching
    }
    
    if subs_str != "?" and banner:
        try:
            mod_data["subs"] = int(subs_str)
        except ValueError:
            pass
    
    return mod_data

# ============================================================
# MAIN JSON GENERATION WITH QUEUE
# ============================================================

def generate_json(repos):
    mods = []
    seen_workshop_ids = set()
    
    # Load existing GitHub stats
    gh_group("Loading Existing GitHub Stats")
    existing_github_stats = load_existing_stats()
    print(f"📊 Found {len(existing_github_stats)} existing GitHub stats in cache")
    gh_endgroup()
    
    # Load queue
    gh_group("Loading GitHub Stats Queue")
    pending_queue, queue_timestamp = load_queue()
    print(f"📋 Pending repos in queue: {len(pending_queue)}")
    if queue_timestamp:
        print(f"⏰ Queue last updated: {queue_timestamp}")
    gh_endgroup()
    
    # FIRST PASS: Process highlights concurrently (but rate limited)
    gh_group("FIRST PASS: Processing highlighted mods")
    highlight_repos = [repo for repo in repos if repo.get("homepage", "") and "steamcommunity.com" in repo.get("homepage", "")]
    
    total_highlights = len(highlight_repos)
    print(f"Found {total_highlights} highlighted repos to process")
    print(f"Processing with {STEAM_MAX_WORKERS} concurrent workers...")
    print(f"Rate limit: {STEAM_REQUESTS_PER_MINUTE} requests per minute\n")
    
    completed = 0
    success_count = 0
    
    with ThreadPoolExecutor(max_workers=STEAM_MAX_WORKERS) as executor:
        future_to_repo = {executor.submit(process_mod, repo): repo for repo in highlight_repos}
        
        for idx, future in enumerate(as_completed(future_to_repo), 1):
            repo = future_to_repo[future]
            completed += 1
            
            if IS_GITHUB_ACTIONS and completed % 5 == 0:
                progress = (completed / total_highlights) * 100
                print(f"Progress: {completed}/{total_highlights} ({progress:.1f}%)")
            
            print(f"[{idx}/{total_highlights}] {repo['name']}: ", end="", flush=True)
            
            try:
                mod_data = future.result()
                if mod_data and mod_data['workshop_id'] not in seen_workshop_ids:
                    seen_workshop_ids.add(mod_data['workshop_id'])
                    mods.append(mod_data)
                    status = "✓" if mod_data.get('banner') and 'subs' in mod_data else "⚠️"
                    success_count += 1
                    print(status)
                else:
                    print("SKIP")
            except Exception as e:
                gh_error(f"Failed to process {repo['name']}: {e}")
                print(f"ERROR - {e}")
    
    gh_notice(f"Completed first pass: {success_count}/{total_highlights} highlights added")
    gh_endgroup()
    
    # SECOND PASS: Process remaining repos
    gh_group("SECOND PASS: Processing standard mods")
    remaining_repos = [repo for repo in repos if repo not in highlight_repos]
    print(f"Checking {len(remaining_repos)} repos for workshop.txt...")
    print(f"Processing with {STEAM_MAX_WORKERS} concurrent workers...\n")
    
    added = 0
    completed = 0
    total_remaining = len(remaining_repos)
    
    with ThreadPoolExecutor(max_workers=STEAM_MAX_WORKERS) as executor:
        future_to_repo = {executor.submit(process_mod, repo, True): repo for repo in remaining_repos}
        
        for future in as_completed(future_to_repo):
            repo = future_to_repo[future]
            completed += 1
            
            if IS_GITHUB_ACTIONS and completed % 10 == 0:
                progress = (completed / total_remaining) * 100
                print(f"Progress: {completed}/{total_remaining} ({progress:.1f}%)")
            
            try:
                mod_data = future.result()
                if mod_data and mod_data['workshop_id'] not in seen_workshop_ids:
                    seen_workshop_ids.add(mod_data['workshop_id'])
                    mods.append(mod_data)
                    added += 1
                    status = "✓" if mod_data.get('banner') and 'subs' in mod_data else "⚠️"
                    print(f"[+] {repo['name']}: {status}")
            except Exception:
                pass
    
    gh_notice(f"Completed second pass: {added} standard mods added")
    gh_endgroup()
    
    # ============================================================
    # GITHUB STATS WITH QUEUE SYSTEM
    # ============================================================
    
    gh_group("GITHUB STATS QUEUE MANAGEMENT")
    
    # Create repo_url to repo_obj mapping for queue processing
    repo_map = {mod['repo_url']: mod.get('repo_obj') for mod in mods if mod.get('repo_obj')}
    
    # Determine which repos need stats fetched
    repos_to_fetch = []
    
    # Priority 1: Process queue first (finish what we started)
    print(f"\n📋 Processing queue...")
    for repo_url in pending_queue:
        if repo_url in repo_map:
            repos_to_fetch.append(repo_url)
        else:
            gh_warning(f"Queued repo no longer exists: {repo_url}")
    
    print(f"  • {len(repos_to_fetch)} repos from queue")
    
    # Priority 2: Repos without stats at all
    print(f"\n🆕 Finding repos without stats...")
    repos_without_stats = []
    for mod in mods:
        repo_url = mod['repo_url']
        if repo_url not in existing_github_stats and repo_url not in repos_to_fetch:
            repos_without_stats.append(repo_url)
    
    print(f"  • {len(repos_without_stats)} repos need initial stats")
    repos_to_fetch.extend(repos_without_stats[:max(0, GITHUB_API_LIMIT - len(repos_to_fetch))])
    
    # Limit to API limit
    fetch_count = min(len(repos_to_fetch), GITHUB_API_LIMIT)
    repos_to_fetch = repos_to_fetch[:fetch_count]
    
    print(f"\n📊 GitHub Stats Plan:")
    print(f"  • Will fetch: {fetch_count} repos")
    print(f"  • Already have: {len(existing_github_stats)} repos")
    print(f"  • Will queue: {max(0, len(pending_queue) + len(repos_without_stats) - fetch_count)} repos for next run")
    
    # Fetch GitHub stats for selected repos
    if repos_to_fetch:
        print(f"\n🔄 Fetching GitHub stats for {len(repos_to_fetch)} repositories...")
        
        for idx, repo_url in enumerate(repos_to_fetch, 1):
            repo_obj = repo_map.get(repo_url)
            if not repo_obj:
                continue
            
            stats = get_github_stats(repo_obj)
            if stats:
                existing_github_stats[repo_url] = stats
                print(f"  ✓ [{idx}/{len(repos_to_fetch)}] {repo_obj['name']}: {stats['openIssues']} issues, {stats['stars']} stars")
            else:
                print(f"  ✗ [{idx}/{len(repos_to_fetch)}] {repo_obj['name']}: Failed to fetch stats")
    
    # Calculate what goes in the queue for next time
    remaining_queue = []
    
    # Add unfetched repos from current queue
    for repo_url in pending_queue[fetch_count:]:
        if repo_url in repo_map:
            remaining_queue.append(repo_url)
    
    # Add repos without stats that we didn't fetch this time
    for mod in mods:
        repo_url = mod['repo_url']
        if repo_url not in existing_github_stats and repo_url not in repos_to_fetch and repo_url not in remaining_queue:
            remaining_queue.append(repo_url)
    
    # Save queue
    save_queue(remaining_queue)
    print(f"\n💾 Saved {len(remaining_queue)} repos to queue for next run")
    
    gh_endgroup()
    
    # ============================================================
    # BUILD FINAL mods.json WITH GITHUB STATS
    # ============================================================
    
    gh_group("Building final mods.json")
    
    # Add GitHub stats to mods and clean up temporary fields
    mods_with_stats = 0
    for mod in mods:
        # Remove temporary field
        mod.pop('repo_obj', None)
        mod.pop('workshop_id', None)
        
        # Add GitHub stats if available
        repo_url = mod['repo_url']
        if repo_url in existing_github_stats:
            mod['github'] = existing_github_stats[repo_url]
            mods_with_stats += 1
    
    # Sort by subs
    mods.sort(key=lambda x: x.get("subs", 0), reverse=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(mods, f, indent=2, ensure_ascii=False)
    
    gh_endgroup()
    
    # Statistics
    highlights = sum(1 for m in mods if m.get("highlight"))
    print(f"{'='*60}")
    print(f"✓ Wrote {len(mods)} mods to {OUTPUT_FILE}")
    print(f"  • {highlights} highlights (main page)")
    print(f"  • {len(mods) - highlights} standard (issue tracker)")
    print(f"  • {mods_with_stats} with GitHub stats")
    print(f"  • {len(remaining_queue)} queued for next run")
    print(f"{'='*60}\n")
    
    gh_notice(f"Successfully generated {OUTPUT_FILE} with {len(mods)} mods ({mods_with_stats} with GitHub stats)")
    
    return mods

# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    if IS_GITHUB_ACTIONS:
        gh_group("Setup")
    
    print(f"{'='*60}")
    print(f"Starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    start_time = time.time()
    repos = get_repos()
    print(f"Found {len(repos)} non-archived and non-private repos\n")
    
    if IS_GITHUB_ACTIONS:
        gh_endgroup()
    
    generate_json(repos)
    
    elapsed = time.time() - start_time
    print(f"{'='*60}")
    print(f"Completed in {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")
    print(f"{'='*60}")
    
    gh_notice(f"Total execution time: {elapsed/60:.1f} minutes")
