import { clsx } from "clsx";
import {
  AlertTriangle, ArrowUp, Beef, Brush, Bug, CalendarDays, CircleCheck, CircleX, CloudFog, CloudLightning, CloudRain, CloudSun, Coins, FileQuestion, FlaskConical,
  Flame, FolderOpen, Globe, Heart, Leaf, MapPin, Microscope, Mountain, RefreshCw, Ruler, Satellite, ScanSearch, Search, Settings, Shield, Snowflake, Sprout, Star,
  Sun, TestTube, Thermometer, Tractor, TrendingUp, Trophy, Waves, Wheat, Zap, Droplet, type LucideIcon,
} from "lucide-react";
import type { CropId } from "@/types/api";
import { cropColor, cropName } from "@/lib/format";
import { useT } from "@/i18n";

/**
 * One icon language for the whole product. Older copy and data used emoji; they are mapped here
 * to the same stroke icons the rest of the UI uses, with a calm semantic tint.
 */
const MAP: Record<string, { I: LucideIcon; c?: string }> = {
  "🧂": { I: FlaskConical, c: "var(--level-medium-fg)" },
  "💧": { I: Droplet, c: "var(--water)" },
  "🌱": { I: Sprout, c: "var(--accent)" },
  "🌾": { I: Wheat, c: "var(--gold-fg)" },
  "❄️": { I: Snowflake, c: "var(--water)" },
  "❄": { I: Snowflake, c: "var(--water)" },
  "🧊": { I: Snowflake, c: "var(--water)" },
  "🔥": { I: Flame, c: "var(--level-high-fg)" },
  "🌧️": { I: CloudRain, c: "var(--water)" },
  "🌧": { I: CloudRain, c: "var(--water)" },
  "🌡️": { I: Thermometer, c: "var(--level-high-fg)" },
  "🏔️": { I: Mountain },
  "⚠️": { I: AlertTriangle, c: "var(--warn-fg)" },
  "🐄": { I: Beef },
  "🔍": { I: Search },
  "📍": { I: MapPin },
  "🌿": { I: Leaf, c: "var(--accent)" },
  "🛰️": { I: Satellite },
  "🏆": { I: Trophy, c: "var(--gold-fg)" },
  "💰": { I: Coins, c: "var(--gold-fg)" },
  "🗓️": { I: CalendarDays },
  "🌊": { I: Waves, c: "var(--water)" },
  "🌍": { I: Globe },
  "☀️": { I: Sun, c: "var(--gold-fg)" },
  "🛡": { I: Shield },
  "🛡️": { I: Shield },
  "⚡": { I: Zap },
  "⚙️": { I: Settings },
  "📏": { I: Ruler },
  "💚": { I: Heart, c: "var(--accent)" },
  "⭐": { I: Star, c: "var(--gold-fg)" },
  "⛈️": { I: CloudLightning, c: "var(--water)" },
  "🌫️": { I: CloudFog },
  "⛅": { I: CloudSun },
  "🚜": { I: Tractor },
  "🏜️": { I: Sun, c: "var(--level-high-fg)" },
  "⬆": { I: ArrowUp, c: "var(--accent)" },
  "🤖": { I: ScanSearch },
  "📈": { I: TrendingUp },
  "📂": { I: FolderOpen },
  "🐛": { I: Bug },
  "🧪": { I: TestTube },
  "🧹": { I: Brush },
  "🔄": { I: RefreshCw },
  "❓": { I: FileQuestion, c: "var(--fg-3)" },
  "✅": { I: CircleCheck, c: "var(--level-low-fg)" },
  "❌": { I: CircleX, c: "var(--level-high-fg)" },
  "🔬": { I: Microscope },
};

/** Inline icon sized to the surrounding text. Unknown glyphs render nothing. */
export function G({ e, className, tint = true }: { e: string; className?: string; tint?: boolean }) {
  const hit = MAP[e] ?? MAP[e.replace(/️/g, "")];
  if (!hit) return null;
  const { I, c } = hit;
  return <I aria-hidden className={clsx("inline-block h-[1.05em] w-[1.05em] shrink-0 align-[-0.15em]", className)} strokeWidth={1.9} style={tint && c ? { color: c } : undefined} />;
}

/** A crop is shown by its colour everywhere (3D twin, timelines, lists), never by an emoji. */
export function CropDot({ crop, className, label }: { crop: CropId; className?: string; label?: boolean }) {
  const { lang } = useT();
  return (
    <span className={clsx("inline-flex items-center gap-1.5 align-middle", className)}>
      <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cropColor(crop) }} aria-hidden />
      {label && cropName(crop, lang)}
    </span>
  );
}
