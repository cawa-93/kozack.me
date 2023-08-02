import type {socialLinks as TsocialLinks} from "../_data.ts";

export default (
    {comp, name, job, tagline, socialLinks, donationLink, articlesLink}: {
        name: string;
        job: string;
        tagLine: string;
        socialLinks: TsocialLinks;
        donationLink: TsocialLinks[number]
        articlesLink: TsocialLinks[number]
    },
) => (
    <section
        className={"flex items-center max-md:flex-col-reverse max-md:text-center gap-5"}
    >
        <div className={"flex flex-[5] flex-col gap-2 word-wrap"}>
            <h1 className={"text-brand-blue text-[clamp(50px,5vw,60px)] leading-[1] font-bold"}>
                {name}
            </h1>
            <p className={"text-[clamp(50px,5vw,60px)] leading-[1] font-bold text-[#3c3c43]"}>
                {job}
            </p>
            <p className={"text-2xl text-[rgb(60_60_67_/_0.75)] mt-3"}>{tagline}</p>
            <div className={'flex flex-wrap gap-x-10 gap-y-5 justify-center items-center mt-5'}>

                <div className={'flex flex-wrap gap-2 justify-between items-center'}>
                    <comp.SocialIcon {...donationLink} className={`text-[rgb(60_60_67_/_0.75)] hover:text-inherit flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm hover:border-current`} expanded={true}/>
                    <comp.SocialIcon {...articlesLink} className={`text-[rgb(60_60_67_/_0.75)] hover:text-inherit flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm hover:border-current`} expanded={true}/>
                </div>

                <ul className={'flex flex-wrap gap-4 justify-between items-center'}>
                    {socialLinks.map((link, index) =>
                        (
                            <li>
                                <comp.SocialIcon {...link}
                                                 className={`text-[rgb(60_60_67_/_0.75)] hover:text-inherit`}/>
                            </li>
                        ))}
                </ul>
            </div>
        </div>
        <div className={"text-center flex-[3]"}>
            <img
                className={"min-w-[320px] mx-auto"}
                width={"320"}
                height={"320"}
                src="../images/avatar.png"
                imagick="avif webp png 320@2 320@3"
            />
        </div>
    </section>
);
