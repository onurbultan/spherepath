// Generated from tokens.json. Do not edit by hand.
export const designTokens = {
  "color": {
    "light": {
      "deed": "#1D4E6B",
      "deedBg": "#DDE5EA",
      "onDeed": "#FFFFFF",
      "ask": "#A8412A",
      "askBg": "#F0E2DC",
      "onAsk": "#FFFFFF",
      "background": "#F6F7F3",
      "card": "#FFFFFF",
      "elevated": "#FFFFFF",
      "chrome": "#F0F2EC",
      "sunk": "#E7E9E3",
      "line": "#E2E5DD",
      "lineStrong": "#C9D0CB",
      "textPrimary": "#16232C",
      "textSecondary": "#4F5F67",
      "textTertiary": "#59686F",
      "warm": "#A9661F",
      "warmBg": "#F1E5D4",
      "cool": "#68767C",
      "coolBg": "#DFE3DD",
      "good": "#2C6349",
      "goodBg": "#DCE8E0",
      "focus": "#1D4E6B",
      "focusHalo": "#DDE5EA",
      "overlay": "rgba(22, 35, 44, 0.38)"
    },
    "dark": {
      "deed": "#83B6D6",
      "deedBg": "#1B2C36",
      "onDeed": "#0B0F12",
      "ask": "#E08A6D",
      "askBg": "#2E211C",
      "onAsk": "#241410",
      "background": "#0E1215",
      "card": "#181F23",
      "elevated": "#1E272C",
      "chrome": "#131A1D",
      "sunk": "#0A0D0F",
      "line": "#252E33",
      "lineStrong": "#3A464C",
      "textPrimary": "#DDE3DE",
      "textSecondary": "#93A2A8",
      "textTertiary": "#7F8F96",
      "warm": "#D9A05C",
      "warmBg": "#2C2317",
      "cool": "#93A2A8",
      "coolBg": "#222A2E",
      "good": "#79B497",
      "goodBg": "#18271F",
      "focus": "#83B6D6",
      "focusHalo": "#1B2C36",
      "overlay": "rgba(0, 0, 0, 0.62)"
    }
  },
  "shadow": {
    "light": {
      "sm": "0 1px 2px rgba(22, 35, 44, 0.06)",
      "md": "0 4px 14px rgba(22, 35, 44, 0.10)",
      "lg": "0 18px 44px rgba(22, 35, 44, 0.18)"
    },
    "dark": {
      "sm": "0 1px 2px rgba(0, 0, 0, 0.5)",
      "md": "0 4px 16px rgba(0, 0, 0, 0.55)",
      "lg": "0 20px 48px rgba(0, 0, 0, 0.68)"
    }
  },
  "space": {
    "xs": 4,
    "sm": 6,
    "md": 8,
    "lg": 12,
    "xl": 16,
    "2xl": 20,
    "3xl": 24,
    "4xl": 32,
    "5xl": 40
  },
  "radius": {
    "hair": 2,
    "sm": 4,
    "md": 7,
    "lg": 8,
    "xl": 12,
    "pill": 999
  },
  "hit": {
    "min": 44,
    "comfortable": 52,
    "record": 64
  },
  "control": {
    "xs": 28,
    "sm": 32,
    "md": 38,
    "lg": 44
  },
  "motion": {
    "fast": 120,
    "base": 200,
    "slow": 320
  }
} as const;
export type ColorScheme = keyof typeof designTokens.color;
export type ColorToken = keyof (typeof designTokens.color)["light"];

export function colorsForScheme(scheme: ColorScheme) {
  return designTokens.color[scheme];
}
