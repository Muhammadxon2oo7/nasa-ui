"use client";

import { m } from "motion/react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listFields, saveFields, type SavedField } from "@/api/client";
import { num } from "@/lib/format";
import { useT } from "@/i18n";
import { useWizard } from "@/store/wizardStore";
import { Button, EmptyState, spring } from "@/components/ui";

export default function Fields() {
  const { t, lang } = useT();
  const router = useRouter();
  const wiz = useWizard();
  const [items, setItems] = useState<SavedField[]>([]);
  useEffect(() => setItems(listFields()), []); // eslint-disable-line react-hooks/set-state-in-effect -- read localStorage after mount
  const remove = (id: string) => {
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    saveFields(next);
  };
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <h1 className="mb-5 text-[clamp(28px,4.5vw,40px)] font-semibold tracking-[-0.03em]">{t("fields.title")}</h1>
      {items.length === 0 ? (
        <EmptyState icon="🌾" title={t("fields.empty")} text={t("fields.emptyd")} action={<Button className="mt-2" onClick={() => router.push("/analyze")}>{t("nav.analyze")}</Button>} />
      ) : (
        <div className="grid gap-2.5">
          {items.map((f, i) => (
            <m.div key={f.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.03 }} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <button type="button" onClick={() => router.push(`/result/${f.fieldId}`)} className="min-w-0 flex-1 text-left">
                <input
                  aria-label="name"
                  defaultValue={f.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const next = items.map((x) => (x.id === f.id ? { ...x, name: e.target.value || x.name } : x));
                    setItems(next);
                    saveFields(next);
                  }}
                  className="w-full bg-transparent text-[16px] font-semibold outline-none"
                />
                <span className="text-[13px] text-[var(--fg-3)] tnum">
                  {num(f.areaHa, 1)} {t("ha")} · {new Date(f.savedAt).toLocaleDateString(lang === "uz" ? "uz-UZ" : "en-US")}
                </span>
              </button>
              <Button size="sm" variant="secondary" onClick={() => { wiz.set({ polygon: f.polygon, step: 2 }); router.push("/analyze"); }}>
                <RefreshCw size={14} /> {t("fields.reanalyze")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(f.id)} ariaLabel={t("fields.delete")}>
                <Trash2 size={15} />
              </Button>
            </m.div>
          ))}
        </div>
      )}
    </div>
  );
}
