import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          alt: "hsl(var(--surface-alt) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--surface-alt) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        error: "hsl(var(--error) / <alpha-value>)",
        ring: "hsl(var(--primary) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "3px",
        md: "6px",
        lg: "10px",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.8125rem", { lineHeight: "1.55" }],
        base: ["0.9375rem", { lineHeight: "1.6" }],
        lg: ["1.0625rem", { lineHeight: "1.5" }],
        xl: ["1.375rem", { lineHeight: "1.3" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
