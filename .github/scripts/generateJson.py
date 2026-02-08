import os
import requests
import json
import re
import time
from bs4 import BeautifulSoup
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Semaphore
from collections import deque

# CONFIG
GITHUB_USERNAME = "Chuckleberry-Finn"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUTPUT_FILE = "mods.json"

# Detect if running in GitHub Actions
IS_GITHUB_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"

# Concurrency settings
STEAM_MAX_WORKERS = 1  # For Steam requests (rate limited)

# Rate limiting - PROACTIVE from the start
STEAM_REQUESTS_PER_MINUTE = 10
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
        print(f"i {message}")

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
        print(f"x {message}")

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
                        print(f" Rate limit: waiting {sleep_time:.1f}s... ({len(self.requests)}/{self.max_requests} requests in window)")
                    else:
                        print(f" Rate limit: waiting {sleep_time:.1f}s...")
                    time.sleep(sleep_time)
                    # Clean up again after sleeping
                    now = time.time()
                    while self.requests and now - self.requests[0] >= self.window:
                        self.requests.popleft()
            
            # Record this request
            self.requests.append(time.time())

# Global rate limiter - always active
steam_limiter = RateLimiter(STEAM_REQUESTS_PER_MINUTE, RATE_WINDOW)

# GITHUB REPO FETCHING
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

    return [repo for repo in repos if not repo.get("archived")]

# WORKSHOP.TXT FETCHING
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

# STEAM WORKSHOP SCRAPING
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

# PROCESS SINGLE MOD
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
            "workshop_id": workshop_id
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
        "workshop_id": workshop_id
    }
    
    if subs_str != "?" and banner:
        try:
            mod_data["subs"] = int(subs_str)
        except ValueError:
            pass
    
    return mod_data

# JSON OUTPUT
def generate_json(repos):
    mods = []
    seen_workshop_ids = set()
    
    # FIRST PASS: Process highlights concurrently (but rate limited)
    gh_group("FIRST PASS: Processing highlighted mods")
    highlight_repos = [repo for repo in repos if repo.get("homepage", "") and "steamcommunity.com" in repo.get("homepage", "")]
    
    total_highlights = len(highlight_repos)
    print(f"Found {total_highlights} highlighted repos to process")
    print(f"Processing with {STEAM_MAX_WORKERS} concurrent workers...")
    print(f"Rate limit: {STEAM_REQUESTS_PER_MINUTE} requests per minute\n")
    
    # Track progress for GitHub Actions
    completed = 0
    success_count = 0
    
    with ThreadPoolExecutor(max_workers=STEAM_MAX_WORKERS) as executor:
        future_to_repo = {executor.submit(process_mod, repo): repo for repo in highlight_repos}
        
        for idx, future in enumerate(as_completed(future_to_repo), 1):
            repo = future_to_repo[future]
            completed += 1
            
            # Show progress percentage in GitHub Actions
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
            
            # Show progress percentage in GitHub Actions
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

    # Remove workshop_id from final output (was only for deduplication)
    for mod in mods:
        mod.pop('workshop_id', None)
    
    # Sort by subs
    mods.sort(key=lambda x: x.get("subs", 0), reverse=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(mods, f, indent=2, ensure_ascii=False)
    
    # Statistics
    highlights = sum(1 for m in mods if m.get("highlight"))
    print(f"{'='*60}")
    print(f"✓ Wrote {len(mods)} mods to {OUTPUT_FILE}")
    print(f"  • {highlights} highlights (main page)")
    print(f"  • {len(mods) - highlights} standard (issue tracker)")
    print(f"{'='*60}\n")
    
    gh_notice(f"Successfully generated {OUTPUT_FILE} with {len(mods)} mods")
    
    return mods

# MAIN
if __name__ == "__main__":
    if IS_GITHUB_ACTIONS:
        gh_group("Setup")
    
    print(f"{'='*60}")
    print(f"Starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    start_time = time.time()
    repos = get_repos()
    print(f"Found {len(repos)} non-archived repos\n")
    
    if IS_GITHUB_ACTIONS:
        gh_endgroup()
    
    generate_json(repos)
    
    elapsed = time.time() - start_time
    print(f"{'='*60}")
    print(f"Completed in {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")
    print(f"{'='*60}")
    
    gh_notice(f"Total execution time: {elapsed/60:.1f} minutes")
