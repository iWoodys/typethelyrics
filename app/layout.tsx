import type { Metadata, Viewport } from "next";
import "./globals.css";

const mobileSiteBootstrap = `try{var h=location.hostname.toLowerCase().replace(/\\.$/,"");var q=new URLSearchParams(location.search);document.documentElement.dataset.mobileSite=(h==="m.typethelyrics.sbs"||h==="m.localhost"||q.get("mobile")==="1"||innerWidth<=767)?"true":"false"}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL("https://typethelyrics.sbs"),
  title: "TypeTheLyrics - Escribe al ritmo de tu música",
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
  keywords: ["typing", "lyrics", "music", "spotify", "music typing", "typing game"],
  creator: "TypeTheLyrics",
  publisher: "TypeTheLyrics",
  openGraph: {
    title: "TypeTheLyrics - Escribe al ritmo de tu música",
    description: "Juego de mecanografía musical con letras sincronizadas y multijugador.",
    url: "https://typethelyrics.sbs",
    siteName: "TypeTheLyrics",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TypeTheLyrics - Escribe al ritmo de tu música",
    description: "Juego de mecanografía musical con letras sincronizadas y multijugador.",
  },
  category: "Technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: mobileSiteBootstrap }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
