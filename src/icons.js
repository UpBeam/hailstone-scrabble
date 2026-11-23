/**
 * Crisp 1.75px-stroke geometric SVG icons (20x20 viewBox).
 */

const svg = (paths, size = 17) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  rules: svg(`<path d="M3 13.5l3.2-6 3.3 3.5L13 5l4 10"/><circle cx="17" cy="15" r="1.2" fill="currentColor" stroke="none"/>`),
  theme: svg(`<circle cx="10" cy="10" r="7.5"/><path d="M10 2.5v15"/><path d="M10 10l6.5-3.7"/><path d="M10 10l6.5 3.7"/>`),
  settings: svg(`<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>`),
  soundOn: svg(`<path d="M3.5 7.8h2.8l4-3.3v11l-4-3.3H3.5z"/><path d="M13.3 7.2a4 4 0 0 1 0 5.6"/><path d="M15.6 5a7 7 0 0 1 0 10"/>`),
  soundOff: svg(`<path d="M3.5 7.8h2.8l4-3.3v11l-4-3.3H3.5z"/><path d="M13.5 7.5l4 5M17.5 7.5l-4 5"/>`),
  recall: svg(`<path d="M6.5 7H3v3.5"/><path d="M3.4 7.4A6.5 6.5 0 1 1 5.2 15"/>`),
  shuffle: svg(`<path d="M3 6.5h3l7 7h4M14.5 11l2.5 2.5-2.5 2.5M14.5 4l2.5 2.5-2.5 2.5M3 13.5h3l1.6-1.6M11.4 8.1L13 6.5h4"/>`),
  swap: svg(`<path d="M4 7.5h12M13 4.5l3 3-3 3M16 12.5H4M7 9.5l-3 3 3 3"/>`),
  close: svg(`<path d="M5 5l10 10M15 5L5 15"/>`, 15),
};
