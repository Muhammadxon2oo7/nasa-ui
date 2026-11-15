# TerraVision: tizim bo'yicha savollar va javoblar

Har bir javob 2-3 gap. Avval qisqa javobni ayting, hakam chuqurroq so'rasa tafsilotga o'ting.

## Arxitektura

**1. Tizim qanday qismlardan iborat?**
Uch qismdan:
- **Frontend:** Next.js, Vercel'da.
- **Backend:** Python FastAPI, o'z serverimizda.
- **Sun'iy yo'ldosh hisoblari:** Google Earth Engine'da.

Frontend backend'ga bitta proksi (`/py`) orqali murojaat qiladi, shuning uchun brauzer backend manzilini bilmaydi.

**2. Nega backend Python'da?**
- NASA va Earth Engine'ning rasmiy kutubxonalari Python'da.
- Iqlim va suv hisoblari uchun eng yaxshi ilmiy kutubxonalar (pandas, numpy) ham Python'da.
- FastAPI tez ishlaydi va API hujjatini (`/docs`) o'zi yaratadi.

**3. Nega sun'iy yo'ldosh suratlarini o'zingiz yuklab olmaysiz?**
Bitta dala uchun yillar davomidagi minglab surat terabaytlab hajm bo'ladi. Earth Engine hisobni NASA arxivi yonida, Google serverlarida bajaradi va bizga faqat tayyor raqamni qaytaradi. Shuning uchun serverimiz kichik va arzon.

**4. Bitta tahlil ichida nima bo'ladi?**
1. Backend ish (job) ochadi va darhol uning raqamini qaytaradi.
2. Iqlim, dala tarixi, tuproq, suv va prognoz parallel yig'iladi.
3. Suv ehtiyoji, qoidalar, ballar va kalendar hisoblanadi.
4. Natija bazaga saqlanadi.

Frontend har 2-3 soniyada ish holatini so'raydi va progressni ko'rsatadi.

**5. Natija qayerda saqlanadi?**
- Tahlillar backend'da SQLite bazasida doimiy saqlanadi. Shuning uchun yer pasportidagi QR-kod boshqa telefonda ham ochiladi.
- Takroriy hisoblar disk keshida turadi.
- Brauzerda ham nusxa saqlanadi, fermer "Dalalarim" bo'limida ko'radi.

## Ma'lumot

**6. Ma'lumotlar qanchalik yangi?**
| Ma'lumot | Qanchalik yangi |
|---|---|
| 7 kunlik prognoz | har kuni |
| 30 m sun'iy yo'ldosh surati | har 2-3 kunda |
| NASA POWER iqlimi | oyiga bir yangilanadi |
| GRACE suv zaxirasi | 2024 yilgacha (NASA shu muddatgacha chiqargan) |

Har bir raqam yonida uning manbasi va davri ko'rsatiladi.

**7. Ma'lumot yetishmasa (bulut, uzilish) tizim nima qiladi?**
Ishlashda davom etadi. Yetishmagan qism "Noma'lum" deb, sababi bilan chiqadi, qolgan hammasi ko'rsatiladi. Hech qachon 0 yoki to'qib chiqarilgan qiymat qo'yilmaydi.

**8. Nega 2005-2025 yillar?**
20 yil iqlimning odatiy holatini va yomon yillarni ko'rsatish uchun yetarli. Shu bilan birga oxirgi isish trendini ham aks ettiradi. Dala tarixi esa 2013 yildan, Landsat 8 ishga tushgan yildan boshlanadi.

**9. Sun'iy yo'ldosh ma'lumoti yer usti o'lchovidan qanday farq qiladi?**
- **Sun'iy yo'ldosh:** butun dalani va har yilni qamraydi, lekin bilvosita o'lchaydi va bulut xalaqit beradi.
- **Yer usti o'lchovi:** aniq, lekin bitta nuqtada va kam joyda.

Shuning uchun biz ikkalasini birlashtiramiz: sun'iy yo'ldosh asosiy, fermer kiritgan laboratoriya natijasi esa ustun turadi.

## Tezlik va ishonchlilik

**10. Tahlil qancha vaqt oladi va nega?**
| Holat | Vaqt |
|---|---|
| Yangi dala, birinchi javob | ~4 s |
| Yangi dala, to'liq natija | 35-40 s |
| Oldin tahlil qilingan dala | ~1 s |

Eng ko'p vaqtni Earth Engine'dagi ko'p yillik sun'iy yo'ldosh hisobi oladi. Fermer 2-qadamdagi savollarga javob berayotganda bu hisob fonda boshlanib qo'yiladi.

**11. Qanday tezlashtirdingiz?**
- **Iqlim oldindan tayyor:** NASA POWER mamlakatning 100 ta ekin katagi uchun oldindan yuklangan.
- **Parallel yig'ish:** sun'iy yo'ldosh qismlari bir vaqtda olinadi.
- **Bir marta hisob:** bitta dala uchun bitta hisob, bir xil so'rovlar bitta ishga qo'shiladi.
- **Demo dalalar:** har kuni ertalab oldindan hisoblanadi.

**12. Backend ishdan chiqsa nima bo'ladi?**
Frontend'da o'zining zaxira hisoblash mexanizmi va tayyor demo natijalar bor, sayt ochilishda davom etadi. Vaqtinchalik 502 xatosi kelsa, frontend tahlilni tashlamaydi, qayta so'raydi.

**13. Earth Engine yoki NASA serveri ishlamasa-chi?**
O'sha qism "vaqtincha cheklangan" deb belgilanadi, qolgan tahlil chiqadi. `/health` sahifasi har bir manbaning (GEE, POWER, Open-Meteo) holatini va javob vaqtini ko'rsatadi, muammo darhol ko'rinadi.

**14. Bir vaqtda ko'p foydalanuvchi kirsa-chi?**
- Backend holatni saqlamaydi, og'ir hisob esa Earth Engine'da bajariladi. Shuning uchun server yuki kichik.
- Har bir dala bir marta hisoblanadi, keyin keshdan beriladi.
- Suiiste'molga qarshi har bir IP uchun daqiqasiga 20 ta tahlil cheklovi bor.

**15. Qanday testlaysiz?**
- **Backend:** 97 ta avtomatik test (suv, iqlim, qoidalar, iqtisod, API).
- **Frontend:** har bir o'zgarishda tiplar va kod sifati tekshiriladi, brauzerda kompyuter va telefonda sinaladi.
- **Ilmiy tekshiruv:** backtest hamda WaPOR, ECOSTRESS va OpenET bilan mustaqil solishtirish.

## Xavfsizlik va maxfiylik

**16. Foydalanuvchi ma'lumotlari qanday himoyalanadi?**
- Ro'yxatdan o'tish yo'q, ism, telefon yoki parol so'ralmaydi.
- Faqat dala chegarasi va fermer javoblari saqlanadi.
- Fikr-mulohaza (baho, hosil) faqat foydalanuvchi rozilik bildirsa yuboriladi.

**17. API kalitlari qayerda saqlanadi?**
Faqat backend serverida (Earth Engine xizmat hisobi, AI kaliti). Brauzerga hech qachon chiqmaydi. Xato xabarlarida ham server ichki ma'lumotlari ko'rsatilmaydi.

**18. Saytga hujum qilinsa?**
- Hamma ulanishlar HTTPS orqali.
- CORS faqat bizning saytga ruxsat beradi.
- IP bo'yicha so'rov cheklovi bor.
- Kiruvchi ma'lumot tekshiriladi: dala 0.1-5 000 ga, faqat O'zbekiston hududi, o'zini kesmaydigan poligon.

## Aniqlik va cheklovlar

**19. Tavsiya qanchalik aniq?**
Eng qurg'oqchil 3 yilda (2014, 2021, 2023) tavsiya 9 ta variantdan 1-o'rinda bo'ldi va gektariga 3 500-4 400 m³ suv tejadi. Suv sarfi usulimiz AQShda OpenET bilan solishtirilganda r = 0.96. Bu bitta pilot dala bo'yicha natija, shuning uchun uni ochiq aytamiz.

**20. AI xato qilsa-chi?**
AI qaror qabul qilmaydi, faqat izoh matnini yozadi, barcha raqamlar formulalardan chiqadi. AI matnida biz bermagan raqam bo'lsa yoki matn tushunarsiz bo'lsa, rad etiladi va o'rniga shablon ishlatiladi.

**21. Eng katta cheklovlar qanday?**
1. Sho'rlanish darajasi laboratoriya bilan kalibrlanmagan.
2. Hosil va narxlar mamlakat bo'yicha o'rtacha.
3. Bulutli yillarda dala tarixi to'liq bo'lmasligi mumkin.

Uchalasi ham ilovada ochiq ko'rsatiladi.

**22. Tizim fermer o'rniga qaror qabul qiladimi?**
Yo'q. U variantlarni toraytiradi va dalillarni ko'rsatadi, yakuniy qarorni fermer va agronom qabul qiladi. Bu har bir natija sahifasida yozilgan.

## Kengaytirish

**23. Boshqa davlatda ishlaydimi?**
NASA ma'lumotlari global, shuning uchun hisoblar istalgan joyda ishlaydi. O'zgartirish kerak bo'lganlari:
- hudud chegarasi;
- mahalliy sug'orish me'yorlari va narxlar;
- ekinlar ro'yxati.

Kod deyarli o'zgarmaydi.

**24. Yangi ekin qo'shish qanchalik oson?**
Ekinlar bitta sozlama faylida turadi: o'sish bosqichlari, suv koeffitsiyentlari, sho'rga chidamlilik chegarasi, mavsum. Yangi ekin shu faylga bir qator qo'shish bilan kiradi va avtomatik ravishda barcha hisoblarga tushadi.

**25. Kelajakda nimani qo'shasiz?**
1. Laboratoriya namunalari bilan sho'rlanishni kalibrlash.
2. O'zbekiston tovar-xom ashyo birjasidan (UzEx) jonli narxlar.
3. Fermerlardan haqiqiy hosilni yig'ib, modelni o'qitish. Buning uchun API allaqachon tayyor.
4. Telegram bot orqali haftalik ish eslatmalari.
