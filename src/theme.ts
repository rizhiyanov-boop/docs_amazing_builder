export type ThemeName = 'light' | 'dark';

type ThemeTokens = {
  bg: string;
  panel: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  accentSolid: string;
  border: string;
  shadow: string;
  inputBg: string;
  inputText: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  buttonBg: string;
  buttonText: string;
  buttonShadow: string;
  buttonShadowHover: string;
  activeBg: string;
  activeText: string;
  previewBg: string;
  previewText: string;
  previewBorder: string;
  previewTableHead: string;
};

const THEMES: Record<ThemeName, ThemeTokens> = {
  dark: {
    bg: '#0b1021',
    panel: '#0f172a',
    card: '#111827',
    text: '#e5e7eb',
    muted: '#9ca3af',
    accent: 'linear-gradient(135deg, #6366f1, #22d3ee)',
    accentSolid: '#6366f1',
    border: '#1f2937',
    shadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
    inputBg: '#0c1429',
    inputText: '#e5e7eb',
    scrollbarTrack: '#0f172a',
    scrollbarThumb: '#475569',
    scrollbarThumbHover: '#64748b',
    buttonBg: 'linear-gradient(135deg, #6366f1, #22d3ee)',
    buttonText: '#0b1021',
    buttonShadow: '0 10px 20px rgba(99, 102, 241, 0.25)',
    buttonShadowHover: '0 14px 28px rgba(99, 102, 241, 0.35)',
    activeBg: 'rgba(99, 102, 241, 0.12)',
    activeText: '#e5e7eb',
    previewBg: '#0d152a',
    previewText: '#e5e7eb',
    previewBorder: '#334155',
    previewTableHead: '#1f2937'
  },
  light: {
    bg: '#f8fafc',
    panel: '#ffffff',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#6b7280',
    accent: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
    accentSolid: '#7c3aed',
    border: '#e5e7eb',
    shadow: '0 12px 30px rgba(0, 0, 0, 0.08)',
    inputBg: '#ffffff',
    inputText: '#000000',
    scrollbarTrack: '#ffffff',
    scrollbarThumb: '#ffffff',
    scrollbarThumbHover: '#f3f4f6',
    buttonBg: '#111111',
    buttonText: '#ffffff',
    buttonShadow: '0 10px 20px rgba(17, 17, 17, 0.18)',
    buttonShadowHover: '0 14px 28px rgba(17, 17, 17, 0.24)',
    activeBg: '#111111',
    activeText: '#ffffff',
    previewBg: '#ffffff',
    previewText: '#111827',
    previewBorder: '#e5e7eb',
    previewTableHead: '#f8fafc'
  }
};

export function getThemeTokens(theme: ThemeName): ThemeTokens {
  return THEMES[theme];
}

export function applyThemeToRoot(theme: ThemeName, root: HTMLElement = document.documentElement): void {
  const tokens = THEMES[theme];
  root.dataset.theme = theme;
  root.style.setProperty('--bg', tokens.bg);
  root.style.setProperty('--panel', tokens.panel);
  root.style.setProperty('--card', tokens.card);
  root.style.setProperty('--text', tokens.text);
  root.style.setProperty('--muted', tokens.muted);
  root.style.setProperty('--accent', tokens.accent);
  root.style.setProperty('--accent-solid', tokens.accentSolid);
  root.style.setProperty('--border', tokens.border);
  root.style.setProperty('--shadow', tokens.shadow);
  root.style.setProperty('--input-bg', tokens.inputBg);
  root.style.setProperty('--input-text', tokens.inputText);
  root.style.setProperty('--scrollbar-track', tokens.scrollbarTrack);
  root.style.setProperty('--scrollbar-thumb', tokens.scrollbarThumb);
  root.style.setProperty('--scrollbar-thumb-hover', tokens.scrollbarThumbHover);
  root.style.setProperty('--button-bg', tokens.buttonBg);
  root.style.setProperty('--button-text', tokens.buttonText);
  root.style.setProperty('--button-shadow', tokens.buttonShadow);
  root.style.setProperty('--button-shadow-hover', tokens.buttonShadowHover);
  root.style.setProperty('--active-bg', tokens.activeBg);
  root.style.setProperty('--active-text', tokens.activeText);
}
