/** Preset Tailwind compartilhado do condar. */
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef2f3', 100: '#fde6e8', 200: '#fbd0d5', 300: '#f7aab3',
          400: '#ef6274', 500: '#e63e52', 600: '#d81e34', 700: '#b5192b',
          800: '#971823', 900: '#7f1720', 950: '#46080e',
        },
        areia: '#edebe7',
        tinta: '#1a1a1a',
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
}
