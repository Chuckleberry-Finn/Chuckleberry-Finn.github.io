import json
import os
import requests
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

# Load mod data - filter only highlights for the banner
with open("mods.json", "r", encoding="utf-8") as f:
    all_mods = json.load(f)
    mods = [mod for mod in all_mods if mod.get("highlight", False)]

# Config
output_width = 1000
output_height = 256
title_height = 80  # Height for title overlay
banner_height = output_height - title_height  # Remaining height for mod images
image_size = 256
images = []

# Load and resize banners
for mod in mods:
    url = mod.get("banner")
    if not url:
        continue
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGBA")
        resized = img.resize((image_size, banner_height), Image.LANCZOS)
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
# Position them below the title area
for i in range(num_images - 1, -1, -1):
    output.paste(images[i], (positions[i], title_height), images[i])

# Draw title overlay
draw = ImageDraw.Draw(output)

# Try to load a nice font, fall back to default if not available
try:
    # Try Lobster (cursive) for "Chuck's" and "Mods"
    lobster_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 50)
except:
    lobster_font = ImageFont.load_default()

# Title text
left_text = "Chuck's"
center_text = "PROJECT ZOMBOID"
right_text = "Mods"

# Get text sizes for positioning
left_bbox = draw.textbbox((0, 0), left_text, font=lobster_font)
left_width = left_bbox[2] - left_bbox[0]

# Center text with smaller font
try:
    center_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
except:
    center_font = ImageFont.load_default()

center_bbox = draw.textbbox((0, 0), center_text, font=center_font)
center_width = center_bbox[2] - center_bbox[0]
center_height = center_bbox[3] - center_bbox[1]

right_bbox = draw.textbbox((0, 0), right_text, font=lobster_font)
right_width = right_bbox[2] - right_bbox[0]

# Calculate spacing and positions
gap = 15  # Gap between elements
total_width = left_width + gap + center_width + gap + right_width
start_x = (output_width - total_width) // 2
y_pos = (title_height - 50) // 2  # Center vertically in title area

# Golden/amber color for the cursive text
golden_color = (255, 204, 102, 255)  # #FFCC66

# White/cream for center text
white_color = (245, 230, 200, 255)  # Cream white

# Draw text with glow effect (multiple layers)
def draw_text_with_glow(draw, pos, text, font, color, glow_color=(255, 149, 0, 100)):
    x, y = pos
    # Outer glow
    for offset in [(0, 2), (2, 0), (0, -2), (-2, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
        draw.text((x + offset[0] * 2, y + offset[1] * 2), text, font=font, fill=glow_color)
    # Inner glow
    for offset in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
        draw.text((x + offset[0], y + offset[1]), text, font=font, fill=glow_color)
    # Main text
    draw.text((x, y), text, font=font, fill=color)

# Draw "Chuck's"
draw_text_with_glow(draw, (start_x, y_pos), left_text, lobster_font, golden_color)

# Draw "PROJECT ZOMBOID" (centered, slightly lower)
center_x = start_x + left_width + gap
center_y = y_pos + 8  # Slightly lower
draw.text((center_x, center_y), center_text, font=center_font, fill=white_color)

# Draw "Mods"
right_x = center_x + center_width + gap
draw_text_with_glow(draw, (right_x, y_pos), right_text, lobster_font, golden_color)

# Save output
output.save("mod_stack_preview.png")
print(f"Saved: mod_stack_preview.png (with {num_images} highlighted mods)")
