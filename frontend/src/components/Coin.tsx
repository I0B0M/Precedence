"use client";

import { useId } from "react";

/** Precedence's mark: a struck gold coin, on a 24-unit grid so it stays crisp at 14–28px. A slab-serif "P",
 *  same geometry as the original mono mark, so both variants line up pixel for pixel. Original, not traced. */
export const COIN_P_PATH =
  "M8.6,7 L12,7 L12,8 L11,8 L11,16 L12,16 L12,17 L8.6,17 L8.6,16 L9.6,16 L9.6,8 L8.6,8 Z " +
  "M11,8 L15.5,8 L15.5,12.5 L11,12.5 Z " +
  "M12.3,9 L14.3,9 L14.3,11.5 L12.3,11.5 Z";

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
