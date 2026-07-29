/**
 * Stub of `@/api` — the platform capabilities the canvas calls into.
 * Returns mocked-but-shaped data so the feature's real code paths (generateScript →
 * Hook/Body/CTA, voiceover, library) run end to end without a live account.
 */
import { delay, placeholderImage } from '../placeholder';
import { type MyLibraryAsset, type SavedProduct, ScriptType } from './typings';

export async function listProducts(_args: { limit?: number; offset?: number }): Promise<{ products: SavedProduct[] }> {
  await delay(200);
  return {
    products: [
      {
        name: 'Hydration Serum',
        description: '72-hour clinical hydration in one lightweight drop — dermatologist tested, no residue.',
        price: '29',
        currency: 'USD',
      },
    ],
  };
}

export async function generateScript(args: {
  needNum?: number;
  productName?: string;
  description?: string;
  price?: string;
  duration?: number;
  language?: string;
}): Promise<{
  Scripts: Array<{ modelNames?: string[]; Script: Array<{ Type: ScriptType; Content: string }> }>;
}> {
  await delay(650);
  const name = args?.productName ?? 'the product';
  return {
    Scripts: [
      {
        modelNames: ['symphony-demo-llm'],
        Script: [
          { Type: ScriptType.HOOK, Content: `Stop scrolling — ${name} just replaced your entire shelf.` },
          {
            Type: ScriptType.USP,
            Content: `Clinically tested, ${name} delivers 72-hour hydration in one lightweight drop. Real results, zero residue.`,
          },
          { Type: ScriptType.CTA, Content: 'Tap to grab the bundle — 20% off ends tonight.' },
        ],
      },
    ],
  };
}

export async function generateVoiceover(_args: {
  script: string;
  voiceId?: string;
  videoId?: string;
}): Promise<{ TtsList: Array<{ AudioUrl?: string }>; VoiceDuration?: number }> {
  await delay(600);
  // A silent 1-frame WAV keeps <audio> happy without shipping a real asset.
  return {
    TtsList: [{ AudioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=' }],
    VoiceDuration: 12,
  };
}

export async function getMyLibrary(_args: { limit?: number; offset?: number }): Promise<{ Assets: MyLibraryAsset[] }> {
  await delay(300);
  return {
    Assets: [
      { assetId: 'lib-1', fileName: 'Serum bottle — studio', assetType: 'image', content: placeholderImage('Serum', '#e7efff', '#2f6bff') },
      { assetId: 'lib-2', fileName: 'Serum bottle — wet stone', assetType: 'image', content: placeholderImage('Wet stone', '#d3e0ff', '#1e4fd6') },
      { assetId: 'lib-3', fileName: 'Unboxing b-roll', assetType: 'video', content: placeholderImage('Unboxing', '#2f6bff', '#7c3aed') },
      { assetId: 'lib-4', fileName: 'Street scene b-roll', assetType: 'video', content: placeholderImage('Street', '#7c3aed', '#2f6bff') },
      { assetId: 'lib-5', fileName: 'Brand BGM — upbeat', assetType: 'audio', content: '' },
      { assetId: 'lib-6', fileName: 'UGC presenter — Mia', assetType: 'avatar', content: placeholderImage('Mia', '#e7efff', '#7c3aed') },
    ],
  };
}
