


export const uk = {
    title: '❤️ Дякую за підтримку України!',
    message: 'Оскільки росія веде геноцидну війну проти моєї країни, я вдячний усім, хто продовжує підтримувати Україну в нашій боротьбі за свободу.',
    linkText: 'Подивіться, як ви можете допомогти',
}

export const en = {
    title: '❤️ Thank You for Supporting Ukraine!',
    message: 'As russia wages a genocidal war against my country, I\'m grateful to everyone who continues to stand with Ukraine in our fight for freedom.',
    linkText: 'See how you can help',
}

export const linkUrl = 'https://stand-with-ukraine.pp.ua/'


export default ({
                    comp,
                    title,
                    message,
                    linkUrl,
                    linkText,

    name, job, tagline, description
                }) => {
    return (
        <>
            <comp.LayoutContainer className={'flex flex-col gap-3'}>
                <comp.StandWithUkraineBanner title={title} message={message}
                                             linkUrl={linkUrl}
                                             linkText={linkText}></comp.StandWithUkraineBanner>

                <comp.HeroSection name={name} job={job} tagline={tagline}/>
            </comp.LayoutContainer>
        </>
    );
};