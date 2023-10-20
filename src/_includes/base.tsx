export default ({ title, children }) => (
  <html>
    <head>
      <title>{title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body className={"bg-white dark:bg-zinc-900 scroll-my-20 dark:text-[rgb(226,226,226)]"}>
      {children}
    </body>
  </html>
);
