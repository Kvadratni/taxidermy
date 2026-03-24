import type { Metadata } from "next";
import { Manrope, Work_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Taxidermy — Canadian Capital Gains Calculator",
  description:
    "Calculate adjusted cost base (ACB), detect superficial losses, and generate CRA Schedule 3 output for Canadian capital gains tax.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${workSans.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Prevent Dark Reader extension from injecting attributes (causes hydration mismatches) */}
        <meta name="darkreader-lock" />
      </head>
      <body className="min-h-full antialiased">
        {/* Apply theme class before paint to prevent flash of wrong theme */}
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t===null&&d))document.documentElement.classList.add('dark');}())`}</Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
