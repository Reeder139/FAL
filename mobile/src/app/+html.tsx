import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML document every statically rendered page is wrapped in. Web only —
 * it has no effect on the native builds.
 *
 * This file replaces Expo's default document rather than extending it, so
 * the boilerplate below (charset, viewport, ScrollViewStyleReset) has to be
 * carried over verbatim. ScrollViewStyleReset in particular is not optional:
 * without it the body scrolls as well as the ScrollViews inside it, and the
 * app gets a second scrollbar.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover is what makes env(safe-area-inset-*) report
          * real numbers. Installed to a home screen there is no browser
          * chrome to keep content clear of the notch and the home
          * indicator, so without this the app draws underneath both. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Belt and braces alongside robots.txt and the X-Robots-Tag header
          * (see vercel.json). robots.txt only asks crawlers not to fetch;
          * a page someone links to can still be indexed unfetched. */}
        <meta name="robots" content="noindex, nofollow" />

        <meta name="theme-color" content="#070D14" />
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* Safari ignores the manifest for both of these: standalone mode
          * comes from apple-mobile-web-app-capable, and the home screen
          * icon from the apple-touch-icon link, not manifest.icons.
          * black-translucent pairs with viewport-fit=cover to let the app's
          * own background run up under the status bar. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Carp Leagues" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        <ScrollViewStyleReset />

        {/* Matches app.json's backgroundColor and Colors.dark.background.
          * Set here as well so the page is already the right colour before
          * React mounts — otherwise the load flashes white, which is very
          * visible on a dark-only app. */}
        <style dangerouslySetInnerHTML={{ __html: BACKGROUND_STYLE }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const BACKGROUND_STYLE = `
body {
  background-color: #070D14;
}`;
