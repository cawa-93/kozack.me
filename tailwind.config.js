/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "media",
  corePlugins: {
    backgroundOpacity: false,
    textOpacity: false,
    borderOpacity: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          blue: {
            DEFAULT: "#0c93d1",
          },
        },
      },
    },
  },
  plugins: [],
};
