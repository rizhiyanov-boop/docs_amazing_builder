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
    bg: '#1c1830',
    panel: '#28233f',
    card: '#28233f',
    text: '#f0ecff',
    muted: '#b9b1d8',
    accent: 'linear-gradient(135deg, #a78bfa, #f0abfc)',
    accentSolid: '#c4b5fd',
    border: '#3a3258',
    shadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
    inputBg: '#221d39',
    inputText: '#f0ecff',
    scrollbarTrack: '#161226',
    scrollbarThumb: '#3a3258',
    scrollbarThumbHover: '#4a4170',
    buttonBg: '#c4b5fd',
    buttonText: '#1c1830',
    buttonShadow: '0 10px 20px rgba(196, 181, 253, 0.18)',
    buttonShadowHover: '0 14px 28px rgba(196, 181, 253, 0.25)',
    activeBg: 'rgba(196, 181, 253, 0.16)',
    activeText: '#f0ecff',
    previewBg: '#28233f',
    previewText: '#f0ecff',
    previewBorder: '#3a3258',
    previewTableHead: '#221d39'
  },
  light: {
    bg: '#ebe5d6',
    panel: '#fbf8f0',
    card: '#fbf8f0',
    text: '#2c2113',
    muted: '#998866',
    accent: 'linear-gradient(135deg, #b8562a, #d97842)',
    accentSolid: '#b8562a',
    border: '#d6cdb3',
    shadow: '0 10px 24px rgba(63, 45, 22, 0.08)',
    inputBg: '#f5efe0',
    inputText: '#2c2113',
    scrollbarTrack: '#ebe5d6',
    scrollbarThumb: '#d6cdb3',
    scrollbarThumbHover: '#bdb293',
    buttonBg: '#b8562a',
    buttonText: '#fbf8f0',
    buttonShadow: '0 8px 18px rgba(184, 86, 42, 0.16)',
    buttonShadowHover: '0 12px 22px rgba(184, 86, 42, 0.22)',
    activeBg: 'rgba(184, 86, 41, 0.12)',
    activeText: '#2c2113',
    previewBg: '#fbf8f0',
    previewText: '#2c2113',
    previewBorder: '#d6cdb3',
    previewTableHead: '#f5efe0'
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
