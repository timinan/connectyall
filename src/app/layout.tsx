import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Body / conversational text — sub paragraphs, names, recap, channel values.
// Kept under the same CSS variable name so Tailwind's --font-sans theme token still resolves.
const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Engineered / stamped spots — status pills, mono labels, channel tags,
// dates, button text. Carries the design-system identity.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Connectyall: voice notes that connect y'all",
  description: "Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest. They get your details, you remember theirs.",
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Connectyall',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#7C5CFF',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-neutral-950 phone-frame-body">
        <div className="phone-frame flex flex-col flex-1 min-h-[100dvh]">
          {children}
        </div>
      </body>
    </html>
  );
}
