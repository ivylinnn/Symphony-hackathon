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
          surface1: '#f8f8f9',
          surface2: '#f2f3f3',
          surface3: '#ececed',
          fillLow: '#e1e1e2',
          fill: '#87898b',
          fillMedHigh: '#3f4145',
          fillHigh: '#262627',
          onFill: '#ffffff',
          highOnSurface: '#121415',
          mediumOnSurface: '#6d6e70',
          lowOnSurface: '#87898b',
        },
        primary: {
          fill: '#009995',
          fillHover: '#008581',
          fillPressed: '#017572',
          onFill: '#ffffff',
          onSurface: '#017976',
          surface2: '#e8fbf9',
          surface3: '#d3f4f1',
        },
        /* GenAI 专用薰衣草紫（设计规范：GENAI ONLY），编辑 agent 等 AI 功能的点缀色 */
        ai: {
          fill: '#a1a1fa',
          text: '#8078f6',
          deep: '#665cd6',
          tint: '#e9ebff',
        },
        success: {
          fill: '#2a9c49',
          onSurface: '#1f7a39',
        },
        error: {
          fill: '#ef504b',
          fillLow: '#fdeae9',
        },
        warning: {
          fill: '#ff9000',
        },
        /* ks/color/data/data5 —— 数据可视化蓝色系（fill / fillMedHigh / fillHigh） */
        data5: {
          fill: '#7cc0ed',
          fillMedHigh: '#38a3e2',
          fillHigh: '#0f6ea6',
        },
      },
      fontFamily: {
        sans: [
          "'TikTok Sans Text'",
          "'TikTok Sans'",
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          "'Segoe UI'",
          'sans-serif',
        ],
        mono: ["'IBM Plex Mono'", 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
        /* 剪辑器入场：接住画布推近节点的运镜，微缩放+淡入延续 zoom-in。 */
        'editor-in': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        /* 内联编辑坞入场：右侧 agent 从右滑入、底部时间线从下滑入，和镜头推近同步。 */
        'dock-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'dock-in-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'graphic-in': 'graphic-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'rule-in': 'rule-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'hud-in': 'hud-in 500ms ease-out both',
        'mask-up': 'mask-up 720ms cubic-bezier(0.19, 1, 0.22, 1) both',
        'draw-path': 'draw-path 2.2s cubic-bezier(0.65, 0, 0.35, 1) both',
        'editor-in': 'editor-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'dock-in-right': 'dock-in-right 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'dock-in-up': 'dock-in-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
