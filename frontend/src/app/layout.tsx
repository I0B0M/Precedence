import type { Metadata } from "next";
import { Bricolage_Grotesque, Doto, Figtree } from "next/font/google";
import { Header } from "@/components/Header";
import { SampleBanner } from "@/components/SampleBanner";
import { ModeProvider } from "@/lib/mode";
import "./globals.css";

const doto = Doto({ subsets: ["latin"], weight: ["900"], variable: "--font-doto" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-bricolage" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Stone",
  description: "Start from what you own, and test whether the news ever mattered.",
};

// Pro is dark, so apply the remembered mode before first paint (no white flash on reload in Pro).
const MODE_BEFORE_PAINT =
  `(function(){try{document.documentElement.dataset.mode=localStorage.getItem("stone.mode")==="pro"?"pro":"lite"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="lite" className={`${doto.variable} ${bricolage.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_BEFORE_PAINT }} />
      </head>
      <body>
        <ModeProvider>
          <div className="wrap">
            <Header />
            <SampleBanner />
            <main>{children}</main>
            <footer className="note foot">
              Built at ShellHacks 2026. Not investment advice. No order is ever sent from this screen.
            </footer>
          </div>
        </ModeProvider>
      </body>
    </html>
  );
}
