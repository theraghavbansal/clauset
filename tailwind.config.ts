import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', '"Segoe UI"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', '"Consolas"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
