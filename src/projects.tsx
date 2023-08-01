import type {Project} from './_projects.ts'

export const uk = {
  title: 'Проєкти'
};

export const en = {
  title: 'Projects'
};

function localizedDate(date: Date, lang: string) {
    const shouldShowMonth = date.getTime() === new Date(date.getFullYear())
    const formatter = new Intl.DateTimeFormat(lang, {
        year: 'numeric',
        month: shouldShowMonth ? 'short' : undefined
    })
    return formatter.format(date)
}

function localizedPeriod({start, end}: { start: Date, end?: Date }, lang: string) {
    const messages = {
        uk: 'Дотепер',
        en: 'Now'
    }

    const localizedStart = localizedDate(start, lang)
    const localizedEnd = end ? localizedDate(end, lang) : messages[lang]

    return `${localizedStart}${localizedStart !== localizedEnd ? ` — ${localizedEnd}` : ''}`
}



export default ({comp, projects: _projects, lang}) => {
    const projects = _projects as Project[]
    return (
        <comp.LayoutContainer className={"flex flex-col gap-20"}>
            {
                projects.map(project =>
                    <article className={'flex flex-col bg-[oklch(0.6_0_89.876_/_0.1)] rounded-3xl p-6'}>
                        <h2 className={'font-light text-xl'}>{project.label}</h2>

                        <div>
                            {localizedPeriod(project.period, lang)}
                        </div>

                        <div>
                            <div>{project.description}</div>
                        </div>
                    </article>
                )
            }
        </comp.LayoutContainer>
    );
};

// language=CSS
`
    * {
        color: oklch(0.6 0 89.876 / 0.5);
    }
`