# TerraVision backend: 5-bosqich (qisqa)

`29d65e1` (FRONTEND_UCHUN_OZGARISHLAR.md) frontend'ga ulandi va sinaldi. Quyida faqat ikki band bor.

## 1. Kunlik oldindan hisoblash: demo dalalar ro'yxatini yangilang (muhim)

Hujjatda yozilishicha, 05:00 dagi oldindan hisoblash eski **±0.0012° × ±0.0009° kvadratlar** bilan ishlaydi. Frontend esa endi bu kvadratlarni ishlatmaydi. Kvadratlar kanal, yo'l va qo'shni dalalarni kesib o'tardi, shuning uchun har bir dala chegarasi sun'iy yo'ldosh suratidan qo'lda chizildi. Poligon boshqa bo'lgani uchun `fieldId` ham boshqa, demak sizning kunlik keshingiz bizning demolarni qamramaydi.

Iltimos, kunlik vazifaga quyidagi poligonlarni qo'ying. Har biri uchun `lang: "uz"` va `lang: "en"` kerak.

**Jonli demo dalalar** (`/result/live-*`, taqqoslashdagi "Demo joylar"):

```json
{
  "paxta":        [[68.73211,40.56228],[68.74173,40.56168],[68.742,40.55912],[68.73275,40.55943],[68.73211,40.56228]],
  "paxta-bugdoy": [[69.03531,40.40136],[69.03728,40.40108],[69.0368,40.39944],[69.03488,40.39976],[69.03531,40.40136]],
  "beda":         [[68.84441,40.48041],[68.84626,40.48041],[68.84606,40.47652],[68.84419,40.47652],[68.84441,40.48041]]
}
```

**Wizard'dagi demo dalalar** (Tahlil → "Demo dalalar"):

```json
{
  "sirdaryo": [[68.6846,40.4994],[68.6888,40.4994],[68.6888,40.5029],[68.6846,40.5029],[68.6846,40.4994]],
  "xorazm":   [[60.61679,41.49802],[60.6182,41.49771],[60.61767,41.49601],[60.61668,41.49369],[60.6152,41.49431],[60.61679,41.49802]],
  "fargona":  [[71.68703,40.5019],[71.68908,40.5021],[71.68989,40.50094],[71.68776,40.50049],[71.68703,40.5019]],
  "jizzax":   [[67.55023,39.97217],[67.55533,39.97059],[67.55533,39.97013],[67.55023,39.97095],[67.55023,39.97217]]
}
```

**Frontend yuboradigan so'rov** (jonli demolar uchun):

```json
{"polygon": {"type": "Polygon", "coordinates": [<ring>]}, "rotation": [{"year": 2023, "crop": null}, {"year": 2024, "crop": null}, {"year": 2025, "crop": null}],
 "priorities": ["water", "salinity"], "water": {"availability": "medium", "method": "furrow"}, "profile": "farmer", "lang": "uz" | "en"}
```

**Taqqoslash:** 3 ta jonli demo joy, 5 ta maqsad (`winter_wheat`, `cotton`, `alfalfa`, `pasture`, `general`), ikki tilda. Joy nomlari so'rovning bir qismi:
- `uz`: "Paxta dalasi", "Paxta-bug'doy dalasi", "Beda dalasi";
- `en`: "Cotton field", "Cotton-wheat field", "Alfalfa field".

Bugun bularning hammasini frontend tomonidan bir marta qo'lda oldindan hisoblatdik. Lekin kesh muddati tugasa, hakamlar oldida birinchi ochilish yana sekin bo'ladi.

## 2. AI izohida ichki so'zlar

- **Ko'rindi:** jonli `explanation.why` da "Hisobda bu rejim JSON'dagi ko'rsatkichlar bo'yicha 79 ball oladi: suv 62, daromad 68, ..." kabi matn chiqdi.
- **Frontend hozircha nima qiladi:** bunday matnni (`JSON`, "ko'rsatkichlar bo'yicha", "ball oladi:") o'tkazib yuboradi va o'zining raqamli izohini ko'rsatadi.
- **Kerak:** promptga qoida qo'shing: "Fermerga oddiy tilda yoz. JSON, metrika nomlari va ichki ballarni tilga olma. 2-3 gap, hozirgi rotatsiyaga nisbatan farq bilan."

## Frontend'da ulanganlar (ma'lumot uchun)

- `lang: "en"`: analyze, compare, zones (`?lang=`), passport (`?lang=`).
- `partial.rankingFinal: false` bo'lsa, tavsiya ko'rsatilmaydi va "Strategiyalar baholanmoqda" chiqadi.
- `explanationStatus: "pending"` bo'lsa, 90 s dan keyin `GET /api/analysis/{id}` qayta so'raladi. `generatedBy: "llm"` bo'lsa "AI" belgisi qo'yiladi va `explanation.summary` ishlatiladi.
- `soil.salinity.usedReason`, `inPlan` filtri, `history.sensors`, `history.m1.warning`, `strategies[].profit`.
- `POST /api/feedback`: 1-5 yulduzli baho va kiritilgan hosil.
