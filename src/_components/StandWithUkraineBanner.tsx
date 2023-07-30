export default ({
                    title,
                    message,
                    linkUrl,
                    linkText
                }) => {
    console.log({
        title,
        message,
        linkUrl,
        linkText
    })
    return (
        <article className={'flex flex-col gap-2 text-sm border rounded text-[#059669] dark:text-[#52ce9f] border-green-400 dark:border-green-200 p-4 bg-[#f9f9fa] dark:bg-[#313136]'}>
            <p><strong>{title}</strong></p>
            <p>{message}</p>
            <p>
                <a className={'text-[#0056B9] dark:text-[#5ccbff]'} href={linkUrl}>{linkText}</a>
            </p>
        </article>
    );
}