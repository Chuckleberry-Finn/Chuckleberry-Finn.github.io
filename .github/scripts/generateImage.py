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
title_height = 50
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
        aspect = img.width / img.height
        resized = img.resize((int(target_height * aspect), target_height), Image.LANCZOS)
        images.append(resized)
    except Exception as e:
        print(f"Failed to load {mod['name']}: {e}")

if not images:
    print("No images to combine.")
    exit()

# Calculate spacing for overlap
if len(images) > 1:
    total_overlap = images[0].width + (len(images) - 1) * int(images[0].width * 0.5)
    spacing = int((output_width - images[0].width) / (len(images) - 1))
else:
    spacing = 0

# Create canvas
output = Image.new("RGBA", (output_width, target_height + title_height), (0, 0, 0, 0))
x = 0
for img in images:
    output.paste(img, (x, title_height), img)
    x += spacing

# Add title text
draw = ImageDraw.Draw(output)
try:
    font = ImageFont.truetype("Helvetica.ttf", font_size)
except:
    font = ImageFont.load_default()

text_width, text_height = draw.textsize(title_text, font=font)
draw.text(
    ((output_width - text_width) / 2, (title_height - text_height) / 2),
    title_text,
    fill=(255, 255, 255, 255),
    font=font
)

# Save
output.save("mod_stack_preview.png")
print("Saved: mod_stack_preview.png")