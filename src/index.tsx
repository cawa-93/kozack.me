import * as globalData from './_data.ts'


export const uk = {
  title: globalData.uk.name,
  description: globalData.uk.description
};

export const en = {
  title: globalData.en.name,
  description: globalData.en.description
};

export const banner = {
    title: "❤️ Дякую за підтримку України!",
    'title.en': "❤️ Thank You for Supporting Ukraine!",

    message:
        "Оскільки росія веде геноцидну війну проти моєї країни, я вдячний усім, хто продовжує підтримувати Україну в нашій боротьбі за свободу.",
    'message.en':
        "As russia wages a genocidal war against my country, I'm grateful to everyone who continues to stand with Ukraine in our fight for freedom.",

    linkText: "Подивіться, як ви можете допомогти",
    'linkText.en': "See how you can help",

    url: 'https://stand-with-ukraine.pp.ua/'
}


export default ({
                    comp,
                    banner,

                    name,
                    job,
                    tagline,
                    socialLinks,
                }) => {
    return (
        <>
            <comp.LayoutContainer className={"flex flex-col gap-20"}>
                <comp.StandWithUkraineBanner {...banner}/>

                <comp.HeroSection
                    name={name}
                    job={job}
                    tagline={tagline}
                    socialLinks={socialLinks}
                />
            </comp.LayoutContainer>
        </>
    );
};
