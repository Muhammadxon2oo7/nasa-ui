import { ArrowRight, Satellite } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-card)]" aria-hidden>
        <Satellite size={28} strokeWidth={1.6} />
      </span>
      <div>
        <p className="text-[13px] font-semibold tracking-wide text-[var(--fg-3)]">404</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Bu sahifa orbitada yo&apos;q</h1>
        <p className="mt-2 text-[15px] text-[var(--fg-2)]">Havola eskirgan yoki xato yozilgan. Dalangizni qaytadan tahlil qiling yoki tayyor demoni oching.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/analyze" className="press inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-fill)] px-5 py-2.5 text-[15px] font-semibold text-white">
          Dalani tahlil qilish <ArrowRight size={16} />
        </Link>
        <Link href="/demo" className="press inline-flex items-center rounded-full bg-[var(--surface)] px-5 py-2.5 text-[15px] font-semibold shadow-[var(--shadow-card)]">
          Demo
        </Link>
      </div>
    </div>
  );
}
