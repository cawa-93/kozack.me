import {Angular, CSS, Git, HTML, JavaScript, type Skill, WebExtensions, WordPress} from "./_Skills.ts";


type ProjectPicture = { emoji: string } | { href: string }

type Project = {
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