import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      transitionTimingFunction: {
        brand: "cubic-bezier(.22, .7, .2, 1)",
      },
      fontFamily: {
        // Ink & Paper type (see src/styles/ink.css). Opt-in until the redesign is rolled out.
        // The defaults too, so font-sans and font-mono on older screens are the brand faces.
        sans: ['"Schibsted Grotesk"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", '"SFMono-Regular"', "Consolas", "monospace"],
        display: ['"Gloock"', '"Iowan Old Style"', '"Palatino Linotype"', "Georgia", "serif"],
        grotesk: ['"Schibsted Grotesk"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        plex: ['"IBM Plex Mono"', "ui-monospace", '"SFMono-Regular"', "Consolas", "monospace"],
      },
      colors: {
        // Ink & Paper tokens (see src/styles/ink.css). They flip with the .light class.
        surface: {
          DEFAULT: "rgb(var(--ez-surface) / <alpha-value>)",
          2: "rgb(var(--ez-surface-2) / <alpha-value>)",
          3: "rgb(var(--ez-surface-3) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--ez-line) / <alpha-value>)",
          soft: "rgb(var(--ez-line-soft) / <alpha-value>)",
        },
        fg: "rgb(var(--ez-fg) / <alpha-value>)",
        dim: "rgb(var(--ez-dim) / <alpha-value>)",
        faint: "rgb(var(--ez-faint) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--ez-brand) / <alpha-value>)",
          hover: "rgb(var(--ez-brand-hover) / <alpha-value>)",
          pressed: "rgb(var(--ez-brand-pressed) / <alpha-value>)",
          text: "rgb(var(--ez-brand-text) / <alpha-value>)",
        },
        "on-brand": "rgb(var(--ez-on-brand) / <alpha-value>)",
        gilt: "rgb(var(--ez-gilt) / <alpha-value>)",
        leak: "rgb(var(--ez-leak) / <alpha-value>)",
        paper: {
          DEFAULT: "rgb(var(--ez-paper) / <alpha-value>)",
          ink: "rgb(var(--ez-paper-ink) / <alpha-value>)",
          dim: "rgb(var(--ez-paper-dim) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px hsla(152, 45%, 35%, 0.3)" },
          "50%": { boxShadow: "0 0 20px hsla(152, 45%, 35%, 0.5)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.5s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
