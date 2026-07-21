import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PRIVACY } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Privacy | PEA",
  description: "Privacy Policy for the PEA interface.",
};

export default function Privacy() {
  return <LegalPage doc={PRIVACY} />;
}
