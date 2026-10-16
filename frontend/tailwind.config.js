/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Cairo', 'sans-serif'],
        arabic: ['Cairo', 'sans-serif'],
      },
      colors: {
        // FPS Pharmacy primary — clinical teal (every `pharma-*` class across the app).
        pharma: {
          50:  '#effaf9',
          100: '#d6f3f0',
          200: '#afe6e1',
          300: '#7bd2cc',
          400: '#43b6b1',
          500: '#209a98',
          600: '#147c7d',
          700: '#136466',
          800: '#145053',
          900: '#144345',
          950: '#06282b',
        },
        // Deep navy used for the sidebar and dark surfaces.
        ink: {
          700: '#1d3448',
          800: '#132638',
          900: '#0c1b2a',
          950: '#07111c',
        },
      },
    },
  },
  plugins: [],
}
