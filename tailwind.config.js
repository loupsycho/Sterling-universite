/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#080808',
          900: '#151515',
          800: '#242424',
          700: '#333333',
          600: '#4a4a4a',
          400: '#8a8a8a',
        },
        gold: {
          50: '#fbf7ef',
          200: '#ead9b4',
          300: '#E6D2A3',
          400: '#d4b67a',
          500: '#C6A15B',
          600: '#a88443',
          700: '#856a33',
        },
        bone: {
          50: '#FBF9F4',
          100: '#F5F1E9',
          200: '#e9e3d6',
          300: '#cfc7b6',
        },
        success: { 400: '#7fb88f', 500: '#5c9e6e' },
        warning: { 400: '#e0b15c', 500: '#c8913a' },
        error: { 400: '#e08a80', 500: '#c4574b' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 1s ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
      },
    },
  },
  plugins: [],
};
