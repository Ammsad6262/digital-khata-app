"use client";

/**
 * StickyFormActions — pins the Save/Cancel buttons to the viewport bottom.
 *
 * Why this exists:
 *   On Android, the user holds the phone in one hand and taps with their thumb.
 *   If the Save button is at the bottom of scrollable content, they have to
 *   scroll past everything to reach it. This component renders a sticky bar
 *   that's always visible at the viewport bottom — no scrolling needed.
 *
 * The bar sits ABOVE the bottom nav (z-index higher) and adds bottom padding
 * to the page content so nothing gets hidden behind it.
 *
 * Usage:
 *   <StickyFormActions
 *     onCancel={() => router.back()}
 *     onSave={handleSubmit}
 *     saveLabel="Save Sale"
 *     saveDisabled={hasErrors || isPending}
 *     isPending={isPending}
 *   />
 *
 *   This replaces the manual <div className="flex gap-2 pt-1">...</div> pattern.
 */

import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";

export function StickyFormActions({
  onCancel,
  onSave,
  saveLabel,
  cancelLabel,
  saveDisabled = false,
  isPending = false,
  saveVariant = "primary",
  className,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  isPending?: boolean;
  saveVariant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={cn(
        // Sticky bar above the floating bottom nav. The bottom offset must
        // include the iPhone safe area, otherwise the Save row slides under
        // the nav on notched devices.
        "sticky z-20 -mx-4 mt-4 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-xl",
        className,
      )}
      style={{
        bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onCancel}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant={saveVariant}
          size="lg"
          className="flex-[2]"
          disabled={saveDisabled || isPending}
          onClick={onSave}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saveLabel ?? t("common.save")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}