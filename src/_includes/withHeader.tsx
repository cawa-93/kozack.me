export const layout = 'base.tsx'


type Messages = {
    readonly switchLang: string
    readonly contacts: string
    readonly projects: string
}

export const en: Messages = {
    switchLang: 'Змінити мову на', // Текст пропозиції змінити мову повинен бути протилежною мовою від поточної
    contacts: 'Contacts',
    projects: 'Projects',
}


export const uk: Messages = {
    switchLang: 'Switch language to', // Текст пропозиції змінити мову повинен бути протилежною мовою від поточної
    contacts: 'Контакти',
    projects: 'Проєкти',
}

export default ({children, comp, alternates, lang, uk, en}) => {
    const langLinkToDisplay = alternates.find(a => a.lang !== lang)

    const {switchLang} = ({uk, en})[lang] as Messages

    return (
        <>
            <header className={'py-5'}>
                <comp.LayoutContainer
                    className={'w-full'}>
                    <a
                        className={'flex items-center gap-2 opacity-75 hover:opacity-100 focus-visible:opacity-100'}
                        href={langLinkToDisplay.url} rel={'alternate'}
                        lang={langLinkToDisplay.lang}
                        hrefLang={langLinkToDisplay.lang}
                        rel="alternate"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16">
                            <g fill="currentColor">
                                <path
                                    d="M4.545 6.714L4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"/>
                                <path
                                    d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292c.178.217.451.635.555.867c1.125-.359 2.08-.844 2.886-1.494c.777.665 1.739 1.165 2.93 1.472c.133-.254.414-.673.629-.89c-1.125-.253-2.057-.694-2.82-1.284c.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492a2 2 0 0 1-.94.31"/>
                            </g>
                        </svg>
                        {switchLang + ' ' + new Intl.DisplayNames(langLinkToDisplay.lang, {type: 'language'}).of(langLinkToDisplay.lang)}
                    </a>
                </comp.LayoutContainer>
            </header>
            <main className={'pt-4 pb-44'}>
                {children}
            </main>
        </>
    );
}
