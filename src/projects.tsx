import {Angular, CSS, Git, HTML, JavaScript, Skill, WebExtensions, WordPress} from "./_Skills.ts";

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




type ProjectPicture = { emoji: string } | { href: string }
export type Project = {
    label: string,
    'label.en'?: string,
    links?: {
        label: string,
        'label.en'?: string,
        url: string
    }[]
    description?: string
    'description.en'?: string
    period: {
        start: Date
        end?: Date
    }
    skills: Skill[]
    // picture: ProjectPicture
}
export const projects: Project[] = [
    {
        label: 'Інформер Вконтактє',
        "label.en": 'VK notice',
        description: 'Розширеня для браузерів для вконтактє',
        'description.en': 'Web extension for VK',
        picture: {
            emoji: '😅'
        },
        links: [{
            label: 'GitHub',
            url: 'https://github.com/Sashkis/vknotice',
        }],
        period: {
            start: new Date('2013'),
            end: new Date('2016'),
        },
        skills: [
            WebExtensions,
            Angular,
            JavaScript,
            Git,
            HTML,
            CSS,
        ]
    },

    {
        label: 'allatkachukart.com',
        description: 'Особистий вебсайт художниці',
        'description.en': 'Artist\'s personal site',
        picture: {
            emoji: '😅'
        },
        period: {
            start: new Date('2016'),
            end: new Date('2016'),
        },
        links: [{
            url: 'http://web.archive.org/web/20201022065728/http:/allatkachukart.com/',
            label: 'Вебархів',
            'label.en': 'Web Archive',
        }],
        skills: [
            WordPress,
            HTML,
            CSS,
        ]

    }
].sort((p1, p2) => {
    const byEnd = (p2.period.end.getTime() || Infinity) - (p1.period.end.getTime() || Infinity);
    return byEnd !== 0 ? byEnd : p2.period.start.getTime() - p1.period.start.getTime();
})




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