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
SUPERSAMPLE = 4


def clamp(value: float) -> int:
    return max(0, min(255, round(value)))


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        clamp(a[0] + (b[0] - a[0]) * t),
        clamp(a[1] + (b[1] - a[1]) * t),
        clamp(a[2] + (b[2] - a[2]) * t),
    )


def make_bubble_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    bubble_box = (
        int(size * 0.11),
        int(size * 0.11),
        int(size * 0.89),
        int(size * 0.86),
    )
    tail = [
        (int(size * 0.32), int(size * 0.74)),
        (int(size * 0.26), int(size * 0.93)),
        (int(size * 0.43), int(size * 0.84)),
    ]
    draw.rounded_rectangle(bubble_box, radius=int(size * 0.31), fill=255)
    draw.polygon(tail, fill=255)
    return mask


def make_gradient(size: int) -> Image.Image:
    top_left = (44, 177, 205)
    top_right = (58, 111, 255)
    bottom_left = (18, 212, 164)
    bottom_right = (30, 79, 230)
    image = Image.new("RGBA", (size, size))
    pixels = image.load()

    for y in range(size):
        for x in range(size):
            nx = x / max(1, size - 1)
            ny = y / max(1, size - 1)
            top_mix = mix(top_left, top_right, nx)
            bottom_mix = mix(bottom_left, bottom_right, nx)
            base = mix(top_mix, bottom_mix, ny)
            pixels[x, y] = (*base, 255)

    return image


def add_shape_highlights(canvas: Image.Image, mask: Image.Image, size: int) -> None:
    top_sheen = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(top_sheen)
    draw.polygon(
        [
            (int(size * 0.16), int(size * 0.14)),
            (int(size * 0.62), int(size * 0.16)),
            (int(size * 0.49), int(size * 0.37)),
            (int(size * 0.16), int(size * 0.33)),
        ],
        fill=255,
    )
    top_sheen = ImageChops.multiply(top_sheen, mask)
    sheen = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    sheen.putalpha(top_sheen.point(lambda value: clamp(value * 0.16)))
    canvas.alpha_composite(sheen)

    lower_depth = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(lower_depth)
    draw.polygon(
        [
            (int(size * 0.47), int(size * 0.42)),
            (int(size * 0.95), int(size * 0.47)),
            (int(size * 0.89), int(size * 0.86)),
            (int(size * 0.33), int(size * 0.88)),
            (int(size * 0.43), int(size * 0.69)),
        ],
        fill=255,
    )
    lower_depth = ImageChops.multiply(lower_depth, mask)
    shade = Image.new("RGBA", (size, size), (7, 24, 105, 0))
    shade.putalpha(lower_depth.point(lambda value: clamp(value * 0.10)))
    canvas.alpha_composite(shade)


def add_moon(canvas: Image.Image, size: int) -> None:
    moon_mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(moon_mask)
    outer = (
        int(size * 0.38),
        int(size * 0.30),
        int(size * 0.59),
        int(size * 0.59),
    )
    inner = (
        int(size * 0.46),
        int(size * 0.26),
        int(size * 0.69),
        int(size * 0.59),
    )
    draw.ellipse(outer, fill=255)
    draw.ellipse(inner, fill=0)

    moon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    moon.putalpha(moon_mask)
    canvas.alpha_composite(moon)


def make_icon(size: int) -> Image.Image:
    hi_size = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (hi_size, hi_size), (0, 0, 0, 0))
    mask = make_bubble_mask(hi_size)

    bubble = make_gradient(hi_size)
    canvas.paste(bubble, (0, 0), mask)
    add_shape_highlights(canvas, mask, hi_size)
    add_moon(canvas, hi_size)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


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
