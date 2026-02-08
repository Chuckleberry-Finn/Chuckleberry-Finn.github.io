import os
import requests
import json
import re
from bs4 import BeautifulSoup

# CONFIG
GITHUB_USERNAME = "Chuckleberry-Finn"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUTPUT_FILE = "mods.json"

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
    Returns (workshop_id, is_highlight) tuple
    """
    # Check if repo has homepage with Steam URL (these are highlights)
    homepage = repo.get("homepage", "")
    is_highlight = homepage and "steamcommunity.com" in homepage
    
    # If homepage has Steam URL, extract ID from there
    if is_highlight:
        match = re.search(r'id=(\d+)', homepage)
        if match:
            return (match.group(1), True)
    
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
                    return (workshop_id, False)
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
                    return (workshop_id, False)
    except Exception as e:
        pass
    
    return (None, False)

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

def get_workshop_data(steam_url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en-US,en;q=0.9"
        }
        r = requests.get(steam_url, headers=headers, timeout=10)
        if r.status_code != 200:
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

    except Exception as e:
        print(f"[Scraper error] {steam_url} → {e}")
        return "?", None, None, None

# JSON OUTPUT
def generate_json(repos):
    mods = []
    seen_workshop_ids = set()  # To track already-included mods by workshop ID

    for repo in repos:
        workshop_id, is_highlight = get_workshop_id_from_repo(repo)
        
        # Skip if no workshop ID found
        if not workshop_id:
            print(f"[SKIP] No workshop ID found for {repo['name']}")
            continue
        
        # Skip duplicates
        if workshop_id in seen_workshop_ids:
            print(f"[SKIP] Duplicate workshop ID {workshop_id} for {repo['name']}")
            continue
        
        seen_workshop_ids.add(workshop_id)
        
        steam_url = f"https://steamcommunity.com/sharedfiles/filedetails/?id={workshop_id}"
        github_url = repo["html_url"]
        repo_name = repo["name"]

        subs_str, title, banner, video_links = get_workshop_data(steam_url)
        
        # Skip if workshop page doesn't exist or has no title
        if not title:
            print(f"[SKIP] Invalid workshop page for {repo_name} (ID: {workshop_id})")
            continue
        
        project_name = title if title else repo_name

        try:
            subs_num = int(subs_str) if subs_str != "?" else -1
        except ValueError:
            subs_num = -1

        mods.append({
            "name": project_name,
            "subs": subs_num,
            "steam_url": steam_url,
            "repo_url": github_url,
            "banner": banner or "",
            "videos": video_links or [],
            "highlight": is_highlight,
        })
        
        print(f"[ADDED] {project_name} (ID: {workshop_id}) - {'HIGHLIGHT' if is_highlight else 'standard'}")

    # Sort by subs (highest first)
    mods.sort(key=lambda x: x["subs"], reverse=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(mods, f, indent=2, ensure_ascii=False)
        
    highlights = sum(1 for m in mods if m.get("highlight"))
    print(f"\n✓ Wrote {len(mods)} mods to {OUTPUT_FILE}")
    print(f"  - {highlights} highlights (will appear on main page)")
    print(f"  - {len(mods) - highlights} standard (issue tracker only)")

# MAIN
if __name__ == "__main__":
    repos = get_repos()
    print(f"Found {len(repos)} non-archived repos")
    generate_json(repos)
