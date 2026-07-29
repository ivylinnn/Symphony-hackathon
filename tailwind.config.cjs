/**
 * Reconstructed subset of the creative-cue design tokens the canvas feature uses.
 * The private repo ships these as semantic tokens; the values here mirror the hints
 * called out in the feature README (e.g. neutral-fillHigh ≈ rgb(38,38,39), neutral-fill
 * ≈ rgb(135,137,139)) and fill in a coherent light theme for everything else.
 *
 * `extend.colors` merges with Tailwind's defaults, so the custom named keys below
 * (surface / fillLow / onFill / highOnSurface …) sit alongside the stock palette.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: {
          surface: '#ffffff',
          surface1: '#f5f6f8',
          surface2: '#eceef2',
          surface3: '#e1e4ea',
          fillLow: '#dfe1e6',
          fill: '#87898b',
          fillMedHigh: '#3f4145',
          fillHigh: '#262627',
          onFill: '#ffffff',
          highOnSurface: '#191b1f',
          mediumOnSurface: '#565961',
          lowOnSurface: '#8b8e96',
        },
        primary: {
          fill: '#2f6bff',
          onFill: '#ffffff',
          onSurface: '#1e4fd6',
          surface2: '#e7efff',
          surface3: '#d3e0ff',
        },
        success: {
          fill: '#12a06a',
          onSurface: '#0f7a53',
        },
        error: {
          fill: '#e5484d',
          fillLow: '#fbe9ea',
        },
      },
    },
  },
  plugins: [],
};
