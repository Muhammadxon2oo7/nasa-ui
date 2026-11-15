import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="text-[48px]" aria-hidden>
        🛰️
      </div>
      <h1 className="text-[24px] font-semibold">404 · Sahifa topilmadi</h1>
      <Link href="/" className="rounded-full bg-[var(--accent-fill)] px-5 py-2.5 font-semibold text-white">
        TerraVision
      </Link>
    </div>
  );
}
