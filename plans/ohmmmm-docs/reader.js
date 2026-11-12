// The reader: marks, in "On this page", the section being read. Loaded with defer on every page.
// The section being read is the last one whose heading has passed the line just under the header.
// At the foot of the page it is the last section, so a short last section can still be marked.
(() => {
  const links = [...document.querySelectorAll('.site-toc a[href^="#"]')];
  const pairs = links
    .map(link => [link, document.getElementById(decodeURIComponent(link.hash.slice(1)))])
    .filter(([, target]) => target);
  if (!pairs.length) return;

  const header = document.querySelector(".site-header");
  let current = null;

  function mark(link) {
    if (link === current) return;
    current?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "location");
    current = link;
  }

  function update() {
    const line = (header?.offsetHeight ?? 0) + 24;
    const atFoot = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let reading = pairs[0][0];
    for (const [link, target] of pairs) {
      if (target.getBoundingClientRect().top - line <= 0) reading = link;
    }
    mark(atFoot ? pairs[pairs.length - 1][0] : reading);
  }

  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }, { passive: true });
  addEventListener("resize", update);
  // A click marks its section at once, without waiting for the scroll to settle.
  for (const [link] of pairs) link.addEventListener("click", () => mark(link));
  update();
})();
