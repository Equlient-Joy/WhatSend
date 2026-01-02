import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("ROOT BOUNDARY ERROR:", error);
  return (
    <html lang="en">
      <head>
        <title>Oh no!</title>
        <Meta />
        <Links />
      </head>
      <body>
        <h1>App Error</h1>
        <pre>{error instanceof Error ? error.stack : JSON.stringify(error)}</pre>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* Polaris CSS - Required for Shopify Polaris components to render correctly */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
