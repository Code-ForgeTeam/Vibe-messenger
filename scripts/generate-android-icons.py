from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets" / "android-icons"
LEGACY_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
ADAPTIVE_FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}
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
        int(size * 0.085),
        int(size * 0.075),
        int(size * 0.915),
        int(size * 0.815),
    )
    tail = [
        (int(size * 0.34), int(size * 0.735)),
        (int(size * 0.24), int(size * 0.94)),
        (int(size * 0.43), int(size * 0.825)),
    ]
    draw.rounded_rectangle(bubble_box, radius=int(size * 0.295), fill=255)
    draw.polygon(tail, fill=255)
    draw.ellipse(
        (
            int(size * 0.275),
            int(size * 0.68),
            int(size * 0.455),
            int(size * 0.83),
        ),
        fill=255,
    )
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
    draw.rounded_rectangle(
        [
            int(size * 0.16),
            int(size * 0.15),
            int(size * 0.72),
            int(size * 0.36),
        ],
        radius=int(size * 0.14),
        fill=255,
    )
    top_sheen = ImageChops.multiply(top_sheen, mask)
    sheen = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    sheen.putalpha(top_sheen.point(lambda value: clamp(value * 0.12)))
    canvas.alpha_composite(sheen)

    lower_depth = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(lower_depth)
    draw.polygon(
        [
            (int(size * 0.42), int(size * 0.39)),
            (int(size * 0.94), int(size * 0.45)),
            (int(size * 0.86), int(size * 0.84)),
            (int(size * 0.32), int(size * 0.86)),
            (int(size * 0.41), int(size * 0.69)),
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
        int(size * 0.39),
        int(size * 0.275),
        int(size * 0.61),
        int(size * 0.605),
    )
    inner = (
        int(size * 0.475),
        int(size * 0.255),
        int(size * 0.69),
        int(size * 0.605),
    )
    draw.ellipse(outer, fill=255)
    draw.ellipse(inner, fill=0)

    moon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    moon.putalpha(moon_mask)
    canvas.alpha_composite(moon)


def fit_icon_to_canvas(image: Image.Image, size: int, padding_ratio: float) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image

    cropped = image.crop(bbox)
    target_width = max(1, round(size * (1 - padding_ratio * 2)))
    target_height = max(1, round(size * (1 - padding_ratio * 2)))
    scale = min(target_width / cropped.width, target_height / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - resized.width) // 2, (size - resized.height) // 2)
    result.alpha_composite(resized, offset)
    return result


def make_icon(size: int, padding_ratio: float) -> Image.Image:
    hi_size = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (hi_size, hi_size), (0, 0, 0, 0))
    mask = make_bubble_mask(hi_size)

    bubble = make_gradient(hi_size)
    canvas.paste(bubble, (0, 0), mask)
    add_shape_highlights(canvas, mask, hi_size)
    add_moon(canvas, hi_size)
    canvas = fit_icon_to_canvas(canvas, hi_size, padding_ratio)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    for density, size in LEGACY_SIZES.items():
        folder = TARGET / density
        folder.mkdir(parents=True, exist_ok=True)
        legacy_icon = make_icon(size, 0.02)
        legacy_icon.save(folder / "ic_launcher.png", format="PNG")
        legacy_icon.save(folder / "ic_launcher_round.png", format="PNG")

    for density, size in ADAPTIVE_FOREGROUND_SIZES.items():
        folder = TARGET / density
        folder.mkdir(parents=True, exist_ok=True)
        adaptive_icon = make_icon(size, 0.16)
        adaptive_icon.save(folder / "ic_launcher_foreground.png", format="PNG")
    print("android launcher icons generated")


if __name__ == "__main__":
    main()
