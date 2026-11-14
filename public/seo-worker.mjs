// Canonical transport and real error responses for public static sites.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === 'http:' && url.hostname.endsWith('.ohmmmm.com')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 308);
    }
    const asset = await env.ASSETS.fetch(request);
    const errorPage = ['/404', '/404.html', '/404/'].includes(url.pathname);
    const response = new Response(asset.body, {
      // ASSETS uses temporary redirects for static HTML aliases; the canonical policy is permanent.
      status: errorPage ? 404 : asset.status === 307 && asset.headers.has('Location') ? 308 : asset.status,
      headers: asset.headers,
    });
    if (response.status === 404) response.headers.set('X-Robots-Tag', 'noindex');
    return response;
  },
};
