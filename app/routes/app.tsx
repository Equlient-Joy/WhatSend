import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

// Extend JSX for Shopify web components
declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-link': React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
    }
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);

    // eslint-disable-next-line no-undef
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  } catch (error) {
    console.error("LOADER ERROR in app.tsx (Layout):", error);
    throw error;
  }
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/additional">Additional page</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("ROUTE ERROR in app.tsx:", error);
  return (
    <div>
      <h1>Something went wrong in App Layout</h1>
      <pre>{error instanceof Error ? error.message : JSON.stringify(error)}</pre>
      <pre>{error instanceof Error ? error.stack : ""}</pre>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
