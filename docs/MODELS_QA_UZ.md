# TerraVision: modellar va texnologiyalar bo'yicha savollar

Raqamlar jonli backend'ning `/api/models` javobidan olingan (2026-yil noyabr). Avval qisqa javobni ayting, hakam chuqurroq so'rasa tafsilotga o'ting.

## AI modellar

**1. Tizimda qanday AI modellar bor?**
Uchta:
1. **M1:** dala tarixini aniqlaydi, ya'ni har yili nima ekilganini.
2. **M2:** mavsumiy xavf prognozi (ECMWF SEAS5).
3. **LLM:** tushuntirish matnlarini oddiy tilga o'giradi (Claude Haiku).

Tavsiyaning o'zini AI bermaydi. Uni ochiq qoidalar va formulalar beradi.

**2. M1 qanday ishlaydi?**
- **Asos:** NASA Harvest jamoasining oldindan o'qitilgan Presto modeli. U sun'iy yo'ldosh qatorlarini (Sentinel-1 radar, Sentinel-2 optik suratlar, ob-havo, relyef) raqamli "barmoq izi"ga aylantiradi.
- **Klassifikator:** shu barmoq izidan Random Forest ekin turini aniqlaydi.
- **Klasslar (8 ta):** paxta, kuzgi bug'doy, bug'doy + takroriy ekin, sholi, beda, makkajo'xori, bo'sh yer, boshqa.

**3. M1 nimada o'qitilgan?**
Markaziy Osiyo bo'yicha ochiq dataset: Remelgado va boshqalar, 2020, CAWa crop type, CC-BY-4.0 litsenziyasi. Unda 2016-2018 yillardagi 6 706 ta dala bor va har birida yerda tekshirilgan haqiqiy ekin turi yozilgan.

**4. M1 qanchalik aniq?**
Ikki xil qattiq sinovdan o'tgan:

| Sinov | Aniqlik |
|---|---|
| Vaqt bo'yicha: 2016-2017 da o'qitib, 2018 da sinash | 83.3% |
| Hudud bo'yicha: Qashqadaryo umuman o'qitishda bo'lmagan | 82.0% |

Asosiy ekinlarda (paxta, bug'doy) F1 0.86-0.88.

**5. Nega ikki xil sinov?**
Oddiy tasodifiy bo'linishda model "yodlab olishi" mumkin. Biz ikki qiyinroq savolni tekshirdik:
- model kelajak yilni oldindan ko'ra oladimi;
- model hech ko'rmagan viloyatda ishlay oladimi.

Ikkalasida ham aniqlik 82-83% atrofida qoldi.

**6. Qaysi ekinlarda zaif?**
Sholi, beda, makkajo'xori va bo'sh yerda. Sababi: o'qitish ma'lumotida ular juda kam (sholi atigi 36 ta, makkajo'xori 38 ta). Shuning uchun:
- ishonch past bo'lsa, natija "noma'lum" deb ko'rsatiladi;
- sholi faqat suv bosish belgisi bo'lsa va ishonch 80% dan yuqori bo'lsa chiqadi.

**7. Model "ishonchi"ga ishonsa bo'ladimi?**
Ha, buning uchun model kalibrlangan (isotonic usul). Kalibrlash xatosi (ECE) 0.143 dan 0.045 ga tushdi. Ya'ni model "80% ishonaman" desa, haqiqatda taxminan 80% holatda to'g'ri chiqadi.

**8. Bir nechta yondashuvni solishtirganmisiz?**
Ha, beshta, bir xil 2018 test yilida:

| Yondashuv | Aniqlik |
|---|---|
| Faqat fenologiya qoidalari | 34.9% |
| NDVI + Random Forest | 85.2% |
| Presto + logistik regressiya | 76.7% |
| Presto + Random Forest (tanlangan) | 83.3% |
| Presto + NDVI + Random Forest | 81.3% |

Qoidalar zaxira sifatida qoladi, asosiy ish modelda.

**9. Oddiy NDVI modeli 85.2% bo'lsa, nega Presto'ni tanladingiz?**
Farq kichik (2 foiz punkt). Presto bitta NDVI egri chizig'iga emas, radar, ob-havo va relyefga ham tayanadi. Radar bulut orqali ko'radi, shuning uchun bulutli yillarda va yangi hududlarda barqarorroq. Ikkala natija ham ochiq, uni yashirmaymiz.
> Eslatma: bu tanlov sababini backend dasturchisi bilan aniq tasdiqlab oling.

**10. M2 (mavsumiy prognoz) qanday ishlaydi?**
- **Prognoz:** ECMWF SEAS5 6 oy oldinga 50 ta mumkin bo'lgan ob-havo ssenariysini beradi.
- **Tuzatish:** ularni NASA POWER'ning 20 yillik me'yoriga "delta" usuli bilan moslaymiz, shunda ular aynan shu dala uchun ma'noli bo'ladi.
- **Natija:** "kelasi oylar odatdagidan issiq yoki quruq bo'lish ehtimoli" va "50 ssenariyning nechtasida suv yetadi".

**11. LLM nima uchun kerak va qaysi model?**
Claude Haiku. U faqat formulalar chiqargan natijani fermer tushunadigan 2-3 gapga aylantiradi. Qaror qabul qilmaydi.

**12. LLM raqam o'ylab topmasligini qanday ta'minlaysiz?**
LLM matnidagi har bir raqam biz hisoblagan ma'lumot bilan ±1% aniqlikda solishtiriladi. Bitta raqam ham mos kelmasa, matn tashlanadi va o'rniga shablon matn chiqadi. Matn fonda yoziladi, foydalanuvchi uni kutmaydi.

## Ilmiy modellar va formulalar

**13. Suv ehtiyoji qaysi model bilan hisoblanadi?**
FAO-56 Penman-Monteith, bug'lanish uchun xalqaro standart. U NASA POWER'ning harorat, namlik, shamol va quyosh radiatsiyasidan referens bug'lanishni hisoblaydi. Keyin ekin koeffitsiyentiga (Kc, har bir o'sish bosqichi uchun alohida) ko'paytiriladi.

**14. Sho'rga chidamlilik qanday baholanadi?**
Maas-Hoffman modeli bilan (FAO-29). Har bir ekinning sho'rlik chegarasi bor, masalan arpa ~8 dS/m, makkajo'xori ~1.7 dS/m. Tuproq sho'rligi shu chegaradan oshsa, hosil kamayadi. Sho'r yuvish uchun kerak bo'lgan suv ham shu FAO-29 formulasi bilan hisoblanadi.

**15. Qurg'oqchilik qanday aniqlanadi?**
SPI-3 indeksi bilan: oxirgi 3 oylik yog'in shu davrning 20 yillik o'rtachasidan qanchalik kam. Qo'shimcha ravishda SMAP tuproq namligi me'yordan qanchalik past ekani z-ball sifatida ko'rsatiladi.

**16. Ekin mavsumga sig'ishi qanday tekshiriladi?**
GDD (o'sish uchun to'plangan issiqlik) va sovuq sanalari bilan. Ekin pishishi uchun kerakli issiqlikni birinchi kuzgi sovuqqacha to'play oladimi, shu tekshiriladi. Bu R1 qoidasi.

**17. Chorva uchun issiqlik stressi qanday o'lchanadi?**
THI (harorat-namlik indeksi) bilan, NASA POWER'dan kunlik hisoblanadi. 72 dan yuqori - yengil stress, 79 dan - o'rta, 89 dan - kuchli.

**18. Dala ichidagi zonalar qaysi usul bilan topiladi?**
Statistik usul bilan, AI emas. Har bir 30 m piksel dala o'rtachasi bilan solishtiriladi:
- ko'p yillik NDVI (sust o'sish);
- Landsat yozgi harorati (suv stressi);
- sho'rlanish indeksi;
- qiyalik.

Eng yomon 20% qism zona bo'ladi, faqat farq o'lchov xatosidan katta bo'lsagina.

## Tavsiya va isbot

**19. Tavsiya AI'danmi?**
Yo'q, bu ataylab qilingan. Tavsiya 7 ta agronomik qoida va ochiq ball formulasidan chiqadi: har bir qadam tushuntiriladigan va tekshiriladigan. Qishloq xo'jaligida fermer "nega?" deb so'raydi, "qora quti" javobi bunga yaramaydi.

**20. Strategiya bahosi qanday hisoblanadi?**
- 6 ta ko'rsatkich 0-100 ball oladi: suv, daromad, tuproq, sho'rlanish, iqlim xavfi, mehnat.
- Fermer ustuvorligiga qarab og'irlik beriladi: 1-tanlov ×3, 2-tanlov ×2, 3-tanlov ×1.5, qolganlari ×0.5.
- Natija: og'irlikli o'rtacha.

Fermer ustuvorlikni o'zgartirsa, ballar darhol qayta hisoblanadi.

**21. Tavsiyaning to'g'riligini qanday isbotlaysiz?**
Backtest bilan: model eng qurg'oqchil 3 yildan (2014, 2021, 2023) oldingi ma'lumotlar bilan ishlatildi, natija shu yillarning haqiqiy ob-havosi bilan tekshirildi. Tavsiya 9 variantdan 1-o'rinda bo'ldi va gektariga 3 500-4 400 m³ suv tejadi.

**22. Suv hisobini mustaqil kim tekshirgan?**
Uchta mustaqil manba:
- **OpenET (AQSh):** usulimiz solishtirilganda r = 0.96;
- **FAO WaPOR;**
- **NASA ECOSTRESS** (issiqlik surati).

Ikkalasi ham (WaPOR va ECOSTRESS) bizning dala bo'yicha hisobimiz bilan mos keldi.

## Texnologiyalar

**23. Qanday texnologiyalar ishlatilgan?**
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, MapLibre (3D xarita), Leaflet (chizish xaritasi).
- **Backend:** Python FastAPI, Google Earth Engine, pandas/numpy, scikit-learn (M1), SQLite.
- **Joylashuv:** Vercel va o'z serverimiz.

**24. 3D dala qanday chiziladi?**
MapLibre GL sun'iy yo'ldosh suratini relyef modeli ustiga yotqizadi. Dala chegarasi ko'tarilgan shakl sifatida chiziladi va har oy rejalashtirilgan ekin rangiga bo'yaladi. 3D dvigatel sahifa yuklanib bo'lgach ishga tushadi, shuning uchun birinchi ekran tez ochiladi.

**25. 30 metrli suratlarda bulutni qanday chetlab o'tasiz?**
Brauzer dala tushgan NASA HLS surat bo'lagini o'qiydi va piksellarni sanaydi: bulut (oq piksellar) va g'ubor (past kontrast). Har oydan eng toza kun tanlanadi. Bu backend'siz, foydalanuvchining brauzerida ishlaydi.
