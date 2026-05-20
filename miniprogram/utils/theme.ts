export type ThemeMode = "light" | "dark";

export function getSystemTheme(): ThemeMode {
  try {
    const info = wx.getSystemInfoSync();
    const theme = (info as { theme?: string }).theme;
    return theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
