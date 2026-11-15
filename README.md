# TerraVision

**Dehqon, chorvador, yer tanlovchi va mutaxassis uchun NASA ma'lumotlari asosidagi qaror qabul qilish platformasi.**
NASA Space Apps Challenge 2026 · *Field Shift: Adapting Farms with NASA Data*

> Dalangizni xaritada chizing. Biz NASA ma'lumotlari bilan uning tarixini o'qib, kamida 3 ta rotatsiya strategiyasini suv, tuproq, daromad va iqlim xavfi bo'yicha solishtirib beramiz va har birini nega tavsiya qilganimizni tushuntiramiz.

## Muammo

- O'zbekistonda **1.75 mln ga** sug'oriladigan yer sho'rlangan (O'zbekkosmos, 2025).
- Bug'doy o'rimidan keyin dala **2-3 oy bo'sh** turadi.
- Fermerlar uchun bepul, o'zbek tilidagi qaror qabul qilish vositasi yo'q.

## Nima qiladi

| Bo'lim | Nima beradi | Manba |
| --- | --- | --- |
| Dala tarixi | 2017-yildan beri har yili nima ekilgani, yozgi bo'sh davrlar | Sentinel-2 L2A NDVI (SCL maskasi) |
| Iqlim | Sovuq sanalari, 40°C+ kunlar trendi, yog'in, SPI-3, GDD | NASA POWER 2005-2025 |
| Tuproq | Sho'rlanish darajasi va trendi, tarkib, ildiz zonasi namligi, mos ekinlar | Sentinel-2 SI, SoilGrids, POWER GWETROOT, FAO-29 |
| Suv | Oylik sug'orish talabi m³/ga, noaniqlik oralig'i, sug'orish usuli | FAO-56, POWER + ERA5 ET0 ansambli |
| Strategiyalar | Hozirgi + 3 ta alternativa, R1-R8 qoidalari, ball, 5 qismli tushuntirish | Qoidalar + ballash (LLM emas) |
| Prognoz | 7 kun, 5 oylik mavsumiy ehtimollik, "Agar…?" simulyatsiyasi | Open-Meteo, ECMWF SEAS5 (delta usuli) |
| Xarita | MODIS NDVI, SMAP, IMERG, SRTM qatlamlari | NASA GIBS |
| 🐄 Yaylov holati | Joriy yil NDVI 20 yillik me'yorga nisbatan (%, persentil), qurg'oq yillar | MODIS MOD13Q1 2005-2026 |
| 🐄 Sig'im | Taxminiy shartli bosh/ga oralig'i va podangiz holati (yetarli / ehtiyot / ortiqcha) | MODIS MOD17A3HGF NPP |
| 🐄 Issiqlik stressi | THI ≥ 72 kunlar, trend, 7 kunlik prognoz | NASA POWER, Open-Meteo, NRC 1971 |
| 🐄 Suv manbalari | Eng yaqin doimiy va mavsumiy suv, yo'nalish | JRC Global Surface Water |
| 📍 Yer tanlash | 2-4 joyni maqsad bo'yicha solishtirish, eng mos joy va sababi | Barcha yuqoridagilar |
| 🔬 Mutaxassis rejimi | To'liq raqamlar, 🛡 barqarorlik, CSV / JSON / GeoJSON eksport | `/api/export/{id}` |

| 📅 Ish kalendari (B1, N2, N8) | "Bu hafta nima qilish kerak?", 3 oylik reja, sho'r yuvish hajmi va bosqichlari (FAO-29), tuproq haroratiga qarab ekish, muzlash ehtimoli, `.ics` | Open-Meteo, ERA5-Land |
| 💧 Haqiqiy iste'mol (A1) | Ekin ehtiyoji va Sentinel-2 bo'yicha haqiqiy iste'mol, bergan suvingiz kiritilsa samaradorlik | Sentinel-2, MODIS MOD16 (tekshiruv) |
| 🏔️ Suv ta'minoti signali (N1) | Tog'lardagi qor va yozgi daryo oqimi, bog'liqlik (r) ochiq ko'rsatiladi | MODIS MOD10A2, GloFAS |
| 🌍 FAO GAEZ (N9) | Hududga moslik va potensial hosil, yer tanlashda 20% vazn | FAO GAEZ v4 |
| 💰 Sof foyda (B2) | Fermer kiritgan hosil, narx va xarajat asosida, qurg'oqchil yil bilan | Maas-Hoffman, FAO-33 Ky |
| 📄 Yer pasporti (C1) | A4, QR-kod, PDF sifatida saqlash (`/passport/{id}`) | Barcha yuqoridagilar |
| 🗺️ GIBS (N12) | Haqiqiy rang, qor, yer harorati qatlamlari, Worldview havolasi | NASA GIBS |
| 🔁 Backtest (A6) | 4 dala × 3 yil: o'tmish ma'lumoti bilan tavsiya, keyingi yil haqiqiy ob-havosi bilan tekshiruv | `/about`, `/api/backtest` |
| Ўзбекча (B4) | Lotin · Кирилл · EN | Avtomatik transliteratsiya |
| ⭐ Qayta aloqa (C3) | Baho, hosil, rozilik (hozircha faqat qurilmada) | - |

Har bir sahifa **profil** (Kim siz?) va **Oddiy / Mutaxassis** rejimiga moslashadi. Ma'lumot yo'q yoki niqoblangan bo'lsa, ❓ va sababi ko'rsatiladi, hech qachon 0 emas.

## Backend (FastAPI)

Asosiy hisob jamoaning FastAPI backend'ida: https://github.com/Muhammadalixon-Qodirov/nasa_agro (`FRONTEND_UCHUN_API.md`).
Brauzer `/py/*` ga murojaat qiladi, Next.js uni `BACKEND_URL` ga uzatadi (CORS kerak emas).
Javob `src/api/fastapi.ts` adapteri orqali frontend shartnomasiga (`src/types/api.ts`) o'giriladi.
Backend ishlamasa, ichki Next.js hisobi (`src/server`) zaxira sifatida ishlaydi.

```bash
cp .env.example .env.local   # BACKEND_URL=http://agro-nasa-api.e-investment.uz
```

## Ishga tushirish

```bash
npm install
npm run dev            # http://localhost:3000
```

Kalitlar shart emas: barcha manbalar ochiq API. Demo dalalar (`/demo`) backend ishlamasa ham ochiladi.
Demo JSON'larni yangilash uchun dev server ishlab turganda: `node scripts/build-demo.mjs http://localhost:3000` (4 pilot dala chorvachilik moduli bilan + har bir maqsad uchun `compare-<goal>.json`).

Ma'lumot yig'ish skriptlari: `node scripts/build-water-supply.mjs` (N1, ~10 daqiqa) va `node scripts/build-gaez.mjs` (N9) → `data/ref/`.

API: `GET /api/calendar/{id}?format=json|ics`, `GET /api/passport/{id}`, `GET /api/backtest`, `POST /api/analyze`, `POST /api/whatif`, `POST /api/compare`, `GET /api/export/{fieldId}?format=csv|json|geojson`, `GET /api/crops`, `GET /api/models`, `GET /health`.

## Arxitektura

- **Next.js 16** (App Router, React 19, Tailwind 4, Motion, Leaflet + Geoman). UI premium-glass uslubida: Liquid Glass, spring animatsiyalar, zaif qurilmalar uchun adaptiv sifat darajasi.
- **Backend** shu loyiha ichida (`src/server`, `src/app/api`). API shartnomasi `src/types/api.ts` (FRONTEND_REJASI §5.2 bilan aynan bir xil), shuning uchun keyin FastAPI backend frontendni o'zgartirmasdan ulanadi (`NEXT_PUBLIC_API_URL`).
- Fayl kesh (`.cache/`): POWER 30 kun, Sentinel-2 30 kun, SEAS5 7 kun. Keshdagi tahlil ~0.5 s, yangi dala ~25-30 s.

## Rejadan farqlar (PRO_REJA'ga nisbatan)

| Rejada | Hozir | Sabab |
| --- | --- | --- |
| React + Vite, FastAPI | Next.js (frontend + backend) | Bitta deploy, skill talabi. API shartnomasi saqlangan |
| Google Earth Engine | Microsoft Planetary Computer (STAC + TiTiler statistikasi) | GEE service account kerak; PC kalitsiz va dala bo'yicha 1 s'da javob beradi |
| M1 Presto | NDVI fenologiya qoidalari (B0) | Remelgado ma'lumotlari va o'qitish hali qilinmagan |
| LLM tushuntirish | Shablon matn (raqamlar hisobdan) | Claude kaliti va raqam tekshiruvchi keyingi bosqich |
| SEAS5 ΔT POWER normasiga | ERA5 normasiga nisbatan anomaliya + POWER normasi (delta) | SEAS5 va POWER har xil balandlik va manba; to'g'ridan-to'g'ri solishtirish xato beradi |

## Cheklovlar

- Sho'rlanish chegaralari (SI 0.22 / 0.27) taxminiy, pilot dalalarda kalibrlanmagan (T7).
- Kc va ECe qiymatlari FAO-56 / FAO-29 asl jadvallari bilan qayta tekshirilishi kerak (T6).
- Paxta, makkajo'xori va sholi faqat NDVI bo'yicha ajralmaydi. Takroriy ekin turi aniqlanmaydi.
- Ekin narxlari ekspert bahosi. SEAS5 hindcast bilan tekshirilmagan (ishonch: past).
- Yaylov sig'imi o'rtacha koeffitsientlarga tayanadi (oraliq ko'rsatiladi). JRC suv qatlami 2020 gacha.
- GPS bo'yinbog' (M4) va M1 kalibrlash hali qilinmagan.
- Qilinmagan: A2 rasmiy me'yorlar (ma'lumot yig'ilmagan, ❓), N4 OpenET va WaPOR (GEE kerak), N5 ECOSTRESS (Earthdata login kerak), B3 Telegram, B5, B6, C2, A3, A5.
- Tekshiruv: ET0 ERA5 (Open-Meteo) bilan yillik farq 6-10% (KPI ≤ 15% ✓).

## Litsenziyalar va atributsiya

NASA POWER, GIBS, SRTM (NASA, ochiq) · Sentinel-2 (Copernicus, ochiq) · SoilGrids (CC BY 4.0) · MODIS MOD13Q1 / MOD17A3HGF (NASA LP DAAC, ochiq) · JRC GSW (CC BY 4.0) · Open-Meteo / ERA5 / SEAS5 (CC BY 4.0) · Esri World Imagery · OpenStreetMap / Nominatim (ODbL).
