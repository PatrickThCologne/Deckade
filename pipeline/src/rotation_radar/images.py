"""Booster pack cut-outs and mana symbols, stored as static files for the website.

Product photos come as JPEGs on a white background. The cut-out removes that
background without eating into the (sometimes almost white) packaging:

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

from rotation_radar.config import TCGPLAYER_PRODUCT_IMAGE
from rotation_radar.sources.http import HttpClient

log = logging.getLogger(__name__)

WHITE_THRESHOLD = 246  # lower values ate into the near-white Final Fantasy pack
EDGE_BAND = 6  # pixels along the outline that get the white share removed
EDGE_GAIN = 2.2  # how quickly an outline pixel becomes opaque again
MIN_ALPHA = 0.06
TARGET_HEIGHT = 600
WEBP_QUALITY = 88

Pixel = tuple[int, int, int, int]


def cut_out(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = cast(list[Pixel], list(rgba.get_flattened_data()))  # RGBA -> 4-tuples
    background = _background_mask(pixels, width, height)
    depth = _outline_depth(background, width, height)
    rgba.putdata([_unmix(p, bg, d) for p, bg, d in zip(pixels, background, depth, strict=True)])
    return _downscale(_crop(_erode_alpha(rgba)))


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


LARGE_SOURCE = 1000  # sets with their own page: shown large next to the card list
SMALL_SOURCE = 600  # sets that only appear as a tile; a third of the processing time


class PackImageStore:
    """Cut-out pack images under ``<image_dir>/packs``, regenerated only when the product changes.

    The manifest maps each set to the TCGplayer product its image was made from.
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

    def ensure(
        self, set_code: str, set_name: str, tcgplayer_id: str, size: int = LARGE_SOURCE
    ) -> str | None:
        """Relative public path of the pack image, or None if it could not be created."""
        source = TCGPLAYER_PRODUCT_IMAGE.format(product_id=tcgplayer_id, size=size)
        file_name = pack_file_name(set_code, set_name)
        target = self._dir / file_name
        public_path = f"images/packs/{file_name}"
        self._rename_earlier_file(set_code, target)
        # Older manifests stored the full URL; the product id identifies the image either way.
        if target.exists() and tcgplayer_id in self._manifest.get(set_code, "").split("/")[-1]:
            return public_path
        try:
            image = cut_out(Image.open(io.BytesIO(self._http.get_bytes(source))))
        except Exception as error:  # a missing image must not break the whole build
            log.warning("No pack image for %s: %s", set_code, error)
            return public_path if target.exists() else None
        self._dir.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=WEBP_QUALITY, method=6)
        self._manifest[set_code] = tcgplayer_id
        self._manifest_path.write_text(json.dumps(self._manifest, indent=2, sort_keys=True))
        return public_path

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
