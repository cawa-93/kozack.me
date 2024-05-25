export default ({ title, children, url }, {url: urlHelper}) => {
    return (
        <html>
        <head>
            <title>{title}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <link rel="stylesheet" href="/styles.css" />
            <link rel="canonical" href={urlHelper(url, true)} />
        </head>
        <body className={"bg-white dark:bg-zinc-900 scroll-my-20 dark:text-[rgb(226,226,226)]"}>
        {children}
        </body>
        </html>
    )
};
