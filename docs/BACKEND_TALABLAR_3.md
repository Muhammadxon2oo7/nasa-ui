# TerraVision backend: 3-bosqich (tekshiruv natijalari)

Oxirgi commitlar (`a31e401` ... `4dafb50`) jonli API'da tekshirildi: `agro-nasa-api.e-investment.uz`, paxta demo dalasi (68.7376, 40.5609). Katta ish qilingan. Frontend quyidagilarni ulab bo'ldi:

- asinxron tahlil (`?async=true` + `/api/jobs`): yangi dala 502 siz ~35-50 s da ochiladi;
- `GET /api/analysis/{id}`: QR pasport boshqa telefonda ochiladi;
- `/api/zones`: "Dalam qanday?" tabida xarita va ro'yxat;
- GRACE, IMERG va eroziya, zaif mavsumlar, SMAP anomaliya, sun'iy yo'ldosh sho'rlanishi, kuzgi ekish, tuproqqa ta'sir, WaPOR va ECOSTRESS tekshiruvlari, `startDate`/`endDate`, yangi xato formati.

Quyida faqat **topilgan muammolar**. Har birida: nima ko'rindi (aniq qiymat bilan) va nima qilish kerak.

---

## 1. Job progressi yolg'on ko'rsatadi (muhim)

- **Ko'rindi:** `GET /api/jobs/{id}` 3-soniyadan 31-soniyagacha bir xil `{"stage": "forecast", "progress": 0.85}` qaytardi, keyin to'satdan `done`. Bosqichlar parallel ishlaydi, `stage` esa oxirgi *boshlangan* vazifani ko'rsatadi.
- **Natija:** frontend bosqichlarni ko'rsata olmaydi. "85%" yozuvi 30 soniya turib qolsa, foydalanuvchi ilova qotib qolgan deb o'ylaydi. Shu sababli frontend hozir faqat vaqtga asoslangan progressni ko'rsatyapti.
- **Kerak:**
  - `progress = tugagan vazifalar / jami vazifalar`, faqat o'sib boradi;
  - `stages: {"climate": "done", "history": "running", "soil": "done", "water": "pending", ...}`: parallel vazifalar uchun har birining holati.
- **Mezon:** yangi dala tahlilida `progress` kamida 4 marta har xil qiymat oladi va hech qachon kamaymaydi.

## 2. Zonalar dala chegarasidan tashqariga chiqadi

- **Ko'rindi:** `/api/zones/f-710431ea062c` zonalari dala poligonidan 1-2 piksel (30-60 m) tashqariga chiqib turibdi, xaritada aniq ko'rinadi.
- **Kerak:** vektorga o'tkazishdan oldin rasterni `image.clip(geom)` qilish, keyin har bir zonani `feature.intersection(geom, 1)` bilan kesish. `areaHa` kesilgandan keyingi maydon bo'lsin.

## 3. Shovqin zona bo'lib chiqyapti

- **Ko'rindi:** `water_stress` zonasi `value: 35.745`, `fieldMean: 35.632`, ya'ni 0.11°C farq. Landsat yuza harorati aniqligi taxminan ±1°C, demak bu farq o'lchov xatosi ichida. Ikkita bir xil (`value`, `areaHa` teng) `water_stress` zonasi ham bor.
- **Kerak:**
  - Minimal ma'noli farq bo'lmasa, zona chiqmasin.
    - LST: >= 1.0°C;
    - NDVI: >= 0.05;
    - SI: >= 0.01 yoki dala o'rtachasidan 5%;
    - qiyalik: hozirgidek > 2°.
  - Bir xil geometriyali zonalarni birlashtirish.
  - Hech narsa qolmasa: `features: []`, `reason: "Dala bir xil: sezilarli farq yo'q"`. Bu ham foydali natija.

## 4. Zonalar birinchi so'rovda ulanishni uzadi

- **Ko'rindi:** birinchi `GET /api/zones/{id}` `read ETIMEDOUT` bilan uzildi (ulanish GEE hisobini kutib qoldi). Ikkinchi urinishda keshdan 0 s da keldi.
- **Kerak (biri yetadi):**
  - `/api/analyze` ishi tugashi bilan zonalarni fonda hisoblashni boshlash (prefetch). Foydalanuvchi "Dalam qanday?" ga o'tguncha tayyor bo'ladi.
  - Yoki zonalar ham job bo'lsin: birinchi chaqiruvda `202 {"jobId"}`, keyin `/api/jobs/{id}`.

## 5. Sho'rlanish bahosi rejalarni keskin o'zgartiryapti

- **Ko'rindi:** `salinityLevel` yuborilmaganda paxta demo dalasi uchun `soil.salinity = {"level": "low", "eceEstDsM": 1.2, "confidence": "low"}`. Manba: 2016 yilgi 1 km global xarita. Avval shu dala uchun Sentinel-2 indeksi trendi +28% (o'sish) edi. Sirdaryo viloyatida sug'oriladigan yerlarning katta qismi rasman sho'rlangan.
- **Oqibat:** "past" baho sho'rga chidamlilik qoidalarini (R2) o'chirib qo'yadi va tavsiya butunlay boshqacha bo'ladi: "o'rta" bilan "Bug'doy + oq jo'xori" (75 ball) edi, "past" bilan "Paxta → Bug'doy → Beda" (92 ball). Ishonchi past baho tavsiyani eng ko'p o'zgartiradigan omil bo'lib qolmasligi kerak.
- **Kerak:**
  - `confidence: "low"` bo'lsa, qoidalar uchun konservativ qiymat: global xarita bilan viloyat bo'yicha rasmiy ulushning kattasi. Viloyat statistikasi yo'q bo'lsa, `medium`.
  - Javobda ikkalasi ham bo'lsin: `soil.salinity.eceEstDsM` (sun'iy yo'ldosh) va `soil.eceUsed` (qoidalarda ishlatilgani), `soil.salinity.usedReason`.
  - Frontend hozir foydalanuvchiga "ishonch past, laboratoriya natijasini kiriting" deb ko'rsatyapti.

## 6. Ekish oynasida `lateStart` noaniq

- **Ko'rindi:** paxta uchun `recommendedFrom: "04-11"`, `lateStart: "04-09"`. `lateStart` oyna oxiri emas, "kech yilda boshlanish sanasi". Frontend uni oxir deb o'qib "11-aprel - 9-aprel" ko'rsatgan edi (tuzatildi).
- **Kerak:** aniq oyna: `recommendedFrom` va `recommendedTo` (masalan, sovuq yoki tuproq sharti bajarilgandan keyingi 15-20 kun). `lateStart` ni `p90Start` deb qayta nomlash.

## 7. Rejada yo'q ekinlar ro'yxatlarda

- **Ko'rindi:** `sowing.crops` va `climate.vulnerableWindows` da sholi, makkajo'xori, mosh bor, lekin dala uchun hozirgi va tavsiya rejasi paxta, bug'doy va beda.
- **Kerak:** har bir yozuvga `inPlan: true/false` yoki `strategies: ["B", "C"]`. Frontend hozir o'zi filtrlayapti.

## 8. Tavsiya qoidani buzadi

- **Ko'rindi:** tavsiya etilgan strategiyada (`Paxta → Bug'doy → Beda`, 92 ball) `rules` ichida `fail`: "Kuzgi sovuqqa ulgurmaydi: Paxta (3 kun kech)". `why` oxirida "Shart: ..." deb yozilgan, bu to'g'ri. Lekin `fail` bo'lgan reja 1-o'rinda.
- **Kerak (biri):**
  - `fail` bo'lgan strategiyaga jarima (masalan −10 ball), shunda `fail` siz muqobil oldinga chiqadi;
  - yoki `summary.bestStrategyId` faqat `fail` siz strategiyalar orasidan, hammasida `fail` bo'lsa eng kamida.
- Hakam "tavsiya o'zi ishlamaydi-ku" deb so'raydi.

## 9. Dala tarixida shubhali "Sholi"

- **Ko'rindi:** paxta demo dalasining aniqlangan hozirgi rotatsiyasi "Paxta → Sholi → Paxta". Sirdaryo'ning Mirzaobod tumanida bitta yilda sholi ekilishi ehtimoldan uzoq.
- **Kerak:** NDVI qoidalarida sholi uchun suv bosish belgisini (LSWI > NDVI, may-iyun) majburiy qilish. M1 natijasida `probability < 0.6` bo'lsa, `crop: "other"` va `uncertain: true`.

## 10. Bir xil so'rov ikki job yaratadi

- **Ko'rindi:** bir xil polygon va parametrlar bilan ketma-ket ikki `POST ?async=true` ikkita `jobId` qaytardi va GEE ikki marta ishladi.
- **Kerak:** `fieldId + parametrlar xeshi` bo'yicha ishlayotgan job bo'lsa, o'shaning `jobId` sini qaytarish. Kvota va vaqt tejaladi.

---

## Hali qilinmagan (avvalgi hujjatlardan)

- Landsat/HLS bilan 2013 yildan boshlangan dala tarixi (1-hujjat, #9).
- UzEx birja narxlarini avtomatik olish (2-hujjat, D).
- LLM: `/health` → `llm.enabled: false`. Kalit qo'yilsa `generatedBy: "llm"`. Raqamli shablon `why` yaxshi ishlayapti, demo uchun shart emas.

## Muhimlik tartibi

| # | Ish | Hajm |
|---|---|---|
| 1 | Job progressi (1) | 1-2 soat |
| 2 | Zonalarni kesish, shovqinni olib tashlash, prefetch (2, 3, 4) | 3-4 soat |
| 3 | Sho'rlanish konservativ qiymati (5) | 2 soat |
| 4 | Tavsiyada `fail` (8) | 1 soat |
| 5 | Ekish oynasi, `inPlan` (6, 7) | 1 soat |
| 6 | Sholi tekshiruvi, job dedup (9, 10) | 2 soat |
