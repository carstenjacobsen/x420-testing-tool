/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        stellar: {
          50: '#eef8ff',
          100: '#d9efff',
          200: '#bce4ff',
          300: '#8ed3ff',
          400: '#59b8ff',
          500: '#339bff',
          600: '#1a7cf5',
          700: '#1264e1',
          800: '#154fb6',
          900: '#17458f',
          950: '#132a57',
        },
      },
    },
  },
  plugins: [],
};
