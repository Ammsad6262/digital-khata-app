-- Migration: add_theme_column
-- Date: 2026-10-01
--
-- Adds a `theme` column to the Setting table for per-user theme persistence.
-- Default value is "monochrome" (the new Black & White default theme).
-- Valid values: "monochrome", "default", "leaf"

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'monochrome';
