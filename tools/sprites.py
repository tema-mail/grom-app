#!/usr/bin/env python3
"""Сборка слоёв героя из Universal LPC Spritesheet Character Generator.

Запуск: python3 tools/sprites.py <путь к клону LPC-генератора>
Нужны папки sheet_definitions, palette_definitions и spritesheets (хватит sparse-клона).

На выходе sprites/*.webp (lossless) и sprites/manifest.json, плюс CREDITS.md.
Каждый обычный слой – полоса 576x320: строка 0 – walk лицом вниз (9 кадров),
строка 1 – slash лицом вниз (6 кадров), строка 2 – hurt (6 кадров), строки 3 и 4 – walk влево
и вправо (для героя на рабочем столе), строка 5 – sit лицом вниз (3 кадра), 6 – slash вправо (бой), кадр 64x64.
Отдельно «ochki» (солнцезащитные очки) – надеваются на выходной, в манифесте в "extra".
Слои удара большого оружия (slash_128, slash_oversize) – 6 кадров по 128 или 192 px, две строки: вниз и вправо.
Раскраска по палитрам LPC делается здесь, в браузере палитр нет.
Слои собираются под три тела по форме героя (FORMS); манифест хранит файл слоя для каждой формы.
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
WEST, EAST = 1, 3  # ходьба влево и вправо – для героя на рабочем столе

# (ключ, определение, номера слоёв, вариант-файл, перекраски [(материал, база, цель)])
# ---------- ВНЕШНОСТЬ ГЕРОЯ: менять только здесь, потом заново запустить скрипт ----------
# Цвета – имена из palette_definitions/<материал>/<материал>_ulpc.json генератора LPC.
VNESHNOST = {
    "kozha": "light",                              # кожа: light, amber, olive, taupe, bronze, brown, black…
    "volosy": "hair/short/hair_cowlick.json",      # причёска: файл из sheet_definitions/hair/… (Артём 15.11: коротко по бокам, объём сверху назад)
    "volosy_cvet": "black",                        # цвет волос, бровей и бороды: black, dark_brown, chestnut…
    "boroda": None,                                # None или "hair/beards/beards_5oclock_shadow.json" (щетина), beards_trimmed…
    "brovi": "head/eyebrows/eyebrows_thick.json",  # None или "head/eyebrows/eyebrows_thin.json" / eyebrows_thick.json
    "glaza": "brown",                              # глаза: blue, green, brown, gray…
}
V = VNESHNOST
SKIN = ("body", "light", V["kozha"])
HAIR = ("hair", "orange", V["volosy_cvet"])

BASE = [
    ("body", "body/body.json", [1], None, [SKIN]),
    ("head", "head/heads/human/heads_human_male.json", [1], None, [SKIN, ("eye", "blue", V["glaza"])]),
    ("hair", V["volosy"], [1], None, [HAIR]),
    ("trusy", "legs/shorts/legs_shorts_short.json", [1], None, [("cloth", "white", "navy")]),
] + [(k, V[k], [1], None, [HAIR]) for k in ("boroda", "brovi") if V[k]]
# Не шмот: очки для выходного, страница и стол надевают их сами.
EXTRA = [
    ("ochki", "headwear/accessories/glasses/facial_glasses_sunglasses.json", [1], "sunglasses", None),
]
# Форма героя -> тип тела LPC. Если у предмета нет слоя под тело, берём ближайший (FALLBACK).
FORMS = {"dryshch": "teen", "norma": "male", "atlet": "muscular"}
FALLBACK = {"teen": ["teen", "male"], "male": ["male"], "muscular": ["muscular", "male"]}
ITEMS = [
    ("mayka", "torso/shirts/sleeveless/torso_clothes_sleeveless1.json", [1], None, None),
    ("rubashka", "torso/shirts/longsleeve/torso_clothes_longsleeve.json", [1], None, [("cloth", "white", "bluegray")]),
    ("shtany", "legs/pants/legs_pants.json", [1], None, [("cloth", "white", "charcoal")]),
    ("botinki", "feet/boots/feet_boots_basic.json", [1], None, [("cloth", "white", "brown")]),
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
    ("plashch", "torso/cape/cape_solid.json", [1, 2], None, [("cloth", "white", "red")]),
]
CUSTOM_SIZE = {"slash_128": 128, "slash_oversize": 192}


def hexrgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def recolor(im, lpc, specs):
    if not specs:
        return im
    a = np.array(im.convert("RGBA")).astype(np.int16)
    out = a.copy()
    for material, base, target in specs:
        if base == target:
            continue
        pal = json.loads((lpc / f"palette_definitions/{material}/{material}_ulpc.json").read_text())
        for src, dst in zip(pal[base], pal[target]):
            src, dst = hexrgb(src), hexrgb(dst)
            m = (np.abs(a[..., :3] - src) <= 1).all(axis=-1) & (a[..., 3] > 0)
            out[m, :3] = dst
    return Image.fromarray(out.astype(np.uint8), "RGBA")


RAW = "https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/"


def fetch(lpc, rel):
    """Файла нет в sparse-клоне (сменили причёску, бороду) – докачать его с GitHub в тот же клон."""
    p = lpc / rel
    if p.exists():
        return p
    import subprocess
    import tempfile
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.close()
    ok = subprocess.run(["curl", "-fsSL", "--max-time", "30", "-o", tmp.name, RAW + rel], stderr=subprocess.DEVNULL).returncode == 0
    if not ok:
        Path(tmp.name).unlink(missing_ok=True)
        return p
    data = Path(tmp.name).read_bytes()
    Path(tmp.name).unlink()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


def sheet(lpc, base_path, anim, variant):
    rel = f"spritesheets/{base_path}{anim}" + (f"/{variant}.png" if variant else ".png")
    p = fetch(lpc, rel)
    return Image.open(p).convert("RGBA") if p.exists() else None


def build_std(lpc, base_path, variant, spec):
    rows = [("walk", SOUTH, 9), ("slash", SOUTH, 6), ("hurt", 0, 6), ("walk", WEST, 9), ("walk", EAST, 9),
            ("sit", SOUTH, 3), ("slash", EAST, 6)]
    strip = Image.new("RGBA", (9 * F, len(rows) * F))
    found = []
    for row, (anim, src_row, n) in enumerate(rows):
        im = sheet(lpc, base_path, anim, variant)
        if im is None:
            continue
        if anim not in found:
            found.append(anim)
        strip.paste(im.crop((0, src_row * F, n * F, (src_row + 1) * F)), (0, row * F))
    return recolor(strip, lpc, spec), found


def build_custom(lpc, base_path, variant, size):
    p = fetch(lpc, f"spritesheets/{base_path}{variant}.png")
    im = Image.open(p).convert("RGBA")
    out = Image.new("RGBA", (6 * size, 2 * size))  # строка 0 – удар лицом вниз, 1 – вправо (бой)
    out.paste(im.crop((0, SOUTH * size, 6 * size, (SOUTH + 1) * size)), (0, 0))
    out.paste(im.crop((0, EAST * size, 6 * size, (EAST + 1) * size)), (0, size))
    return out


def save(im, name):
    im.save(OUT / f"{name}.webp", "WEBP", lossless=True, quality=100, method=6)


def body_path(L, body):
    for b in FALLBACK[body]:
        if L.get(b):
            return L[b], b
    raise SystemExit(f"нет слоя ни под одно тело: {L}")


def main():
    lpc = Path(sys.argv[1]).resolve()
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.webp"):
        if not old.name.startswith("vrag_"):  # противники – свои, их рисует tools/enemies.py
            old.unlink()
    manifest = {"forms": FORMS, "base": [], "items": {}, "extra": {}, "fallbacks": []}
    credits = []
    for group, key in ((BASE, "base"), (ITEMS, "items"), (EXTRA, "extra")):
        for name, defn, layers, variant, spec in group:
            d = json.loads((lpc / "sheet_definitions" / defn).read_text())
            out_layers, used = [], set()
            for n in layers:
                L = d[f"layer_{n}"]
                custom = L.get("custom_animation")
                files, made = {}, {}
                for forma, body in FORMS.items():
                    path, got = body_path(L, body)
                    if got != body:
                        manifest["fallbacks"].append(f"{name} слой {n}: {body} -> {got}")
                    used.add(path)
                    if path not in made:
                        fname = f"{name}_{n}_{got}" if len({body_path(L, b)[0] for b in FORMS.values()}) > 1 else f"{name}_{n}"
                        if custom:
                            save(build_custom(lpc, path, variant, CUSTOM_SIZE[custom]), fname)
                            made[path] = (fname, None)
                        else:
                            im, found = build_std(lpc, path, variant, spec)
                            save(im, fname)
                            made[path] = (fname, found)
                    files[forma] = made[path][0]
                one = {"f": files, "z": L["zPos"]}
                if custom:
                    one["slash"] = CUSTOM_SIZE[custom]
                else:
                    one["anims"] = next(iter(made.values()))[1]
                out_layers.append(one)
            if key == "base":
                manifest["base"].extend(out_layers)
            else:
                manifest[key][name] = out_layers
            for c in d.get("credits", []):
                cf = c["file"].rstrip("/")
                if any(u.startswith(cf + "/") or u.rstrip("/") == cf or cf.startswith(u.rstrip("/")) for u in used):
                    credits.append({"item": name, "name": d["name"], "file": c["file"], "authors": c["authors"],
                                    "licenses": c["licenses"], "urls": c.get("urls", []), "notes": c.get("notes", "")})
    manifest["fallbacks"] = sorted(set(manifest["fallbacks"]))
    manifest["credits"] = credits
    import hashlib
    h = hashlib.sha1()
    for f in sorted(OUT.glob("*.webp")):
        h.update(f.read_bytes())
    manifest["v"] = h.hexdigest()[:8]  # версия слоёв: страница добавляет её к адресам картинок, чтобы кэш не держал старые
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    write_credits_md(credits)
    print("слоёв:", len(list(OUT.glob("*.webp"))), "записей авторов:", len(credits))
    print("подставлено чужое тело:", *manifest["fallbacks"], sep="\n  ")


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
    lines += [
        "## Противники – свои",
        "",
        "Черепаха-Прокрастинатор и Капитан Отмазка (sprites/vrag_*.webp) нарисованы для «Грома» кодом "
        "(tools/enemies.py), не из LPC. Права – у владельца проекта.",
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
