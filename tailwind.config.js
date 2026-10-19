/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#0a0f1a",
          900: "#0e1524",
          850: "#121a2c",
          800: "#182238",
          700: "#1f2b45",
        },
        line: {
          900: "#1b2537",
          700: "#263349",
          500: "#33445f",
        },
        muted: "#8292ab",
        good: "#34d399",
        bad: "#f87171",
        warn: "#fbbf24",
        accent: "#4e8ef7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
