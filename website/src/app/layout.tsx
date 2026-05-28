import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leap — A fun challenge every day",
  description:
    "Take the leap with your community. One daily challenge at 12:00PM ET, no edits, and a feed of people who showed up alongside you.",
  icons: {
    icon: "/brandmark.png",
    apple: "/brandmark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
