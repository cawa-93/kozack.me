export default ({title, children} ) => (
    <html>
    <head>
        <title>{title}</title>
        <link rel="stylesheet" href="/components.css"/>
        <link rel="stylesheet" href="/styles.css"/>
    </head>
    <body>
    {children}
    </body>
    </html>
)