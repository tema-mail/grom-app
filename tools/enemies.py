#!/usr/bin/env python3
"""Свои противники героя (не LPC, рисуем кодом): Черепаха-Прокрастинатор и Капитан Отмазка.

Запуск: python3 tools/enemies.py -> sprites/vrag_cherepaha.webp, sprites/vrag_kapitan.webp
Полоса 7 кадров 64x64, противник смотрит влево (на героя):
0–1 стоит, 2–3 получает удар, 4–6 улетает (заваливается назад).
Персонажи свои: ни цветных повязок, ни щита с буквой, ни сине-красного костюма.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sprites"
F = 64
INK = (34, 24, 30, 255)  # контур в духе LPC


def el(d, box, fill, outline=INK, w=1):
    d.ellipse(box, fill=fill, outline=outline, width=w)


def rect(d, box, fill, outline=INK, w=1):
    d.rectangle(box, fill=fill, outline=outline, width=w)


# ---------- Черепаха-Прокрастинатор ----------
SKIN = (112, 146, 62, 255)
SKIN_D = (78, 108, 44, 255)
SHELL = (122, 84, 48, 255)
SHELL_D = (88, 58, 32, 255)
BELLY = (216, 196, 122, 255)
BANDANA = (128, 116, 100, 255)
PHONE = (24, 24, 30, 255)
SCREEN = (110, 180, 230, 255)


def cherepaha(yawn):
    im = Image.new("RGBA", (F, F))
    d = ImageDraw.Draw(im)
    # ноги
    el(d, (22, 52, 31, 62), SKIN)
    el(d, (33, 52, 42, 62), SKIN)
    # панцирь со спины (смотрит влево – панцирь справа)
    el(d, (28, 22, 52, 56), SHELL)
    d.line((34, 30, 48, 30), fill=SHELL_D)
    d.line((32, 39, 50, 39), fill=SHELL_D)
    d.line((34, 48, 48, 48), fill=SHELL_D)
    d.line((41, 24, 41, 54), fill=SHELL_D)
    # толстое брюхо
    el(d, (16, 27, 42, 58), BELLY)
    for y in (34, 41, 48):
        d.line((20, y, 38, y), fill=(180, 160, 96, 255))
    # дальняя рука свисает
    el(d, (36, 34, 44, 48), SKIN_D)
    # голова
    el(d, (12, 8, 34, 30), SKIN)
    # бандана одного цвета с узлом сзади
    rect(d, (12, 13, 34, 17), BANDANA)
    d.polygon([(34, 14), (41, 11), (40, 18)], fill=BANDANA, outline=INK)
    d.polygon([(34, 16), (40, 21), (37, 23)], fill=BANDANA, outline=INK)
    # сонные полуприкрытые глаза
    for x in (16, 23):
        d.line((x, 21, x + 4, 21), fill=INK)
        d.line((x, 20, x + 4, 20), fill=SKIN_D)
    # зевок
    if yawn:
        el(d, (16, 23, 25, 30), (90, 30, 40, 255))
    else:
        d.line((17, 26, 23, 26), fill=INK)
    # ближняя рука с телефоном
    el(d, (16, 34, 26, 44), SKIN)
    rect(d, (9, 33, 15, 44), PHONE)
    d.rectangle((10, 35, 14, 41), fill=SCREEN)
    return im


# ---------- Капитан Отмазка ----------
TIGHTS = (106, 63, 160, 255)
TIGHTS_D = (74, 40, 118, 255)
GOLD = (232, 192, 48, 255)
GOLD_D = (178, 136, 24, 255)
CAPE = (214, 150, 30, 255)
FACE = (240, 200, 160, 255)
HAIR = (30, 26, 34, 255)


def kapitan(puff):
    im = Image.new("RGBA", (F, F))
    d = ImageDraw.Draw(im)
    # плащ за спиной, развевается вправо
    d.polygon([(36, 20), (52 + puff, 30), (54 + puff, 58), (36, 52)], fill=CAPE, outline=INK)
    d.line((44, 28, 47 + puff, 56), fill=GOLD_D)
    # ноги и сапоги
    rect(d, (24, 44, 29, 57), TIGHTS)
    rect(d, (32, 44, 37, 57), TIGHTS_D)
    rect(d, (22, 55, 30, 61), GOLD)
    rect(d, (31, 55, 39, 61), GOLD)
    # руки в боки
    d.polygon([(22, 27), (13, 35), (21, 43), (24, 40), (18, 35), (24, 31)], fill=TIGHTS, outline=INK)
    d.polygon([(38, 27), (46, 35), (39, 43), (36, 40), (42, 35), (36, 31)], fill=TIGHTS_D, outline=INK)
    el(d, (19, 40, 24, 45), GOLD)  # перчатки на поясе
    el(d, (36, 40, 41, 45), GOLD)
    # надутая грудь
    d.rounded_rectangle((20 - puff, 25, 40, 46), radius=5, fill=TIGHTS, outline=INK)
    rect(d, (20, 42, 40, 45), GOLD)
    # большая буква «О»
    d.ellipse((24 - puff, 28, 36 - puff, 40), outline=GOLD, width=3)
    # голова, подбородок вверх
    el(d, (21, 8, 37, 25), FACE)
    d.polygon([(21, 13), (24, 5), (34, 5), (38, 12), (30, 10)], fill=HAIR, outline=INK)
    d.line((23, 15, 27, 14), fill=INK)  # самодовольно прикрытые глаза
    d.line((30, 15, 33, 14), fill=INK)
    d.line((24, 20, 29, 21), fill=INK)  # ухмылка
    d.point((29, 20), fill=INK)
    return im


def flash(im):
    """Кадр удара: белая вспышка по силуэту."""
    out = im.copy()
    px = out.load()
    for y in range(F):
        for x in range(F):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = ((r + 255 * 2) // 3, (g + 255 * 2) // 3, (b + 255 * 2) // 3, a)
    return out


def lean(im, dx):
    """Отшатнулся назад: верх уезжает вправо, ноги на месте."""
    out = Image.new("RGBA", (F, F))
    for y in range(F):
        shift = round(dx * (1 - y / F))
        out.paste(im.crop((0, y, F, y + 1)), (shift, y))
    return out


def fly(im, angle, dy):
    out = im.rotate(angle, resample=Image.NEAREST, center=(32, 36))
    moved = Image.new("RGBA", (F, F))
    moved.paste(out, (0, -dy), out)
    return moved


def strip(stand0, stand1):
    frames = [stand0, stand1, flash(lean(stand0, 3)), lean(stand0, 6),
              fly(stand0, -35, 0), fly(stand0, -80, 0), fly(stand0, -125, 0)]
    s = Image.new("RGBA", (F * len(frames), F))
    for i, fr in enumerate(frames):
        s.paste(fr, (i * F, 0))
    return s


def main():
    OUT.mkdir(exist_ok=True)
    for name, a, b in (("cherepaha", cherepaha(False), cherepaha(True)), ("kapitan", kapitan(0), kapitan(1))):
        strip(a, b).save(OUT / f"vrag_{name}.webp", "WEBP", lossless=True, quality=100, method=6)
    print("противники: sprites/vrag_cherepaha.webp, sprites/vrag_kapitan.webp")


if __name__ == "__main__":
    main()
