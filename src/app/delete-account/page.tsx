import type { Metadata } from "next";
import { LegalPageView } from "@/components/legal/LegalPageView";
import { DATA_DELETION } from "@/content/legal";

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "How to delete your Dukhata account and the records inside it.",
};

export default function DeleteAccountPage() {
  return <LegalPageView doc={DATA_DELETION} />;
}
