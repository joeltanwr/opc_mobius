/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#ED1C24",
          hover: "#D0121A",
          active: "#A60E14",
        },
        navy: "#1E293B",
        canvas: "#F8FAFC",
        border: "#E2E8F0",
        ink: {
          DEFAULT: "#0F172A",
          secondary: "#64748B",
          light: "#94A3B8",
        },
        success: { DEFAULT: "#10B981", bg: "#ECFDF5" },
        warning: { DEFAULT: "#F59E0B", bg: "#FEF3C7" },
        info: { DEFAULT: "#2563EB", bg: "#EFF6FF" },
        analytics: "#6366F1",
        control: "#94A3B8",
      },
      fontFamily: {
        sans: ["Open Sans", "Helvetica Neue", "Arial", "sans-serif"],
        num: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.05), 0 1px 2px -1px rgba(0,0,0,0.05)",
        "card-hover": "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.03)",
      },
      maxWidth: {
        container: "1280px",
      },
    },
  },
  plugins: [],
};
