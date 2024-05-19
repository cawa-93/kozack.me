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

export default ({children, comp, alternates, articlesLink, lang, uk, en, url}, helpers) => {
    const langLinkToDisplay = alternates.find(a => a.lang !== lang)

    const {switchLang, contacts, projects} = ({uk, en})[lang] as Messages

    const links: { label: string, attributes: HTMLAnchorElement }[] = [
        {
            label: contacts,
            attributes: {
                href: helpers.url(`~/index.tsx(lang=${lang})`)+'#contacts',
            }
        },
        {
            label: projects,
            attributes: {
                href: `https://www.linkedin.com/in/alex-kozack/details/projects`,
            }
        },
        {
            label: articlesLink.label,
            attributes: {
                href: articlesLink.url,
            }
        }
    ]

    return (
        <>
            <header className={'py-5 border-t flex items-center justify-end fixed bottom-0 bg-inherit z-10 w-full max-sm:text-sm'}>
                <comp.LayoutContainer
                    className={'w-full flex flex-wrap items-center justify-between gap-2'}>

                    <a
                        className={'capitalize flex items-center gap-2'}
                        href={langLinkToDisplay.url} rel={'alternate'}
                        aria-label={switchLang + ' ' + new Intl.DisplayNames(langLinkToDisplay.lang, {type: "language"}).of(langLinkToDisplay.lang)}
                        title={switchLang + ' ' + new Intl.DisplayNames(langLinkToDisplay.lang, {type: "language"}).of(langLinkToDisplay.lang)}
                        lang={langLinkToDisplay.lang}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16">
                            <g fill="currentColor">
                                <path
                                    d="M4.545 6.714L4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"/>
                                <path
                                    d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292c.178.217.451.635.555.867c1.125-.359 2.08-.844 2.886-1.494c.777.665 1.739 1.165 2.93 1.472c.133-.254.414-.673.629-.89c-1.125-.253-2.057-.694-2.82-1.284c.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492a2 2 0 0 1-.94.31"/>
                            </g>
                        </svg>
                        {new Intl.DisplayNames(langLinkToDisplay.lang, {type: "language"}).of(langLinkToDisplay.lang)}
                    </a>


                    <nav>
                        <ul className={'flex items-center gap-3 sm:gap-6 md:gap-12'}>
                            {
                                links.map(({label, attributes}) => {
                                    const isCurrentLink = attributes.href.split('#')[0] === url
                                    return <li>
                                        <a className={`underline ${isCurrentLink ? 'decoration-4' : 'decoration-1'} hover:decoration-4 focus-visible:decoration-4`} {...(isCurrentLink ? {'aria-current': 'page'} : {})} {...attributes}>{label}</a>
                                    </li>;
                                })
                            }
                        </ul>
                    </nav>


                </comp.LayoutContainer>
            </header>
            <main className={'py-4 md:py-6 pb-44'}>
                {children}
            </main>
        </>
    );
}
