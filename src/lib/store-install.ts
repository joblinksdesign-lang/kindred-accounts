import { useEffect } from "react";

/**
 * Makes sure that when a shopper installs from a shop page, the phone installs
 * THAT shop (opening straight to /store/<slug>) instead of the main app.
 *
 * The app-wide manifest link is emitted by the root document, and browsers use
 * the FIRST <link rel="manifest"> they find — so on a shop page we point every
 * manifest link at the shop manifest while the page is open, and restore the
 * original links on the way out.
 */
export function useStoreInstallTarget(slug: string, storeName: string, themeColor: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const head = document.head;
    const storeManifest = `/store/${slug}/manifest.webmanifest`;

    const links = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'));
    const previous = links.map((l) => ({ el: l, href: l.getAttribute("href") }));
    links.forEach((l) => l.setAttribute("href", storeManifest));
    if (links.length === 0) {
      const l = document.createElement("link");
      l.rel = "manifest";
      l.href = storeManifest;
      head.appendChild(l);
      previous.push({ el: l, href: null });
    }

    // iOS ignores the manifest: these tags decide how the saved icon behaves.
    const added: HTMLMetaElement[] = [];
    const meta = (name: string, content: string) => {
      const existing = head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (existing) {
        existing.dataset["prevContent"] = existing.content;
        existing.content = content;
        added.push(existing);
        return;
      }
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      m.dataset["storeAdded"] = "1";
      head.appendChild(m);
      added.push(m);
    };
    meta("apple-mobile-web-app-capable", "yes");
    meta("mobile-web-app-capable", "yes");
    meta("apple-mobile-web-app-status-bar-style", "black-translucent");
    meta("apple-mobile-web-app-title", storeName.slice(0, 15));
    meta("theme-color", themeColor);

    return () => {
      previous.forEach(({ el, href }) => {
        if (href === null) el.remove();
        else el.setAttribute("href", href);
      });
      added.forEach((m) => {
        if (m.dataset["storeAdded"]) m.remove();
        else if (m.dataset["prevContent"] !== undefined) {
          m.content = m.dataset["prevContent"];
          delete m.dataset["prevContent"];
        }
      });
    };
  }, [slug, storeName, themeColor]);
}
