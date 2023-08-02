export default ({ title, children }) => (
  <html>
    <head>
      <title>{title}</title>

        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>

        <link rel="stylesheet" href="/components.css" />
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body className={"dark:bg-zinc-900 scroll-my-20"}>
      {children}
    </body>
  </html>
);
