import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Only the arrivals table uses it, so it should not compete with first paint.
  preload: false,
});

const description =
  "Flight waves, rides to the airport, venue dismissals and a surge forecast for rideshare drivers, built around wherever you drive.";

export const metadata: Metadata = {
  title: "RideSurge",
  description,
  applicationName: "RideSurge",
  appleWebApp: {
    capable: true,
    title: "RideSurge",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The build id lets a running copy of the app notice that a newer one has been published.
    <html lang="en" data-build={process.env.NEXT_PUBLIC_BUILD_ID} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
