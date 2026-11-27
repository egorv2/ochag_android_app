#!/usr/bin/env python3
"""Генерирует иконки PWA и Android (mipmap) без внешних зависимостей (только stdlib).

    python3 scripts/make-icons.py

Рисует «очаг»: тёмный тёплый фон и пламя с вертикальным градиентом.
Варианты: icon (скруглённый квадрат), round (круг), maskable (на всю площадь),
foreground (прозрачный слой для adaptive icon). 2x-суперсэмплинг для сглаживания.
"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res"


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def flame_color(t: float) -> tuple[int, int, int]:
    """t=0 — низ пламени (горячее), t=1 — кончик."""
    hot, mid, tip = (255, 233, 176), (255, 150, 48), (255, 76, 46)
    return mix(hot, mid, t * 1.5) if t < 0.67 else mix(mid, tip, (t - 0.67) / 0.33)


def flame_at(x: float, y: float) -> tuple[bool, float]:
    """Нормированные координаты 0..1 -> (внутри пламени, позиция в градиенте)."""
    top, bottom = 0.14, 0.86
    if y < top or y > bottom:
        return False, 0.0
    t = (y - top) / (bottom - top)
    width = 0.30 * (math.sin(math.pi * t) ** 0.72) * (0.72 + 0.42 * t)
    center = 0.5 + 0.055 * (1 - t) ** 1.6 - 0.02 * t
    if abs(x - center) > width:
        return False, 0.0
    inner = False
    inner_top = 0.46
    if y > inner_top:
        ti = (y - inner_top) / (bottom - inner_top)
        iw = 0.145 * (math.sin(math.pi * ti) ** 0.7) * (0.8 + 0.3 * ti)
        inner = abs(x - (0.5 + 0.012 * (1 - ti))) < iw
    # низ пламени горячее (t=0 для градиента), кончик — красный
    return True, (0.15 * (1 - t) if inner else 1 - t)


def mask_alpha(variant: str, x: float, y: float, coverage: float) -> float:
    """coverage — доля попавших подмасок (для сглаживания края)."""
    if variant in ("maskable", "foreground"):
        return 1.0
    if variant == "round":
        return coverage if math.hypot(x - 0.5, y - 0.5) <= 0.495 else 0.0
    radius = 0.19
    cx, cy = abs(x - 0.5), abs(y - 0.5)
    if cx <= 0.5 - radius or cy <= 0.5 - radius:
        return 1.0
    return 1.0 if math.hypot(cx - (0.5 - radius), cy - (0.5 - radius)) <= radius else 0.0


def render(size: int, variant: str, ss: int = 2) -> bytearray:
    pad = {"icon": 0.055, "round": 0.14, "maskable": 0.0, "foreground": 0.21}[variant]
    transparent = variant == "foreground"
    pixels = bytearray(size * size * 4)
    for py in range(size):
        row = bytearray(size * 4)
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    alpha = mask_alpha(variant, x, y, 1.0)
                    bg = mix((45, 28, 19), (20, 14, 10), min(1.0, math.hypot(x - 0.5, y - 0.42) / 0.56))
                    fx = pad + (x - pad) / (1 - 2 * pad) if pad else x
                    fy = pad + (y - pad) / (1 - 2 * pad) if pad else y
                    hit, t = flame_at(fx, fy)
                    if hit:
                        color = flame_color(t)
                        bg = tuple(round(bg[i] * 0.25 + color[i] * 0.75) for i in range(3))  # type: ignore[assignment]
                        sample_alpha = 1.0
                    else:
                        sample_alpha = 0.0 if transparent else 1.0
                    pixel_alpha = alpha * sample_alpha if variant != "foreground" else sample_alpha
                    r += bg[0] * pixel_alpha
                    g += bg[1] * pixel_alpha
                    b += bg[2] * pixel_alpha
                    a += pixel_alpha
            n = ss * ss
            idx = px * 4
            if a > 0:
                row[idx] = round(r / a)
                row[idx + 1] = round(g / a)
                row[idx + 2] = round(b / a)
            row[idx + 3] = round(a / n * 255)
        pixels[py * size * 4 : (py + 1) * size * 4] = row
    return pixels


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, pixels: bytearray) -> None:
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"  {path.relative_to(ROOT)}: {size}x{size}")


def main() -> None:
    print("PWA:")
    write_png(OUT / "icon-192.png", 192, render(192, "icon"))
    write_png(OUT / "icon-512.png", 512, render(512, "icon"))
    write_png(OUT / "icon-maskable.png", 512, render(512, "maskable"))

    if ANDROID.exists():
        print("Android mipmap:")
        # launcher: 48dp, foreground adaptive: 108dp (безопасная зона 66dp в центре)
        for density, dp in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
            folder = ANDROID / f"mipmap-{density}"
            icon_size = round(48 * dp)
            fg_size = round(108 * dp)
            write_png(folder / "ic_launcher.png", icon_size, render(icon_size, "icon"))
            write_png(folder / "ic_launcher_round.png", icon_size, render(icon_size, "round"))
            write_png(folder / "ic_launcher_foreground.png", fg_size, render(fg_size, "foreground", ss=1))
    else:
        print("  (android/ ещё не создан — пропускаем mipmap)")


if __name__ == "__main__":
    main()
