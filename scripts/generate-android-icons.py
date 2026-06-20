from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets" / "android-icons"
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
FILENAMES = ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")
def make_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    draw_mask = ImageDraw.Draw(mask)

    bubble_box = (
        int(size * 0.08),
        int(size * 0.09),
        int(size * 0.92),
        int(size * 0.83),
    )
    tail = [
        (int(size * 0.30), int(size * 0.71)),
        (int(size * 0.24), int(size * 0.92)),
        (int(size * 0.46), int(size * 0.78)),
    ]
    draw_mask.rounded_rectangle(bubble_box, radius=int(size * 0.29), fill=255)
    draw_mask.polygon(tail, fill=255)

    bubble = Image.new("RGBA", (size, size), (33, 104, 243, 255))
    bubble_bottom = Image.new("L", (size, size), 0)
    draw_bottom = ImageDraw.Draw(bubble_bottom)
    draw_bottom.polygon(
        [
            (int(size * 0.46), int(size * 0.38)),
            (int(size * 0.95), int(size * 0.44)),
            (int(size * 0.92), int(size * 0.83)),
            (int(size * 0.24), int(size * 0.92)),
            (int(size * 0.40), int(size * 0.69)),
        ],
        fill=255,
    )
    bubble_bottom = ImageChops.multiply(bubble_bottom, mask)
    bubble.paste((18, 78, 220, 255), (0, 0), bubble_bottom)

    accent = Image.new("L", (size, size), 0)
    draw_accent = ImageDraw.Draw(accent)
    draw_accent.polygon(
        [
            (int(size * 0.14), int(size * 0.20)),
            (int(size * 0.58), int(size * 0.16)),
            (int(size * 0.44), int(size * 0.34)),
            (int(size * 0.18), int(size * 0.36)),
        ],
        fill=255,
    )
    accent = ImageChops.multiply(accent, mask)
    bubble.paste((92, 169, 255, 255), (0, 0), accent)
    canvas.paste(bubble, (0, 0), mask)

    moon_mask = Image.new("L", (size, size), 0)
    draw_moon = ImageDraw.Draw(moon_mask)
    outer = (
        int(size * 0.31),
        int(size * 0.23),
        int(size * 0.66),
        int(size * 0.62),
    )
    inner = (
        int(size * 0.44),
        int(size * 0.19),
        int(size * 0.75),
        int(size * 0.61),
    )
    draw_moon.ellipse(outer, fill=255)
    draw_moon.ellipse(inner, fill=0)
    moon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    moon.putalpha(moon_mask)
    canvas.alpha_composite(moon)

    return canvas


def main() -> None:
    for density, size in DENSITIES.items():
        folder = TARGET / density
        folder.mkdir(parents=True, exist_ok=True)
        icon = make_icon(size)
        for filename in FILENAMES:
            icon.save(folder / filename, format="PNG")
    print("android launcher icons generated")


if __name__ == "__main__":
    main()
