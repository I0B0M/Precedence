import type { Metadata } from "next";
import { Bricolage_Grotesque, Doto, Figtree } from "next/font/google";
import { Header } from "@/components/Header";
import { SampleBanner } from "@/components/SampleBanner";
import { ModeProvider } from "@/lib/mode";
import "./globals.css";

const doto = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-doto" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-bricolage" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Stone",
  description: "Start from what you own, and test whether the news ever mattered.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${doto.variable} ${bricolage.variable} ${figtree.variable}`}>
      <body>
        <ModeProvider>
          <div className="wrap">
            <Header />
            <SampleBanner />
            <main>{children}</main>
            <footer className="note" style={{ marginTop: 60, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              Built at ShellHacks 2026. Not investment advice. No order is ever sent from this screen.
            </footer>
          </div>
        </ModeProvider>
      </body>
    </html>
  );
}
