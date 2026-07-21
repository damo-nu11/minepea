import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { TERMS } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Terms | PEA",
  description: "Terms of Service for the PEA interface.",
};

export default function Terms() {
  return <LegalPage doc={TERMS} />;
}
