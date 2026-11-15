"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useT } from "@/i18n";

export function Footer() {
  const { t } = useT();
  return (
    <footer className="mt-16 border-t border-[var(--hairline)] px-4 py-8 text-[13px] text-[var(--fg-3)] sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("footer.data")}</span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={13} /> {t("footer.warn")}
        </span>
        <Link href="/about#sources" className="text-[var(--accent)] hover:underline">
          {t("nav.about")}
        </Link>
      </div>
    </footer>
  );
}
