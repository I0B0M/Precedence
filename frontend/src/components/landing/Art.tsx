import { CoinGlyph } from "@/components/Coin";

/* Landing artwork, drawn in SVG. */

export const Mark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><CoinGlyph mono /></svg>
);

/* Card: a price line with event dots, glowing from below */
export const DotsArt = () => (
  <svg className="home-art" viewBox="0 0 576 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="glowA" cx="50%" cy="100%" r="75%"><stop offset="0" stopColor="rgb(37,99,235)" stopOpacity="0.9" /><stop offset="1" stopColor="rgb(0,0,0)" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="576" height="480" fill="url(#glowA)" />
    <polyline fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" points="0,330 48,318 96,340 144,300 192,312 240,270 288,286 336,240 384,262 432,214 480,230 528,190 576,200" />
    {[[144, 300], [240, 270], [336, 240], [432, 214], [528, 190]].map(([x, y], i) => (
      <g key={i}><circle cx={x} cy={y} r="9" fill="#D4AF37" /><circle cx={x} cy={y} r="20" fill="none" stroke="rgba(212,175,55,0.35)" /></g>
    ))}
    {Array.from({ length: 12 }, (_, i) => <line key={i} x1={i * 48 + 24} x2={i * 48 + 24} y1="360" y2="480" stroke="rgba(255,255,255,0.08)" />)}
  </svg>
);

/* Card: hit-rate bar vs normal range */
export const RangeArt = () => (
  <svg className="home-art" viewBox="0 0 576 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="glowB" cx="50%" cy="100%" r="70%"><stop offset="0" stopColor="rgb(37,99,235)" stopOpacity="1" /><stop offset="1" stopColor="rgb(0,0,0)" stopOpacity="0" /></radialGradient>
      <linearGradient id="bar" x1="0" x2="1"><stop offset="0" stopColor="rgba(255,255,255,0.15)" /><stop offset="1" stopColor="rgba(255,255,255,0.5)" /></linearGradient>
    </defs>
    <rect width="576" height="480" fill="url(#glowB)" />
    <rect x="88" y="200" width="400" height="120" rx="16" fill="rgba(10,14,30,0.75)" stroke="rgba(255,255,255,0.25)" />
    <rect x="120" y="258" width="336" height="10" rx="5" fill="url(#bar)" />
    <rect x="230" y="250" width="120" height="26" rx="13" fill="none" stroke="rgba(255,255,255,0.7)" strokeDasharray="4 4" />
    <circle cx="300" cy="263" r="11" fill="#D4AF37" />
    <text x="120" y="236" fill="#fff" fontFamily="Epilogue, sans-serif" fontSize="18">Mattered before?</text>
    <text x="456" y="236" fill="#D4AF37" fontFamily="Epilogue, sans-serif" fontSize="18" textAnchor="end">No clear pattern</text>
  </svg>
);

/* Feature: stock page — dusk sky, a screen with a chart and event dots */
export const ChartPanel = () => (
  <svg className="home-art wide" viewBox="0 0 1920 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(24,26,30)" /><stop offset="0.6" stopColor="rgb(80,78,82)" /><stop offset="1" stopColor="rgb(170,140,110)" /></linearGradient>
      <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgb(30,34,40)" /><stop offset="1" stopColor="rgb(14,16,20)" /></linearGradient>
    </defs>
    <rect width="1920" height="800" fill="url(#dusk)" />
    <path d="M0 640 L1920 520 L1920 800 L0 800Z" fill="rgb(12,12,14)" />
    <g transform="translate(340 170) skewY(4)">
      <rect width="600" height="380" rx="10" fill="url(#scr)" stroke="rgba(255,255,255,0.18)" />
      <polyline fill="none" stroke="rgb(230,190,60)" strokeWidth="3" points="30,300 80,260 130,280 180,210 230,230 280,160 330,190 380,120 430,150 480,90 530,110 570,70" />
      {[[180, 210], [280, 160], [380, 120], [480, 90]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#D4AF37" />)}
      {['1W', '1M', '3M', '1Y', '2Y'].map((l, i) => <text key={l} x={30 + i * 50} y="350" fill="rgba(255,255,255,0.6)" fontFamily="Epilogue, sans-serif" fontSize="16">{l}</text>)}
      <rect x="270" y="380" width="60" height="110" fill="rgb(20,20,22)" />
    </g>
  </svg>
);

/* Feature: funds — layered holdings discs on blue-grey */
export const FundsPanel = () => (
  <svg className="home-art wide" viewBox="0 0 1920 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="bg2" cx="50%" cy="100%" r="75%"><stop offset="0" stopColor="rgba(37,99,235,0.45)" /><stop offset="1" stopColor="#0b0b0c" /></radialGradient>
      <linearGradient id="disc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(255,255,255,0.75)" /><stop offset="0.5" stopColor="rgba(90,96,110,0.9)" /><stop offset="1" stopColor="rgba(220,224,232,0.8)" /></linearGradient>
    </defs>
    <rect width="1920" height="800" fill="url(#bg2)" />
    {Array.from({ length: 10 }, (_, i) => (
      <ellipse key={i} cx="960" cy={640 - i * 46} rx={220 - i * 6} ry="44" fill="url(#disc)" stroke="rgba(212,175,55,0.55)" />
    ))}
  </svg>
);

/* Feature: paper trading — phone with pretend-cash receipt */
export const PaperPanel = () => (
  <svg className="home-art wide" viewBox="0 0 1920 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="bg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0.25" stopColor="#000" /><stop offset="1" stopColor="rgba(37,99,235,0.55)" /></linearGradient></defs>
    <rect width="1920" height="800" fill="url(#bg3)" />
    <g transform="translate(800 110) rotate(8)">
      <rect width="340" height="700" rx="46" fill="#0b0b0c" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
      <rect x="24" y="80" width="292" height="36" rx="8" fill="rgb(255,214,10)" />
      <text x="170" y="104" textAnchor="middle" fontFamily="Epilogue, sans-serif" fontSize="16" fill="#111">Not real money</text>
      <text x="40" y="180" fontFamily="Epilogue, sans-serif" fontSize="15" fill="rgba(255,255,255,0.6)">Pretend cash</text>
      <text x="40" y="226" fontFamily="Epilogue, sans-serif" fontSize="40" fill="#fff">$5,000.00</text>
      {['Buy  BX   2 sh', 'Sell SPY 1 sh', 'Buy  AMZN 1 sh'].map((r, i) => (
        <g key={r}><line x1="40" x2="300" y1={290 + i * 64} y2={290 + i * 64} stroke="rgba(255,255,255,0.12)" />
          <text x="40" y={326 + i * 64} fontFamily="Epilogue, sans-serif" fontSize="17" fill="#fff">{r}</text>
          <text x="300" y={326 + i * 64} textAnchor="end" fontFamily="Epilogue, sans-serif" fontSize="13" fill="rgba(255,255,255,0.5)">Friday close</text></g>
      ))}
      <rect x="40" y="520" width="260" height="44" rx="22" fill="#D4AF37" />
      <text x="170" y="548" textAnchor="middle" fontFamily="Epilogue, sans-serif" fontSize="16" fill="#111">Reset</text>
    </g>
  </svg>
);

/* Four line icons */
const S = { fill: 'none', stroke: '#D4AF37', strokeWidth: 1.4 } as const;
export const IconTested = () => (
  <svg className="home-icon" viewBox="0 0 200 200" aria-hidden="true">
    {Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => <circle key={`${r}${c}`} cx={40 + c * 30} cy={40 + r * 30} r="9" {...S} />))}
    <circle cx="130" cy="130" r="9" fill="#D4AF37" />
  </svg>
);
export const IconHonest = () => (
  <svg className="home-icon" viewBox="0 0 200 200" aria-hidden="true">
    <path d="M100 24 L168 52 V104 C168 142 138 168 100 180 C62 168 32 142 32 104 V52 Z" {...S} />
    <path d="M70 102 H130 M70 124 H112" {...S} /><circle cx="100" cy="72" r="10" {...S} />
  </svg>
);
export const IconSources = () => (
  <svg className="home-icon" viewBox="0 0 200 200" aria-hidden="true">
    {[0, 1, 2].map(i => <g key={i} transform={`translate(${36 + i * 20} ${36 + i * 22})`}><rect width="92" height="116" rx="6" {...S} /><path d="M16 26 H76 M16 44 H76 M16 62 H56" {...S} /></g>)}
  </svg>
);
export const IconChecked = () => (
  <svg className="home-icon" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="70" {...S} /><circle cx="100" cy="100" r="52" {...S} strokeDasharray="6 6" />
    <path d="M72 102 L92 122 L130 82" {...S} strokeWidth="2" />
  </svg>
);

