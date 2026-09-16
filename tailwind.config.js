/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teleforge: {
          primary: 'var(--tf-primary, #8B1E22)',
          hover: 'var(--tf-primary-hover, #74181B)',
          active: 'var(--tf-primary-active, #5F1215)',
          subtle: 'var(--tf-primary-subtle, rgba(139, 30, 34, 0.20))',
          secondary: 'var(--tf-secondary-accent, #FFF8EE)',
          cream: 'var(--tf-cream, #FFF8EE)',
          creamAccent: 'var(--tf-cream-accent, #F5EBE1)',
          creamMuted: 'var(--tf-cream-muted, #D8CAB8)',
          bg: 'var(--tf-bg, #0c1017)',
          surface: 'var(--tf-surface, #151d27)',
          surfaceElevated: 'var(--tf-surface-elevated, #1a2430)',
          bubbleOut: 'var(--tf-bubble-out, #43191d)',
          bubbleIn: 'var(--tf-bubble-in, #1a2430)',
          bubbleOutText: 'var(--tf-bubble-out-text, #FFF8EE)',
          bubbleInText: 'var(--tf-bubble-in-text, #E6EDF3)',
        },
        telegram: {
          primary: 'var(--tf-primary, #8B1E22)',
          hover: 'var(--tf-primary-hover, #74181B)',
          light: '#FFF1F1',
          bg: 'var(--tf-bg, #0c1017)',
          sidebarLight: 'var(--tf-surface, #ffffff)',
          sidebarDark: 'var(--tf-surface, #151d27)',
          chatBgLight: 'var(--tf-bg, #F8F4EE)',
          chatBgDark: 'var(--tf-bg, #0c1017)',
          bubbleOutLight: 'var(--tf-bubble-out, #FCEBEB)',
          bubbleOutDark: 'var(--tf-bubble-out, #43191d)',
          bubbleInLight: 'var(--tf-bubble-in, #ffffff)',
          bubbleInDark: 'var(--tf-bubble-in, #1a2430)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
