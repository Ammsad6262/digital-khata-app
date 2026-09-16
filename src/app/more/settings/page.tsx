/**
 * Settings page (/more/settings).
 *
 * V1 sections:
 *   - Backup & Export → /more/backup (full backup/restore UI)
 *   - Business info (display only — editing comes in a later phase)
 *
 * Future sections (placeholder cards):
 *   - Currency
 *   - PIN lock
 *   - Data management
 */

import Link from "next/link";
import {
  Database,
  Building2,
  Globe,
  Lock,
  ChevronRight,
  Info,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";

export const dynamic = "force-dynamic";

const SETTINGS_SECTIONS = [
  {
    href: "/more/backup",
    title: "Backup & Export",
    description: "Download full backup (JSON) or export individual tables as CSV",
    icon: Database,
    color: "bg-brand-50 text-brand-700",
    available: true,
  },
  {
    href: null,
    title: "Business Info",
    description: "Business name, currency, timezone",
    icon: Building2,
    color: "bg-blue-50 text-blue-700",
    available: false,
  },
  {
    href: null,
    title: "Currency",
    description: "Change currency symbol (Rs., $, etc.)",
    icon: Globe,
    color: "bg-purple-50 text-purple-700",
    available: false,
  },
  {
    href: null,
    title: "PIN Lock",
    description: "Set a PIN to lock the app when not in use",
    icon: Lock,
    color: "bg-amber-50 text-amber-700",
    available: false,
  },
];

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="Settings" />
      <ScreenContent>
        <div className="space-y-2">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const content = (
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${section.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {section.title}
                    {!section.available ? (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">(soon)</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-slate-500">{section.description}</p>
                </div>
                {section.available ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                ) : null}
              </div>
            );

            if (section.href) {
              return (
                <Link
                  key={section.title}
                  href={section.href}
                  className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 active:bg-slate-100"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={section.title}
                className="block rounded-xl border border-slate-200 bg-white p-3 opacity-60"
              >
                {content}
              </div>
            );
          })}
        </div>

        {/* About */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-500" />
            <p className="text-xs font-semibold text-slate-700">About</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Digital Khata & Wholesale Business App — V1.
            Built for small wholesale businesses to replace paper khata registers.
            All data stays on this device.
          </p>
        </div>
      </ScreenContent>
    </>
  );
}
