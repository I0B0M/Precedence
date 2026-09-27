import type { Metadata } from "next";
import { Alegreya, Doto, Epilogue } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SampleBanner } from "@/components/SampleBanner";
import { ModeProvider } from "@/lib/mode";
import "./globals.css";
// The home page's styles load with the site's, not as a route file: every page links home, so Next preloaded a
// separate home.css everywhere and warned that it went unused. All its classes are prefixed home-.
import "./home.css";

const epilogue = Epilogue({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-epilogue" });
const alegreya = Alegreya({ subsets: ["latin"], weight: ["400"], variable: "--font-alegreya" });
// Dot-matrix face for the small uppercase labels only (.kicker, the Briefing's .bf-kicker); never body text.
const doto = Doto({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-doto" });

export const metadata: Metadata = {
  title: "Precedence",
  description: "Start from what you own, and test whether the news ever mattered.",
};

// Pro is dark, so apply the remembered mode before first paint (no white flash on reload in Pro).
const MODE_BEFORE_PAINT =
  `(function(){try{document.documentElement.dataset.mode=localStorage.getItem("stone.mode")==="pro"?"pro":"lite"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="lite" className={`${epilogue.variable} ${alegreya.variable} ${doto.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_BEFORE_PAINT }} />
      </head>
      <body>
        <ModeProvider>
          <div className="wrap">
            <Header />
            <SampleBanner />
            <main>{children}</main>
            <Footer />
          </div>
        </ModeProvider>
      </body>
    </html>
  );
}
