"""Booster pack cut-outs and mana symbols, stored as static files for the website.

Official images from Wizards mostly come transparent already; they are only cropped, turned
to face the viewer (``make_upright``) and scaled. The official photos of 2019/2020 come on a
white background. The cut-out removes that background without eating into the (sometimes
almost white) packaging:

1. Flood fill from the image border: light pixels connected to the border become
   transparent. White print on the pack stays, because it is not connected.
2. The first pixels along the outline are blended with white in the JPEG. For them
   the white share is removed ("color to alpha"), so no bright fringe remains.
3. The outermost alpha line is eroded by one pixel, the image cropped and scaled
   down with premultiplied alpha (otherwise white bleeds back into the edge).
"""

from __future__ import annotations

import io
import json
import logging
import re
import unicodedata
from collections import deque
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import cast

from PIL import Image, ImageChops, ImageFilter

from rotation_radar.config import WIZARDS_IMAGE_HOST
from rotation_radar.sources.http import HttpClient

log = logging.getLogger(__name__)

WHITE_THRESHOLD = 246  # lower values ate into the near-white Final Fantasy pack
EDGE_BAND = 6  # pixels along the outline that get the white share removed
EDGE_GAIN = 2.2  # how quickly an outline pixel becomes opaque again
MIN_ALPHA = 0.06
TARGET_HEIGHT = 600
WEBP_QUALITY = 88
OFFICIAL_FRAME = 4  # grey frame around the official photos of 2019/2020; blocks the flood fill
UPRIGHT_TOLERANCE = 0.02  # corners this close to the bounding box (share of the width): upright
UPRIGHT_MARGIN = 0.04  # room for edges that bulge past the corners (share of the width)

Pixel = tuple[int, int, int, int]
Point = tuple[float, float]


def cut_out(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = cast(list[Pixel], list(rgba.get_flattened_data()))  # RGBA -> 4-tuples
    background = _background_mask(pixels, width, height)
    depth = _outline_depth(background, width, height)
    rgba.putdata([_unmix(p, bg, d) for p, bg, d in zip(pixels, background, depth, strict=True)])
    return _downscale(_crop(_erode_alpha(rgba)))


def prepare_pack(image: Image.Image, *, frame: int = 0, upright: bool = False) -> Image.Image:
    """Crop and scale a transparent image; cut a photo out of its white background first.

    ``frame`` pixels are cut off a photo's border before the cut-out. ``upright`` turns a
    pack that is shown at an angle to face the viewer.
    """
    rgba = image.convert("RGBA")
    if _is_transparent(rgba):
        cropped = _crop(rgba)
        return _downscale(make_upright(cropped) if upright else cropped)
    if frame:
        rgba = rgba.crop((frame, frame, rgba.width - frame, rgba.height - frame))
    rgba.thumbnail((LARGE_SOURCE, LARGE_SOURCE))  # the flood fill is slow on large photos
    result = cut_out(rgba)
    return make_upright(result) if upright else result


def make_upright(image: Image.Image) -> Image.Image:
    """Map the four corners of the pack outline onto a rectangle.

    Wizards' renders since 2024 show the pack slightly turned, one side nearer than the other;
    older images face the viewer. An image whose corners already sit on its bounding box is
    returned unchanged.
    """
    box = image.getchannel("A").getbbox()
    if box is None:
        return image
    corners = _outline_corners(image)
    left, top, right, bottom = box[0], box[1], box[2] - 1, box[3] - 1
    upright = ((left, top), (right, top), (right, bottom), (left, bottom))
    offset = max(_distance(c, u) for c, u in zip(corners, upright, strict=True))
    if offset <= UPRIGHT_TOLERANCE * image.width:
        return image
    top_left, top_right, bottom_right, bottom_left = corners
    width = (_distance(top_left, top_right) + _distance(bottom_left, bottom_right)) / 2
    height = (_distance(top_left, bottom_left) + _distance(top_right, bottom_right)) / 2
    margin = round(width * UPRIGHT_MARGIN)
    target = (
        (margin, margin),
        (margin + width, margin),
        (margin + width, margin + height),
        (margin, margin + height),
    )
    size = (round(width) + 2 * margin, round(height) + 2 * margin)
    turned = image.convert("RGBa").transform(  # premultiplied: no dark fringe at the edge
        size,
        Image.Transform.PERSPECTIVE,
        _perspective(target, corners),
        Image.Resampling.BICUBIC,
    )
    return _crop(turned.convert("RGBA"))


def _outline_corners(image: Image.Image) -> tuple[Point, Point, Point, Point]:
    """Top left, top right, bottom right, bottom left: the opaque pixels furthest that way."""
    alpha = image.getchannel("A")
    factor = max(1, -(-alpha.height // TARGET_HEIGHT))  # large sources: search a smaller copy
    small = alpha.reduce(factor) if factor > 1 else alpha
    width = small.width
    opaque = [
        (i % width, i // width)
        for i, value in enumerate(cast(list[int], list(small.get_flattened_data())))
        if value >= 128
    ]
    top_left = min(opaque, key=lambda p: p[0] + p[1])
    top_right = max(opaque, key=lambda p: p[0] - p[1])
    bottom_right = max(opaque, key=lambda p: p[0] + p[1])
    bottom_left = min(opaque, key=lambda p: p[0] - p[1])
    return cast(
        tuple[Point, Point, Point, Point],
        tuple(
            (x * factor, y * factor) for x, y in (top_left, top_right, bottom_right, bottom_left)
        ),
    )


def _distance(a: Point, b: Point) -> float:
    return float(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5)


def _perspective(target: Iterable[Point], source: Iterable[Point]) -> list[float]:
    """The eight coefficients PIL needs to map points of the result back to the source."""
    rows: list[list[float]] = []
    for (x, y), (u, v) in zip(target, source, strict=True):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    for col in range(8):  # Gauss-Jordan elimination with partial pivoting
        pivot = max(range(col, 8), key=lambda r: abs(rows[r][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        for r in range(8):
            if r != col:
                factor = rows[r][col] / rows[col][col]
                rows[r] = [a - factor * b for a, b in zip(rows[r], rows[col], strict=True)]
    return [rows[i][8] / rows[i][i] for i in range(8)]


def _is_transparent(image: Image.Image) -> bool:
    last_x, last_y = image.width - 1, image.height - 1
    corners = ((0, 0), (last_x, 0), (0, last_y), (last_x, last_y))
    return all(cast(Pixel, image.getpixel(corner))[3] < 10 for corner in corners)


def _neighbours(x: int, y: int, width: int, height: int) -> Iterator[tuple[int, int]]:
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < width and 0 <= ny < height:
            yield nx, ny


def _background_mask(pixels: list[Pixel], width: int, height: int) -> bytearray:
    def is_light(pixel: Pixel) -> bool:
        return all(channel >= WHITE_THRESHOLD for channel in pixel[:3])

    mask = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    queue.extend((x, y) for x in range(width) for y in (0, height - 1))
    queue.extend((x, y) for y in range(height) for x in (0, width - 1))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if mask[index] or not is_light(pixels[index]):
            continue
        mask[index] = 1
        queue.extend(_neighbours(x, y, width, height))
    return mask


def _outline_depth(background: bytearray, width: int, height: int) -> bytearray:
    """Distance (1..EDGE_BAND) of foreground pixels from the background, 0 = deeper inside."""
    depth = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if background[index]:
                continue
            on_border = x in (0, width - 1) or y in (0, height - 1)
            touches_bg = any(
                background[ny * width + nx] for nx, ny in _neighbours(x, y, width, height)
            )
            if on_border or touches_bg:
                depth[index] = 1
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        current = depth[y * width + x]
        if current >= EDGE_BAND:
            continue
        for nx, ny in _neighbours(x, y, width, height):
            index = ny * width + nx
            if not background[index] and not depth[index]:
                depth[index] = current + 1
                queue.append((nx, ny))
    return depth


def _unmix(pixel: Pixel, is_background: int, depth: int) -> Pixel:
    if is_background:
        return (0, 0, 0, 0)
    if not depth:
        return pixel
    red, green, blue, _ = pixel
    darkness = max(255 - red, 255 - green, 255 - blue) / 255
    alpha = min(1.0, darkness * EDGE_GAIN * (1 + (depth - 1) * 0.6))
    if alpha < MIN_ALPHA:
        return (0, 0, 0, 0)

    def without_white(channel: int) -> int:
        return max(0, min(255, round(255 - (255 - channel) / alpha)))

    return (without_white(red), without_white(green), without_white(blue), round(alpha * 255))


def _erode_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    image.putalpha(ImageChops.darker(alpha, alpha.filter(ImageFilter.MinFilter(3))))
    return image


def _crop(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else image


def _downscale(image: Image.Image) -> Image.Image:
    if image.height <= TARGET_HEIGHT:
        return image
    size = (round(image.width * TARGET_HEIGHT / image.height), TARGET_HEIGHT)
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


LARGE_SOURCE = 1000  # photos are scaled to this before the cut-out


class PackImageStore:
    """Pack images under ``<image_dir>/packs``, regenerated only when the source changes.

    The manifest maps each set to the URL of the official image its pack was made from.
    """

    def __init__(self, http: HttpClient, image_dir: Path) -> None:
        self._http = http
        self._dir = image_dir / "packs"
        self._manifest_path = self._dir / "sources.json"
        self._manifest: dict[str, str] = (
            json.loads(self._manifest_path.read_text(encoding="utf-8"))
            if self._manifest_path.exists()
            else {}
        )

    def ensure_official(self, set_code: str, set_name: str, url: str) -> str | None:
        """Relative public path of the pack image, or None if it could not be created."""
        file_name = pack_file_name(set_code, set_name)
        target = self._dir / file_name
        public_path = f"images/packs/{file_name}"
        self._rename_earlier_file(set_code, target)
        if target.exists() and self._manifest.get(set_code) == url:
            return public_path
        try:
            raw = Image.open(io.BytesIO(self._http.get_bytes(url)))
            image = prepare_pack(raw, frame=OFFICIAL_FRAME, upright=True)
        except Exception as error:  # a missing image must not break the whole build
            log.warning("No pack image for %s: %s", set_code, error)
            return self.official(set_code, set_name)
        self._dir.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=WEBP_QUALITY, method=6)
        self._manifest[set_code] = url
        self._write_manifest()
        return public_path

    def official(self, set_code: str, set_name: str) -> str | None:
        """Path of an official image stored by an earlier build, so it is not looked up again."""
        file_name = pack_file_name(set_code, set_name)
        self._rename_earlier_file(set_code, self._dir / file_name)
        stored = self._manifest.get(set_code, "")
        if stored.startswith(WIZARDS_IMAGE_HOST) and (self._dir / file_name).exists():
            return f"images/packs/{file_name}"
        return None

    def remove_unused(self, kept: Iterable[str]) -> None:
        """Delete pack images no set uses any more, such as photos from an earlier source."""
        if not self._dir.exists():
            return
        keep = {Path(path).name for path in kept}
        for path in sorted(self._dir.glob("*.webp")):
            if path.name not in keep:
                path.unlink()
                log.info("Removed unused pack image %s", path.name)
        # Set codes have no hyphen: the code is the part of the file name before the first one
        codes = {name.split("-", 1)[0].removesuffix(".webp") for name in keep}
        self._manifest = {code: url for code, url in self._manifest.items() if code in codes}
        self._write_manifest()

    def _write_manifest(self) -> None:
        self._manifest_path.write_text(json.dumps(self._manifest, indent=2, sort_keys=True))

    def _rename_earlier_file(self, set_code: str, target: Path) -> None:
        """Keep an image saved under an earlier name: only the code, or an older set name."""
        if target.exists() or not self._dir.exists():
            return
        # Set codes have no hyphen, so "<code>-" only matches this set's files
        earlier = [self._dir / f"{set_code}.webp", *sorted(self._dir.glob(f"{set_code}-*.webp"))]
        for path in earlier:
            if path.exists():
                path.rename(target)
                log.info("Renamed pack image %s to %s", path.name, target.name)
                return


def pack_file_name(set_code: str, set_name: str) -> str:
    """'dsk', 'Duskmourn: House of Horror' -> 'dsk-duskmourn-house-of-horror.webp'.

    The code keeps names unique and sorts the folder; the set name makes it searchable.
    """
    decomposed = unicodedata.normalize("NFKD", set_name)
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", plain.replace("'", "")).strip("-")
    return f"{set_code}-{slug}.webp" if slug else f"{set_code}.webp"


def symbol_file_name(symbol: str) -> str:
    """'W/U' -> 'WU.svg', the naming Scryfall uses as well."""
    return symbol.replace("/", "") + ".svg"


def store_symbols(
    http: HttpClient, svg_urls: dict[str, str], symbols: Iterable[str], image_dir: Path
) -> None:
    """Download the SVGs of the given mana symbols once, so the site does not hotlink them."""
    target_dir = image_dir / "symbols"
    target_dir.mkdir(parents=True, exist_ok=True)
    for symbol in sorted(set(symbols)):
        target = target_dir / symbol_file_name(symbol)
        url = svg_urls.get(symbol)
        if target.exists() or url is None:
            continue
        target.write_bytes(http.get_bytes(url))
