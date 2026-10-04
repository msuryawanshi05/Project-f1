/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        pitwall: {
          bg:          'var(--pw-bg)',
          surface:     'var(--pw-surface)',
          'surface-2': 'var(--pw-surface-2)',
          border:      'var(--pw-border)',
          muted:       'var(--pw-muted)',
          text:        'var(--pw-text)',
          dim:         'var(--pw-dim)',
          ghost:       'var(--pw-ghost)',
          'text-strong': 'var(--pw-text-strong)',
        },
        sector: {
          purple: 'var(--pw-purple)',
          green:  'var(--pw-green)',
          yellow: 'var(--pw-yellow)',
          white:  'var(--pw-text-strong)',
        },
        status: {
          green:  'var(--pw-green)',
          yellow: 'var(--pw-yellow)',
          red:    'var(--pw-red)',
          sc:     '#FFA500',
          vsc:    'var(--pw-yellow)',
        },
        popup: {
          critical: '#E8002D',
          high:     '#FF6B00',
          medium:   '#B468FF',
          info:     '#888888',
          blue:     '#3671C6',
          teal:     '#00D2BE',
        },
      },
      fontFamily: {
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Rajdhani', 'Barlow Condensed', 'sans-serif'],
        digital: ['Orbitron', 'JetBrains Mono', 'monospace'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        timing: ['13px', { lineHeight: '1.2', letterSpacing: '0.02em' }],
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulse_dot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        countdown_tick: {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '50%':  { opacity: '0.7' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
      },
      animation: {
        ticker:            'ticker 30s linear infinite',
        pulse_dot:         'pulse_dot 2s ease-in-out infinite',
        'slide-in-right':  'slide-in-right 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
