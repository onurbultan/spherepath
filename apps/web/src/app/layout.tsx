import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Karla, Zilla_Slab } from "next/font/google";
import type { ReactNode } from "react";
import "./theme.generated.css";
import "./globals.css";
import { AppProviders } from "./providers";
import { themeBootstrapScript } from "@/shared/ui/theme-bootstrap";

const karla = Karla({
  subsets: ["latin", "latin-ext"],
  variable: "--font-karla",
});

const zillaSlab = Zilla_Slab({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-zilla-slab",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Spherepath",
  description: "Emlak danışmanları için portföy üretim sistemi ve günlük davranış koçu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <meta name="facebook-domain-verification" content="w2mszidyek3g5reasz3u2ti03tki5t" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${karla.variable} ${zillaSlab.variable} ${ibmPlexMono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
