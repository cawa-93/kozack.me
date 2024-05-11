import * as globalData from './_data.ts'

const bannerUrl = 'https://stand-with-ukraine.pp.ua/'

export const uk = {
    title: globalData.uk.name,
    description: globalData.uk.description,
    banner: {
        title: "Дякую за підтримку України!",
        message:
            "Оскільки росія веде геноцидну війну проти моєї країни, я вдячний усім, хто продовжує підтримувати Україну в нашій боротьбі за свободу.",
        linkText: "Подивіться, як ви можете допомогти",
        url: bannerUrl,
    }
};

export const en = {
    title: globalData.en.name,
    description: globalData.en.description,
    banner: {
        title: "Thank You for Supporting Ukraine!",
        message:
            "As russia wages a genocidal war against my country, I'm grateful to everyone who continues to stand with Ukraine in our fight for freedom.",
        linkText: "See how you can help",
        url: bannerUrl,
    }
};


export default ({
                    comp,
                    banner,

                    name,
                    job,
                    tagline,
                    socialLinks,
                    donationLink,
                    articlesLink
                }) => {
    return (
        <>
            <comp.LayoutContainer className={"flex flex-col gap-10 md:gap-20"}>


                <comp.StandWithUkraineBanner {...banner}/>

                <comp.HeroSection
                    name={name}
                    job={job}
                    tagline={tagline}
                    socialLinks={socialLinks}
                    donationLink={donationLink}
                    articlesLink={articlesLink}
                />
            </comp.LayoutContainer>
        </>
    );
};
