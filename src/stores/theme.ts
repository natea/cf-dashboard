// dashboard/src/stores/theme.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolvedTheme: "light" | "dark") {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (resolvedTheme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Update CSS variables for toast
  root.style.setProperty(
    "--toast-bg",
    resolvedTheme === "dark" ? "#1f2937" : "#fff"
  );
  root.style.setProperty(
    "--toast-color",
    resolvedTheme === "dark" ? "#f3f4f6" : "#374151"
  );
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      resolvedTheme: getSystemTheme(),

      setTheme: (theme) => {
        const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
        applyTheme(resolvedTheme);
        set({ theme, resolvedTheme });
      },

      toggleTheme: () => {
        const current = get().resolvedTheme;
        const newTheme = current === "dark" ? "light" : "dark";
        applyTheme(newTheme);
        set({ theme: newTheme, resolvedTheme: newTheme });
      },
    }),
    {
      name: "theme-storage",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolvedTheme =
            state.theme === "system" ? getSystemTheme() : state.theme;
          applyTheme(resolvedTheme);
          state.resolvedTheme = resolvedTheme;
        }
      },
    }
  )
);

// Initialize theme on module load
if (typeof window !== "undefined") {
  // Listen for system theme changes
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      const state = useThemeStore.getState();
      if (state.theme === "system") {
        const resolvedTheme = e.matches ? "dark" : "light";
        applyTheme(resolvedTheme);
        useThemeStore.setState({ resolvedTheme });
      }
    });

  // Apply initial theme
  const state = useThemeStore.getState();
  const resolvedTheme =
    state.theme === "system" ? getSystemTheme() : state.theme;
  applyTheme(resolvedTheme);
}
