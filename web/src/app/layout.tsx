import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApplyForge — Job Application Automation",
  description: "Local-first job application pipeline — Quick Apply with ChatGPT bridge",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <Script id="clear-jobapp-bridge-signal" strategy="beforeInteractive">
          {`try{localStorage.removeItem('jobapp_pending_prompt_run')}catch(e){}`}
        </Script>
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-canvas text-on-surface min-h-screen w-full font-sans">
        {children}
      </body>
    </html>
  );
}
