module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7ff',
          100: '#e8eeff',
          200: '#cfdcff',
          300: '#adc0ff',
          400: '#7d93ff',
          500: '#4d6df7',
          600: '#3556e5',
          700: '#2944ba',
          800: '#273d94',
          900: '#22356e'
        }
      },
      boxShadow: {
        panel: '0 30px 60px -20px rgba(20, 30, 75, 0.45)'
      }
    }
  },
  plugins: []
};
