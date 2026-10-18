import * as globalData from '../_data.ts'
import {games} from './_games.ts'

export const uk = {
    heading: 'Ігри',
    title: `Ігри — ${globalData.uk.name}`,
    description: 'Невеликі ігри, які я роблю у вільний час. Вони запускаються просто в браузері, нічого не треба встановлювати.',
    games: games.map(({slug, uk}) => ({slug, ...uk})),
};

export const en = {
    heading: 'Games',
    title: `Games — ${globalData.en.name}`,
    description: 'Small games I make in my spare time. They run right in your browser, no installation needed. For now, they are available in Ukrainian only.',
    games: games.map(({slug, en}) => ({slug, ...en})),
};

export default ({comp, heading, description, games}) => {
    return (
        <comp.LayoutContainer className={"flex flex-col gap-10 md:gap-16"}>
            <section className={"flex flex-col gap-3"}>
                <h1 className={"text-brand-blue text-[clamp(45px,7vw,60px)] leading-[1] font-bold"}>
                    {heading}
                </h1>
                <p className={"text-[clamp(18px,2.5vw,22px)] opacity-75 max-w-3xl"}>{description}</p>
            </section>

            <ul role="list" className={"grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"}
                transform-images="avif webp jpg 400@2">
                {games.map(game => (
                    <li key={game.slug}>
                        <a href={`/games/${game.slug}/`} className={"group flex flex-col gap-3"}>
                            <div className={"overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"}>
                                <img
                                    src={`/images/games/${game.slug}.jpg`}
                                    alt=""
                                    width="400"
                                    height="225"
                                    loading="lazy"
                                    className={"w-full aspect-video object-cover motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-105 group-focus-visible:scale-105"}
                                />
                            </div>
                            <h2 className={"m-0 text-xl font-bold group-hover:text-brand-blue group-focus-visible:text-brand-blue"}>
                                {game.title}
                            </h2>
                            <p className={"opacity-75"}>{game.description}</p>
                        </a>
                    </li>
                ))}
            </ul>
        </comp.LayoutContainer>
    );
};
