import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SampleBanner } from "@/components/SampleBanner";
import { ModeProvider } from "@/lib/mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stone",
  description: "Start from what you own, and test whether the news ever mattered.",
};

// Pro is dark, so apply the remembered mode before first paint (no white flash on reload in Pro).
const MODE_BEFORE_PAINT =
  `(function(){try{document.documentElement.dataset.mode=localStorage.getItem("stone.mode")==="pro"?"pro":"lite"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="lite" suppressHydrationWarning>
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
