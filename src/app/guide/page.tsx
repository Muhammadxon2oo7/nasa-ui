"use client";

import { clsx } from "clsx";
import { ArrowRight, BookOpen, CalendarDays, Droplet, Earth, FlaskConical, Layers, MapPinned, MousePointerClick, ScanSearch, Settings2, Sprout, Users, Wheat } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/i18n";

type Lx = { uz: string; en: string };
type Section = { id: string; icon: typeof BookOpen; title: Lx; what: Lx; steps: Lx[]; img: string; link?: { href: string; label: Lx } };

/**
 * In-app user guide. Text follows the interface language (Uzbek Latin/Cyrillic via the site-wide
 * transliteration layer, English), and so do the screenshots: public/guide/{en|uz|cyrl}/NN.jpg (next/image serves AVIF/WebP at the right width).
 * The red frame in each screenshot marks the part the section talks about.
 */
const SECTIONS: Section[] = [
  {
    id: "start", icon: Users, img: "01",
    title: { uz: "Boshlash: kim siz?", en: "Start: who are you?" },
    what: { uz: "Bosh sahifada o'zingizga mos rolni tanlang. Sayt shu rolga qarab kerakli bo'limni ochadi.", en: "On the home page, pick the role that fits you. The site opens the right section for it." },
    steps: [
      { uz: "Dehqon: \"Nima ekay?\" - dala uchun ekin rejasi.", en: "Farmer: \"What to grow?\" - a crop plan for your field." },
      { uz: "Chorvador: yaylov holati, sig'imi va issiqlik xavfi.", en: "Herder: pasture condition, capacity and heat risk." },
      { uz: "Yer tanlovchi: bir nechta joyni solishtirish.", en: "Land seeker: compare several places." },
      { uz: "Mutaxassis: barcha tafsilotlar ochiq holda.", en: "Expert: every detail open." },
    ],
    link: { href: "/", label: { uz: "Bosh sahifa", en: "Home page" } },
  },
  {
    id: "header", icon: Settings2, img: "00",
    title: { uz: "Til, rejim va ko'rinish", en: "Language, mode and theme" },
    what: { uz: "Yuqori o'ng burchakdagi tugmalar butun sayt uchun ishlaydi.", en: "The buttons in the top-right corner work across the whole site." },
    steps: [
      { uz: "UZ → ЎЗ → EN: tilni almashtiradi (lotin, kirill, ingliz). Qo'llanma ham shu tilda ochiladi.", en: "UZ → ЎЗ → EN: switches the language (Latin, Cyrillic, English). This guide follows it." },
      { uz: "Oddiy / Mutaxassis: mutaxassis rejimida barcha yashirin bo'limlar ochiq turadi.", en: "Simple / Expert: in expert mode every collapsed section is open." },
      { uz: "Quyosh/oy belgisi: yorug' yoki qorong'i ko'rinish.", en: "Sun/moon icon: light or dark theme." },
      { uz: "Rol belgisi: rolingizni istalgan vaqtda o'zgartirasiz.", en: "Role icon: change your role at any time." },
    ],
  },
  {
    id: "field", icon: MapPinned, img: "02",
    title: { uz: "1-qadam: dalani belgilang", en: "Step 1: mark your field" },
    what: { uz: "Tahlil sahifasida dalangizni xaritada ko'rsating. Bu eng muhim qadam: barcha hisob shu chegara bo'yicha qilinadi.", en: "On the Analyze page, show your field on the map. Everything is calculated inside this boundary." },
    steps: [
      { uz: "\"Chizish\": dala burchaklarini birma-bir bosing, birinchi nuqtaga qaytsangiz chegara yopiladi.", en: "\"Draw\": tap the field corners one by one; tapping the first point closes the boundary." },
      { uz: "\"Nuqta\": dala markazini bosing, atrofida maydon belgilanadi.", en: "\"Point\": tap the centre of the field and an area is marked around it." },
      { uz: "\"Joylashuvim\" yoki viloyat ro'yxati: xaritani tez topish uchun.", en: "\"My location\" or the region list: to find your area quickly." },
      { uz: "Yoki o'ngdagi demo dalalardan birini tanlang.", en: "Or pick one of the demo fields on the right." },
    ],
    link: { href: "/analyze", label: { uz: "Tahlilni boshlash", en: "Start an analysis" } },
  },
  {
    id: "questions", icon: MousePointerClick, img: "02b",
    title: { uz: "2-qadam: bir nechta savol", en: "Step 2: a few questions" },
    what: { uz: "Dalangiz haqida bilganingizni kiriting. Bilmasangiz, sun'iy yo'ldosh o'zi aniqlaydi.", en: "Tell us what you know about the field. If you don't know, the satellite works it out." },
    steps: [
      { uz: "Hozirgi rotatsiya: oxirgi 3 yilda nima ekilgan. \"Bilmayman\" desangiz, sun'iy yo'ldoshdan olinadi.", en: "Current rotation: what grew in the last 3 years. Choose \"I don't know\" and the satellite fills it in." },
      { uz: "Nima muhim: 3 tagacha ustuvorlik tanlang, birinchi bosilgani eng muhim hisoblanadi.", en: "What matters: pick up to 3 priorities; the first one you tap counts most." },
      { uz: "Suv: ta'minot darajasi va sug'orish usuli (egat, tomchilatib, yomg'irlatib).", en: "Water: how much you get and how you irrigate (furrow, drip, sprinkler)." },
      { uz: "\"Tahlil qilish\": birinchi javob 2-4 soniyada chiqadi.", en: "\"Analyze\": the first answer appears in 2-4 seconds." },
    ],
  },
  {
    id: "answer", icon: Sprout, img: "03",
    title: { uz: "Natija: asosiy javob va 3D dala", en: "Result: the answer and the 3D field" },
    what: { uz: "Natija sahifasining yuqori qismi bitta savolga javob beradi: dalaga nima ekish kerak va nima uchun.", en: "The top of the result page answers one question: what to grow on this field, and why." },
    steps: [
      { uz: "O'ngda: tavsiya etilgan rotatsiya, 100 ballik baho va hozirgi rotatsiyangiz bilan solishtirish.", en: "Right: the recommended rotation, its score out of 100 and how it compares with what you grow today." },
      { uz: "\"Qurg'oqchil yilda ham ... ball\": reja yomon yilda ham ishlashini ko'rsatadi.", en: "\"Still ... in a dry year\": shows the plan holds up in a bad year." },
      { uz: "Chapda 3D dala: A-D variantni tanlang, Ekinlar / Suv / Sho'r ko'rinishini almashtiring, ▶ bilan 3 yilni oyma-oy ko'ring.", en: "Left, the 3D field: pick plan A-D, switch Crops / Water / Salt, press ▶ to play the 3 years month by month." },
    ],
    link: { href: "/result/demo-sirdaryo", label: { uz: "Namuna natijani ochish", en: "Open a sample result" } },
  },
  {
    id: "plan", icon: Wheat, img: "04",
    title: { uz: "\"Nima ekay?\" - variantlarni solishtirish", en: "\"What to grow?\" - compare the options" },
    what: { uz: "Hozirgi rotatsiya (A) va kamida uchta muqobil variant yonma-yon turadi.", en: "Your current rotation (A) sits next to at least three alternatives." },
    steps: [
      { uz: "Har bir kartada: ball, suv, sho'rga moslik, tuproq va taxminiy tushum.", en: "Each card shows score, water, salt tolerance, soil and estimated revenue." },
      { uz: "\"Batafsil\": nega tavsiya qilingani, dalillar, foyda, ma'lumot bo'shliqlari va xavflar.", en: "\"Details\": why it is suggested, evidence, benefits, data gaps and risks." },
      { uz: "\"Ustuvorliklarni o'zgartirish\": nima muhimligini o'zgartirsangiz, ballar darhol qayta hisoblanadi.", en: "\"Change priorities\": change what matters and the scores update at once." },
    ],
  },
  {
    id: "whatif", icon: ScanSearch, img: "05",
    title: { uz: "\"Agar yil boshqacha kelsa?\"", en: "\"What if the year is different?\"" },
    what: { uz: "Ob-havo o'zgarsa tavsiya qanday o'zgarishini sinab ko'ring.", en: "Try how the advice changes if the weather changes." },
    steps: [
      { uz: "Harorat va yog'in slayderlarini suring yoki \"Qurg'oqchilik\", \"Issiq yil\" tugmalarini bosing.", en: "Move the temperature and rain sliders, or press \"Drought\" or \"Hot year\"." },
      { uz: "Variantlar tartibi va suv ehtiyoji qayta hisoblanadi.", en: "The ranking and the water need are recalculated." },
    ],
  },
  {
    id: "water", icon: Droplet, img: "06",
    title: { uz: "\"Qancha suv?\"", en: "\"How much water?\"" },
    what: { uz: "Har bir variantning yillik suv ehtiyoji, sug'orish jadvali va rasmiy me'yorlar bilan solishtirish.", en: "Yearly water need for each plan, an irrigation schedule and a check against official norms." },
    steps: [
      { uz: "Yuqoridagi idishlar: variantlarning suv ehtiyoji bir qarashda.", en: "The tanks at the top: every plan's water need at a glance." },
      { uz: "Me'yor shkalasi: yo'lak - rasmiy oraliq, nuqta - bizning hisob.", en: "Norms scale: the band is the official range, the dot is our calculation." },
      { uz: "Suv zaxirasi (GRACE): hududda yillar davomida suv kamayayotganini ko'rsatadi.", en: "Water storage (GRACE): shows how water has declined in the region over the years." },
    ],
  },
  {
    id: "zones", icon: Layers, img: "08",
    title: { uz: "\"Dalam qanday?\" - dala ichidagi zonalar", en: "\"How is my field?\" - zones inside the field" },
    what: { uz: "Dalaning qaysi qismida muammo borligini 30 metrli piksellar bo'yicha ko'rsatadi.", en: "Shows which part of the field has a problem, at 30-metre pixels." },
    steps: [
      { uz: "Rangli zonalar: sust o'sish, suv stressi, sho'rlanish, eroziya.", en: "Coloured zones: low vigour, water stress, salinity, erosion." },
      { uz: "Zonani bosing: sababi va nima qilish kerakligi chiqadi.", en: "Tap a zone to see why and what to do." },
      { uz: "Pastda: 30 m sun'iy yo'ldosh suratlari, tuproq, dala tarixi va 20 yillik iqlim.", en: "Below: 30 m satellite images, soil, field history and 20-year climate." },
    ],
  },
  {
    id: "calendar", icon: CalendarDays, img: "09",
    title: { uz: "\"Qachon nima qilay?\"", en: "\"What to do when?\"" },
    what: { uz: "Tavsiya etilgan reja bo'yicha ish kalendari va ob-havo xavflari.", en: "A work calendar for the recommended plan, with weather risks." },
    steps: [
      { uz: "Oylar lentasi: qachon ekish, sug'orish va o'rish.", en: "Month strip: when to sow, irrigate and harvest." },
      { uz: "Ekish vaqti: tuproq harorati va sovuqqa qarab.", en: "Sowing time: based on soil temperature and frost." },
      { uz: "\"Ekin qachon zaif bo'ladi?\": jazirama va sovuq xavfi oylar bo'yicha.", en: "\"When is each crop vulnerable?\": heat and frost risk by month." },
      { uz: "\"Kalendarga qo'shish\": rejani telefon kalendariga yuklab oling.", en: "\"Add to calendar\": download the plan to your phone calendar." },
    ],
  },
  {
    id: "livestock", icon: Earth, img: "10",
    title: { uz: "Chorvachilik moduli", en: "Livestock module" },
    what: { uz: "Natija sahifasining yuqorisida \"Chorvachilik\" ni tanlang: o'sha yer yaylov sifatida baholanadi.", en: "Choose \"Livestock\" at the top of the result page: the same land is assessed as pasture." },
    steps: [
      { uz: "Yaylov holati: 20 yillik me'yorga nisbatan ko'kligi.", en: "Pasture condition: greenness against the 20-year norm." },
      { uz: "Sig'im: necha bosh mol boqish mumkin.", en: "Capacity: how many animals it can carry." },
      { uz: "Issiqlik stressi va eng yaqin suv manbai.", en: "Heat stress for the herd and the nearest water." },
    ],
    link: { href: "/result/demo-jizzax?module=livestock&tab=pasture", label: { uz: "Namuna yaylovni ochish", en: "Open a sample pasture" } },
  },
  {
    id: "compare", icon: FlaskConical, img: "11",
    title: { uz: "Solishtirish: qaysi yer yaxshiroq?", en: "Compare: which land is better?" },
    what: { uz: "2-4 ta joyni bitta maqsad bo'yicha solishtiring: bug'doy, paxta, beda, yaylov yoki umumiy.", en: "Compare 2-4 places for one goal: wheat, cotton, alfalfa, pasture or general." },
    steps: [
      { uz: "Xaritani bosing (200 m maydon qo'shiladi) yoki \"Chegara chizish\" bilan aniq chizing.", en: "Tap the map (adds a 200 m plot) or use \"Draw boundary\" for an exact shape." },
      { uz: "Maqsadni tanlang va \"Solishtirish\" ni bosing. Natija ko'pincha darhol chiqadi.", en: "Pick the goal and press \"Compare\". The result is usually there at once." },
      { uz: "Jadvalda eng mos joy belgilanadi, har bir qatorda sababi bilan.", en: "The table marks the best place, with the reason in every row." },
    ],
    link: { href: "/compare", label: { uz: "Solishtirishni ochish", en: "Open Compare" } },
  },
  {
    id: "method", icon: BookOpen, img: "12",
    title: { uz: "Metodologiya", en: "Methodology" },
    what: { uz: "Qaysi NASA ma'lumoti qaysi raqam uchun ishlatilgani, formulalar va tekshiruvlar.", en: "Which NASA dataset feeds which number, the formulas and how we validate them." },
    steps: [
      { uz: "Har bir raqam yonidagi kichik belgi uning manbasini ko'rsatadi.", en: "The small badge next to every number names its source." },
      { uz: "Tavsiya - maslahat. Yakuniy qarorni siz va agronom qabul qilasiz.", en: "Advice only. You and your agronomist make the final decision." },
    ],
    link: { href: "/about", label: { uz: "Metodologiyani ochish", en: "Open Methodology" } },
  },
];

export default function GuidePage() {
  const { lang } = useT();
  const script = useLang((s) => s.script);
  const L = (x: Lx) => (lang === "en" ? x.en : x.uz);
  const dir = lang === "en" ? "en" : script === "cyrl" ? "cyrl" : "uz";
  const [active, setActive] = useState(SECTIONS[0].id);

  // highlight the section being read in the table of contents
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-35% 0px -60% 0px" });
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <header className="pt-4 pb-6 sm:pt-8">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]"><BookOpen size={15} /> {lang === "en" ? "User guide" : "Foydalanish qo'llanmasi"}</p>
        <h1 className="mt-1 text-[clamp(28px,4.4vw,42px)] font-semibold tracking-[-0.03em] text-balance">{lang === "en" ? "How to use TerraVision" : "TerraVision'dan qanday foydalanish"}</h1>
        <p className="mt-2 max-w-[62ch] text-[16px] text-[var(--fg-2)]">
          {lang === "en"
            ? "Thirteen short sections, in the order you will meet them. The red frame in each picture shows exactly where to look."
            : "O'n uchta qisqa bo'lim, saytda qanday tartibda uchrasa shu tartibda. Har bir rasmdagi qizil ramka aynan qayerga qarash kerakligini ko'rsatadi."}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={lang === "en" ? "Guide sections" : "Qo'llanma bo'limlari"} className="hidden lg:block">
          <ol className="sticky top-[96px] grid min-w-0 gap-0.5">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined} className={clsx("flex min-w-0 items-start gap-2 rounded-xl px-2.5 py-1.5 text-[13.5px] leading-snug transition-colors", active === s.id ? "bg-[var(--surface)] font-semibold text-[var(--fg)] shadow-[var(--shadow-card)]" : "text-[var(--fg-2)] hover:text-[var(--fg)]")}>
                  <span className="w-5 shrink-0 pt-px text-right text-[12px] text-[var(--fg-3)] tnum">{i + 1}</span>
                  <span className="min-w-0 break-words">{L(s.title)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid gap-6">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-[96px] overflow-hidden rounded-[24px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
              <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] xl:items-start">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><s.icon size={18} strokeWidth={1.8} /></span>
                    <span className="text-[12.5px] font-semibold text-[var(--fg-3)] tnum">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h2 className="mt-3 text-[21px] leading-tight font-semibold tracking-[-0.02em]">{L(s.title)}</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--fg-2)]">{L(s.what)}</p>
                  <ol className="mt-4 grid gap-2">
                    {s.steps.map((st, k) => (
                      <li key={k} className="flex gap-2.5 text-[14.5px] leading-snug">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--fg-2)] tnum">{k + 1}</span>
                        <span>{L(st)}</span>
                      </li>
                    ))}
                  </ol>
                  {s.link && (
                    <Link href={s.link.href} className="press mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-fill)] px-4 py-2 text-[14px] font-semibold text-white">
                      {L(s.link.label)} <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
                <figure className="overflow-hidden rounded-[16px] bg-[var(--surface-2)] ring-1 ring-[var(--hairline)]">
                  <Image src={`/guide/${dir}/${s.img}.jpg`} alt={L(s.title)} width={1400} height={875} sizes="(min-width: 1280px) 640px, (min-width: 1024px) 60vw, 100vw" priority={i < 2} className="block aspect-[16/10] h-auto w-full object-cover object-top" />
                </figure>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
