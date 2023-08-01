import type { socialLinks as TsocialLinks } from "../_data.ts";

export default (
  { comp, name, job, tagline, socialLinks }: {
    name: string;
    job: string;
    tagLine: string;
    socialLinks: TsocialLinks;
  },
) => (
  <section
    className={"flex items-center max-md:flex-col-reverse max-md:text-center"}
  >
    <div className={"flex flex-1 flex-col gap-2"}>
      <h1 className={"text-brand-blue text-6xl font-bold"}>
        {name}
      </h1>
      <p className={"text-6xl font-bold text-[#3c3c43]"}>
        {job}
      </p>
      <p className={"text-2xl text-[rgb(60_60_67_/_0.75)] mt-3"}>{tagline}</p>
      <ul className={'flex gap-2 justify-between items-center mt-5'}>
        {socialLinks.map((link, index) => {
            const shouldBeExpanded = index < 2
            const additionalClassNames = shouldBeExpanded ? 'flex gap-2 items-center rounded-full border px-4 min-h-[40px] text-sm hover:border-current' : ''
          return (
            <li>
              <comp.SocialIcon {...link} className={`text-[rgb(60_60_67_/_0.75)] hover:text-inherit ${additionalClassNames}`} expanded={shouldBeExpanded} />
            </li>
          );
        })}
      </ul>
    </div>
    <div className={"text-center flex-1"}>
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
