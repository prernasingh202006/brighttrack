/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        night: { 950: '#060b18', 900: '#0a1224', 800: '#101b35', 700: '#18264a', 600: '#27386a', 500: '#3a4f85' },
        paper: { DEFAULT: '#f6f4ee', 200: '#ebe7dc' },
        sodium: { 300: '#ffd36b', 400: '#ffbf3a', 500: '#ffa800', 600: '#e08a00', 700: '#a86400' },
      },
      boxShadow: {
        glow: '0 0 40px 6px rgba(255,168,0,.35)',
        lamp: '0 0 24px 4px rgba(255,191,58,.55)',
      },
      keyframes: {
        flicker: { '0%,100%': { opacity: 1 }, '48%': { opacity: 0.85 }, '50%': { opacity: 1 }, '52%': { opacity: 0.7 } },
      },
      animation: { flicker: 'flicker 5s infinite' },
    },
  },
  plugins: [],
};
