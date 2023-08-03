export default ({
                    title,
                    message,
                    url,
                    linkText,
                }) => {
    return (
        <article
            className={"flex flex-col gap-2 text-sm border rounded text-[#059669] dark:text-[#52ce9f] border-green-400 dark:border-green-200 p-4 bg-[#f9f9fa] dark:bg-[#313136]"}
        >
            <p className={'flex gap-2 items-center'}>
                <span className={'text-lg motion-safe:animate-bounce'} style={{'animation-duration': '2s'}}>❤️</span>
                <strong>{title}</strong>
            </p>
            <p>{message}</p>
            <p>
                <a className={"text-[#0056B9] dark:text-[#5ccbff]"} href={url}>
                    {linkText}
                    <svg className={'inline'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                        <g transform="translate(24 0) scale(-1 1)">
                            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                               stroke-width="2">
                                <path stroke-dasharray="14" stroke-dashoffset="14" d="M19 12H5.5">
                                    <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="14;0"/>
                                </path>
                                <path stroke-dasharray="8" stroke-dashoffset="8" d="M5 12L10 17M5 12L10 7">
                                    <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.3s" dur="0.2s"
                                             values="8;0"/>
                                </path>
                            </g>
                        </g>
                    </svg>
                </a>
            </p>
        </article>
    );
};
