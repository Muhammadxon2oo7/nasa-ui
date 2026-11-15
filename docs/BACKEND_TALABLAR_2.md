# TerraVision backend: 2-bosqich

`BACKEND_TALABLAR.md` dan keyin topilgan va challenge baholashida eng ko'p ball beradigan bandlar. Birinchi hujjatdagi P0 bandlari (502 timeout, xom xato matnlari, compare 500, doimiy pasport, bo'sh "why") hali ham birinchi navbatda.

Frontend holati: natija sahifasi 4 ta savolga qayta qurildi: "Nima ekay?", "Qachon nima qilay?", "Qancha suv?", "Dalam qanday?". Pastdagi har bir band shu savollardan biriga to'g'ridan-to'g'ri javob beradi.

---

## A. Challenge'ning o'zi so'ragan, lekin javobda yo'q narsalar

Challenge matnidan iqtiboslar va ularga kerakli maydonlar.

### A1. "Highlight times when fields are typically bare" (dala bo'sh turadigan davrlar)

- Hozir bu faqat matn ichida: `evidence: "Yozda dala o'rtacha 17 kun bo'sh turadi"`. Frontend raqamni matndan ajrata olmaydi.
- Kerak:
  ```jsonc
  "strategies": [{ "bare": { "daysPerYear": 17, "windows": [{"from": "06-08", "to": "06-25"}] } }]
  "history":    { "bareWindows": [{"year": 2024, "from": "06-30", "to": "09-15", "source": "Sentinel-2 NDVI"}] }
  ```
- UI'da: reja chizig'ida bo'sh davrlar shtrixlangan bo'ladi, dala tarixida esa haqiqatda bo'sh qolgan yozlar ko'rinadi.

### A2. "Seasons when current crops appear more vulnerable" (zaif mavsumlar)

- Kerak:
  ```jsonc
  "climate": { "vulnerableWindows": [
    {"crop": "cotton", "from": "07-10", "to": "08-05", "risk": "heat",  "probPct": 70, "note": "40°C+ gullash davriga to'g'ri keladi"},
    {"crop": "winter_wheat", "from": "03-20", "to": "04-05", "risk": "frost", "probPct": 20}
  ]}
  ```
- Ma'lumot allaqachon bor: `heat`, `frost`, `gdd`, ekin fenologiyasi. Ekin bosqichlari bilan iqlim xavf oynalarini kesishtirish kerak, xolos.

### A3. Field-level vulnerability zones (dala ichidagi xavf zonalari)

Challenge: *"visualize field-level vulnerabilities (zones of erosion risk, water stress hotspots, frost-prone areas)"*. Hozir hamma narsa dala bo'yicha bitta raqam. Bu eng katta bo'shliq va eng ko'zga ko'rinadigan imkoniyat.

- Yangi endpoint: `GET /api/zones/{fieldId}` (yoki `analyze` javobida `zones`).
  ```jsonc
  {"type": "FeatureCollection", "features": [
    {"type": "Feature", "geometry": {...},
     "properties": {"kind": "low_vigor", "level": "high", "areaHa": 0.8,
                    "value": 0.31, "unit": "NDVI p50 2019-2025", "note": "Dalaning janubi doim kech ko'karadi"}}
  ]}
  ```
- `kind` turlari va manbalar (hammasi GEE'da, 30 m):

  | `kind` | Hisob | GEE |
  |---|---|---|
  | `low_vigor` | Ko'p yillik mavsum NDVI mediani, dala ichida pastki 20% | `NASA/HLS/HLSL30/v002`, `NASA/HLS/HLSS30/v002` |
  | `water_stress` | Yozgi yuza harorati (Landsat B10) yoki NDVI-LST farqi, yuqori 20% | `LANDSAT/LC09/C02/T1_L2` (`ST_B10`) |
  | `erosion` | Qiyalik > 2° va kuchli yog'in kunlari | `USGS/SRTMGL1_003` + `NASA/GPM_L3/IMERG_V07` |
  | `salinity` | Sho'rlanish indeksi, dala ichidagi yuqori 20% | Sentinel-2 / HLS |

- Vektorga o'tkazish: `ee.Image.reduceToVectors` (scale 30). Kichik bo'laklarni (< 0.1 ga) birlashtirish.
- Frontend tayyor: zonalar 3D model va 30 m xaritaga rangli qatlam bo'lib tushadi, bosilganda `note` ochiladi.

### A4. Rotatsiyaning tuproqqa ta'siri raqam bilan

Challenge: *"nutrient cycling, erosion risk, organic matter contributions, pest-cycle disruption"*. Hozir `metrics.soil` bitta 0-100 raqam, nima uchun shunday ekani ko'rinmaydi.

- Kerak:
  ```jsonc
  "strategies": [{ "soilEffects": {
    "nFixKgHaPerYear": 60,         // dukkaklilar (mosh, beda, no'xat) bo'yicha jadval qiymati
    "coverDaysPerYear": 310,       // tuproq o'simlik bilan qoplangan kunlar
    "rootDepthMaxCm": 180,         // beda, kungaboqar: chuqur ildiz
    "residueTHa": 4.2,             // organik modda manbai
    "pestBreakYears": 2,           // bir oiladagi ekinlar orasidagi tanaffus
    "source": "FAO crop parameters, crops.json"
  }}]
  ```
- `crops.json` da `n_fixing` allaqachon bor, qolganlari shu jadvalga ustun qo'shish bilan bo'ladi.

---

## B. Shartnomani tozalash

### B1. Strategiya nomida "Hozirgi:" prefiksi

- Hozir `name: "Hozirgi: Paxta → Paxta → Paxta"`. Holat `isCurrent: true` bilan allaqachon belgilangan, frontend yorliqni o'zi qo'yadi. Prefiks tufayli "Hozirgi: Hozirgi: ..." chiqib qolish xavfi bor.
- Kerak: `name: "Paxta → Paxta → Paxta"`, `isCurrent: true`.

### B2. Mavsum sanalari

- Hozir `seasons[]`: `{"year": 2, "start": "10-10", "end": "06-07"}`. Yil indeks (1-3), `start > end` esa "o'tgan kuzda boshlangan" degani. Frontend buni tushunadi, lekin bu yashirin qoida.
- Kerak (yangi maydon, eskisini o'chirmasdan):
  ```jsonc
  {"year": 2, "start": "10-10", "end": "06-07", "startDate": "2027-10-10", "endDate": "2028-06-07"}
  ```

### B3. Kuzgi ekish oynasi

- `calendar.soilTempSowing` faqat bahorgi ekinlar uchun (tuproq harorati ko'tarilishi bo'yicha). Tavsiya qilingan rejada kuzgi bug'doy bo'lsa, ro'yxat bo'sh qoladi va "Qachon ekay?" savoliga javob yo'q.
- Kerak:
  ```jsonc
  "calendar": { "autumnSowing": [
    {"crop": "winter_wheat", "windowFrom": "09-25", "windowTo": "10-20",
     "rule": "Birinchi kuzgi sovuqqa (P10: 11-01) qadar >= 450 GDD to'plash",
     "source": "NASA POWER 2005-2025"}
  ]}
  ```

### B4. Daromad: hozirgi va tavsiya farqi

- `income` har strategiya uchun bor, yaxshi. Hakam "tavsiya pul yo'qotadimi?" deb so'raydi. Frontend farqni o'zi hisoblayapti (`~$510/ga past, lekin...`). Agar `ref_economics.json` da beda yoki mosh kabi ekinlarning chorvachilikdagi qiymati (yem) bo'lsa, `income.feedValueUsdPerHa` alohida maydon bo'lsin: beda pul emas, yem sifatida baholanadi.

---

## C. Tezlik: bir zumda javob

Hakam demoda yangi dala chizadi va 60 soniya kutadi. Bu demoning eng zaif lahzasi.

1. **NASA POWER oldindan.** O'zbekiston hududini ~200 ta POWER katagi (0.5° x 0.625°) qoplaydi; sug'oriladigan yerlar faqat ~60-80 tasiga to'g'ri keladi. Har tunda hammasini yuklab, diskka yozish kerak: `climate`, `et0`, `frost` va `heat` 0 soniyada tayyor bo'ladi.
2. **Bosqichma-bosqich javob.** Iqlim va strategiyalar 3 soniyada qaytsin. GEE qismlari (`history`, `soil`, `zones`) keyinroq kelsin: `GET /api/jobs/{id}` orqali (1-hujjat, P0-1) yoki SSE (`text/event-stream`) bilan. Frontend natijani darhol ko'rsatadi, qolgan bloklar kelishi bilan to'ladi.
3. **GEE so'rovlari parallel.** `ThreadPoolExecutor` (1-hujjat).
4. **Kesh kaliti.** Iqlim va tarix kalitida `today` bo'lmasin (1-hujjat, P2-20).

**Mezon.** Yangi dala: birinchi natija 5 soniyadan kam, to'liq natija 40 soniyadan kam, 502 yo'q.

---

## D. Bozor ma'lumoti (challenge: "market suitability")

- Challenge resurslarida USDA AMS Market News bor. O'zbekiston uchun analog: **UzEx** (O'zbekiston respublika tovar-xom ashyo birjasi) kunlik savdo natijalari: bug'doy, paxta xomashyosi, beda pichani.
- Hozir `ref_economics.json` statik. Haftalik yangilanadigan narxlar jadvali (`prices(crop, date, uzsPerKg, source)`) va javobda `income.priceDate` bo'lsin: hakam narx qachongi ekanini ko'radi.

---

## Muhimlik tartibi (qisqa)

| # | Ish | Nimaga ta'sir | Taxminiy hajm |
|---|---|---|---|
| 1 | 1-hujjat P0 (timeout, xato matnlari, compare, pasport, `why`) | Demo yiqilmaydi | 1 kun |
| 2 | C1-C2 tezlik | Demo kutish 60 s → 5 s | 1 kun |
| 3 | A3 dala ichidagi zonalar | Challenge'ning eng vizual talabi | 1-1.5 kun |
| 4 | A1, A2 bo'sh davrlar va zaif mavsumlar | Challenge'ning ikki aniq talabi | 0.5 kun |
| 5 | B1-B3 shartnoma | Toza UI, "Qachon ekay?" javobi | 0.5 kun |
| 6 | A4 tuproq ta'siri | "Nima uchun" savoliga dalil | 0.5 kun |
| 7 | 1-hujjat P1 (GRACE, IMERG, HLS tarix, ECOSTRESS) | Challenge ma'lumotlari ro'yxati | 1-2 kun |
| 8 | D bozor narxlari | Daromadga ishonch | 0.5 kun |

Har bir yangi maydon qo'shilganda `FRONTEND_UCHUN_API.md` ga misol JSON bilan yozib qo'ying. Frontend uni shu hujjatdan oladi va adapter (`src/api/fastapi.ts`) orqali ulaydi.
