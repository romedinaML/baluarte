import type { Config } from 'tailwindcss';
import { baluarteTheme } from './baluarte.tailwind';

export default {
  content: [
    './src/**/*.{ts,tsx,mdx}',
    './.storybook/**/*.{ts,tsx,mdx}',
    './stories/**/*.{ts,tsx,mdx}',
  ],
  theme: { extend: baluarteTheme },
  plugins: [],
} satisfies Config;
