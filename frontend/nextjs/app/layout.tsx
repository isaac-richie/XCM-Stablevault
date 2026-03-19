import "./globals.css";
import type { Metadata } from "next";
import { appConfig } from "../lib/config";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: `${appConfig.name} Frontend`,
  description:
    "Premium demo frontend for the XCM StableVault project on Polkadot Hub TestNet.",
  icons: {
    icon: "/Gemin.png",
    shortcut: "/Gemin.png",
    apple: "/Gemin.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
