// The site's only script: registers the offline service worker (/sw.js). Loaded with defer.
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  });
}
