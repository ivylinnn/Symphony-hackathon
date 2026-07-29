/** Build an inline SVG data URI so generated media has something to show in the demo. */
export const placeholderImage = (label: string, from = '#2f6bff', to = '#7c3aed'): string => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${from}'/>
        <stop offset='1' stop-color='${to}'/>
      </linearGradient>
    </defs>
    <rect width='480' height='480' fill='url(#g)'/>
    <text x='50%' y='51%' font-family='sans-serif' font-size='34' font-weight='600'
      fill='#ffffff' fill-opacity='0.92' text-anchor='middle' dominant-baseline='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/** Small delay so the mocked async calls feel like real round-trips. */
export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
