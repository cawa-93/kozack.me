import {render} from "https://deno.land/x/resvg_wasm/mod.ts";
import {encode} from "https://deno.land/std@0.195.0/encoding/base64.ts";

export const lang = ['uk', 'en']

export default async function ({name, job, tagline, lang}) {

    const file = encode(await Deno.readFile('./src/images/avatar.png'))

    const descriptionLines = tagline.split(/\s/).reduce((lines, word) => {


        if (lines.at(-1)?.text.endsWith('.') || (lines.at(-1)?.text.length + word.length) >= 42) {
            lines.push({
                y: (lines.at(-1)?.y + 40),
                text: word
            })
        } else {
            lines[lines.length - 1].text += ' ' + word
        }

        return lines
    }, [{y: 380, text: ''}])
        .map(line => `<text x="100" y="${line.y}" className="text-gray">${line.text}</text>`)
        .join('')


    return render(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect x="0" y="0" width="1200" height="630" fill="#fff" />

    <style>
        .text-brand-blue, .text-secondary, .text-gray {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
            Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
        }

        .text-brand-blue, .text-secondary {
            fill: rgb(60, 60, 67);
            font-size: 60px;
            font-weight: bold;
        }

        .text-brand-blue {
            fill: #4cafde;
        }

        .text-gray {
            fill: #6d6d72;
            font-size: 30px;
        }
    </style>

    <!-- Text Elements -->
    <text x="100" y="240" className="text-brand-blue">${name}</text>
    <text x="100" y="320" className="text-secondary">${job}</text>
    ${descriptionLines}
    <!-- Друга колонка -->

    <!-- Квадратне зображення в другій колонці -->
    <image x="780" y="160" href="data:image/png;base64,${file}" width="320" height="320" />
</svg>`);
}
