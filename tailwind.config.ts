import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./frontend/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Column colors
        backlog: {
          50: "#f9fafb",
          100: "#f3f4f6",
          500: "#6b7280",
          600: "#4b5563",
        },
        agent: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
        },
        review: {
          50: "#fefce8",
          100: "#fef9c3",
          500: "#eab308",
          600: "#ca8a04",
        },
        revision: {
          50: "#fff7ed",
          100: "#ffedd5",
          500: "#f97316",
          600: "#ea580c",
        },
        done: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
