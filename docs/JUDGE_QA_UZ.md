# TerraVision: hakamlar savollari va qisqa javoblar

Har bir javob ovoz chiqarib 15-20 soniyada aytiladi. Raqamlar jonli tizimdagi o'z sinovlarimizdan (2026-yil noyabr).

## Umumiy

**1. Qanday muammoni hal qilasiz va kim uchun?**
O'zbekiston dalalarida suv yetishmaydi, tuproq esa yildan-yilga sho'rlanmoqda. Shunga qaramay, ko'p fermerlar har yili paxta yoki bug'doyni takrorlaydi. TerraVision to'rt xil foydalanuvchiga dala bo'yicha aniq yo'l ko'rsatadi:
- dehqonga: nima ekish kerak;
- chorvadorga: yaylov holati qanday;
- yer tanlovchiga: qaysi joy yaxshiroq;
- mutaxassisga: to'liq metodologiya.

**2. Qaysi NASA ma'lumotlaridan foydalanasiz va nima uchun?**
- NASA POWER: 20 yillik kunlik iqlim. Suv ehtiyoji, sovuq va jazirama uchun.
- SMAP: tuproq namligi va harorati. Qurg'oqchilik va ekish muddati uchun.
- GPM IMERG: kuchli yog'in va eroziya.
- Landsat va Sentinel-2 (HLS, 30 m): dala tarixi va dala ichidagi zonalar.
- MODIS: yaylov ko'kligi, qor va bug'lanish.
- GRACE/GRACE-FO: uzoq muddatli suv zaxirasi.
- SRTM: qiyalik.
- ECOSTRESS: haqiqiy suv sarfini mustaqil tekshirish.

**3. Tavsiya to'g'ri ekanini qanday bilasiz?**
To'rt yo'l bilan tekshiramiz:
1. **Backtest:** o'tgan eng qurg'oqchil uch yilda (2014, 2021, 2023) tavsiya etilgan rotatsiya 9 ta variantdan 1-o'rinni egalladi va gektariga taxminan 3 500-4 400 m³ suv tejadi.
2. **Rasmiy me'yorlar:** hisoblangan suv ehtiyoji rasmiy sug'orish me'yorlari bilan solishtiriladi (ADB, TIIAME).
3. **Mustaqil sun'iy yo'ldoshlar:** suv sarfi bahosi FAO WaPOR va NASA ECOSTRESS bilan tekshirilgan, ikkalasi ham mos keldi.
4. **AQSh yer o'lchovlari:** shu suv hisoblash usuli AQShda OpenET bilan sinalganda r = 0.96 chiqdi.

**4. Ma'lumot yo'q yoki noaniq bo'lsa nima bo'ladi?**
Hech qachon 0 ko'rsatmaymiz. Yetishmayotgan qiymat "Noma'lum" deb, sababi bilan chiqadi. Ishonchi past qiymatlarga "ishonch past" belgisi qo'yiladi va laboratoriya natijasi so'raladi (masalan, sun'iy yo'ldoshdan baholangan sho'rlanish). Har bir strategiyada ma'lumot bo'shliqlari va agronom tekshirishi kerak bo'lgan xavflar alohida yozilgan.

**5. Bu agronomni almashtiradimi?**
Yo'q. Tizim variantlarni toraytiradi va dalillarni ko'rsatadi, yakuniy qarorni fermer va agronom qabul qiladi. Bu jumla har bir natija sahifasida yozilgan.

**6. Tahlil qancha vaqt oladi?**
Yangi dala uchun birinchi javob 2-4 soniyada chiqadi, to'liq tahlil 15-45 soniyada tugaydi. Ilgari tahlil qilingan dala taxminan 1 soniyada ochiladi.

**7. Butun O'zbekiston bo'yicha ishlay oladimi?**
Ha:
- **Iqlim:** NASA POWER mamlakatning ekin maydonlarini qoplaydigan 100 ta katak uchun oldindan yuklab qo'yilgan.
- **Sun'iy yo'ldosh ishlari:** Google Earth Engine'da bajariladi.
- **Takroriy so'rovlar:** har bir dala bir marta hisoblanadi va saqlanadi.

Asosiy xarajat yangi dalalar uchun Earth Engine hisobi, bizning server emas.

**8. Keyin nima qilasiz?**
1. Sho'rlanishni viloyat tuproq xizmatining laboratoriya namunalari bilan kalibrlash.
2. O'zbekiston tovar-xom ashyo birjasidan (UzEx) jonli narxlarni ulash.
3. Fermerlardan haqiqiy hosil haqida fikr yig'ish. Buning uchun API allaqachon tayyor, real hosil ma'lumotlari modelni yaxshilaydi.

## Frontend

**9. Frontend qaysi texnologiyalarda yozilgan va nega?**
- **Asosiy stek:** Next.js 16, React 19, Tailwind CSS 4 va Motion.
- **Nega Next.js:** oldindan tayyorlangan sahifalar zaif telefonlarda ham tez ochiladi.
- **Joylashuv:** Vercel. Backend bitta `/py` proksi orqali ulanadi, shuning uchun backend manzili yashirin va CORS muammosi yo'q.
- **Sifat (Lighthouse, mobil):** qulaylik 97-100, SEO 100, best practices 96-100.

**10. 3D dala qanday ishlaydi?**
- **Asos:** MapLibre GL Esri sun'iy yo'ldosh suratini relyef ustiga yotqizadi. Relyef NASA SRTM asosidagi Mapterhorn ma'lumotidan olinadi.
- **Ko'rinish:** dalaning haqiqiy chegarasi ko'tarib chiziladi va rejalashtirilgan ekinga qarab oyma-oy rangini o'zgartiradi. Fermer 3 yillik rotatsiyani video kabi ko'radi.
- **Tezlik:** 3D dvigatel sahifa yuklanib bo'lgandan keyin ishga tushadi, shuning uchun birinchi ekran tez ochiladi.

**11. Dalaning 30 metrli suratlarini qanday ko'rsatasiz?**
- **Manba:** NASA GIBS'dagi HLS (Landsat va Sentinel-2 birlashtirilgan) suratlari.
- **Bulut va g'ubor tekshiruvi:** brauzer dala tushgan surat bo'lagini yuklab, uning ustidagi bulut va g'uborni piksel bo'yicha o'lchaydi. Har oydan eng toza kun tanlanadi.
- **Xarajat:** buning uchun backend kerak emas. So'rovlar past ustuvorlikda ketadi, shuning uchun ko'rinib turgan xarita birinchi yuklanadi.

**12. Nega shunchaki xarita emas, savol ko'rinishidagi tablar?**
Fermer ma'lumotlar to'plami bilan emas, savol bilan o'ylaydi. Natija sahifasi qaror qabul qilish tartibidagi to'rt savoldan iborat: Nima ekay? Qachon nima qilay? Qancha suv? Dalam qanday? Har bir grafik o'zi javob beradigan savol ostida turadi.

**13. Backend sekin bo'lsa yoki internet bo'lmasa nima bo'ladi?**
- **Backend sekin:** tahlil fon ishi sifatida bajariladi. Birinchi javobni darhol ko'rsatamiz, to'liq natija kelganda sahifa o'zi yangilanadi.
- **Backend ishlamasa:** saytning o'z zaxira hisoblash mexanizmi va oldindan hisoblangan demo dalalar ishlab turadi.
- **Taqqoslash sahifasi:** so'rovni foydalanuvchi tugmani bosishidan oldin boshlab qo'yadi.

**14. Tillar va qulaylik qanday?**
- **Tillar:** o'zbek (lotin va kirill) va ingliz tili, istalgan sahifada almashtiriladi.
- **Qulaylik:**
  - dala zonalari ranglari rang ajrata olmaydigan odamlar uchun ham farqlanadi;
  - klaviatura va ekran o'quvchi dasturlar uchun yozuvlar bor;
  - kamaytirilgan animatsiya rejimi qo'llab-quvvatlanadi;
  - mobil ko'rinish 360 px kenglikkacha ishlaydi.

**15. Foydalanuvchini adashtirmaslik uchun nima qilgansiz?**
- Har bir raqam yonida uning manbasi ko'rsatilgan.
- Dastlabki natija "Dastlabki baho" deb belgilanadi.
- Ishonchi past qiymatlarga alohida belgi qo'yiladi.
- Demo dalalarning chegaralari sun'iy yo'ldosh suratidan qo'lda chizilgan, shuning uchun tahlil tasodifiy kvadratni emas, bitta haqiqiy dalani qamraydi.

## Backend

**16. Backend arxitekturasi qanday?**
- **Stek:** Python FastAPI. Sun'iy yo'ldosh ma'lumotlari Google Earth Engine'dan, iqlim NASA POWER va Open-Meteo'dan olinadi.
- **Saqlash:** saqlangan tahlillar SQLite'da, takroriy so'rovlar uchun disk keshi bor.
- **Fon ishlari:** og'ir hisoblar fon ishi sifatida bajariladi va progressini bildirib turadi. Bir-biriga bog'liq bo'lmagan manbalar parallel olinadi.

**17. Suv ehtiyojini qanday hisoblaysiz?**
NASA POWER ma'lumotidan FAO-56 Penman-Monteith usulida referens bug'lanish hisoblanadi. U har bir o'sish bosqichi uchun ekin koeffitsiyentiga ko'paytiriladi, samarali yog'in ayiriladi va sug'orish samaradorligiga bo'linadi (egatda 55%, tomchilatib sug'orishda 90%). Bitta raqam emas, 20 yillik iqlim bo'yicha oraliq beramiz.

**18. Strategiyalar qanday baholanadi?**
- **Qoidalar:** har bir rotatsiya 7 ta agronomik qoida bo'yicha tekshiriladi:
  - mavsumga sig'adimi;
  - sho'rga chidamlimi;
  - suv limitiga sig'adimi;
  - rotatsiyada tanaffus bormi;
  - ekish oynasi to'g'rimi;
  - dala qancha kun bo'sh qoladi;
  - dukkakli ekin bonusi.
- **Ko'rsatkichlar:** suv, daromad, tuproq, sho'rlanish, iqlim xavfi va mehnat bo'yicha 0-100 ball oladi.
- **Yakuniy ball:** fermer bergan ustuvorlik tartibidagi og'irliklar bilan o'rtacha hisoblanadi.
- **Chidamlilik:** har bir rotatsiya odatiy yil, qurg'oqchil yil (yog'in −30%) va issiq yil (+1.5 °C) uchun qayta baholanadi.

**19. Fermer ilgari nima ekkanini qanday bilasiz?**
- **Suratlar:** 2013 yildan beri oylik NDVI, 2017 yilgacha Landsat, 2018 yildan Sentinel-2.
- **Model:** o'qitilgan ekin tasniflagichi (Presto va logistik regressiya). Zaxira sifatida fenologiya qoidalari ishlaydi.
- **Ishonch:** model kalibrlangan va dala o'qitish hududidan uzoq bo'lsa ogohlantiradi.

**20. Dala ichidagi muammoli zonalarni qanday topasiz?**
- **Signallar:** har bir 30 m piksel uchun ko'p yillik ko'kligi, yozgi yuza harorati, sho'rlanish indeksi va qiyaligi dala o'rtachasi bilan solishtiriladi.
- **Zonalar:** eng yomon qismlar zona bo'ladi (sust o'sish, suv stressi, sho'rlanish, eroziya) va dala chegarasi bo'yicha kesiladi.
- **Shovqin filtri:** farq faqat sun'iy yo'ldosh xatosidan katta bo'lsa hisobga olinadi (masalan, harorat uchun kamida 1 °C).

**21. GRACE juda dag'al (~300 km), uni nega ishlatasiz?**
Dala o'lchovi sifatida emas, hudud konteksti sifatida ishlatamiz. U havzada har 10 yilda taxminan 6 sm suv yo'qolayotganini ko'rsatadi. Bu kam suv talab qiladigan rotatsiyani tanlash uchun kuchli dalil. Interfeysda "hudud o'rtachasi, dala darajasida emas" deb yozilgan.

**22. AI (LLM) nima qiladi va u raqam o'ylab topmasligini qanday ta'minlaysiz?**
- **Vazifasi:** AI faqat izohni oddiy tilda qayta yozadi. Barcha raqamlar oldin bizning formulalarimiz bilan hisoblanadi.
- **Raqam tekshiruvi:** AI matnida biz bermagan raqam bo'lsa, matn tashlab yuboriladi va o'rniga shablon matn ishlatiladi.

**23. Qanchalik tez ishlaydi va tezlik uchun nima qildingiz?**
- **Natija:** yangi dala uchun birinchi javob taxminan 4 soniyada, to'liq natija taxminan 37 soniyada keladi. Gateway timeout xatolari yo'q.
- **Iqlim oldindan yuklangan:** NASA POWER mamlakatning ekin maydonlari uchun oldindan tayyorlab qo'yilgan.
- **Earth Engine ishlari:** har bir dala uchun bir marta, parallel bajariladi va so'rovlar o'rtasida bo'lishiladi.
- **Suv hisobi:** vektorlashtirildi, taxminan 6 marta tezlashdi.
- **Takroriy so'rovlar:** bir xil so'rov ishlab turgan ishga qo'shiladi.

**24. Qanday testlaysiz?**
- **Avtomatik testlar:** 97 ta backend testi suv, iqlim, qoidalar, iqtisod va API'ni qamraydi.
- **Validatsiya:** o'tgan qurg'oqchil yillar bo'yicha backtest, WaPOR, ECOSTRESS va OpenET bilan mustaqil tekshiruvlar.
- **Frontend:** har bir commit'da tiplar va lint tekshiriladi, kompyuter va telefonda brauzer orqali sinaladi.

**25. Hozirgi asosiy cheklovlar qanday?**
- **Sho'rlanish:** sun'iy yo'ldoshdan olingan daraja laboratoriya ma'lumoti bilan kalibrlanmaguncha ishonchi past baho hisoblanadi.
- **Hosil va narxlar:** mamlakat bo'yicha o'rtacha qiymatlar.
- **Dala tarixi:** bulutsiz suratlar bo'lishiga bog'liq.

Bu uchalasini ilovada yashirmasdan, ochiq ko'rsatamiz.
