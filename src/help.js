/* Bind Help drawer. Loaded after docs.js. */
(() => {
  const $ = (id) => document.getElementById(id);
  const panel = $("help");
  const btn = $("helpbtn");
  const list = $("exlist");
  if (!panel || !btn) return;

  btn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    btn.classList.toggle("on", !panel.hidden);
  });

  panel.querySelectorAll(".help-tabs button").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".help-tabs button").forEach((t) => t.classList.toggle("on", t === tab));
      panel.querySelectorAll("[data-pane]").forEach((pane) => {
        pane.hidden = pane.getAttribute("data-pane") !== tab.getAttribute("data-tab");
      });
    });
  });

  const examples = (window.STRUDEL_DOCS && window.STRUDEL_DOCS.examples) || [];
  examples.forEach((ex) => {
    const card = document.createElement("div");
    card.className = "ex";
    const h = document.createElement("h4");
    h.textContent = ex.title;
    const p = document.createElement("p");
    p.textContent = ex.blurb;
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "Load";
    load.addEventListener("click", () => {
      const el = $("code");
      if (el) el.value = String(ex.code || "").trim() + "\n";
      panel.hidden = true;
      btn.classList.remove("on");
      el && el.dispatchEvent(new Event("input"));
    });
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(load);
    if (list) list.appendChild(card);
  });
})();
