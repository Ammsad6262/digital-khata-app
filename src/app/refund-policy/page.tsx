import type { Metadata } from "next";
import { LegalPageView } from "@/components/legal/LegalPageView";
import { REFUND_POLICY } from "@/content/legal";

export const metadata: Metadata = {
  title: "Refund Policy · Dukhata",
  description: "When a Dukhata licence can be refunded, and how to ask.",
};

export default function RefundPolicyPage() {
  return <LegalPageView doc={REFUND_POLICY} />;
}
