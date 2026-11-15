# TerraVision backend: nimani tuzatish va nimani qo'shish kerak

Frontend tomonidan tayyorlangan ro'yxat. Asos: `nasa_agro` repo (oxirgi commit `707d9c5`), jonli API `agro-nasa-api.e-investment.uz` bilan sinovlar va Space Apps 2026 "Field Shift" challenge matni.

Har bir bandda: **muammo**, **qayerda** (fayl), **nima qilish kerak**, **tayyor deb hisoblash mezoni**. Tartib muhimlik bo'yicha: P0 hakamlar ko'rishidan oldin, P1 kuchli ustunlik beradi, P2 vaqt bo'lsa.

Frontend hozir hamma joyda zaxira yo'l (fallback) ishlatadi: backend xato qilsa, foydalanuvchi baribir natija ko'radi. Lekin hakam "jonli backend" ni ko'rishi kerak, shuning uchun P0 bandlari muhim.

---

## P0. Hakamlar ko'rishidan oldin

### 1. Birinchi tahlil 502 qaytaradi (nginx timeout)

- **Muammo.** Keshlanmagan dala uchun `/api/analyze` 60 soniyadan ko'p ishlaydi (GEE: Sentinel-2 NDVI 2018-2025, SMAP, SoilGrids, MODIS). nginx ulanishni 60 soniyada uzadi va 502/504 qaytaradi. Frontend 4 soniyadan keyin bir marta qayta urinadi, keyin ichki zaxira hisobga o'tadi.
- **Qayerda.** `app/api/analyze.py::post_analyze` sinxron, `app/orchestrator.py::analyze` barcha GEE so'rovlarini ketma-ket bajaradi.
- **Nima qilish kerak (ikki bosqich).**
  1. Darhol: nginx'da `proxy_read_timeout 180s; proxy_send_timeout 180s;` (`/api/` location uchun).
  2. To'g'ri yechim: asinxron ish (job).
     ```
     POST /api/analyze            -> 202 {"jobId": "...", "fieldId": "f-..."}   (keshda bo'lsa 200 + to'liq javob)
     GET  /api/jobs/{jobId}       -> {"status": "running", "stage": "history", "progress": 0.45}
                                  -> {"status": "done", "result": {...}}
                                  -> {"status": "error", "code": "...", "message": {...}}
     ```
     Bosqich nomlari: `climate`, `history`, `soil`, `water`, `strategies`, `forecast`. Frontend'dagi yuklanish ekrani aynan shu bosqichlarni ko'rsatadi: hozir ular taxmin bilan, keyin haqiqiy bo'ladi.
  3. GEE so'rovlarini parallel qilish: `history`, `soil`, `snow` bir-biriga bog'liq emas, `concurrent.futures.ThreadPoolExecutor(max_workers=4)` bilan 2-3 marta tezlashadi.
- **Mezon.** Yangi dala uchun 502 yo'q. Frontend 2 soniyada `jobId` oladi va progressni ko'rsatadi.

### 2. Server ichki ma'lumotlari foydalanuvchiga chiqib qolyapti

- **Muammo.** `degraded[].reason` ichida xom exception matni bor: `f"Sun'iy yo'ldosh ma'lumotini olib bo'lmadi: {e}"`. GEE va httpx xatolarida URL, loyiha ID, token yoki fayl yo'li chiqishi mumkin. Jonli javobda hozir `"AI tushuntirish o'chirilgan (ANTHROPIC_API_KEY yo'q)"` turibdi. Muhit o'zgaruvchisining nomi hakam ekranida chiqdi; frontend buni endi filtrlaydi, lekin manbada tuzatish kerak.
- **Qayerda.** `app/orchestrator.py` 126-222-qatorlar, `app/api/compare.py::_place_facts`.
- **Nima qilish kerak.**
  - `reason` faqat foydalanuvchiga tushunarli matn bo'lsin: `{"part": "history", "code": "gee_timeout", "reason": "Sun'iy yo'ldosh ma'lumoti vaqtincha olinmadi"}`.
  - Xom xato faqat `logger.exception(...)` ga yozilsin.
  - `explanation` uchun `degraded` yozuvi umuman kerak emas: shablon tushuntirish ma'lumot yetishmasligi emas.
  - Javob matnlariga hech qachon env nomlari, URL va stack yozilmasin.
- **Mezon.** `grep -rn '{e}' app/orchestrator.py app/api` faqat log qatorlarini topadi.

### 3. `/api/compare` keshlanmagan joylar uchun 500 qaytaradi

- **Muammo.** `post_compare` faqat `httpx.HTTPError` ni ushlaydi. GEE (`ee.EEException`), `KeyError` yoki `ValueError` xatolari 500 ga aylanadi va butun taqqoslash yiqiladi.
- **Nima qilish kerak.** Har bir joyni alohida `try` ichida hisoblash. Bitta joy yiqilsa, qolganlari baribir qaytsin, yiqilgan joy uchun `{"name": ..., "error": {"code": ..., "reason": ...}}` bo'lsin. Joylarni parallel hisoblash ham kerak (4 joy x 30 soniya = 2 daqiqa, timeout).
- **Mezon.** 4 ta tasodifiy nuqta bilan compare har doim 200 qaytaradi.

### 4. Yer pasporti 1 kundan keyin yo'qoladi va boshqa qurilmada ochilmaydi

- **Muammo.**
  - `GET /api/passport/{field_id}` ma'lumotni diskcache'dan oladi (`expire=DAY`), server qayta ishga tushsa yoki kesh tozalansa 404 bo'ladi.
  - QR-koddagi `onlineUrl` (`/passport/f-xxx`) boshqa telefonda ochilganda frontend tahlilni topa olmaydi, chunki tahlil faqat birinchi brauzerning localStorage'ida.
  - `passportNo` `field_id[-6:]` dan olinadi, bu to'qnashuvga moyil.
- **Nima qilish kerak.**
  - Tahlillarni doimiy saqlash: SQLite (`analyses(field_id PK, created_at, request_json, result_json)`) yetadi.
  - `GET /api/analysis/{field_id}` qo'shish: to'liq `/api/analyze` javobini qaytaradi.
  - `passportNo` uchun `sha256(field_id + created_at)` ning 8 belgisi yoki ketma-ket raqam.
- **Mezon.** QR-kodni boshqa telefonda skanerlasa, pasport to'liq ochiladi, ertasi kuni ham.

### 5. "Nega tavsiya qilindi" matni hech narsa demaydi

- **Muammo.** `app/core/recommend.py::_explain` oxirida `why = f"{strategy.name}. Ekinlar: {names}."` turibdi. Hakam tavsiya kartasini ochganda "Bug'doy + oq jo'xori (har yili). Ekinlar: Kuzgi bug'doy, Oq jo'xori." ni o'qiydi, ya'ni nom ikki marta. Challenge esa aynan "why it was suggested" ni so'raydi.
- **Nima qilish kerak (LLM'siz, deterministik).** `why` ni raqamlar bilan, hozirgi rotatsiyaga nisbatan 2-3 gapdan quring:
  ```
  "Hozirgi paxta monokulturasiga qaraganda yiliga ~2 100 m³/ga kam suv talab qiladi va
   sho'rligi 6 dS/m bo'lgan dalangizga barcha ekinlari chidamli. Kuzgi bug'doydan keyin
   oq jo'xori yozgi bo'sh davrni (o'rtacha 74 kun) yopadi."
  ```
  Formula: eng katta 2 ta ijobiy farq (suv, sho'r, bo'sh kunlar, tushum, tuproq) va 1 ta asosiy shart. Barcha raqamlar `ev` va `ctx` da allaqachon bor.
- **LLM ulansa.** `generatedBy: "llm"`, lekin raqamlarni LLM o'zgartirmasin: raqamlar shablondan, LLM faqat jumla tuzadi. Kalit bo'lmasa `degraded` ga yozilmasin.
- **Mezon.** 4 ta strategiyaning `why` matni bir-biridan farq qiladi va kamida 2 ta raqam bor.

### 6. Matn uslubi (frontend hozir buni o'zi tozalaydi, lekin manbada to'g'ri bo'lsin)

- Uzun chiziq `—` va `–` o'rniga oddiy `-`.
- Javob matnlarida emoji yo'q (`"🐄 Qishki yem..."`, `"taxmin 🔎"`). Ikonkani frontend `type` maydonidan chizadi (`calendar[].type`, `part`). Hujjatdagi "❓ + sabab" talabi ham shunga kiradi: `null` + `reason` yuborilsin, ikonkani UI qo'yadi.
- Chorvachilik vazifalari (`type: "livestock"`) faqat `modules` ichida `livestock` bo'lsa qo'shilsin. Hozir dehqonchilik kalendarida "Qishki yem zaxirasini tekshiring" chiqyapti.

---

## P1. Challenge talablarini to'liq yopish (hakamlar shu ro'yxat bilan baholaydi)

Challenge nomma-nom sanagan NASA ma'lumotlari: **SMAP, ECOSTRESS, GPM, Landsat, MODIS, NASA POWER, GRACE/GRACE-FO, SRTM**. Hozir backend: POWER, SMAP L4, MODIS (NDVI, NPP, snow, ET), SRTM, Sentinel-2. Yo'q: **GRACE, GPM IMERG, Landsat, ECOSTRESS**. Hammasi GEE katalogida tayyor.

| # | Nima | GEE kolleksiya | Nima beradi | Javobga qayerga |
|---|---|---|---|---|
| 7 | **GRACE/GRACE-FO suv zaxirasi trendi** | `NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI` (`lwe_thickness`) | Dala atrofidagi (mascon) yer osti va yer usti suvi 2002-2024, sm/yil trend | `water.storage = {"trendCmPerYear": -1.4, "series": [{"year":2003,"cm":..}], "source": "GRACE/GRACE-FO JPL Mascon"}` |
| 8 | **GPM IMERG kuchli yog'in** | `NASA/GPM_L3/IMERG_V07` (`precipitation`) | Yiliga >20 mm/kun kunlar soni, trend, eroziya xavfi (R-faktor proksi) | `climate.extremeRain = {"daysPerYear": 3.1, "trendPerDecade": 0.4}` va qiyalik bilan `erosionRisk` |
| 9 | **Landsat / HLS bilan uzun dala tarixi** | `NASA/HLS/HLSL30/v002`, `NASA/HLS/HLSS30/v002` (yoki `LANDSAT/LC08/C02/T1_L2`) | Sentinel-2 2017 dan boshlanadi, Landsat 2013 dan: 3-4 yil ko'proq rotatsiya tarixi, bo'sh davrlar | `history.seasons` 2013 dan, `history.sources` da sensor nomi |
| 10 | **ECOSTRESS issiqlik stressi** | GEE'da to'liq emas; AppEEARS API (`ECO_L2T_LSTE`, `ECO_L3T_JET`) | 70 m LST va ET: dala ichidagi issiq nuqtalar, ESI (Evaporative Stress Index) | `heatStress.ecostress = {"lstP90C": 41.2, "esi": 0.62, "scenes": 14}` |
| 11 | **SMAP anomaliya** (hozir faqat o'rtacha) | `NASA/SMAP/SPL4SMGP/008` | Shu oyning namligi 2015-2024 o'rtachasidan qancha farq qiladi: challenge "soil moisture anomalies" ni so'raydi | `soil.moistureAnomaly = {"month": "2026-10", "zScore": -1.3}` |
| 12 | **Haqiqiy ET: FAO WaPOR v3** | `FAO/WAPOR/3/L1_AETI_D` (300 m, 10 kunlik) | MODIS 500 m dan aniqroq haqiqiy suv sarfi (A1 tekshiruvi) | `water.actual.checks[]` ga `source: "wapor"` |

Frontend bularni qo'shganingiz zahoti ko'rsatishga tayyor: GRACE xaritada allaqachon bor (Kosmosdan -> Suv zaxirasi), unga dala bo'yicha raqamli trend qo'shiladi.

### 13. Sho'rlanishni avtomatik aniqlash

- **Muammo.** `SALINITY_PENDING`: sho'rlanish foydalanuvchi javobidan olinadi va har bir javobda `degraded` turadi. Sirdaryo va Xorazm uchun bu asosiy omil.
- **Nima qilish kerak.**
  - Sentinel-2 yoki Landsat bo'yicha ko'p yillik indeks (SI = sqrt(B * R), NDSI, kuz-qish yalang'och tuproqda).
  - Kalibrovka uchun ochiq nuqtalar: SoilGrids yoki Ozbekgidrogeologiya xaritasi, mavjud bo'lsa 10-20 ta lab natijasi.
  - Javob: `soil.salinity = {"level": "medium", "eceEstDsM": 5.8, "confidence": "low", "method": "S2 SI, 2019-2025 bare-soil composite"}`. `confidence` past bo'lsa ham foydalanuvchi javobidan yaxshiroq.

### 14. Noaniqlik

- Challenge "how the model interprets uncertainty" ni so'raydi. `robustness` (odatiy, qurg'oqchil, issiq yil) bor, bu yaxshi. Qo'shimcha:
  - `water.grossM3PerHa` uchun `p10/p50/p90` (20 yillik ETo tarqalishi): hozir faqat `low`/`high`;
  - har bir `metrics` uchun `confidence` (`high`/`medium`/`low`).

### 15. Mehnat ko'rsatkichi (`metrics.labor = null`)

- Ekin bo'yicha odam-kun/ga jadvali (FAO yoki mahalliy texnologik xaritalar) bilan oddiy baho. Xavfli emas, lekin ballar formulasidagi bo'shliq yopiladi.

---

## P2. Sifat va xavfsizlik

16. **CORS default** `http://localhost:5173`. Prod'da `CORS_ORIGINS=https://nasa-ui.e-investment.uz` bo'lsin (frontend `/py` proxy orqali ishlaydi, lekin to'g'ridan-to'g'ri chaqiruvlar uchun kerak).
17. **Rate limit.** `/api/analyze` va `/api/compare` GEE kvotasini yeydi. IP bo'yicha `slowapi` (masalan 10/min).
18. **Kirish validatsiyasi.**
    - Poligon maydoni chegarasi: masalan 0.1-5 000 ga.
    - O'zbekiston bbox tekshiruvi.
    - O'z-o'zini kesuvchi poligon uchun aniq 422 matni: `{"code": "polygon_self_intersection", "message": {"uz": "...", "en": "..."}}`.
    - Hozir xato matnlari faqat o'zbekcha va strukturasiz.
19. **Xato formati.** Barcha 4xx/5xx: `{"code": str, "message": {"uz": str, "en": str}}`. Frontend `code` bo'yicha to'g'ri xabar ko'rsatadi.
20. **Kesh kaliti.** `("analyze", field_id, today)`: har kuni yangidan GEE. Iqlim va tarix uchun kesh kaliti `today` siz bo'lsin (ular kunlik o'zgarmaydi), faqat `forecast` va `calendar` kunlik.
21. **Sog'liq tekshiruvi.** `/health` GEE, POWER va Open-Meteo holatini ham qaytarsin (`{"gee": "ok", "power": "ok", "latencyMs": {...}}`): demo oldidan bir qarashda ko'rinadi.
22. **Testlar.** `test_power_live.py` tarmoqqa bog'liq: CI'da `pytest -m "not live"`. Yangi kodlar (GRACE, IMERG) uchun ham shu.

---

## Frontend nimani kutadi (qisqa shartnoma)

```jsonc
// /api/analyze (yoki /api/jobs/{id} -> result)
{
  "fieldId": "f-...",
  "degraded": [{"part": "history", "code": "gee_timeout", "reason": "Foydalanuvchi uchun matn"}],
  "water": {
    "storage": {"trendCmPerYear": -1.4, "series": [{"year": 2003, "cm": 2.1}], "source": "GRACE/GRACE-FO"}
  },
  "climate": {"extremeRain": {"daysPerYear": 3.1, "trendPerDecade": 0.4, "source": "GPM IMERG V07"}},
  "soil": {
    "salinity": {"level": "medium", "eceEstDsM": 5.8, "confidence": "low", "method": "..."},
    "moistureAnomaly": {"month": "2026-10", "zScore": -1.3, "source": "SMAP L4"}
  },
  "strategies": [{
    "explanation": {"why": "2-3 gap, kamida 2 raqam", "generatedBy": "template"},
    "income": {"...": "B2 - tayyor, frontend ko'rsatyapti"},
    "waterNorms": ["A2 - tayyor, frontend ko'rsatyapti"]
  }]
}
```

`null` qiymat + `reason` qoidasi to'g'ri, uni saqlang. Frontend har bir `null` ni "noma'lum + sabab" ko'rinishida chiqaradi.

---

## Allaqachon yaxshi qilingan narsalar (o'zgartirmang)

- `null` hech qachon 0 emas va `unknownReasons` bilan keladi.
- `robustness` (3 ssenariy) va `rules` (R1-R8): challenge'ning "risks needing local review" talabiga to'g'ri javob.
- B2 daromad: oraliq, ishonchlilik va hosil x narx manbalari bilan.
- A2 me'yorlar: ADB va TIIAME havolalari bilan. Hakamlar uchun eng kuchli "validatsiya" dalillaridan biri.
- Suv ta'minoti signali (MODIS qor + GloFAS) va haqiqiy suv iste'moli (A1).
