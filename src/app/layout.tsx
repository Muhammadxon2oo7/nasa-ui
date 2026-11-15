import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Onest } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

// Onest: a humanist grotesk with full Latin-Extended (o‘, g‘) and Cyrillic, so both Uzbek scripts look native
const onest = Onest({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "TerraVision - yeringizni NASA ma'lumotlari bilan ko'ring",
  description: "NASA Space Apps 2026 · Field Shift. Dalangizni chizing: NASA ma'lumotlari bilan 20 yillik iqlim, dala tarixi, sho'rlanish va suv hisobi asosida rotatsiya strategiyalarini solishtiring.",
  openGraph: { title: "TerraVision", description: "NASA ma'lumotlari bilan ekin almashlab ekish bo'yicha qaror qabul qilish vositasi", images: ["/brand/logo.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F0C" },
  ],
};

// pre-paint: theme + adaptive glass tier (lib/perf.ts)
const BOOT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('fs:theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;
var q=new URLSearchParams(location.search).get('perf');var p='high';
if(q==='low'||q==='high'){p=q}else{var s=JSON.parse(localStorage.getItem('fs:perf')||'null');if(s&&s.p==='low'&&Date.now()-s.t<6048e5){p='low'}else{var n=navigator,apple=/Mac|iPhone|iPad/.test(n.platform||n.userAgent);if((n.deviceMemory&&n.deviceMemory<=4)||(!apple&&n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(n.connection&&n.connection.saveData)){p='low'}}}
d.dataset.perf=p;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <Suspense fallback={null}>
            <Header />
          </Suspense>
          <main className="min-h-[70dvh] pt-[calc(76px+env(safe-area-inset-top))]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
