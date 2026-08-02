import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://typethelyrics.sbs"),
  title: "TypeTheLyrics - Escribí al ritmo de tu música",
  description: "Juego de mecanografía musical con letras sincronizadas, modos de juego, puntuación y progreso.",
  applicationName: "TypeTheLyrics",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "64x64", type: "image/x-icon" },
      { url: "/icon.png?v=2", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: "/icon.png?v=2",
  },
  authors: [{ name: "TypeTheLyrics" }],
  generator: "Next.js",
  keywords: ["typing", "lyrics", "music", "spotify", "typing practice", "typing game"],
  creator: "TypeTheLyrics",
  publisher: "TypeTheLyrics",
  openGraph: {
    title: "TypeTheLyrics - Escribí al ritmo de tu música",
    description: "Juego de mecanografía musical con letras sincronizadas y multijugador.",
    url: "https://typethelyrics.sbs",
    siteName: "TypeTheLyrics",
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TypeTheLyrics - Escribí al ritmo de tu música",
    description: "Juego de mecanografía musical con letras sincronizadas y multijugador.",
  },
  category: "Technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
