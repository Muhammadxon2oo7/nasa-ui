import type { ModelInfo } from "@/types/api";

/** Model cards for /about (PRO_REJA §6). Honest about what is and isn't trained yet. */
export const MODELS: ModelInfo[] = [
  {
    id: "M1",
    name: "Field history (crop type per year)",
    baseModel: "Now: NDVI phenology rules (baseline B0). Planned: Presto (NASA Harvest, NeurIPS 2023)",
    ourContribution: "Monthly Sentinel-2 NDVI per field with SCL cloud mask; rules for winter wheat, double crop, cotton, alfalfa and fallow; farmer answers override.",
    trainingData: "Planned: Remelgado et al. 2020, 8,435 labelled points in Uzbekistan (40 crops → 8 classes)",
    validation: "Planned: time split 2015–2017 train / 2018 test, plus a held-out region",
    limitations: [
      "Cotton, maize and rice look alike in NDVI alone",
      "The second crop after wheat is detected, but not its species",
      "No accuracy number yet: we will publish it only after the 2018 test set is run",
    ],
  },
  {
    id: "M2",
    name: "Seasonal risk outlook",
    baseModel: "ECMWF SEAS5 (51 ensemble members, via Open-Meteo)",
    ourContribution: "Elevation lapse-rate correction, comparison with the 20-year NASA POWER normal, and per-strategy robustness across all members",
    validation: "Ensemble spread shown as uncertainty. Hindcast skill check against Copernicus CDS is next",
    limitations: ["No hindcast bias correction yet, so confidence is reported as low", "Probabilities, not a forecast of a specific day"],
  },
  {
    id: "M3",
    name: "What-if simulation",
    baseModel: "FAO-56 water balance + rules R1–R8 + scoring",
    ourContribution: "Shifts 20 years of NASA POWER Tmax/Tmin by ΔT and rainfall by ΔP, then recomputes ET0, GDD, frost dates, water need and ranking",
    limitations: ["Does not change humidity, wind or radiation", "Crop yields are not simulated, only suitability and water"],
  },
];
