# TerraVision: judge questions and short answers

Each answer is meant to be said out loud in 15-20 seconds. Numbers come from our own tests on the live system (November 2026).

## General

**1. What problem do you solve, and for whom?**
Uzbek farms are short of water and their soil is getting saltier, yet most farmers still repeat cotton or wheat every year. TerraVision tells four kinds of users what to do with a field: farmers (what to grow), herders (pasture condition), land seekers (which plot is best) and experts (the full method).

**2. Which NASA data do you use, and for what?**
- NASA POWER: 20 years of daily climate, for water need, frost and heat.
- SMAP: soil moisture and soil temperature, for drought and sowing dates.
- GPM IMERG: heavy rain and erosion.
- Landsat and Sentinel-2 (HLS, 30 m): field history and zones inside the field.
- MODIS: pasture greenness, snow and evapotranspiration.
- GRACE/GRACE-FO: long-term water storage.
- SRTM: slope.
- ECOSTRESS: an independent check of real water use.

**3. How do you know the recommendation is right?**
We check it four ways:
1. **Backtest:** on the three driest past years (2014, 2021, 2023), our recommended rotation ranked 1st of 9 and saved about 3,500-4,400 m³/ha.
2. **Official norms:** our water need is compared with official irrigation norms (ADB, TIIAME).
3. **Independent satellites:** our water-use estimate is cross-checked with FAO WaPOR and NASA ECOSTRESS, and both agree.
4. **US ground truth:** the same water method tested against OpenET gives r = 0.96.

**4. What happens when data is missing or uncertain?**
We never show a zero. A missing value is shown as "Unknown" with the reason. Low-confidence values, such as salinity estimated from satellite, carry a "low confidence" label and ask for a lab result. Every strategy also lists its data gaps and the risks an agronomist should check.

**5. Does it replace the agronomist?**
No. It narrows the options and shows the evidence; the final decision stays with the farmer and the agronomist. That sentence is on every result page.

**6. How long does an analysis take?**
The first answer appears in 2-4 seconds; the full analysis of a brand-new field takes 15-45 seconds. A field that was analysed before opens in about 1 second.

**7. Can it scale to all of Uzbekistan?**
Yes:
- **Climate:** NASA POWER is pre-loaded for the 100 grid cells that cover the country's farmland.
- **Satellite work:** it runs on Google Earth Engine.
- **Repeat visits:** each field is computed once and cached.

The main cost is Earth Engine compute for new fields, not our server.

**8. What would you build next?**
1. Calibrate salinity with lab samples from the regional soil service.
2. Add live market prices from the Uzbek commodity exchange (UzEx).
3. Collect farmer feedback; the API is already built, so real yields can improve the model.

## Frontend

**9. What is the frontend stack, and why?**
- **Core:** Next.js 16 with React 19, Tailwind CSS 4 and Motion.
- **Why Next.js:** static and pre-rendered pages load fast on weak phones.
- **Hosting:** Vercel. One `/py` proxy hides the backend address and avoids CORS problems.
- **Quality (Lighthouse, mobile):** Accessibility 97-100, SEO 100, Best Practices 96-100.

**10. How does the 3D field work?**
- **Engine:** MapLibre GL draws Esri satellite imagery on a NASA-derived terrain model (Mapterhorn elevation).
- **What it shows:** the field's real boundary is extruded and coloured month by month by the planned crop, so the farmer can play the 3-year rotation like a video.
- **Loading:** the 3D engine loads only after the page is idle, so the first screen stays fast.

**11. How do you show 30-metre satellite images of the field?**
- **Source:** NASA's Harmonized Landsat-Sentinel (HLS) imagery from NASA GIBS.
- **Cloud and haze check:** the browser downloads the image tile that covers the field and measures the cloud and haze over it pixel by pixel, keeping the clearest day of each month.
- **Cost:** no backend is needed for this, and the requests run at low priority so the visible map loads first.

**12. Why not just show maps? Why the questions-style tabs?**
Farmers don't think in datasets. The result page is four questions in decision order: What to grow? What to do when? How much water? How is my field? Every chart sits under the question it answers.

**13. How do you handle a slow backend or no internet?**
- **Slow backend:** the analysis runs as a background job; we show the first answer at once and swap in the full one when it arrives.
- **Backend down:** a built-in fallback engine and pre-computed demo fields still work.
- **Compare page:** it starts the request before the user presses the button.

**14. Languages and accessibility?**
- **Languages:** Uzbek (Latin and Cyrillic) and English, switchable anywhere.
- **Accessibility:** colour-blind-safe palettes for map zones, keyboard and screen-reader labels, reduced-motion support, and a mobile layout down to 360 px.

**15. How do you avoid misleading the user?**
- Every number shows its source badge.
- First estimates are marked as "First estimate".
- Low-confidence values are labelled.
- Field boundaries in the demos were drawn by hand from satellite imagery, so the analysis covers one real field, not a random square.

## Backend

**16. What is the backend architecture?**
- **Stack:** Python FastAPI, Google Earth Engine for satellite data, NASA POWER and Open-Meteo for climate.
- **Storage:** SQLite for saved analyses, a disk cache for repeated requests.
- **Jobs:** heavy work runs as background jobs that report their progress; independent data sources are fetched in parallel.

**17. How do you compute water need?**
FAO-56 Penman-Monteith reference evapotranspiration from NASA POWER, multiplied by crop coefficients for each growth stage, minus effective rainfall, divided by irrigation efficiency (furrow 55%, drip 90%). We report the range across 20 climate years, not a single number.

**18. How are strategies scored?**
- **Rules:** every rotation is checked against 7 agronomic rules: fits the season, salt tolerance, water limit, rotation break, sowing window, bare-field days, legume bonus.
- **Metrics:** it gets 0-100 scores for water, income, soil, salinity, climate risk and labour.
- **Final score:** a weighted average using the farmer's own priority order.
- **Robustness:** we re-score each rotation in a normal year, a dry year (−30% rain) and a hot year (+1.5 °C).

**19. How do you know what the farmer grew before?**
- **Imagery:** monthly NDVI since 2013, from Landsat until 2017 and Sentinel-2 from 2018.
- **Model:** a trained crop classifier (Presto plus logistic regression), with phenology rules as a fallback.
- **Confidence:** the model is calibrated, and it warns when a field is far from its training area.

**20. How do you find problem zones inside a field?**
- **Signals:** for each 30 m pixel we compare multi-year greenness, summer surface temperature, a salinity index and slope with the field average.
- **Zones:** the worst parts become zones (low vigour, water stress, salinity, erosion), clipped to the field boundary.
- **Noise filter:** a difference counts only if it is larger than the satellite's error (for example at least 1 °C for temperature).

**21. How do you use GRACE when it is so coarse (~300 km)?**
As regional context, not a field measurement. It shows that the basin has lost about 6 cm of water per decade, which supports choosing a lower-water rotation. The UI says "regional average, not field-level".

**22. What does the AI (LLM) do, and how do you stop it from inventing numbers?**
- **Its role:** an LLM only rewrites the explanation in plain language. All numbers are calculated by our formulas first.
- **Number guard:** if the text contains a number we did not give it, we discard it and use our template.

**23. How fast is it, and what did you do about speed?**
- **Result:** first answer in about 4 s, full result in about 37 s for a brand-new field, no gateway timeouts.
- **Climate pre-loaded:** NASA POWER is pre-loaded for the country's farmland.
- **Earth Engine work:** it runs once per field, in parallel, and is shared between requests.
- **Water calculation:** vectorised, about 6× faster.
- **Duplicate requests:** they join the running job.

**24. How do you test it?**
- **Automated tests:** 97 backend tests cover water, climate, rules, economics and the API.
- **Validation:** a backtest on past drought years, plus independent checks against WaPOR, ECOSTRESS and OpenET.
- **Frontend:** type-checked and linted on every commit, with browser checks on desktop and phone.

**25. What are the main limitations today?**
- **Salinity:** the level from satellite is a low-confidence estimate until calibrated with lab data.
- **Yields and prices:** these are national averages.
- **Field history:** it depends on cloud-free imagery.

We show all three openly in the app instead of hiding them.
