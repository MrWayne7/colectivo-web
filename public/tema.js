/* Tema claro/oscuro: sigue el sistema (o SITE.tema), el visitante puede cambiarlo y se recuerda. */
(() => {
  const guardado = () => { try { return localStorage.getItem("tema"); } catch { return null; } };
  const sistema = () => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const base = (window.SITE && SITE.tema) || "auto";
  const actual = () => guardado() || (base === "auto" ? sistema() : base);
  const aplicar = () => {
    const t = actual();
    document.documentElement.dataset.theme = t;
    document.querySelectorAll("[data-tema-btn]").forEach(b => { b.textContent = t === "dark" ? "\u263C" : "\u263E"; b.setAttribute("aria-label", t === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"); });
    document.querySelectorAll("[data-tema-txt]").forEach(b => b.textContent = t === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === "dark" ? "#000000" : "#F1F4EA";
  };
  window.Tema = { aplicar, cambiar() { try { localStorage.setItem("tema", actual() === "dark" ? "light" : "dark"); } catch {} aplicar(); } };
  aplicar();
  document.addEventListener("DOMContentLoaded", aplicar);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicar);
  document.addEventListener("click", e => { if (e.target.closest("[data-tema-btn],[data-tema-txt]")) { e.preventDefault(); Tema.cambiar(); } });
})();
