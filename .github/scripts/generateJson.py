import os
import requests
import json
import re
import time
from bs4 import BeautifulSoup

# CONFIG
GITHUB_USERNAME = "Chuckleberry-Finn"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUTPUT_FILE = "mods.json"

# Rate limiting
STEAM_REQUESTS_PER_MINUTE = 10
steam_request_times = []

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

# RATE LIMITING
def wait_for_rate_limit():
    """Ensure we don't exceed STEAM_REQUESTS_PER_MINUTE"""
    global steam_request_times
    now = time.time()
    
    # Remove requests older than 60 seconds
    steam_request_times = [t for t in steam_request_times if now - t < 60]
    
    # If we've hit the limit, wait
    if len(steam_request_times) >= STEAM_REQUESTS_PER_MINUTE:
        oldest = steam_request_times[0]
        wait_time = 60 - (now - oldest) + 1  # Add 1 second buffer
        if wait_time > 0:
            print(f"[RATE LIMIT] Waiting {wait_time:.1f}s before next Steam request...")
            time.sleep(wait_time)
            # Clean up again after waiting
            now = time.time()
            steam_request_times = [t for t in steam_request_times if now - t < 60]
    
    # Record this request
    steam_request_times.append(time.time())

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
            # Look for line starting with 'id='
            for line in r.text.split('\n'):
                line = line.strip()
                if line.startswith('id='):
                    workshop_id = line.split('=', 1)[1].strip()
                    return (workshop_id, False, None)
    except Exception as e:
        print(f"[INFO] Could not fetch workshop.txt for {repo['name']}: {e}")
    
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
    except Exception as e:
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

    except Exception as e:
        print(f"[ERROR] {steam_url}: {e}")
        return []

def get_workshop_data(steam_url, max_retries=3):
    """Fetch workshop data with rate limiting and retries"""
    for attempt in range(max_retries):
        try:
            wait_for_rate_limit()
            
            headers = {
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "en-US,en;q=0.9"
            }
            r = requests.get(steam_url, headers=headers, timeout=15)
            
            if r.status_code == 429:  # Too Many Requests
                wait_time = 30 * (attempt + 1)
                print(f"[RATE LIMITED] Waiting {wait_time}s before retry (attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait_time)
                continue
                
            if r.status_code != 200:
                print(f"[WARNING] Status {r.status_code} for {steam_url}")
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
            print(f"[TIMEOUT] Request timed out for {steam_url} (attempt {attempt + 1}/{max_retries})")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
        except Exception as e:
            print(f"[ERROR] {steam_url} → {e}")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
    
    return "?", None, None, None

# JSON OUTPUT
def generate_json(repos):
    mods = []
    seen_workshop_ids = set()  # To track already-included mods by workshop ID

    # FIRST PASS: Process repos with homepage Steam URLs (highlights)
    print("\n=== FIRST PASS: Processing highlighted mods (homepage URLs) ===")
    highlight_repos = [repo for repo in repos if repo.get("homepage", "") and "steamcommunity.com" in repo.get("homepage", "")]
    
    for repo in highlight_repos:
        workshop_id, is_highlight, steam_url = get_workshop_id_from_repo(repo)
        
        if not workshop_id:
            print(f"[SKIP] No workshop ID found for {repo['name']}")
            continue
        
        if workshop_id in seen_workshop_ids:
            print(f"[SKIP] Duplicate workshop ID {workshop_id} for {repo['name']}")
            continue
        
        seen_workshop_ids.add(workshop_id)
        github_url = repo["html_url"]
        repo_name = repo["name"]
        
        print(f"[PROCESSING HIGHLIGHT] {repo_name} (ID: {workshop_id})")
        subs_str, title, banner, video_links = get_workshop_data(steam_url)
        
        # Use repo name as fallback if title fetch failed
        project_name = title if title else repo_name
        
        # Only include subs if we got valid data, otherwise omit the field
        mod_data = {
            "name": project_name,
            "steam_url": steam_url,
            "repo_url": github_url,
            "banner": banner or "",
            "videos": video_links or [],
            "highlight": True,
        }
        
        # Only add subs if we got valid data
        if subs_str != "?" and title and banner:
            try:
                subs_num = int(subs_str)
                mod_data["subs"] = subs_num
            except ValueError:
                pass  # Don't include subs if invalid
        
        mods.append(mod_data)
        
        status = "✓" if title and banner and subs_str != "?" else "⚠️ (missing data)"
        print(f"[ADDED] {project_name} (ID: {workshop_id}) - HIGHLIGHT {status}")
    
    print(f"\n✓ Completed first pass: {len(mods)} highlights added\n")
    
    # SECOND PASS: Process remaining repos for workshop.txt
    print("=== SECOND PASS: Processing standard mods (workshop.txt) ===")
    remaining_repos = [repo for repo in repos if repo not in highlight_repos]
    
    for repo in remaining_repos:
        workshop_id, is_highlight, steam_url = get_workshop_id_from_repo(repo)
        
        # Skip if no workshop ID found
        if not workshop_id:
            continue  # Silent skip for repos without workshop.txt
        
        # Skip duplicates
        if workshop_id in seen_workshop_ids:
            print(f"[SKIP] Duplicate workshop ID {workshop_id} for {repo['name']}")
            continue
        
        seen_workshop_ids.add(workshop_id)
        
        # Construct steam_url for non-highlights
        if not steam_url:
            steam_url = f"https://steamcommunity.com/sharedfiles/filedetails/?id={workshop_id}"
        
        github_url = repo["html_url"]
        repo_name = repo["name"]
        
        # For non-highlights from workshop.txt, validate the Steam page exists
        print(f"[PROCESSING STANDARD] {repo_name} (ID: {workshop_id})")
        subs_str, title, banner, video_links = get_workshop_data(steam_url)
        
        # Skip if workshop page doesn't exist or has no title
        if not title:
            print(f"[SKIP] Invalid workshop page for {repo_name} (ID: {workshop_id})")
            continue
        
        project_name = title
        
        # Only include subs if we got valid data
        mod_data = {
            "name": project_name,
            "steam_url": steam_url,
            "repo_url": github_url,
            "banner": banner or "",
            "videos": video_links or [],
            "highlight": False,
        }
        
        # Only add subs if we got valid data
        if subs_str != "?" and banner:
            try:
                subs_num = int(subs_str)
                mod_data["subs"] = subs_num
            except ValueError:
                pass  # Don't include subs if invalid
        
        mods.append(mod_data)
        
        status = "✓" if banner and subs_str != "?" else "⚠️ (no banner)" if not banner else "⚠️ (no subs)"
        print(f"[ADDED] {project_name} (ID: {workshop_id}) - standard {status}")
    
    print(f"\n✓ Completed second pass: {len(mods) - len(highlight_repos)} standard mods added\n")

    # Sort by subs (highest first), but handle missing subs
    mods.sort(key=lambda x: x.get("subs", 0), reverse=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(mods, f, indent=2, ensure_ascii=False)
        
    highlights = sum(1 for m in mods if m.get("highlight"))
    highlights_with_complete_data = sum(1 for m in mods if m.get("highlight") and m.get("banner") and "subs" in m)
    highlights_with_banners = sum(1 for m in mods if m.get("highlight") and m.get("banner"))
    standard_with_complete_data = sum(1 for m in mods if not m.get("highlight") and m.get("banner") and "subs" in m)
    standard_with_banners = sum(1 for m in mods if not m.get("highlight") and m.get("banner"))
    
    print(f"\n{'='*60}")
    print(f"✓ Wrote {len(mods)} mods to {OUTPUT_FILE}")
    print(f"{'='*60}")
    print(f"  HIGHLIGHTS (main page):")
    print(f"    • {highlights} total")
    print(f"    • {highlights_with_complete_data}/{highlights} with complete data (banner + subs)")
    print(f"    • {highlights_with_banners}/{highlights} with banners")
    print(f"\n  STANDARD (issue tracker):")
    print(f"    • {len(mods) - highlights} total")
    print(f"    • {standard_with_complete_data}/{len(mods) - highlights} with complete data (banner + subs)")
    print(f"    • {standard_with_banners}/{len(mods) - highlights} with banners")
    
    # List any highlights missing data
    missing_data = [m for m in mods if m.get("highlight") and (not m.get("banner") or "subs" not in m)]
    if missing_data:
        print(f"\n⚠️  {len(missing_data)} highlights with incomplete data:")
        for m in missing_data:
            issues = []
            if not m.get("banner"):
                issues.append("no banner")
            if "subs" not in m:
                issues.append("no subs")
            print(f"    - {m['name']}: {', '.join(issues)}")
    
    print(f"{'='*60}\n")

# MAIN
if __name__ == "__main__":
    repos = get_repos()
    print(f"Found {len(repos)} non-archived repos")
    generate_json(repos)
