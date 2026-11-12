import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [tailwindcss()],
  preview: {
    allowedHosts: ['airrest-website.onrender.com'],
  },
};
