# TerraVision backend: 4-bosqich (qisman natija)

`39fe152` (tezlik, `partial`) frontend'ga ulandi va jonli API'da sinaldi. Wizard'da yangi dala (Sirdaryo demo, yangi poligon):

| Bosqich | Vaqt "Tahlil qilish" bosilgandan |
|---|---|
| Natija sahifasi ochildi (`partial`) | **4.3 s** (avval ~50 s) |
| To'liq natija, sahifa o'zi yangilandi | **37.8 s** |

Frontend `partial` ni "Dastlabki baho" deb ko'rsatadi. Suv, tuproq, kalendar va zonalar tablari to'liq natija kelguncha "tayyorlanmoqda" holatida turadi. `complete: false` bo'lsa, 90 s dan keyin `GET /api/analysis/{id}` ni bir marta qayta so'raydi.

## 1. Dastlabki tavsiya to'liq tavsiyadan farq qiladi (muhim)

- **Ko'rindi:** bir xil dala uchun:
  - `partial`: `Paxta → Bug'doy → Beda`, **93 ball**;
  - to'liq natija: `Bug'doy + oq jo'xori (har yili)`, **73 ball**.
  Foydalanuvchi bir tavsiyani ko'radi, 30 soniyadan keyin boshqasi chiqadi. Hakam uchun bu "model barqaror emas" degan signal.
- **Sabab:** `partial` strategiyalari sho'rlanish (R2 qoidasi) va dala tarixi (hozirgi rotatsiya) ma'lum bo'lmasdan baholanadi.
- **Kerak (biri):**
  1. **Sho'rlanishni "essentials" ga qo'shish.** Global 1 km sho'rlanish xaritasidan bitta piksel o'qish GEE'da tez (1-2 s). Viloyat bo'yicha konservativ prior bilan birga (3-hujjat, 5-band) `partial` dan oldin hisoblansin. Shunda R2 qoidasi dastlabki bahoda ham ishlaydi.
  2. Yoki `partial` da `strategies` reytingsiz bo'lsin: ballar bor, lekin `bestStrategyId: null` va `rankingFinal: false`. Frontend unda "Strategiyalar baholanmoqda" deb ko'rsatadi.
- **Mezon:** 10 ta tasodifiy dala uchun `partial.bestStrategyId == result.summary.bestStrategyId` kamida 8 tasida.

## 2. `partial` da sarlavha maydonlari yo'q

- **Ko'rindi:** `partial.field` da `periodStart`, `periodEnd`, `region`, `district` yo'q. Frontend sarlavhada "tahlil: undefined-undefined" chiqargan edi (endi zaxira matn qo'yilgan).
- **Kerak:** `partial.field` to'liq `field` bilan bir xil shaklda bo'lsin. Bu qiymatlar POWER va poligondan darhol ma'lum.

## 3. Oldindan isitish to'liq natijani tezlashtirmayapti

- Frontend 1-qadamdan chiqishda (`Davom etish`) `POST /api/analyze?async=true` ni fonda yuboradi, toki foydalanuvchi 2-qadamni to'ldirguncha GEE qismlari keshga tushsin.
- **Ko'rindi:** isitish so'rovidan 9.4 s keyin yuborilgan haqiqiy so'rov ham to'liq natijaga 37.8 s sarfladi. Ikkinchi so'rov birinchisining tugashini kutmay, GEE ni qaytadan ishga tushirgan ko'rinadi.
- **Kerak:** bir xil poligon uchun GEE vazifasi ishlayotgan bo'lsa (parametrlar boshqa bo'lsa ham), yangi job o'sha vazifaning natijasini kutsin. GEE qismlari (tarix, tuproq, zonalar) faqat poligonga bog'liq, ustuvorlik va suv usuliga bog'liq emas. Kalit: `polygon hash`, so'rovning to'liq xeshi emas.
- **Mezon:** 1-qadamdan 20 s keyin bosilgan "Tahlil qilish" to'liq natijani 20 s dan kam vaqtda oladi.

## 4. 3-hujjatdan holat

Zonalar endi dala chegarasi ichida, bu yaxshi. Qolganlari (job progressi, LST shovqini, sho'rlanish priori, `fail` bo'lgan tavsiya, ekish oynasi, `inPlan`, sholi, job dedup) hali ham ochiq. `BACKEND_TALABLAR_3.md` ga qarang.
