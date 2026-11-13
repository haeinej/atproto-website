// Joining the plan without leaving the page. The form in the popup posts to this site's own
// Worker either way; with this script it is sent in the background, and the popup then says
// thank you where the form was. If anything here fails, the form is sent the plain way.
const popup = document.getElementById("join");
const form = popup?.querySelector("form.join");
// What the popup shows: the form, the form with a line saying it did not work, or only the thanks.
const SHOWN = {
  form: ["h2", "form.join", ".join-note"],
  problem: ["h2", "form.join", ".join-note", ".join-problem"],
  thanks: [".join-thanks"],
};
const show = name => {
  for (const part of popup.querySelectorAll("h2, form.join, .join-note, .join-problem, .join-thanks")) {
    part.hidden = !SHOWN[name].some(selector => part.matches(selector));
  }
};
form?.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams(new FormData(form)) });
    show(response.ok ? "thanks" : "problem");
    if (response.ok) form.reset();
  } catch {
    show("problem");
  } finally {
    button.disabled = false;
  }
});
// Opened again later, the popup is the form again.
popup?.addEventListener("toggle", event => {
  if (event.newState === "open" && !popup.querySelector(".join-thanks").hidden) show("form");
});
