#!/usr/bin/env python3
"""Сборка слоёв героя из Universal LPC Spritesheet Character Generator.

Запуск: python3 tools/sprites.py <путь к клону LPC-генератора>
Нужны папки sheet_definitions, palette_definitions и spritesheets (хватит sparse-клона).

На выходе sprites/*.webp (lossless) и sprites/manifest.json, плюс CREDITS.md.
Каждый обычный слой – полоса 576x192: строка 0 – walk лицом вниз (9 кадров),
строка 1 – slash лицом вниз (6 кадров), строка 2 – hurt (6 кадров), кадр 64x64.
Слои удара большого оружия (slash_128, slash_oversize) – полоса 6 кадров по 128 или 192 px.
Раскраска по палитрам LPC делается здесь, в браузере палитр нет.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sprites"
F = 64
SOUTH = 2  # строка «лицом вниз» в листах walk и slash (n, w, s, e)

# (ключ, определение, номера слоёв, вариант-файл, перекраска (материал, база, цель))
BASE = [
    ("body", "body/body.json", [1], None, None),
    ("head", "head/heads/human/heads_human_male.json", [1], None, None),
    ("hair", "hair/short/hair_plain.json", [1], None, ("hair", "orange", "dark_brown")),
    ("shirt", "torso/shirts/longsleeve/torso_clothes_longsleeve.json", [1], None, ("cloth", "white", "bluegray")),
    ("pants", "legs/pants/legs_pants.json", [1], None, ("cloth", "white", "charcoal")),
    ("shoes", "feet/shoes/feet_shoes_basic.json", [1], None, ("cloth", "white", "brown")),
]
ITEMS = [
    ("shlem_kozha", "headwear/hats/caps/hat_cap_leather.json", [1], "leather", None),
    ("shlem_zhelezo", "headwear/helmets/helmets/hat_helmet_nasal.json", [1], None, None),
    ("korona", "headwear/hats/formal/hat_formal_crown.json", [1], "crown_gold", None),
    ("kurtka_kozha", "torso/armour/torso_armour_leather.json", [1], None, None),
    ("kolchuga", "torso/torso_chainmail.json", [1], None, None),
    ("laty", "torso/armour/torso_armour_plate.json", [1], None, None),
    ("kinzhal", "weapons/sword/weapon_sword_dagger.json", [1, 2], "dagger", None),
    ("mech", "weapons/sword/weapon_sword_arming.json", [1, 2, 3, 4], "steel", None),
    ("topor", "weapons/blunt/weapon_blunt_waraxe.json", [1, 2, 3, 4], "waraxe", None),
    ("shchit_derevo", "weapons/shields/heater/shield_heater_revised_wood.json", [1, 2], None, None),
    ("shchit_zhelezo", "weapons/shields/shield_kite.json", [1], "kite_gray", None),
    ("plashch", "torso/cape/cape_solid.json", [1, 2], None, ("cloth", "white", "red")),
]
CUSTOM_SIZE = {"slash_128": 128, "slash_oversize": 192}


def hexrgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def recolor(im, lpc, spec):
    if not spec:
        return im
    material, base, target = spec
    pal = json.loads((lpc / f"palette_definitions/{material}/{material}_ulpc.json").read_text())
    src, dst = pal[base], pal[target]
    a = np.array(im.convert("RGBA")).astype(np.int16)
    out = a.copy()
    for s, d in zip(src, dst):
        s, d = hexrgb(s), hexrgb(d)
        m = (np.abs(a[..., :3] - s) <= 1).all(axis=-1) & (a[..., 3] > 0)
        out[m, :3] = d
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def sheet(lpc, base_path, anim, variant):
    p = lpc / "spritesheets" / base_path / anim
    p = p / f"{variant}.png" if variant else p.with_suffix(".png")
    return Image.open(p).convert("RGBA") if p.exists() else None


def build_std(lpc, base_path, variant, spec):
    strip = Image.new("RGBA", (9 * F, 3 * F))
    found = []
    for row, (anim, src_row, n) in enumerate([("walk", SOUTH, 9), ("slash", SOUTH, 6), ("hurt", 0, 6)]):
        im = sheet(lpc, base_path, anim, variant)
        if im is None:
            continue
        found.append(anim)
        strip.paste(im.crop((0, src_row * F, n * F, (src_row + 1) * F)), (0, row * F))
    return recolor(strip, lpc, spec), found


def build_custom(lpc, base_path, variant, size):
    p = lpc / "spritesheets" / base_path / f"{variant}.png"
    im = Image.open(p).convert("RGBA")
    return im.crop((0, SOUTH * size, 6 * size, (SOUTH + 1) * size))


def save(im, name):
    im.save(OUT / f"{name}.webp", "WEBP", lossless=True, quality=100, method=6)


def main():
    lpc = Path(sys.argv[1]).resolve()
    OUT.mkdir(exist_ok=True)
    manifest = {"base": [], "items": {}}
    credits = []
    for group, key in ((BASE, "base"), (ITEMS, "items")):
        for name, defn, layers, variant, spec in group:
            d = json.loads((lpc / "sheet_definitions" / defn).read_text())
            out_layers, used = [], []
            for n in layers:
                L = d[f"layer_{n}"]
                path = L["male"]
                used.append(path)
                fname = f"{name}_{n}"
                custom = L.get("custom_animation")
                if custom:
                    size = CUSTOM_SIZE[custom]
                    save(build_custom(lpc, path, variant, size), fname)
                    out_layers.append({"f": fname, "z": L["zPos"], "slash": size})
                else:
                    im, found = build_std(lpc, path, variant, spec)
                    save(im, fname)
                    out_layers.append({"f": fname, "z": L["zPos"], "anims": found})
            if key == "base":
                manifest["base"].extend(out_layers)
            else:
                manifest["items"][name] = out_layers
            for c in d.get("credits", []):
                cf = c["file"].rstrip("/")
                if any(u.startswith(cf + "/") or u.rstrip("/") == cf or cf.startswith(u.rstrip("/")) for u in used):
                    credits.append({"item": name, "name": d["name"], "file": c["file"], "authors": c["authors"],
                                    "licenses": c["licenses"], "urls": c.get("urls", []), "notes": c.get("notes", "")})
    manifest["credits"] = credits
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    write_credits_md(credits)
    print("слоёв:", len(list(OUT.glob("*.webp"))), "записей авторов:", len(credits))


def write_credits_md(credits):
    lines = [
        "# Авторы графики",
        "",
        "Герой собран из спрайтов [Universal LPC Spritesheet Character Generator]"
        "(https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).",
        "Ниже – только файлы, взятые в эту страницу. Слои обрезаны до строки «лицом вниз», "
        "перекрашены по палитрам LPC и сохранены в WebP без потерь (tools/sprites.py).",
        "Каждый файл можно использовать по любой из перечисленных у него лицензий; "
        "для CC-BY-SA и GPL производные слои в папке sprites/ распространяются на тех же условиях.",
        "",
    ]
    for c in credits:
        lines.append(f"## {c['item']} – {c['name']} (`{c['file']}`)")
        lines.append("")
        lines.append("- Авторы: " + ", ".join(c["authors"]))
        lines.append("- Лицензии: " + ", ".join(c["licenses"]))
        for u in c["urls"]:
            lines.append(f"- {u}")
        if c["notes"]:
            lines.append(f"- Примечание: {c['notes']}")
        lines.append("")
    (ROOT / "CREDITS.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
