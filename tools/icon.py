#!/usr/bin/env python3
"""Иконка «Гром» из головы героя LPC: icon.webp для страницы и mac/build/icon-1024.png для icns.
Запуск после tools/sprites.py: python3 tools/icon.py"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = ROOT / "sprites"


def head():
    fr = Image.new("RGBA", (64, 64))
    for n in ("body_1", "shirt_1", "head_1", "hair_1"):
        fr.alpha_composite(Image.open(S / f"{n}.webp").convert("RGBA").crop((0, 0, 64, 64)))
    hd = Image.new("RGBA", (64, 64))
    for n in ("head_1", "hair_1"):
        hd.alpha_composite(Image.open(S / f"{n}.webp").convert("RGBA").crop((0, 0, 64, 64)))
    x0, y0, x1, y1 = hd.getbbox()
    y1 = min(y1 + 2, 64)  # немного шеи и плеч
    w = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - w // 2 - 2, cy - w // 2 - 2, cx - w // 2 - 2 + w + 4, cy - w // 2 - 2 + w + 4)
    return fr.crop(box)


def tile(size, h):
    bg = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(bg)
    pad = size // 10
    d.rounded_rectangle((pad, pad, size - pad, size - pad), radius=size // 5, fill=(38, 42, 54, 255))
    inner = size - 2 * pad - size // 12
    k = inner // h.width
    big = h.resize((h.width * k, h.height * k), Image.NEAREST)
    layer = Image.new("RGBA", (size, size))
    layer.alpha_composite(big, ((size - big.width) // 2, (size - big.height) // 2 + size // 40))
    mask = Image.new("L", (size, size))
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, size - pad, size - pad), radius=size // 5, fill=255)
    bg.paste(layer, (0, 0), Image.composite(layer, Image.new("RGBA", (size, size)), mask))
    return bg


h = head()
tile(64, h).save(ROOT / "icon.webp", "WEBP", lossless=True)
(ROOT / "mac" / "build").mkdir(parents=True, exist_ok=True)
tile(1024, h).save(ROOT / "mac" / "build" / "icon-1024.png")
print("иконка: голова", h.size)
