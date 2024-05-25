/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "media",
    corePlugins: {
        backgroundOpacity: false,
        textOpacity: false,
        borderOpacity: false,
        preflight: false,
        float: false,
        backdropBlur: false,
        backdropBrightness: false,
        backdropContrast: false,
        backdropGrayscale: false,
        backdropHueRotate: false,
        backdropInvert: false,
        backdropOpacity: false,
        backdropSaturate: false,
        backdropSepia: false,
    },
    minify: true,
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
