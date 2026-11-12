// Explainers index search: filters the list by title and summary. Without script the full list shows.
const box = document.querySelector(".search");
const input = box?.querySelector("input");
const count = document.querySelector("[data-count]");
if (box && input && count) {
  box.hidden = false;
  input.addEventListener("input", () => {
    const v = input.value.trim().toLowerCase();
    let n = 0;
    for (const li of document.querySelectorAll(".xlist li")) {
      const hit = !v || (li.getAttribute("data-q") || "").includes(v);
      li.hidden = !hit;
      if (hit) n++;
    }
    for (const d of document.querySelectorAll("details.cat")) {
      d.hidden = !d.querySelector("li:not([hidden])");
      if (v && !d.hidden) d.open = true;
    }
    count.textContent = v ? `${n} match${n === 1 ? "" : "es"}` : "";
  });
}
