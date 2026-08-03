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
      /* 动态图形卖点的入场动效：标题上浮淡入，下方细线横向展开。 */
      keyframes: {
        'graphic-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'rule-in': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'hud-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '0.75' },
        },
        'mask-up': {
          '0%': { transform: 'translateY(118%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'draw-path': {
          '0%': { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'graphic-in': 'graphic-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'rule-in': 'rule-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'hud-in': 'hud-in 500ms ease-out both',
        'mask-up': 'mask-up 720ms cubic-bezier(0.19, 1, 0.22, 1) both',
        'draw-path': 'draw-path 2.2s cubic-bezier(0.65, 0, 0.35, 1) both',
      },
    },
  },
  plugins: [],
};
