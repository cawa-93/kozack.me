// Каталог ігор. Вихідний код кожної гри лежить у games/<slug>, а її готова збірка —
// у src/games/<slug>; обкладинка 16:9 — у src/images/games/<slug>.jpg.
type GameText = {
    title: string,
    description: string,
}

export type Game = {
    slug: string,
    uk: GameText,
    en: GameText,
}

export const games: Game[] = [
    {
        slug: 'vtecha',
        uk: {
            title: 'Втеча',
            description: 'Горор про втечу з темного підземного лабіринту. Ви бачите лише те, що вихоплює ваше світло, а десь поруч чатують павуки.',
        },
        en: {
            title: 'Escape',
            description: 'A horror game about escaping a dark underground maze. You only see what your light reveals, and spiders lurk somewhere nearby.',
        },
    },
    {
        slug: 'kutochok-tyshi',
        uk: {
            title: 'Куточок тиші',
            description: 'Затишний tower defence про інтровертку. Зводьте стіни з книжок і саджайте на них котів-чарівників, щоб гості не розрядили її соціальну батарейку.',
        },
        en: {
            title: 'Quiet Corner',
            description: 'A cozy tower defence about an introvert. Build walls of books and put wizard cats on them so the guests don\'t drain her social battery.',
        },
    },
];
