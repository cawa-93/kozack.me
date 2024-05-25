import type {socialLinks as TsocialLinks} from "../_data.ts";
import uid = Deno.uid;

export default (
    {comp, name, job, tagline, socialLinks, donationLink, articlesLink, emailLink, socialHeadlines}: {
        name: string;
        job: string;
        tagLine: string;
        socialLinks: TsocialLinks;
        donationLink: TsocialLinks[number]
        articlesLink: TsocialLinks[number]
        emailLink: TsocialLinks[number],
        socialHeadlines: {primary: string, secondary: string},
    },
) => (
    <section
        className={"flex items-center max-md:flex-col-reverse max-md:text-center gap-5"}
    >
        <div className={"flex flex-[5] flex-col gap-2 word-wrap"}>
            <h1 className={"text-brand-blue text-[clamp(45px,7vw,60px)] leading-[1] font-bold"}>
                {name}
            </h1>
            <p className={"text-[clamp(38px,6vw,60px)] leading-[1] font-bold opacity-90"}>
                {job}
            </p>
            <p className={"text-2xl opacity-75 mt-3"}>{tagline}</p>
            <section id={'contacts'} className={'flex flex-wrap gap-x-10 gap-y-5 justify-center items-center mt-5'}>

                <section className={'flex flex-wrap gap-2 justify-center items-center'} aria-label={socialHeadlines.primary}>
                    <comp.SocialIcon {...donationLink} className={`opacity-75 hover:opacity-100 focus-visible:opacity-100 flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm border-current`} expanded={true}/>
                    <comp.SocialIcon {...articlesLink} className={`opacity-75 hover:opacity-100 focus-visible:opacity-100 flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm border-current`} expanded={true}/>
                    <comp.SocialIcon {...emailLink} className={`opacity-75 hover:opacity-100 focus-visible:opacity-100 flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm border-current`} expanded={true}/>
                </section>

                <section aria-labelledby="socials">
                    <h2 id="socials" className="text-center font-light mb-2 text-sm">{socialHeadlines.secondary}</h2>
                    <ul role="list" className={'flex flex-wrap gap-4 justify-between items-center'}>
                        {socialLinks.map((link, index) =>
                            (
                                <li key={link.url}>
                                    <comp.SocialIcon {...link}
                                                     className={`opacity-75 hover:opacity-100 focus-visible:opacity-100`}/>
                                </li>
                            ))}
                    </ul>
                </section>
            </section>
        </div>
        <div className={"text-center flex-[3]"}>
            <img
                width="320"
                height="320"
                alt={name}
                className={"w-[180px] md:w-[320px] mx-auto"}
                src="../images/avatar.png"
                transform-images="avif webp png 320@2 320@3 180@2 180@3"
            />
        </div>
    </section>
);
