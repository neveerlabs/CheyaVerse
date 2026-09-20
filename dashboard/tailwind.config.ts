import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        "bg-soft": "#fafafa",
        surface: "#ffffff",
        "surface-2": "#f5f5f5",
        divider: "#ebebeb",
        line: "#e8e8e8",
        "line-strong": "#d4d4d4",
        ink: "#0a0a0a",
        "ink-soft": "#525252",
        "ink-mute": "#a3a3a3",
        accent: "#0a0a0a",
        "accent-soft": "#f5f5f5",
        "accent-hover": "#262626",
        success: "#16a34a",
        danger: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      animation: {
        "fade-up": "fadeUp .35s cubic-bezier(.4,0,.2,1)",
        shimmer: "shimmer 2.6s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "220% 0" },
          "100%": { backgroundPosition: "-220% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
