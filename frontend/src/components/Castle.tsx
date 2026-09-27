/** Precedence's mark: three crenellated towers on one wall, an arched gate cut out. One path, one colour
 *  (currentColor), on a 24-unit grid so it stays crisp at 20–28px. */
export const CASTLE_PATH =
  "M2 22V5h1.75v1.75h1.5V5H7v6h2V3h1.75v1.75h2.5V3H15v8h2V5h1.75v1.75h1.5V5H22v17h-8v-3.5a2 2 0 0 0-4 0V22Z";

export function Castle({ size = 24 }: { size?: number }) {
  return (
    <svg className="castle" viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path d={CASTLE_PATH} fill="currentColor" />
    </svg>
  );
}
