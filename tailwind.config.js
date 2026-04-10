/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Navy & Gold theme — warm, comfortable, professional
        navy: '#101B2E',           // slightly warmer navy
        navySecondary: '#1A2740',  // warmer secondary
        gold: '#D4A84B',           // warmer, more amber gold
        goldLight: '#E8C87A',      // lighter gold for hover
        bgDark: '#0C1321',         // deep but not pure black
        panel: '#131D2E',          // warmer panel background
        borderDark: '#243044',     // softer, more visible borders
        textLight: '#D4DCE8',      // slightly warmer white text
        textMuted: '#8B9AB5',      // warmer muted text, still readable
        danger: '#B91C1C',         // standard danger red
        // Additional comfort colors
        success: '#059669',        // emerald green for success states
        info: '#2563EB',           // blue for info states
        warmGray: '#374357',       // warm gray for subtle backgrounds
        // Legacy aliases
        lpBlue: '#101B2E',
        lpGold: '#D4A84B',
        lpGray: '#131D2E',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['"Lato"', '"Heebo"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'gold-sm': '0 1px 3px 0 rgba(201, 162, 39, 0.1), 0 1px 2px -1px rgba(201, 162, 39, 0.1)',
        'gold-md': '0 4px 6px -1px rgba(201, 162, 39, 0.1), 0 2px 4px -2px rgba(201, 162, 39, 0.1)',
        'inner-gold': 'inset 0 2px 4px 0 rgba(201, 162, 39, 0.06)',
      }
    },
  },
  plugins: [],
}
