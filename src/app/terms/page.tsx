import type { Metadata } from "next";
import { LegalPageView } from "@/components/legal/LegalPageView";
import { TERMS_OF_SERVICE } from "@/content/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Dukhata, what you pay for, and your rights.",
};

export default function TermsPage() {
  return <LegalPageView doc={TERMS_OF_SERVICE} />;
}
