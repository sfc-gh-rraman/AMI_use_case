/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a0d14',
          900: '#0d1117',
          800: '#161b22',
          700: '#21262d',
          600: '#30363d',
          500: '#484f58',
        },
        atlas: {
          blue: '#58a6ff',
          green: '#3fb950',
          yellow: '#d29922',
          red: '#f85149',
          purple: '#a371f7',
          cyan: '#39c5cf',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
        }
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 0.25s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
