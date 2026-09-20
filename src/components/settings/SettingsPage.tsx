"use client";

/**
 * SettingsPage — full settings UI.
 *
 * Sections:
 *   1. Business Info — edit business name
 *   2. Currency — pick from common currencies or set custom symbol
 *   3. Theme — pick between Default (green) and Bright Leaf (#CDFF9B + #203D43)
 *   4. Security — set/change/remove owner PIN
 *   5. Data Management — clear all data (danger zone)
 *   6. Backup & Export — links to /more/backup
 */

import { useState } from "react";
import {
  Building2,
  Globe,
  Languages,
  Palette,
  Lock,
  Database,
  AlertTriangle,
  Loader2,
  Check,
  ChevronRight,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { TextField } from "@/components/ui/TextField";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTheme, type Theme } from "@/providers/theme-provider";
import {
  useSettings,
  useUpdateSettings,
  useSetPin,
  useRemovePin,
  useClearAllData,
} from "@/hooks/use-settings";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { cn } from "@/lib/utils/cn";

const CURRENCIES = [
  { code: "PKR", symbol: "Rs.", label: "Pakistani Rupee" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "AED", symbol: "AED", label: "UAE Dirham" },
  { code: "SAR", symbol: "SAR", label: "Saudi Riyal" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "EUR", symbol: "€", label: "Euro" },
];

const THEMES: Array<{
  id: Theme;
  name: string;
  description: string;
  preview: { bg: string; accent: string; dark: string };
}> = [
  {
    id: "default",
    name: "Default Green",
    description: "Classic emerald green",
    preview: { bg: "#f0fdf4", accent: "#16a34a", dark: "#14532d" },
  },
  {
    id: "leaf",
    name: "Bright Leaf",
    description: "#CDFF9B accent + #203D43 dark",
    preview: { bg: "#f7ffee", accent: "#CDFF9B", dark: "#203D43" },
  },
];

export function SettingsPage() {
  const { data: settings, isLoading, isError, error } = useSettings();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <EmptyState
        title="Couldn't load settings"
        description={error instanceof Error ? error.message : "Something went wrong."}
        icon={<AlertTriangle className="h-6 w-6" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <BusinessInfoSection initial={settings} />
      <CurrencySection initial={settings} />
      <LanguageSection />
      <ThemeSection />
      <SecuritySection hasPin={settings.hasPin} />
      <DataManagementSection hasPin={settings.hasPin} />
      <BackupSection />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Business Info
// ────────────────────────────────────────────────────────────────────────────

function BusinessInfoSection({
  initial,
}: {
  initial: { businessName: string | null; currencySymbol: string };
}) {
  const toast = useToast();
  const updateSettings = useUpdateSettings();
  const [businessName, setBusinessName] = useState(initial.businessName ?? "");
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    updateSettings.mutate(
      { businessName: businessName.trim() || null },
      {
        onSuccess: () => {
          toast.success("Business name updated");
          setEditing(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update."),
      },
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Business Info</h2>
      </div>

      {!editing ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {initial.businessName || "Not set"}
            </p>
            <p className="text-xs text-slate-500">Business name</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <TextField
            label="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Zafar Wholesale Trader"
            autoComplete="off"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setBusinessName(initial.businessName ?? "");
                setEditing(false);
              }}
              disabled={updateSettings.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleSave}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Currency
// ────────────────────────────────────────────────────────────────────────────

function CurrencySection({
  initial,
}: {
  initial: { currency: string; currencySymbol: string };
}) {
  const toast = useToast();
  const updateSettings = useUpdateSettings();
  const [selectedCurrency, setSelectedCurrency] = useState(initial.currency);
  const [customSymbol, setCustomSymbol] = useState(initial.currencySymbol);

  const handleSelectCurrency = (code: string, symbol: string) => {
    setSelectedCurrency(code);
    setCustomSymbol(symbol);
    updateSettings.mutate(
      { currency: code, currencySymbol: symbol },
      {
        onSuccess: () => toast.success(`Currency set to ${code} (${symbol})`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update."),
      },
    );
  };

  const handleSaveCustomSymbol = () => {
    if (!customSymbol.trim()) {
      toast.error("Currency symbol cannot be empty.");
      return;
    }
    updateSettings.mutate(
      { currencySymbol: customSymbol.trim() },
      {
        onSuccess: () => toast.success("Currency symbol updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update."),
      },
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Currency</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => handleSelectCurrency(c.code, c.symbol)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              selectedCurrency === c.code
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <span className="text-base font-bold w-6 text-center">{c.symbol}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{c.code}</p>
              <p className="truncate text-[10px] text-slate-500">{c.label}</p>
            </div>
            {selectedCurrency === c.code ? (
              <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-600" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Custom symbol
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value)}
            maxLength={5}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <Button
            size="sm"
            onClick={handleSaveCustomSymbol}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Used everywhere money is displayed (e.g. &ldquo;{customSymbol} 1,234.50&rdquo;)
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Language
// ────────────────────────────────────────────────────────────────────────────

function LanguageSection() {
  const { lang, setLang } = useLanguage();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Languages className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Language / زبان</h2>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLang("en")}
          className={cn(
            "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all w-full",
            lang === "en"
              ? "border-brand-500 bg-brand-50"
              : "border-slate-200 bg-white hover:bg-slate-50",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">
            EN
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">English</p>
            <p className="text-[11px] text-slate-500">Left-to-right layout</p>
          </div>
          {lang === "en" ? (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setLang("ur")}
          className={cn(
            "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all w-full",
            lang === "ur"
              ? "border-brand-500 bg-brand-50"
              : "border-slate-200 bg-white hover:bg-slate-50",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-sm font-bold text-green-700">
            اردو
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">اردو</p>
            <p className="text-[11px] text-slate-500">نستعلیق خط، دائیں سے بائیں</p>
          </div>
          {lang === "ur" ? (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
          ) : null}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Language changes the entire app interface. Noto Nastaliq Urdu font is used for Urdu text.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Theme
// ────────────────────────────────────────────────────────────────────────────

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Palette className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Theme</h2>
      </div>

      <div className="space-y-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all w-full",
              theme === t.id
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 bg-white hover:bg-slate-50",
            )}
          >
            <div className="flex shrink-0 gap-1">
              <div
                className="h-8 w-8 rounded-lg border border-slate-200"
                style={{ backgroundColor: t.preview.bg }}
                title="Background"
              />
              <div
                className="h-8 w-8 rounded-lg border border-slate-200"
                style={{ backgroundColor: t.preview.accent }}
                title="Accent"
              />
              <div
                className="h-8 w-8 rounded-lg border border-slate-200"
                style={{ backgroundColor: t.preview.dark }}
                title="Dark"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{t.name}</p>
              <p className="text-[11px] text-slate-500">{t.description}</p>
            </div>

            {theme === t.id ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            ) : null}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Theme is saved on this device. The Bright Leaf theme uses your custom colors:
        <span className="font-mono text-slate-700"> #CDFF9B</span> (accent) and
        <span className="font-mono text-slate-700"> #203D43</span> (dark).
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Security (PIN)
// ────────────────────────────────────────────────────────────────────────────

function SecuritySection({ hasPin }: { hasPin: boolean }) {
  const toast = useToast();
  const setPin = useSetPin();
  const removePin = useRemovePin();

  const [showPinForm, setShowPinForm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [removePinInput, setRemovePinInput] = useState("");

  const handleSetPin = () => {
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      toast.error("PIN must be 4-6 digits (numbers only).");
      return;
    }

    setPin.mutate(
      { pin: newPin, currentPin: hasPin ? currentPin : undefined },
      {
        onSuccess: () => {
          toast.success(hasPin ? "PIN changed" : "PIN set");
          setShowPinForm(false);
          setNewPin("");
          setCurrentPin("");
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Failed to set PIN.";
          toast.error(msg);
        },
      },
    );
  };

  const handleRemovePin = () => {
    removePin.mutate(
      { currentPin: removePinInput },
      {
        onSuccess: () => {
          toast.success("PIN lock removed");
          setShowRemoveConfirm(false);
          setRemovePinInput("");
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Failed to remove PIN.";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Security</h2>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">
            PIN Lock {hasPin ? "enabled" : "disabled"}
          </p>
          <p className="text-xs text-slate-500">
            {hasPin
              ? "PIN is required for destructive actions (clear data, etc.)"
              : "Set a PIN to protect destructive actions"}
          </p>
        </div>
        {!showPinForm ? (
          <Button
            variant={hasPin ? "outline" : "primary"}
            size="sm"
            onClick={() => setShowPinForm(true)}
          >
            {hasPin ? "Change PIN" : "Set PIN"}
          </Button>
        ) : null}
      </div>

      {showPinForm ? (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {hasPin ? (
            <TextField
              label="Current PIN"
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="••••"
              maxLength={6}
              autoComplete="off"
            />
          ) : null}
          <TextField
            label={hasPin ? "New PIN" : "Set a PIN (4-6 digits)"}
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="••••"
            maxLength={6}
            autoComplete="off"
            autoFocus
            hint="4-6 digits. Used to confirm destructive actions."
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowPinForm(false);
                setNewPin("");
                setCurrentPin("");
              }}
              disabled={setPin.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleSetPin}
              disabled={setPin.isPending || newPin.length < 4}
            >
              {setPin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PIN"}
            </Button>
          </div>
        </div>
      ) : null}

      {hasPin && !showPinForm ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {!showRemoveConfirm ? (
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Remove PIN lock
            </button>
          ) : (
            <div className="space-y-2">
              <TextField
                label="Enter current PIN to remove"
                type="password"
                inputMode="numeric"
                value={removePinInput}
                onChange={(e) => setRemovePinInput(e.target.value)}
                placeholder="••••"
                maxLength={6}
                autoComplete="off"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowRemoveConfirm(false);
                    setRemovePinInput("");
                  }}
                  disabled={removePin.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1"
                  onClick={handleRemovePin}
                  disabled={removePin.isPending || removePinInput.length < 4}
                >
                  {removePin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Data Management (danger zone)
// ────────────────────────────────────────────────────────────────────────────

function DataManagementSection({ hasPin }: { hasPin: boolean }) {
  const toast = useToast();
  const clearAllData = useClearAllData();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");

  const handleClearAll = () => {
    clearAllData.mutate(
      { confirm: true, currentPin: hasPin ? confirmPin : undefined },
      {
        onSuccess: (data) => {
          const d = data.deleted;
          const total = Object.values(d).reduce((s, n) => s + n, 0);
          toast.success(`Cleared ${total} records. App is now empty.`);
          setShowConfirm(false);
          setConfirmPin("");
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Failed to clear data.";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <h2 className="text-sm font-semibold text-red-900">Danger Zone</h2>
      </div>

      <p className="text-xs text-red-700 mb-3">
        Clear all business data — customers, products, sales, payments, expenses, stock.
        Settings (business name, currency, PIN) are preserved. This cannot be undone.
      </p>

      {!showConfirm ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          Clear All Data
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border-2 border-red-300 bg-white p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-xs text-red-800">
              Are you absolutely sure? Every customer, sale, and payment will be
              permanently deleted. Download a backup first if you might need this data.
            </p>
          </div>

          {hasPin ? (
            <TextField
              label="Enter PIN to confirm"
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="••••"
              maxLength={6}
              autoComplete="off"
              autoFocus
            />
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowConfirm(false);
                setConfirmPin("");
              }}
              disabled={clearAllData.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={handleClearAll}
              disabled={clearAllData.isPending || (hasPin && confirmPin.length < 4)}
            >
              {clearAllData.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Yes, delete everything
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Backup & Export link
// ────────────────────────────────────────────────────────────────────────────

function BackupSection() {
  return (
    <Link
      href="/more/backup"
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Database className="h-5 w-5 text-brand-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">Backup & Export</p>
          <p className="text-[11px] text-slate-500">
            Download full backup (JSON) or export tables as CSV
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </div>
    </Link>
  );
}
