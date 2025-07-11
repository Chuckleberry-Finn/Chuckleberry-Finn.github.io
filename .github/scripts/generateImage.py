import json
import requests
from PIL import Image
from io import BytesIO

with open("mods.json", "r", encoding="utf-8") as f:
    mods = json.load(f)

target_height = 256
spacing = 8
images = []

for mod in mods:
    url = mod.get("banner")
    if not url:
        continue
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        aspect = img.width / img.height
        new_w = int(target_height * aspect)
        resized = img.resize((new_w, target_height), Image.LANCZOS)
        images.append(resized)
    except Exception as e:
        print(f"Failed to load {mod['name']}: {e}")

if not images:
    print("No images to combine.")
    exit()

total_w = sum(img.width for img in images) + spacing * (len(images) - 1)
output = Image.new("RGBA", (total_w, target_height), (0, 0, 0, 0))

x = 0
for img in images:
    output.paste(img, (x, 0))
    x += img.width + spacing

output.save("mod_stack_preview.png")
print("Generated mod_stack_preview.png")