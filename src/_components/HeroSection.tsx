export default ({name, job, tagline}) => (
    <section className={'flex items-center max-md:flex-col-reverse max-md:text-center'}>
        <div className={'flex flex-1 flex-col gap-2'}>
            <h1 className={'text-brand-blue text-6xl font-bold'}>
                {name}
            </h1>
            <p className={'text-6xl font-bold text-[#3c3c43]'}>
                {job}
            </p>
            <p className={'text-2xl text-[rgb(60_60_67_/_0.75)]'}>{tagline}</p>
        </div>
        <div className={'text-center flex-1'}>
            <img className={'min-w-[320px] mx-auto'} width={'320'} height={'320'} src="../images/avatar.png" imagick="avif webp png jpg 320@2 320@3"/>
        </div>
    </section>
)
