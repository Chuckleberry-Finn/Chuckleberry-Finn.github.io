import json
import os
import requests
from PIL import Image
from io import BytesIO

# Load mod data - filter only highlights for the banner
with open("mods.json", "r", encoding="utf-8") as f:
    all_mods = json.load(f)
    mods = [mod for mod in all_mods if mod.get("highlight", False)]

# Config
output_width = 1000
output_height = 256
image_size = 256  # Square images
images = []

# Load and resize banners
for mod in mods:
    url = mod.get("banner")
    if not url:
        continue
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        # Resize to square, maintaining aspect ratio and cropping
        resized = img.resize((image_size, image_size), Image.LANCZOS)
        images.append(resized)
    except Exception as e:
        print(f"Failed to load {mod['name']}: {e}")

if not images:
    print("No images to combine.")
    exit()

# Create canvas with title area at top
output = Image.new("RGBA", (output_width, output_height), (0, 0, 0, 0))
num_images = len(images)

# Calculate overlap-based positions (right images overlap more)
positions = []
if num_images == 1:
    positions = [0]
else:
    easing = [((i / (num_images - 1)) ** 1.5) for i in range(num_images)]
    max_eased = easing[-1]
    eased_spread = [(1 - (e / max_eased)) for e in easing]  # inverse
    total_spread = sum(eased_spread)
    scale = (output_width - image_size) / total_spread
    x = 0
    for spread in eased_spread:
        positions.append(int(x))
        x += spread * scale

# Paste images back-to-front so leftmost is least covered
for i in range(num_images - 1, -1, -1):
    output.paste(images[i], (positions[i], 0), images[i])

# Save output
output.save("mod_stack_preview.png")
print(f"Saved: mod_stack_preview.png (with {num_images} highlighted mods)")
