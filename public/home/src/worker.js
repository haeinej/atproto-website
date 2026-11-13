// ohm-web: ohmmmm.com. Serves the static site in ../public with security headers.
// www redirects to the apex. Unknown paths get public/404.html with a real 404 status.
// It also keeps the list of people who join the plan from the homepage: POST /join.

// Extensionless files that must be served as JSON (Apple fetches this one directly).
const JSON_PATHS = new Set([
  "/.well-known/apple-app-site-association",
]);

// Old URLs still listed in the App Store record (ENDPOINTS.md in the app repository, haeinej/ohm) land on their new pages.
const REDIRECTS = new Map([
  ["/privacy-policy", "/privacy"],
  ["/privacy-policy.html", "/privacy"],
]);

// Keep permanent links, sitemap entries and canonical tags on the same URL.
for (const page of ["about", "privacy", "terms", "support", "delete-account", "joined", "join-problem"]) {
  REDIRECTS.set(`/${page}.html`, `/${page}`);
  REDIRECTS.set(`/${page}/`, `/${page}`);
  REDIRECTS.set(`/${page}/index.html`, `/${page}`);
}
REDIRECTS.set("/index.html", "/");
REDIRECTS.set("/index", "/");
REDIRECTS.set("/privacy-policy/", "/privacy");

// The docs moved to their own site. Old links to /docs land on its first page.
const DOCS = "https://docs.ohmmmm.com/";
const EXTERNAL = new Set(["/docs", "/docs/", "/docs.html", "/docs/index.html"]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Scripts are limited to this site's own files: /sw-register.js and the service worker it starts.
  // No inline script runs (the homepage's JSON-LD is inert data, not a script).
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'",
};

// ---- Joining the plan. The homepage's form posts an email address here. It is kept with the
// time it came, and nothing else: no name, no address the request came from. Haein reads the list
// (npm run home:joiners) and writes to each person by hand; nothing is sent from here.
const EMAIL = /^[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[^\s@<>(),;:"'.]{2,}$/;
const to = (url, path) => Response.redirect(new URL(path, url).toString(), 303);

// The page's own script asks for JSON and stays where it is. A form sent the plain way is taken
// to a page that says the same thing.
export async function join(request, env, url) {
  const answered = await joining(request, env, url);
  if (!(request.headers.get("Accept") ?? "").includes("application/json") || answered.status === 403) return answered;
  const ok = answered.headers.get("Location")?.endsWith("/joined") ?? false;
  return Response.json({ ok }, { status: ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}

async function joining(request, env, url) {
  // Only this site's own form may add to the list. A browser says which page a form was on.
  const from = request.headers.get("Origin");
  if (from && from !== url.origin) return new Response("Please use the form on ohmmmm.com.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  let form;
  try {
    form = await request.formData();
  } catch {
    return to(url, "/join-problem");
  }
  // The field no person sees was filled in: thanked like anyone, and not kept.
  if (String(form.get("website") ?? "").trim()) return to(url, "/joined");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return to(url, "/join-problem");
  // A few tries a minute from one place is a person correcting a typo. More is not.
  const limited = env.JOIN_LIMITER && !(await env.JOIN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" })).success;
  if (limited || !env.DB) return to(url, "/join-problem");
  try {
    // An address already on the list stays as it was, with the time it first came.
    await env.DB.prepare("INSERT INTO joiners (email, joined_at) VALUES (?1, ?2) ON CONFLICT (email) DO NOTHING").bind(email, new Date().toISOString()).run();
  } catch {
    return to(url, "/join-problem");
  }
  return to(url, "/joined");
}

// The service worker runs under its own response's CSP: it may fetch this site and nothing else.
const SERVICE_WORKER_CSP = "default-src 'none'; connect-src 'self'";

// Pages, styles.css and the manifest keep the platform default (revalidate every load, ETag),
// so an edit shows up at once. The font is fetched on every page: cache it for a year. Its URL
// is the version, so a changed font must get a new file name (and every preload link with it).
// Images may be replaced in place, so they are cached for a day and refreshed in the background.
// The service worker must always be checked, or browsers keep running an old one.
function cacheControl(pathname) {
  if (pathname === "/sw.js") return "no-cache";
  if (pathname.startsWith("/assets/fonts/")) return "public, max-age=31536000, immutable";
  if (pathname.startsWith("/assets/")) return "public, max-age=86400, stale-while-revalidate=604800";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    let redirect = false;
    const publicHost = url.hostname === "ohmmmm.com" || url.hostname === "www.ohmmmm.com";
    if (publicHost && (url.hostname === "www.ohmmmm.com" || url.protocol === "http:")) {
      url.hostname = "ohmmmm.com";
      url.protocol = "https:";
      redirect = true;
    }

    if (EXTERNAL.has(url.pathname)) return Response.redirect(DOCS, 308);

    if (url.pathname === "/join" && !redirect) {
      if (request.method === "POST") return join(request, env, url);
      // Nothing is at /join to look at: the form is on the homepage.
      return Response.redirect(new URL("/#intro", url).toString(), 303);
    }

    const moved = REDIRECTS.get(url.pathname);
    if (moved) {
      url.pathname = moved;
      redirect = true;
    }
    if (redirect) return Response.redirect(url.toString(), 308);

    const errorPage = ["/404", "/404.html", "/404/"].includes(url.pathname);
    const asset = await env.ASSETS.fetch(errorPage ? new Request(new URL("/404", url), request) : request);
    const response = new Response(asset.body, {
      status: errorPage ? 404 : asset.status,
      statusText: errorPage ? "Not Found" : asset.statusText,
      headers: asset.headers,
    });
    if (response.status === 404) response.headers.set("X-Robots-Tag", "noindex");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    if (JSON_PATHS.has(url.pathname) && asset.ok) response.headers.set("Content-Type", "application/json");
    if (url.pathname === "/manifest.webmanifest" && asset.ok) response.headers.set("Content-Type", "application/manifest+json");
    if (url.pathname === "/sw.js") response.headers.set("Content-Security-Policy", SERVICE_WORKER_CSP);
    const cache = asset.ok && cacheControl(url.pathname);
    if (cache) response.headers.set("Cache-Control", cache);
    return response;
  },
};
