export type Skill = {
    label: string,
    'label.en'?: string,
    isPrimary: boolean
}


export const JavaScript = {
    isPrimary: true,
    label: 'JavaScript'
} satisfies Skill


export const TypeScript = {
    isPrimary: true,
    label: 'TypeScript'
} satisfies Skill


export const HTML = {
    isPrimary: true,
    label: 'HTML'
} satisfies Skill

export const CSS = {
    isPrimary: true,
    label: 'CSS'
} satisfies Skill


export const WordPress = {
    isPrimary: true,
    label: 'WordPress'
} satisfies Skill

export const Vue2 = {
    isPrimary: false,
    label: 'Vue 2'
} satisfies Skill

export const Vue3 = {
    isPrimary: false,
    label: 'Vue 3',
} satisfies Skill

export const Nuxt3 = {isPrimary: false, label: 'Nuxt 3'} satisfies Skill
export const Pinia = {isPrimary: false, label: 'Pinia'} satisfies Skill
export const Vuex = {isPrimary: false, label: 'Vuex'} satisfies Skill
export const Node = {isPrimary: false, label: 'Node.js'} satisfies Skill
export const Deno = {isPrimary: false, label: 'Deno'} satisfies Skill
export const Electron = {isPrimary: false, label: 'Electron.js'} satisfies Skill
export const PHP = {isPrimary: false, label: 'PHP'} satisfies Skill
export const GTM = {isPrimary: false, label: 'Google Tag Manager'} satisfies Skill
export const Git = {isPrimary: false, label: 'Git'} satisfies Skill
export const Angular = {isPrimary: false, label: 'Angular.js'} satisfies Skill
export const WebExtensions = {
    isPrimary: false,
    label: 'Браузерні розширення',
    ['label.en']: 'Web Extensions',
} satisfies Skill

export const Accessibility = {
    isPrimary: false,
    label: 'Вебдоступність',
    ['label.en']: 'Web Accessibility',
} satisfies Skill