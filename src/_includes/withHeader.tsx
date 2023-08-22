export const layout = 'base.tsx'


type Messages = {
    readonly switchLang: string
    readonly contacts: string
    readonly projects: string
}

export const en: Messages = {
    switchLang: 'Змінити мову', // Текст пропозиції змінити мову повинен бути протилежною мовою від поточної
    contacts: 'Contacts',
    projects: 'Projects',
}


export const uk: Messages = {
    switchLang: 'Switch language', // Текст пропозиції змінити мову повинен бути протилежною мовою від поточної
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

                    <a className={'capitalize flex items-center gap-2'} href={langLinkToDisplay.url} rel={'alternate'}>
                        <svg aria-label={switchLang} xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em"
                             viewBox="0 0 24 24">
                            <path fill="currentColor"
                                  d="M22.401 4.818h-9.927L10.927 0H1.599C.72 0 .002.719.002 1.599v16.275c0 .878.72 1.597 1.597 1.597h10L13.072 24H22.4c.878 0 1.597-.707 1.597-1.572V6.39c0-.865-.72-1.572-1.597-1.572zm-15.66 8.68c-2.07 0-3.75-1.68-3.75-3.75c0-2.07 1.68-3.75 3.75-3.75c1.012 0 1.86.375 2.512.976l-.99.952a2.194 2.194 0 0 0-1.522-.584c-1.305 0-2.363 1.08-2.363 2.409S5.436 12.16 6.74 12.16c1.507 0 2.13-1.08 2.19-1.808l-2.188-.002V9.066h3.51c.05.23.09.457.09.764c0 2.147-1.434 3.669-3.602 3.669zm16.757 8.93c0 .59-.492 1.072-1.097 1.072h-8.875l3.649-4.03h.005l-.74-2.302l.006-.005s.568-.488 1.277-1.24c.712.771 1.63 1.699 2.818 2.805l.771-.772c-1.272-1.154-2.204-2.07-2.89-2.805c.919-1.087 1.852-2.455 2.049-3.707h2.034v.002h.002v-.94h-4.532v-1.52h-1.471v1.52H14.3l-1.672-5.21l.006.022h9.767c.605 0 1.097.48 1.097 1.072v16.038zm-6.484-7.311c-.536.548-.943.873-.943.873l-.008.004l-1.46-4.548h4.764c-.307 1.084-.988 2.108-1.651 2.904c-1.176-1.392-1.18-1.844-1.18-1.844h-1.222s.05.678 1.7 2.61z"/>
                        </svg>
                        {new Intl.DisplayNames(langLinkToDisplay.lang, {type: "language"}).of(langLinkToDisplay.lang)}
                    </a>

                </comp.LayoutContainer>
            </header>
            <main className={'py-4 md:py-6 pb-44'}>
                {children}
            </main>
        </>
    );
}
