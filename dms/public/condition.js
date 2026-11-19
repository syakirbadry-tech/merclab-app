// Car body diagram for check-in / condition marks. Five views drawn in SVG;
// tap a spot to add a mark. Coordinates are in each view's own units, so
// marks stay in place at any screen size.
(function () {
  "use strict";

  const KINDS = {
    scratch: { label: "Scratch", color: "#c2410c", sym: "S" },
    dent: { label: "Dent", color: "#7c3aed", sym: "D" },
    chip: { label: "Stone chip", color: "#a16207", sym: "C" },
    paint: { label: "Repainted", color: "#1d4ed8", sym: "P" },
    crack: { label: "Crack / broken", color: "#b91c1c", sym: "B" },
    rust: { label: "Rust", color: "#78350f", sym: "R" },
    other: { label: "Other", color: "#475569", sym: "O" },
  };

  const VIEWS = {
    left: { label: "Left side", w: 220, h: 100 },
    right: { label: "Right side", w: 220, h: 100 },
    top: { label: "Top", w: 220, h: 100 },
    front: { label: "Front", w: 120, h: 100 },
    rear: { label: "Rear", w: 120, h: 100 },
  };

  const BODY = 'fill="var(--car-body)" stroke="var(--car-line)" stroke-width="1.4" stroke-linejoin="round"';
  const GLASS = 'fill="var(--car-glass)" stroke="var(--car-line)" stroke-width="1"';
  const TYRE = 'fill="var(--car-tyre)"';
  const LINE = 'fill="none" stroke="var(--car-line)" stroke-width="1" stroke-linecap="round"';

  // Saloon seen from the side, front to the left.
  const sideShape = `
    <path ${BODY} d="M12 72 L12 60 Q14 52 30 50 L70 46 Q88 28 110 26 L150 26 Q172 28 186 44 L204 47 Q210 50 210 58 L210 72 Q208 76 200 76 L186 76 A18 18 0 0 0 150 76 L70 76 A18 18 0 0 0 34 76 L18 76 Q12 76 12 72 Z"/>
    <path ${GLASS} d="M77 46 Q92 31 110 30 L127 30 L127 46 Z"/>
    <path ${GLASS} d="M131 30 L149 30 Q166 32 177 46 L131 46 Z"/>
    <path ${LINE} d="M74 47 L74 72 M129 47 L129 74 M178 47 L176 72 M30 62 L208 62"/>
    <path ${LINE} d="M112 54 h8 M164 54 h8"/>
    <path fill="var(--car-light)" stroke="var(--car-line)" stroke-width=".8" d="M13 54 Q16 51 26 51 L24 57 L13 58 Z"/>
    <path fill="var(--car-tail)" stroke="var(--car-line)" stroke-width=".8" d="M209 52 L203 50 L203 57 L209.5 57 Z"/>
    <path fill="var(--car-body)" stroke="var(--car-line)" stroke-width="1" d="M78 44 l6 -4 l3 4 z"/>
    <circle cx="52" cy="76" r="14" ${TYRE}/><circle cx="52" cy="76" r="6.5" fill="var(--car-rim)"/>
    <circle cx="168" cy="76" r="14" ${TYRE}/><circle cx="168" cy="76" r="6.5" fill="var(--car-rim)"/>`;

  // Seen from above, front to the left (the car's left side is at the bottom).
  const topShape = `
    <rect x="40" y="9" width="24" height="7" rx="2" ${TYRE}/><rect x="40" y="84" width="24" height="7" rx="2" ${TYRE}/>
    <rect x="156" y="9" width="24" height="7" rx="2" ${TYRE}/><rect x="156" y="84" width="24" height="7" rx="2" ${TYRE}/>
    <path ${BODY} d="M30 15 Q11 18 9 34 L9 66 Q11 82 30 85 L190 85 Q209 82 211 66 L211 34 Q209 18 190 15 Z"/>
    <ellipse cx="72" cy="12" rx="5" ry="3" ${BODY}/><ellipse cx="72" cy="88" rx="5" ry="3" ${BODY}/>
    <path ${GLASS} d="M62 22 L85 26 L85 74 L62 78 Q55 50 62 22 Z"/>
    <rect x="85" y="26" width="64" height="48" rx="6" fill="var(--car-roof)" stroke="var(--car-line)" stroke-width="1"/>
    <path ${GLASS} d="M149 26 L168 24 Q175 50 168 76 L149 74 Z"/>
    <path ${LINE} d="M20 30 Q38 24 58 24 M20 70 Q38 76 58 76 M118 15 L118 26 M118 74 L118 85 M196 24 Q204 36 204 50 Q204 64 196 76"/>`;

  // Front: the car's left side is on the viewer's right.
  const frontShape = `
    <rect x="16" y="80" width="17" height="10" rx="2" ${TYRE}/><rect x="87" y="80" width="17" height="10" rx="2" ${TYRE}/>
    <path ${BODY} d="M14 78 L14 56 Q16 45 28 42 L35 26 Q39 18 50 18 L70 18 Q81 18 85 26 L92 42 Q104 45 106 56 L106 78 Q106 83 100 83 L20 83 Q14 83 14 78 Z"/>
    <path ${GLASS} d="M37 40 L42 27 Q44 22 50 22 L70 22 Q76 22 78 27 L83 40 Z"/>
    <path fill="var(--car-light)" stroke="var(--car-line)" stroke-width=".8" d="M18 50 L37 52 L36 58 L18 57 Z M102 50 L83 52 L84 58 L102 57 Z"/>
    <rect x="44" y="51" width="32" height="12" rx="4" fill="var(--car-grille)" stroke="var(--car-line)" stroke-width=".8"/>
    <circle cx="60" cy="57" r="3.2" fill="none" stroke="var(--car-body)" stroke-width="1"/>
    <path ${LINE} d="M20 70 L100 70 M32 45 L88 45"/>
    <path ${BODY} d="M14 40 l-8 -2 l0 6 l8 1 z M106 40 l8 -2 l0 6 l-8 1 z"/>`;

  // Rear: the car's left side is on the viewer's left.
  const rearShape = `
    <rect x="16" y="80" width="17" height="10" rx="2" ${TYRE}/><rect x="87" y="80" width="17" height="10" rx="2" ${TYRE}/>
    <path ${BODY} d="M14 78 L14 56 Q16 45 28 42 L35 26 Q39 18 50 18 L70 18 Q81 18 85 26 L92 42 Q104 45 106 56 L106 78 Q106 83 100 83 L20 83 Q14 83 14 78 Z"/>
    <path ${GLASS} d="M38 40 L43 28 Q45 23 51 23 L69 23 Q75 23 77 28 L82 40 Z"/>
    <path fill="var(--car-tail)" stroke="var(--car-line)" stroke-width=".8" d="M17 50 L40 51 L40 57 L17 57 Z M103 50 L80 51 L80 57 L103 57 Z"/>
    <rect x="47" y="63" width="26" height="8" rx="1.5" fill="#fff" stroke="var(--car-line)" stroke-width=".8"/>
    <path ${LINE} d="M20 74 L100 74 M30 46 L90 46"/>`;

  const SHAPES = {
    left: sideShape,
    right: `<g transform="translate(220,0) scale(-1,1)">${sideShape}</g>`,
    top: topShape,
    front: frontShape,
    rear: rearShape,
  };

  // Plain-words name for a spot, shown in the condition record.
  function areaName(view, x, y) {
    if (view === "left" || view === "right") {
      const fx = view === "right" ? 220 - x : x;
      const side = view === "left" ? "Left" : "Right";
      if (y > 70 && fx > 32 && fx < 72) return `${side} front wheel`;
      if (y > 70 && fx > 148 && fx < 188) return `${side} rear wheel`;
      if (fx < 30) return "Front bumper";
      if (fx > 204) return "Rear bumper";
      if (y < 47 && fx > 70 && fx < 182) return `${side} window / pillar`;
      if (y < 50 && fx <= 70) return "Bonnet";
      if (y < 50 && fx >= 182) return "Boot lid";
      if (y > 70) return `${side} sill`;
      if (fx < 74) return `${side} front wing`;
      if (fx < 129) return `${side} front door`;
      if (fx < 177) return `${side} rear door`;
      return `${side} rear quarter`;
    }
    if (view === "top") {
      if (x < 22) return "Front bumper";
      if (x > 200) return "Rear bumper";
      if (y < 24 || y > 76) return `${y > 76 ? "Left" : "Right"} side (top edge)`;
      if (x < 60) return "Bonnet";
      if (x < 85) return "Windscreen";
      if (x < 149) return "Roof";
      if (x < 170) return "Rear screen";
      return "Boot lid";
    }
    const front = view === "front";
    if (y > 82) return x < 60 ? `${front ? "Right" : "Left"} tyre` : `${front ? "Left" : "Right"} tyre`;
    if (y < 41) return front ? "Windscreen" : "Rear screen";
    if (y < 50) return front ? "Bonnet" : "Boot lid";
    if (y < 59 && (x < 40 || x > 80)) {
      const l = x < 40 === front ? "Right" : "Left";
      return front ? `${l} headlamp` : `${l} tail lamp`;
    }
    if (y < 63) return front ? "Grille" : "Boot lid";
    return front ? "Front bumper" : "Rear bumper";
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function viewSvg(view, marks, numbers, showFixed) {
    const v = VIEWS[view];
    const dots = marks
      .filter((m) => m.view === view && (showFixed || !m.fixed))
      .map((m) => {
        const k = KINDS[m.kind] || KINDS.other;
        const color = m.fixed ? "var(--ok)" : k.color;
        return `<g class="mk" data-mark="${esc(m.id)}" role="button" tabindex="0" aria-label="Mark ${numbers.get(m.id)}: ${esc(k.label)}${m.area ? ", " + esc(m.area) : ""}${m.fixed ? " (fixed)" : ""}">
          <circle cx="${m.x}" cy="${m.y}" r="9" fill="transparent"/>
          <circle cx="${m.x}" cy="${m.y}" r="5.4" fill="${color}" stroke="#fff" stroke-width="1.4"/>
          <text x="${m.x}" y="${m.y + 2}" text-anchor="middle" font-size="5.6" font-weight="700" fill="#fff">${numbers.get(m.id)}</text></g>`;
      })
      .join("");
    return `<figure class="carview" data-view="${view}">
      <figcaption>${v.label}</figcaption>
      <svg viewBox="0 0 ${v.w} ${v.h}" class="carsvg" data-view="${view}" role="img" aria-label="${v.label} of the car. Tap to add a mark.">
        <rect width="${v.w}" height="${v.h}" fill="transparent"/>${SHAPES[view]}${dots}</svg></figure>`;
  }

  // Draw all views into `box`. opts: { showFixed, onAdd(view,x,y), onPick(id) }
  function render(box, marks, opts = {}) {
    const numbers = new Map(marks.map((m, i) => [m.id, i + 1]));
    box.innerHTML = `<div class="cargrid">
      ${viewSvg("left", marks, numbers, opts.showFixed)}
      ${viewSvg("top", marks, numbers, opts.showFixed)}
      ${viewSvg("right", marks, numbers, opts.showFixed)}
      <div class="carpair">${viewSvg("front", marks, numbers, opts.showFixed)}${viewSvg("rear", marks, numbers, opts.showFixed)}</div>
    </div>`;
    box.querySelectorAll("svg.carsvg").forEach((svg) => {
      svg.addEventListener("click", (e) => {
        const mk = e.target.closest(".mk");
        if (mk) return opts.onPick && opts.onPick(mk.dataset.mark);
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        const view = svg.dataset.view;
        const { w, h } = VIEWS[view];
        const x = Math.max(0, Math.min(w, Math.round(p.x * 10) / 10));
        const y = Math.max(0, Math.min(h, Math.round(p.y * 10) / 10));
        if (opts.onAdd) opts.onAdd(view, x, y);
      });
      svg.addEventListener("keydown", (e) => {
        const mk = e.target.closest(".mk");
        if (mk && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          if (opts.onPick) opts.onPick(mk.dataset.mark);
        }
      });
    });
    return numbers;
  }

  // Small single-view picture with one mark, for the edit dialog.
  function preview(view, x, y, kind) {
    const v = VIEWS[view];
    const k = KINDS[kind] || KINDS.other;
    return `<svg viewBox="0 0 ${v.w} ${v.h}" class="carsvg mini" aria-hidden="true">${SHAPES[view]}
      <circle cx="${x}" cy="${y}" r="6" fill="${k.color}" stroke="#fff" stroke-width="1.6"/></svg>`;
  }

  // Plain side picture for cars with no photo yet.
  const silhouette = () => `<svg viewBox="4 18 212 76" aria-hidden="true">${sideShape}</svg>`;

  window.CarDiagram = { KINDS, VIEWS, render, preview, areaName, silhouette };
})();
