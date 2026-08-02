const THEME_KEY = "tafriz_theme_v1";

export type AppTheme = "light" | "dark";

export function getStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }
  return "light";
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function toggleTheme(): AppTheme {
  const next: AppTheme = getStoredTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/** يُستدعى مبكرًا لتجنّب وميض الثيم */
export function initTheme() {
  applyTheme(getStoredTheme());
}
