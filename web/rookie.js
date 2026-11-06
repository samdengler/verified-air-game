// Rookie, the little jet. The game and the side-by-side page both draw it from here.
// Its eyes stay round and open in every mood: only the pupils, the mouth and the brows change.
(function () {
  const FIN = "M84 50 L94 18 Q96 12 102 13 L108 15 Q113 17 112 23 L108 54 Z";
  const FUSELAGE = "M6 80 C6 60 22 46 46 46 H84 C98 46 110 52 116 60 C110 78 92 104 58 106 H38 C18 106 6 98 6 80 Z";
  const WING = "M70 80 H92 L107 108 Q109 114 103 114 H93 Q88 114 84 108 Z";
  const GEAR = '<rect x="29" y="102" width="5" height="11"/><rect x="60" y="102" width="5" height="9"/><circle cx="31.5" cy="116" r="8"/><circle cx="62.5" cy="115" r="7.5"/>';
  const PLATE = '<rect x="24" y="125" width="72" height="22" rx="8"/>';

  const PUPIL = { up: { x: 0.5, y: -3.75, r: 7 }, flustered: { x: 0, y: 1.25, r: 5.25 } };
  const WIDE = { x: 0, y: 0, r: 8.25 };

  const MOUTH = {
    happy: '<path class="stroke" d="M30 85 Q40 96.5 50 85"/>',
    proud: '<path class="mouth open" d="M30 84 Q40 102.5 50 84 Z"/><ellipse class="tongue" cx="40" cy="91.2" rx="4.2" ry="2.4"/>',
    up: '<circle class="mouth" cx="40" cy="89" r="4.6"/>',
    flustered: '<path class="stroke" d="M30 89 q5 -7 10 0 t10 0"/>',
  };
  const WORRIED = '<path class="stroke" d="M17 55 L35 48"/><path class="stroke" d="M63 55 L45 48"/><path class="sweat" d="M4 34 c5 9 7 13 3.5 17 c-3.5 4 -9.5 1.5 -9 -4 c0 -4 3 -8 5.5 -13 z"/>';

  function eyes(mood) {
    const look = PUPIL[mood] || WIDE;
    const shine = { x: +(look.r * 0.34).toFixed(2), y: +(look.r * -0.38).toFixed(2), r: +(look.r * 0.32).toFixed(2) };
    const pupil = (x) => `<circle class="pupil" cx="${x}" cy="69" r="${look.r}"/><circle class="shine" cx="${x + shine.x}" cy="${69 + shine.y}" r="${shine.r}"/>`;
    return `<circle class="eye" cx="27" cy="69" r="12.5"/><circle class="eye" cx="53" cy="69" r="12.5"/><g class="pupils" data-pupils transform="translate(${look.x} ${look.y})">${pupil(27)}${pupil(53)}</g>`;
  }

  window.drawRookie = function (mood, width) {
    const height = Math.round((width * 150) / 120);
    return `<svg class="rookie" width="${width}" height="${height}" viewBox="0 0 120 150" aria-hidden="true">`
      + `<g class="outline"><path d="${FIN}"/>${GEAR}<path d="${FUSELAGE}"/><path d="${WING}"/>${PLATE}</g>`
      + `<path class="fin" d="${FIN}"/><g class="gear">${GEAR}</g><circle class="hub" cx="31.5" cy="116" r="3"/><circle class="hub" cx="62.5" cy="115" r="2.8"/>`
      + `<path class="fuselage" d="${FUSELAGE}"/><circle class="window" cx="74" cy="62" r="3.6"/><circle class="window" cx="85" cy="62" r="3.6"/><circle class="window" cx="96" cy="62" r="3.6"/>`
      + `<path class="wing" d="${WING}"/><circle class="cheek" cx="14" cy="86" r="5.5"/><circle class="cheek" cx="65" cy="86" r="5.5"/>`
      + eyes(mood) + (MOUTH[mood] || MOUTH.happy) + (mood === "flustered" ? WORRIED : "")
      + `<g class="plate">${PLATE}</g><text x="60" y="141">ROOKIE</text></svg>`;
  };
})();
