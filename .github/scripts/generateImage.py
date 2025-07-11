import json
import requests
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

# Load mods.json
with open("mods.json", "r", encoding="utf-8") as f:
    mods = json.load(f)

# Config
output_width = 700
target_height = 256
title_text = "Chuck's Mod Portfolio"
font_size = 24
images = []

# Load banners and resize
for mod in mods:
    url = mod.get("banner")
    if not url:
        continue
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        resized = img.resize((256, 256), Image.LANCZOS)
        images.append(resized)
    except Exception as e:
        print(f"Failed to load {mod['name']}: {e}")

if not images:
    print("No images to combine.")
    exit()

# Calculate spacing for overlap
output = Image.new("RGBA", (output_width, target_height), (0, 0, 0, 0))

num_images = len(images)
if num_images == 1:
    spacing = 0
else:
    spacing = (output_width - 256) // (num_images - 1)

# Create canvas
x = 0
for img in images:
    output.paste(img, (x, 0), img)
    x += spacing

# Add title text
draw = ImageDraw.Draw(output)
try:
    font = ImageFont.truetype("Helvetica.ttf", font_size)
except:
    font = ImageFont.load_default()

bbox = draw.textbbox((0, 0), title_text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
draw.text(
    ((output_width - text_w) / 2, (target_height - text_h) / 2),
    title_text,
    fill=(255, 255, 255, 255),
    font=font
)

# Save
output.save("mod_stack_preview.png")
print("Saved: mod_stack_preview.png")