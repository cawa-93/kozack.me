export const layout = "base.tsx";


export const lang = ['uk', 'en']


export const uk = {
    name: 'Олександр Козак',
    job: 'Веброзробник',
    tagline: 'та ентузіаст opensource з України. Захоплюється створенням рішень для допомоги людям',
    get description() {
        return `${this.job} ${this.tagline}`
    }
}

export const en = {
    name: 'Alex Kozack',
    job: 'Web developer',
    tagline: 'and opensource enthusiast from Ukraine. Passionate about creating solutions to help people',
    get description() {
        return `${this.job} ${this.tagline}`
    }
}