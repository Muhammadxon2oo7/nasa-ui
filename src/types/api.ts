// Data contract shared by the frontend and the backend.
// Mirrors FRONTEND_REJASI.md §5.2 exactly, so a FastAPI backend (schemas.py) can replace
// the built-in Next.js route handlers without touching the UI.

export type Level = "low" | "medium" | "high";
export type Priority = "water" | "income" | "soil" | "salinity" | "forage" | "labor";
export type IrrigationMethod = "furrow" | "drip" | "sprinkler";
export type CropId =
  | "cotton" | "winter_wheat" | "barley" | "sorghum" | "sunflower" | "sugar_beet"
  | "safflower" | "quinoa" | "mung_bean" | "soybean" | "chickpea" | "alfalfa"
  | "maize" | "rice" | "potato" | "carrot" | "tomato" | "melon" | "fallow" | "other";

// ---------- Request ----------
export interface AnalyzeRequest {
  polygon: GeoJSON.Polygon;
  rotation: { year: number; crop: CropId | null; secondCrop?: CropId | null }[]; // null = let AI detect
  priorities: Priority[]; // order matters, at most 3
  water: { availability: Level; limitM3PerHa?: number; method: IrrigationMethod; appliedM3PerHa?: number };
  soil?: { eceDsM?: number; humusPct?: number; ecwDsM?: number };
  constraints?: { equipment?: string[]; hasLivestock?: boolean };
  lang: "uz" | "en";
  /** FastAPI backend: temporary manual salinity until satellite detection is calibrated */
  salinityLevel?: Level | null;
  // ---- v2.1 platform (FRONTEND_REJASI §5.3) ----
  profile?: Profile;
  modules?: Module[]; // the core is always computed
  placeType?: "polygon" | "point_buffer"; // point → 200 m radius
  livestock?: LivestockInput;
}

export interface LivestockInput {
  herd: { cattle: number; smallRuminants: number; horses: number };
  grazingFrom: number;
  grazingTo: number; // months 1-12
  pastureType: "natural" | "sown" | "mixed";
  hasWaterOnSite: boolean;
  priorities: ("conserve" | "more_animals" | "heat" | "forage")[];
}

// ---------- Response ----------
/** Extra NASA evidence from the FastAPI backend; every part is optional. */
export interface Insights {
  /** GRACE/GRACE-FO total water storage around the field */
  waterStorage?: { trendCmPerYear: number; series: { year: number; cm: number }[]; period?: string; source?: string; resolution?: string; note?: string };
  /** GPM IMERG heavy-rain days and erosion */
  extremeRain?: { daysPerYear: number; thresholdMm: number; trendPerDecade: number; maxDailyMm: number; byYear?: { year: number; heavyDays: number; maxMm: number }[]; period?: string; source?: string };
  erosionRisk?: { level: Level; slopeDeg: number; heavyRainDaysPerYear: number; method?: string };
  /** when a crop's sensitive stage meets heat or frost, and how often */
  vulnerableWindows?: { crop: CropId; from: string; to: string; risk: "heat" | "frost" | "autumn_frost"; probPct: number; note?: string }[];
  /** SMAP root-zone moisture this month vs the long-term normal */
  moistureAnomaly?: { month: string; valueM3M3: number; normalM3M3: number; zScore: number; level: "dry" | "normal" | "wet"; yearsInNormal?: number; source?: string; resolution?: string };
  /** salinity estimated from satellite when the farmer gave none */
  salinityEstimate?: { level: Level; eceEstDsM: number | null; confidence: "high" | "medium" | "low"; method?: string; source?: string; note?: string; usedLevel?: Level; usedReason?: string };
  salinitySource?: "lab" | "user" | "satellite";
  autumnSowing?: { crop: CropId; windowFrom: string; windowTo: string; rule: string; source?: string }[];
}

export type ZoneKind = "low_vigor" | "water_stress" | "salinity" | "erosion";
export interface ZoneProps { kind: ZoneKind; level: Level; areaHa: number; value: number; fieldMean: number; threshold: number; unit: string; note: string }
export interface ZonesData { features: { type: "Feature"; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; properties: ZoneProps }[]; method?: string; sources?: string[]; reason?: string; failedKinds?: string[] }

export interface AnalyzeResponse {
  /** first answer from a running backend job: climate + strategies only, the rest is still computing */
  preliminary?: boolean;
  /** job to resume polling on the result page while `preliminary` */
  pendingJobId?: string;
  /** false when optional parts (GAEZ, M1, ...) were still pending; refetch later */
  complete?: boolean;
  /** false in a preliminary answer: no recommendation yet, strategies are still being ranked */
  rankingFinal?: boolean;
  /** "pending" while the AI explanation is still being written in the background */
  explanationStatus?: "pending" | "llm" | "template";
  insights?: Insights;
  fieldId: string;
  field: FieldInfo;
  summary: {
    text: string;
    salinity: Level;
    waterNeedM3PerHa: number;
    mainRisk: string;
    bestStrategyId: string;
  };
  history: HistoryData;
  climate: ClimateData;
  soil: SoilData;
  water: WaterData;
  strategies: Strategy[]; // ≥ 3, [0] = current rotation
  seasonal?: SeasonalOutlook; // M2
  sources: DataSourceRef[];
  degraded?: string[]; // e.g. ["sentinel2", "soilgrids"]
  generatedAt: string; // ISO date
  // ---- v2.1 ----
  profile?: Profile;
  modulesComputed?: Module[];
  livestock?: LivestockData;
  // ---- v2.2 / v2.3 (QOSHIMCHA_FUNKSIYALAR, FRONTEND_REJASI §5.5-5.6). null = unknown, reason in extrasUnknown
  calendar?: CalendarData | null; // B1 (+N2, N8)
  actualWater?: ActualWaterData | null; // A1 (+N5 checks)
  norms?: NormsData | null; // A2
  waterSupply?: WaterSupplyData | null; // N1
  gaez?: GaezData | null; // N9
  extrasUnknown?: Partial<Record<"calendar" | "actualWater" | "norms" | "waterSupply" | "gaez" | "leaching" | "history" | "soil" | "livestock", string>>;
  // ---- FastAPI backend (nasa_agro, FRONTEND_UCHUN_API.md) ----
  backend?: "fastapi" | "next";
  /** the backend's own field id (passport, re-analysis) when the page uses an alias like live-<name> */
  sourceId?: string;
  forecast?: ForecastData | null;
  degradedReasons?: string[]; // human-readable reasons from the backend
}

export interface FieldInfo {
  areaHa: number;
  centroid: [number, number]; // [lat, lon]
  region?: string;
  district?: string;
  periodStart: number;
  periodEnd: number;
  polygon: GeoJSON.Polygon;
  placeType?: "polygon" | "point_buffer";
  slopeDeg?: number | null;
  elevationM?: number | null;
}

export interface DetectedCrop {
  crop: CropId;
  start: string;
  end: string; // "2021-10-01"
  confidence: number; // 0-1
  source: "M1" | "rules" | "user";
}
export interface HistoryData {
  ndvi: { date: string; value: number | null }[]; // monthly
  seasons: { year: number; crops: DetectedCrop[] }[];
  bareWindows: { start: string; end: string; days: number }[];
  model?: { name: string; accuracy?: number };
  /** which satellite each part of the NDVI series comes from (Landsat 2013-2017, Sentinel-2 2018+) */
  sensors?: { sensor: string; from: string | number; to: string | number; name: string }[];
  /** crop model warning, e.g. field far from the training area */
  modelWarning?: string;
}

export interface ClimateData {
  lastSpringFrost: { median: string; latest: string; latestYear: number }; // "03-28"
  firstAutumnFrost: { median: string; earliest: string; earliestYear: number };
  frostFreeDays: number;
  heatDays40: { year: number; days: number }[];
  monthly: {
    month: number;
    tmaxAvg: number;
    tminAvg: number;
    tmaxP10: number;
    tmaxP90: number;
    precipMm: number;
    et0Mm: number;
  }[];
  lastYearMonthly?: { month: number; tmax: number; tmin: number; precipMm: number }[];
  precipTrendPct: number;
  gddAfterWheat: number;
  cropGddFit: { crop: CropId; required: number; fits: boolean }[];
  frostProbability: { date: string; pct: number }[]; // "03-15"
  spi3?: { date: string; value: number }[];
}

export interface SoilData {
  salinityLevel: Level;
  salinityTrend: { year: number; ndsi: number }[];
  salinityTrendPct?: number;
  texture?: { clay: number; sand: number; silt: number; className?: string };
  socGKg?: number;
  ph?: number;
  soilMoisture?: { date: string; rootzone: number; climatology: number }[];
  cropTolerance: { crop: CropId; tolerance: "tolerant" | "moderate" | "sensitive"; fit: "ok" | "warn" | "bad" }[];
  isEstimated: boolean;
}

export interface WaterData {
  byStrategy: Record<
    string,
    {
      netMm: number; // before efficiency (frontend recomputes gross)
      grossM3PerHa: number;
      lowM3PerHa: number;
      highM3PerHa: number;
      monthly: { month: number; etcMm: number; peffMm: number; irrigationMm: number }[];
      schedule?: { month: number; times: number; m3PerHa: number }[];
    }
  >;
  et0Daily?: { doy: number; mm: number }[];
  efficiency: Record<IrrigationMethod, number>; // { furrow: 0.55, drip: 0.9, sprinkler: 0.75 }
  limitM3PerHa?: number;
}

export interface RuleCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  detail?: string;
}

export interface Strategy {
  id: string; // "A", "B", ...
  name: string; // "Bug'doy + oq jo'xori"
  isCurrent: boolean;
  isNearest?: boolean; // "nearest option"
  seasons: { year: number; crop: CropId; start: string; end: string }[];
  sowWindow?: { crop: CropId; from: string; to: string }[];
  metrics: Record<MetricName, number | null>; // 0-100 each, null = unknown (ADR-10)
  unknownReasons?: Partial<Record<MetricName, string>>;
  robustness?: { score: number; worstScore: number; scenarios: { id: string; score: number }[] };
  /** B2 (backend): estimated GROSS revenue per year, before costs; null usd = no yield/price data */
  income?: StrategyIncome;
  /** A2 (backend): calculated net irrigation vs official regional norms */
  waterNorms?: WaterNorm[];
  /** days the field stands bare in the growing season, with the windows */
  bare?: { daysPerYear: number; windows: { year: number; from: string; to: string; days: number }[] };
  /** what the rotation does to the soil, in physical units */
  soilEffects?: { nFixKgHaPerYear: number; coverDaysPerYear: number; rootDepthMaxCm: number; residueTHa: number; pestBreakYears: number; source?: string };
  laborDaysPerHa?: number;
  /** B2 net profit with default (or the farmer's) costs */
  profit?: { revenueUsdPerHa: number | null; costUsdPerHa: number | null; profitUsdPerHa: number | null; profitUzsPerHa?: number | null; basis?: "defaults" | "user" };
  metricConfidence?: Partial<Record<MetricName, "high" | "medium" | "low" | null>>;
  /** spread of the yearly water need across 20 climate years */
  waterP10?: number;
  waterP90?: number;
  /** gross water need in the dry (−30 % rain) scenario - B2 dry-year profit */
  dryWaterM3PerHa?: number;
  score: number; // backend's initial score
  waterM3PerHa: number;
  saltFit: "ok" | "warn" | "bad";
  rules: RuleCheck[];
  explanation: {
    why: string;
    evidence: { text: string; source: string }[];
    benefits: string[];
    gaps: string[];
    risks: string[];
    generatedBy: "llm" | "template";
    /** 1-2 sentence AI summary when generatedBy is "llm" */
    summary?: string;
  };
}

export interface StrategyIncome {
  usdPerHa: number | null;
  uzsPerHa?: number;
  lowUsdPerHa?: number;
  highUsdPerHa?: number;
  confidence?: "high" | "medium" | "low" | "proxy";
  isGross?: boolean;
  byCrop?: { crop: CropId; yieldTHa: number; priceUsdKg: number; yieldSource: string; priceSource: string }[];
  missing?: CropId[];
  reason?: string;
}

export interface WaterNorm {
  crop: CropId;
  basis: "net" | "gross";
  calculatedM3PerHa: number;
  normRangeM3PerHa: [number, number];
  status: "below" | "within" | "above";
  diffPct: number;
  points: { value: number; label: string; source: string; url?: string }[];
  note?: string;
}

export type MetricName = "water" | "income" | "soil" | "salinity" | "climateRisk" | "labor";

export interface SeasonalOutlook {
  model: "ecmwf_seas5";
  issuedAt: string;
  members: number;
  months: {
    month: string; // "2026-12"
    tempNormal: number;
    tempP10: number;
    tempP25?: number; // FastAPI backend: not yet
    tempP50: number;
    tempP75?: number;
    tempP90: number;
    precipNormal: number;
    precipP10: number;
    precipP50: number;
    precipP90: number;
    probWarmer: number;
    probWetter: number; // 0-1
  }[];
  robustness: Record<string, number>; // strategyId → 0-1
  confidence: Level;
}

export interface DataSourceRef {
  id: string;
  name: string;
  provider: string;
  period?: string;
  url: string;
}

export interface ModelInfo {
  id: "M1" | "M2" | "M3";
  name: string;
  baseModel: string;
  ourContribution: string;
  trainingData?: string;
  validation?: string;
  metrics?: { name: string; value: number; baseline?: number; baselineName?: string }[];
  confusionMatrixUrl?: string;
  limitations: string[];
}

export interface Crop {
  id: CropId;
  name: { uz: string; en: string };
  color: string;
  icon: string;
  waterClass: Level;
  saltTolerance: "tolerant" | "moderate" | "sensitive";
  nFixing: boolean;
}

// ---------- What-if ----------
export interface WhatIfRequest {
  fieldId: string;
  dT: number;
  dPpct: number;
}

// ---------- v2.1 platform types (FRONTEND_REJASI §5.3) ----------
export type Profile = "farmer" | "herder" | "land_seeker" | "expert";
export type Module = "crop" | "livestock";
export type Mode = "simple" | "expert";

/** A value we could not compute: null + reason. Never replaced by 0. */
export interface Unknown {
  value: null;
  reason: string;
}
export type MaybeNumber = number | Unknown;
export const isUnknown = (v: MaybeNumber | undefined | null): v is Unknown => typeof v === "object" && v !== null && v.value === null;

export type Recommendation = Strategy["explanation"] & { id: string; title: string };

export interface LivestockData {
  pasture: {
    statusLevel: Level; // low = poor condition
    anomalyPct: MaybeNumber;
    percentile: MaybeNumber;
    year: number;
    ndviThisYear: { month: number; value: number | null }[];
    ndviNorm: { month: number; p10: number; p50: number; p90: number }[];
    yearlyPeak: { year: number; ndvi: number }[];
    droughtYears: number[];
    areaHa: number; // area the MODIS statistics cover
  };
  capacity: {
    lowAuPerHa: MaybeNumber;
    highAuPerHa: MaybeNumber;
    herdAu: number;
    grazingDays: number;
    status: "ok" | "warn" | "over" | "unknown";
    assumptions: { name: string; value: number; unit: string; source: string }[];
  };
  heat: {
    stressDaysPerYear: number;
    severeDaysPerYear: number;
    trendDaysPerDecade: number;
    yearly: { year: number; days: number }[];
    monthly: { month: number; thiMean: number; thiMax: number }[];
    forecast7d: { date: string; thiMax: number; level: Level }[];
    thresholds: { mild: number; moderate: number; severe: number };
  };
  waterSources?: { nearestPermanentKm: MaybeNumber; nearestSeasonalKm: MaybeNumber; nearestPermanentLatLon?: [number, number]; nearestSeasonalLatLon?: [number, number]; radiusKm: number };
  recommendations: Recommendation[];
}

// Land selection
export type CompareGoal = "winter_wheat" | "cotton" | "alfalfa" | "pasture" | "general";
export interface CompareRequest {
  places: { name: string; polygon: GeoJSON.Polygon }[]; // 2-4
  goal: CompareGoal;
  lang: "uz" | "en";
}
export interface CompareResponse {
  goal: CompareGoal;
  places: {
    placeId: string;
    name: string;
    areaHa: number;
    suitability: number; // 0-100
    rows: Record<string, { value: string; better: boolean }>;
    mainRisk?: string;
    polygon: GeoJSON.Polygon;
  }[];
  bestPlaceId: string;
  explanation: Strategy["explanation"];
}

// ======================= v2.2: additional features (FRONTEND_REJASI §5.5) =======================

// B1
export interface CalendarEvent {
  id: string;
  date: string; // ISO yyyy-mm-dd
  endDate?: string;
  type: "sow" | "irrigate" | "leach" | "harvest" | "weather" | "livestock" | "pest" | "soil_sample" | "feed" | "prepare";
  title: string;
  detail?: string;
  m3PerHa?: number;
  severity?: Level;
  source: string;
}
export interface SoilTempSowing {
  crop: CropId;
  thresholdC: number;
  typicalDate: string; // "04-15", 20-year median
  windowFrom: string; // "04-18"
  windowTo: string;
  forecastReachInDays?: number | null;
  source: "ERA5-Land" | "SMAP L4";
}
export interface CalendarData {
  today: string;
  thisWeek: CalendarEvent[];
  next90Days: CalendarEvent[];
  leaching?: {
    recommended: boolean;
    reason: string;
    stages: { date: string; m3PerHa: number }[];
    totalLowM3PerHa: number;
    totalHighM3PerHa: number;
    continuousM3PerHa: number; // same salt removal by continuous ponding (for comparison)
    method: "continuous" | "intermittent";
    inputs: { eci: number; ecf: number; depthM: number; k: number; eciSource: "satellite" | "lab"; nextCrop: CropId };
    warnings: string[];
    frozenRisk: { dekad: string; pct: number }[]; // N8: "12-2" = 2nd dekad of December
  };
  soilTempSowing?: SoilTempSowing[]; // N2
}

// A1
export interface ActualWaterData {
  year: number;
  crops: CropId[];
  needM3PerHa: number | null; // FAO-56 ETc of the crops detected that year (null: second crop / unknown crop)
  needReason?: string;
  consumedM3PerHa: number; // Sentinel-2 NDVI → Kcb → Kcb·ET0
  consumedLow: number;
  consumedHigh: number;
  checks: { source: "wapor" | "modis" | "ecostress"; m3PerHa: number | null; images?: number; note?: string; status?: "agree" | "disagree" | "insufficient"; label?: string }[];
  monthly: { month: number; needMm: number | null; consumedMm: number; ndvi: number | null }[];
  method: string;
  /** backend-computed when the farmer gave applied water */
  appliedM3PerHa?: number; efficiencyPct?: number; excessM3PerHa?: number;
}

// A2
export interface NormsData {
  zone: string;
  normM3PerHa: number;
  fao56M3PerHa: number;
  diffPct: number;
  source: string;
}

// B2 (computed in the browser from the farmer's prices, yields and costs)
export interface EconomicsInput {
  crops: Partial<Record<CropId, { yieldTPerHa?: number; priceUzsPerKg?: number; costUzsPerHa?: number }>>;
}

// C3 (UI only, stored locally)
export interface FeedbackEntry {
  fieldId: string;
  at: string;
  rating?: number; // 1-5
  yieldTPerHa?: number;
  crop?: CropId;
  appliedM3PerHa?: number;
  note?: string;
}

// A6
export interface BacktestResult {
  fieldId: string;
  name: string;
  cutoff: string;
  evalYear: number;
  weather: { precipPct: number; et0Pct: number; heatDays: number; normalHeatDays: number };
  rows: { strategyId: string; name: string; isCurrent: boolean; predictedRank: number; realizedRank: number; predictedWater: number; realizedWater: number; overLimit: boolean; robustness?: number }[];
  spearman: number | null;
  recommendedHeld: boolean; // the recommended plan stayed in the top 2 under the real weather
  summary: string;
}

// ======================= v2.3: NASA data features (FRONTEND_REJASI §5.6) =======================

// N1
export interface WaterSupplyData {
  basin: "syrdarya" | "amudarya" | "zarafshan";
  basinName: string;
  flowName: string;
  lastSeason: { season: string; snowAnomalyPct: number; percentile: number; level: Level; summerFlowLevel?: Level; summerFlowPct?: number };
  currentSeason: { season: string; from: string; lastDate: string | null; snowAnomalyPct: number | null; level: Level | "early"; confidence: Level };
  history: { year: number; snowIndex: number; marchSnow: number | null; summerFlow: number | null }[];
  correlation?: number | null; // March snow index vs summer flow (r)
  correlationYears?: string | null;
  sources: string[];
}

// N9
export interface GaezData {
  regime: "irrigated" | "rainfed";
  crops: { crop: CropId; regime: "irrigated" | "rainfed"; suitability: number | null; attainableKgPerHa: number | null }[];
  resolutionKm: number;
  note: string;
}

// ======================= FastAPI backend extras (FRONTEND_UCHUN_API.md §4.5) =======================
export interface ForecastData {
  days: { date: string; tmax: number; tmin: number; precipMm: number; windMax: number; et0Mm: number; soilTempMin?: number }[];
  alerts: { date: string; type: "frost" | "heat" | "wind" | "rain"; level: Level; value: number; text: string }[];
  fieldworkDays: string[];
  et0Next7Mm: number;
  source: { name: string; url: string; license?: string };
}
