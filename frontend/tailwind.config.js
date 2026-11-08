/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        red: { 50: '#FFF1F1', 100: '#FFDCDC', 200: '#FFB8B8', 300: '#FF8585', 400: '#FF4A4A', 500: '#F01414', 600: '#E40000', 700: '#BD0000', 800: '#9A0606', 900: '#7F0B0B', 950: '#450000' },
        ink: { 950: '#060607', 900: '#0B0B0D', 850: '#101013', 800: '#151518', 750: '#1A1A1E', 700: '#222227', 600: '#2C2C32', 500: '#3A3A42', 400: '#5A5A64', 300: '#8A8A96', 200: '#B8B8C2', 100: '#E4E4EA', 50: '#F6F6F8' },
        // light onboarding
        paper: '#FFFFFF', mist: '#F5F5F7', smoke: '#1D1D1F', graphite: '#6E6E73', hair: '#E3E3E8', blush: '#FFF0F0',
        // dense views (partner, impact, agent timeline): light canvas, hairline grid, red only for attention
        void: '#FFFFFF', slab: '#FAFAFB', rule: '#E8E8EC', fog: '#6E6E73', snow: '#1D1D1F', alarm: '#D70000',
        wl: { bg: '#EFEAE2', head: '#FFFFFF', in: '#FFFFFF', out: '#D9FDD3', text: '#111B21', muted: '#667781', green: '#00A884', line: '#E9EDEF' },
        wa: { bg: '#EFEAE2', panel: '#FFFFFF', out: '#D9FDD3', in: '#FFFFFF', green: '#00A884', text: '#111B21', muted: '#667781', line: '#E9EDEF', sheet: '#F0F2F5' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Noto Sans Devanagari"', '"Noto Sans Tamil"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(228,0,0,.35), 0 10px 40px -10px rgba(228,0,0,.55)',
        card: '0 1px 0 rgba(255,255,255,.04) inset, 0 20px 50px -20px rgba(0,0,0,.6)',
      },
      keyframes: {
        shine: { '0%': { transform: 'translateX(-120%) skewX(-20deg)' }, '100%': { transform: 'translateX(220%) skewX(-20deg)' } },
        scan: { '0%': { top: '0%' }, '50%': { top: '96%' }, '100%': { top: '0%' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        pulsering: { '0%': { transform: 'scale(.9)', opacity: '.7' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        shine: 'shine 1.1s ease-in-out', scan: 'scan 1.6s ease-in-out infinite', floaty: 'floaty 6s ease-in-out infinite',
        pulsering: 'pulsering 1.6s cubic-bezier(.2,.6,.4,1) infinite', marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
}
