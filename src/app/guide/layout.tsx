import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Qo'llanma · TerraVision",
  description: "TerraVision'dan qanday foydalanish: dalani belgilash, natijani o'qish, suv, zonalar, kalendar, chorvachilik va solishtirish.",
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
