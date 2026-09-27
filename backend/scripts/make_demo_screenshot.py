"""Draw the demo brokerage screenshot for the import screen: a made-up app ("Demo Broker"), real
tickers at their closes on 2026-09-25, illustrative share counts, a cash line, and a total that
adds up. Not anyone's portfolio and not a real app's look.

    uv run --with pillow python scripts/make_demo_screenshot.py

Writes tests/fixtures/demo_screenshot.png (used by scripts/check_gemini.py).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "demo_screenshot.png"
FONT = "/System/Library/Fonts/Helvetica.ttc"  # macOS; index 1 is bold
HOLDINGS = [  # symbol, name, shares, close on 2026-09-25 (Stone's price data)
    ("BX", "Blackstone Inc.", 40, 118.43),
    ("AMZN", "Amazon.com, Inc.", 12, 249.63),
    ("NVDA", "NVIDIA Corporation", 25, 225.04),
    ("SPY", "SPDR S&P 500 ETF Trust", 6, 771.35),
]
CASH = 250.00

W, H, PAD = 780, 1300, 48
INK, MUTE, LINE, ACCENT = (20, 20, 24), (110, 110, 118), (228, 228, 232), (30, 90, 200)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)


def money(v: float) -> str:
    return f"${v:,.2f}"


def main() -> None:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.text((PAD, 40), "9:41", font=font(30, True), fill=INK)
    d.text((PAD, 110), "Demo Broker", font=font(28), fill=ACCENT)
    d.text((PAD, 160), "Portfolio value", font=font(30), fill=MUTE)
    values = [round(sh * px, 2) for _, _, sh, px in HOLDINGS]
    total = round(sum(values) + CASH, 2)
    d.text((PAD, 205), money(total), font=font(76, True), fill=INK)
    d.text((PAD, 320), "Holdings", font=font(38, True), fill=INK)
    y = 390
    for (sym, name, shares, px), value in zip(HOLDINGS, values):
        d.line((PAD, y, W - PAD, y), fill=LINE, width=2)
        d.text((PAD, y + 26), sym, font=font(36, True), fill=INK)
        d.text((PAD, y + 76), f"{name} · {shares} shares", font=font(26), fill=MUTE)
        right = W - PAD
        d.text((right, y + 26), money(value), font=font(36, True), fill=INK, anchor="ra")
        d.text((right, y + 76), f"{money(px)} per share", font=font(26), fill=MUTE, anchor="ra")
        y += 140
    d.line((PAD, y, W - PAD, y), fill=LINE, width=2)
    d.text((PAD, y + 30), "Cash", font=font(36, True), fill=INK)
    d.text((W - PAD, y + 30), money(CASH), font=font(36, True), fill=INK, anchor="ra")
    d.text((PAD, H - 90), "Sample screen for the Stone demo. Share counts are made up.", font=font(24), fill=MUTE)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): 4 holdings + cash = {money(total)}")


if __name__ == "__main__":
    main()
