import type { Metadata } from "next";
import { BrandPage } from "@/components/brand/BrandPage";

export const metadata: Metadata = {
  title: "Brand | PEA",
  description: "Official PEA brand assets: colors, the coin, and the wordmark.",
};

export default function Brand() {
  return <BrandPage />;
}
