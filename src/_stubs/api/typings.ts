/** Stub of `@/api/typings` — the enums and shapes the canvas services reference. */

export const ScriptType = {
  HOOK: 'HOOK',
  USP: 'USP',
  CTA: 'CTA',
} as const;
export type ScriptType = (typeof ScriptType)[keyof typeof ScriptType];

export const VideoDurationLen = {
  DURATION_15: 15,
  DURATION_30: 30,
  DURATION_60: 60,
} as const;
export type VideoDurationLen = (typeof VideoDurationLen)[keyof typeof VideoDurationLen];

export interface MyLibraryAsset {
  assetId: string;
  fileName?: string;
  assetType: string;
  content?: string;
}

export interface SavedProduct {
  name: string;
  description?: string;
  price?: string;
  currency?: string;
}
