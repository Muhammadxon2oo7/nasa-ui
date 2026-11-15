# TerraVision: project description (for the Space Apps project page)

**Proof first**
- **Ranked 1st of 9** in the three driest years (2014, 2021, 2023): a backtest on a cotton pilot field shows our recommended rotation would have been the best of nine options.
- **3,500-4,400 m³/ha of water saved** per year in those drought years compared with the farmer's current rotation.
- **r = 0.96** against the independent OpenET estimate when our water-use method is run on US fields (California, Arizona).

**What it is**
TerraVision turns NASA Earth observations into one clear decision for a field in Uzbekistan, where farms are short of water and soils are getting saltier. A farmer outlines a field on a map and gets at least three rotation strategies compared with what they grow today, scored on water, salinity, soil, income and climate risk, with the evidence, data gaps and risks for each. Herders get a pasture report, land seekers compare places, experts see the full method.

**9 NASA datasets, by name**
1. **NASA POWER**: 20 years of daily climate for water need (FAO-56 ET0), frost and heat.
2. **SMAP L4**: soil moisture and temperature for drought and sowing dates.
3. **GPM IMERG**: heavy-rain days and erosion risk.
4. **Landsat 8/9**: field history 2013-2017 and summer surface temperature for water-stress zones.
5. **HLS (Harmonized Landsat Sentinel-2)**: 30 m images of the field, the clearest day of each month.
6. **MODIS**: pasture greenness (NDVI), grazing capacity (NPP), snow and evapotranspiration.
7. **GRACE / GRACE-FO**: the regional decline in ground and surface water storage.
8. **SRTM**: elevation and slope for erosion and run-off.
9. **ECOSTRESS**: an independent check of real crop water use from thermal imagery.

Partner data: ESA Sentinel-2, ERA5, ECMWF SEAS5, SoilGrids, FAO WaPOR, FAO GAEZ, OpenET.

**How it works**
Outline a field → NASA data is pulled and computed (climate, history, soil, water) → rotations are checked against 7 agronomic rules, scored by the farmer's own priorities and re-tested in dry and hot years → the answer, a work calendar and risk zones inside the field. Every number shows its source; missing data is shown as "unknown", never as zero. The tool supports, and does not replace, the farmer and the agronomist.

**Links**
- Live site: https://nasa-ui.e-investment.uz
- Code: https://github.com/Muhammadxon2oo7/nasa-ui (frontend), https://github.com/Muhammadalixon-Qodirov/nasa_agro (backend)
