import os
import requests
import json
from bs4 import BeautifulSoup

# CONFIG
GITHUB_USERNAME = "Chuckleberry-Finn"
GITHUB_TOKEN = os.environ["CHUCK_PAT"]
OUTPUT_FILE = "mods.json"

# GITHUB REPO FETCHING
def get_repos():
    url = "https://api.github.com/user/repos"
    headers = {"Authorization": f"Bearer {GITHUB_TOKEN}"}
    repos = []
    page = 1

    while True:
        r = requests.get(url, headers=headers, params={
            "page": page,
            "per_page": 100,
            "visibility": "public",
            "affiliation": "owner,collaborator,organization_member"
        })
        if r.status_code != 200:
            raise Exception("GitHub API error:", r.text)
        page_repos = r.json()
        if not page_repos:
            break
        repos.extend(page_repos)
        page += 1

    filtered = []
    for repo in repos:
        if repo.get("archived"):
            continue
        homepage = repo.get("homepage", "")
        if homepage and "steamcommunity.com" in homepage:
            repo["steam_url"] = homepage
            filtered.append(repo)

    return filtered

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

def get_workshop_video(soup):
    iframe = soup.find("iframe", {"src": lambda x: x and ("youtube.com" in x or "steamcdn" in x)})
    if iframe:
        return iframe["src"]
    return None

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
        video = get_workshop_video(soup)

        return sub_count, title, image, video

    except Exception as e:
        print(f"[Scraper error] {steam_url} → {e}")
        return "?", None, None, None

# JSON OUTPUT
def generate_json(repos):
    mods = []
    seen_urls = set()  # To track already-included mods by Steam URL

    for repo in repos:
        steam_url = repo["steam_url"]
        if steam_url in seen_urls:
            continue  # Skip duplicates
        seen_urls.add(steam_url)

        github_url = repo["html_url"]
        repo_name = repo["name"]

        subs_str, title, banner, video = get_workshop_data(steam_url)
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
            "video": video or "",
        })

    mods.sort(key=lambda x: x["subs"], reverse=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(mods, f, indent=2, ensure_ascii=False)
        print(f"Wrote {len(mods)} mods to {OUTPUT_FILE}")

# MAIN
if __name__ == "__main__":
    repos = get_repos()
    generate_json(repos)
