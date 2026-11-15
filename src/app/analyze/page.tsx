"use client";

import { AnimatePresence, m } from "motion/react";
import { useWizard } from "@/store/wizardStore";
import { useLang } from "@/i18n";
import { StepIndicator, Step1, Step2, Step3 } from "@/components/wizard/Steps";
import { spring } from "@/components/ui";

export default function Analyze() {
  const step = useWizard((s) => s.step);
  const set = useWizard((s) => s.set);
  const go = (s: 1 | 2 | 3) => {
    set({ step: s });
    scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
      <div className="mb-4 flex justify-center">
        <StepIndicator step={step} onGo={go} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring}>
          {step === 1 && (
            <Step1
              onNext={() => {
                // Warm the backend while the farmer answers step 2: the satellite part (GEE) is keyed
                // by the polygon and cached, so the real analysis in step 3 starts from a warm cache.
                const pg = useWizard.getState().polygon;
                if (pg) void import("@/api/fastapi").then((f) => f.prewarmFastApi(pg, useLang.getState().lang === "en" ? "en" : "uz")).catch(() => {});
                go(2);
              }}
            />
          )}
          {step === 2 && <Step2 onBack={() => go(1)} onRun={() => go(3)} />}
          {step === 3 && <Step3 onBack={() => go(2)} />}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
