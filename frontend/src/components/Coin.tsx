/** Precedence's mark: a coin, one colour (currentColor), on a 24-unit grid so it stays crisp at 14–28px.
 *  An outer rim, a thin inner ring, and a slab-serif "P" struck in the middle. Original geometry, not traced. */
export const COIN_RIM = { cx: 12, cy: 12, r: 9.5 };
export const COIN_RING = { cx: 12, cy: 12, r: 7.4 };
export const COIN_P_PATH =
  "M8.6,7 L12,7 L12,8 L11,8 L11,16 L12,16 L12,17 L8.6,17 L8.6,16 L9.6,16 L9.6,8 L8.6,8 Z " +
  "M11,8 L15.5,8 L15.5,12.5 L11,12.5 Z " +
  "M12.3,9 L14.3,9 L14.3,11.5 L12.3,11.5 Z";

/** The coin's inner content, with no outer <svg> wrapper, for reuse inside another viewBox="0 0 24 24" svg. */
export function CoinGlyph() {
  return (
    <>
      <circle cx={COIN_RIM.cx} cy={COIN_RIM.cy} r={COIN_RIM.r} fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx={COIN_RING.cx} cy={COIN_RING.cy} r={COIN_RING.r} fill="none" stroke="currentColor" strokeWidth="0.7" />
      <path fill="currentColor" fillRule="evenodd" d={COIN_P_PATH} />
    </>
  );
}

export function Coin({ size = 24 }: { size?: number }) {
  return (
    <svg className="coin" viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <CoinGlyph />
    </svg>
  );
}
