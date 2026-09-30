/* Radio del colectivo: un solo <audio>, una barra fija abajo y una lista de canciones.
   Uso: Radio.init({ tracks, listEl, name }) → Radio.play(i) · Radio.analyser (para el osciloscopio) */
window.Radio = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const R = { tracks: [], i: -1, shuffle: false, analyser: null, audio: null, listEl: null, bar: null, ready: false };

  function buildBar(name) {
    const bar = document.createElement("div");
    bar.className = "player"; bar.id = "player";
    bar.innerHTML = `
      <div class="player__ctrl">
        <button class="prev" aria-label="Anterior">&#9664;</button>
        <button class="play" aria-label="Reproducir">&#9654;</button>
        <button class="next" aria-label="Siguiente">&#9654;&#9654;</button>
        <button class="shuf" aria-label="Aleatorio" aria-pressed="false">&#8644;</button>
      </div>
      <div class="player__info">
        <div class="player__t"><span data-t>Radio</span><small data-a></small></div>
        <div class="player__bar"><span data-cur>0:00</span><input type="range" min="0" max="1000" value="0" aria-label="Progreso"><span data-dur>0:00</span></div>
      </div>
      <div class="player__radio"><i></i>${esc(name || "Radio")}</div>`;
    document.body.appendChild(bar);
    return bar;
  }

  function render() {
    if (!R.listEl) return;
    R.listEl.querySelectorAll(".song").forEach(b => b.classList.toggle("on", +b.dataset.i === R.i));
    const t = R.tracks[R.i];
    if (t && R.bar) {
      R.bar.querySelector("[data-t]").textContent = t.title;
      R.bar.querySelector("[data-a]").textContent = t.artists || t.member || "";
    }
    const playing = R.audio && !R.audio.paused;
    R.bar && (R.bar.querySelector(".play").innerHTML = playing ? "&#10074;&#10074;" : "&#9654;");
    R.listEl.querySelectorAll(".song").forEach(b => { const p = b.querySelector(".song__p"); if (p) p.innerHTML = (+b.dataset.i === R.i && playing) ? "&#10074;&#10074;" : "&#9654;"; });
  }

  function connectAnalyser() {
    if (R.analyser) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const ctx = new AC();
      const src = ctx.createMediaElementSource(R.audio);
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      src.connect(an); an.connect(ctx.destination);
      R.analyser = an; R.ctx = ctx;
    } catch (e) { /* sin analizador; el audio sigue sonando */ }
  }

  function play(i) {
    if (!R.tracks.length) return;
    if (i === undefined) i = R.i < 0 ? 0 : R.i;
    i = (i + R.tracks.length) % R.tracks.length;
    const changing = i !== R.i;
    R.i = i;
    if (changing || !R.audio.src) R.audio.src = R.tracks[i].url;
    connectAnalyser();
    if (R.ctx && R.ctx.state === "suspended") R.ctx.resume();
    R.audio.play().catch(() => {});
    R.bar.classList.add("on");
    document.body.classList.add("has-player");
    render();
  }
  function toggle() { if (R.i < 0) return play(0); R.audio.paused ? play(R.i) : R.audio.pause(); }
  function next() { play(R.shuffle && R.tracks.length > 1 ? (R.i + 1 + Math.floor(Math.random() * (R.tracks.length - 1))) % R.tracks.length : R.i + 1); }
  function prev() { R.audio.currentTime > 3 ? (R.audio.currentTime = 0) : play(R.i - 1); }

  function init({ tracks = [], listEl, name = "Radio" }) {
    R.tracks = tracks; R.listEl = listEl;
    if (listEl) {
      listEl.innerHTML = tracks.length ? tracks.map((t, i) => `
        <button class="song" data-i="${i}">
          <span class="song__p" aria-hidden="true">&#9654;</span>
          <span class="song__t">${esc(t.title)}${t.featured ? '<span class="track__tag">de la semana</span>' : ""}<span class="song__a">${esc(t.artists || t.member || "")}${t.member && t.artists && t.artists !== t.member ? " · subido por " + esc(t.member) : ""}</span></span>
          <span class="song__d">${t.duration ? fmt(t.duration) : ""}</span>
        </button>`).join("") : `<p class="empty">La radio está en silencio. Cuando alguien suba música desde su <a href="/panel">panel</a>, suena aquí.</p>`;
      listEl.addEventListener("click", e => {
        const b = e.target.closest(".song"); if (!b) return;
        const i = +b.dataset.i;
        (i === R.i) ? toggle() : play(i);
      });
    }
    if (R.ready) { render(); return; }
    R.ready = true;
    R.audio = new Audio(); R.audio.preload = "metadata";
    R.bar = buildBar(name);
    const q = s => R.bar.querySelector(s);
    q(".play").addEventListener("click", toggle);
    q(".next").addEventListener("click", next);
    q(".prev").addEventListener("click", prev);
    q(".shuf").addEventListener("click", e => { R.shuffle = !R.shuffle; e.currentTarget.classList.toggle("on", R.shuffle); e.currentTarget.setAttribute("aria-pressed", R.shuffle); });
    const range = q("input");
    range.addEventListener("input", () => { if (R.audio.duration) R.audio.currentTime = range.value / 1000 * R.audio.duration; });
    R.audio.addEventListener("timeupdate", () => {
      if (!R.audio.duration) return;
      range.value = Math.round(R.audio.currentTime / R.audio.duration * 1000);
      q("[data-cur]").textContent = fmt(R.audio.currentTime);
      q("[data-dur]").textContent = fmt(R.audio.duration);
    });
    R.audio.addEventListener("play", render);
    R.audio.addEventListener("pause", render);
    R.audio.addEventListener("ended", next);
    R.audio.addEventListener("error", () => { q("[data-a]").textContent = "no se pudo cargar este audio"; });
    document.addEventListener("keydown", e => {
      if (e.code === "Space" && R.i >= 0 && !/input|textarea|button|select/i.test(e.target.tagName)) { e.preventDefault(); toggle(); }
    });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("previoustrack", prev);
    }
  }
  return { init, play, toggle, next, prev, get analyser() { return R.analyser; }, get audio() { return R.audio; }, get playing() { return R.audio && !R.audio.paused; } };
})();
