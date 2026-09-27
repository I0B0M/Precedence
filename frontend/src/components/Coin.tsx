"use client";

import { useId } from "react";

/** Precedence's mark: a struck gold coin, on a 24-unit grid so it stays crisp at 14–28px. A "P" with a round
 *  bowl (the owner-approved fix), the same path in the gold and mono variants, so they line up pixel for pixel.
 *  Original, not traced. */
export const COIN_P_PATH =
  "M8.6,7 H12.4 A3,3 0 0 1 12.4,13 H10.6 V17 H8.6 Z " +  // stem and round bowl
  "M10.6,8.8 H12.3 A1.2,1.2 0 0 1 12.3,11.2 H10.6 Z";  // the counter, cut out by evenodd

const GOLD_LIGHT = "#F3D27A";
const GOLD_MID = "#C8952E";
const GOLD_DARK = "#9A6B1E";
const RIM = "#8A5D14";
const HIGHLIGHT = "#FCEFC7";
const LETTER = "#6B4A12";
const LETTER_EDGE = "rgba(255,255,255,0.4)";

/** The coin's inner content, with no outer <svg> wrapper, for reuse inside another viewBox="0 0 24 24" svg.
 *  `mono`: the old one-colour outline (currentColor), for a decorative context that tints its own text.
 *  Below ~20px the inner highlight ring is dropped — it just muddies the rim at pill size. */
export function CoinGlyph({ size = 24, mono = false }: { size?: number; mono?: boolean }) {
  const uid = useId();

  if (mono) {
    return (
      <>
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <path fill="currentColor" fillRule="evenodd" d={COIN_P_PATH} />
      </>
    );
  }

  const face = `coin-face-${uid}`;
  return (
    <>
      <defs>
        <linearGradient id={face} x1="12%" y1="8%" x2="88%" y2="92%">
          <stop offset="0%" stopColor={GOLD_LIGHT} />
          <stop offset="55%" stopColor={GOLD_MID} />
          <stop offset="100%" stopColor={GOLD_DARK} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill={`url(#${face})`} stroke={RIM} strokeWidth="0.8" />
      {size >= 20 && <circle cx="12" cy="12" r="8.3" fill="none" stroke={HIGHLIGHT} strokeWidth="0.5" opacity="0.55" />}
      <path fill={LETTER} fillRule="evenodd" d={COIN_P_PATH} />
      <path fill="none" stroke={LETTER_EDGE} strokeWidth="0.3" d={COIN_P_PATH} />
    </>
  );
}

export function Coin({ size = 24 }: { size?: number }) {
  return (
    <svg className="coin" viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <CoinGlyph size={size} />
    </svg>
  );
}
