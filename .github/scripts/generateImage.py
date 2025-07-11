import json
import requests
from PIL import Image
from io import BytesIO

# Load mod metadata
with open("mods.json", "r", encoding="utf-8") as f:
    mods = json.load(f)

# Configuration
target_height = 256  # Height of each image
spacing = 8          # Space between images
output_filename = "mod_stack_preview.png"
images = []

# Download and resize each banner image
for mod in mods:
    url = mod.get("banner")
    if not url:
        continue
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        aspect = img.width / img.height
        new_width = int(target_height * aspect)
        resized = img.resize((new_width, target_height), Image.LANCZOS)
        images.append(resized)
    except Exception as e:
        print(f"Failed to load {mod['name']}: {e}")

# Stop if no images were loaded
if not images:
    print("No images to combine.")
    exit()

# Create a combined image
total_width = sum(img.width for img in images) + spacing * (len(images) - 1)
output = Image.new("RGBA", (total_width, target_height), (0, 0, 0, 0))

# Paste each resized image into the output
x = 0
for img in images:
    output.paste(img, (x, 0))
    x += img.width + spacing

# Save the final composite image to the repo root
output.save(output_filename)
print(f"Generated {output_filename}")