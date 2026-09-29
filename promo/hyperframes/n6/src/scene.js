// Таймлайн ролика N6. Детерминирован: ни Date.now, ни random, ни сети.
// «Камера»: точка записи (fx, fy) в пикселях источника ставится в точку кадра (cx, cy) при масштабе s;
// за время клипа масштаб плавно растёт в zoom раз вокруг той же точки.
(function () {
  const FMT = document.documentElement.dataset.format;
  const CAMS = {
    "16x9": {
      c: [960, 440],
      p1: [800, 200, 1.5], p2: [800, 230, 1.5], p3: [960, 330, 1.35],
      c1: [1330, 620, 1.35], c2: [1330, 780, 1.35], w1: [1330, 460, 1.8],
    },
    "1x1": {
      c: [540, 400],
      p1: [700, 190, 1.35], p2: [700, 230, 1.35], p3: [980, 330, 0.9],
      c1: [1330, 640, 1.2], c2: [1330, 800, 1.2], w1: [1330, 460, 1.7],
    },
    "9x16": {
      c: [540, 730],
      p1: [390, 420, 1.385], p2: [390, 560, 1.385], p3: [390, 700, 1.385],
      c1: [390, 900, 1.385], c2: [390, 900, 1.385], w1: [390, 800, 1.385],
    },
  }[FMT];
  if (!CAMS) throw new Error("Неизвестный формат: " + FMT + " (ожидались 16x9, 1x1, 9x16)");

  const ZOOM = 1.06;
  const CLIPS = { p1: [5, 4], p2: [9, 3], p3: [12, 3], c1: [15, 8], c2: [23, 7], w1: [30, 8] };
  const [cx, cy] = CAMS.c;
  const tl = gsap.timeline({ paused: true });
  const pose = (fx, fy, s) => ({ x: cx - s * fx, y: cy - s * fy, scale: s });

  for (const [id, [start, dur]] of Object.entries(CLIPS)) {
    const [fx, fy, s] = CAMS[id];
    const el = "#cam-" + id;
    tl.fromTo(el, pose(fx, fy, s), { ...pose(fx, fy, s * ZOOM), duration: dur, ease: "none" }, start);
  }

  // Титры и карточки
  tl.from("#s1 .mark", { opacity: 0, y: 20, duration: 0.5, ease: "power2.out" }, 0.2);
  tl.from("#s1 .headline", { opacity: 0, y: 40, duration: 0.8, ease: "power2.out" }, 0.4);
  tl.to("#s1 .headline", { opacity: 0, duration: 0.4, ease: "none" }, 4.6);
  for (const [id, at] of [["#t2", 5], ["#t3a", 15], ["#t3b", 23], ["#t4", 30]]) {
    tl.from(id + " span", { opacity: 0, y: 24, duration: 0.45, ease: "power2.out" }, at + 0.15);
  }
  tl.from("#s5 .brand", { opacity: 0, y: 30, duration: 0.6, ease: "power2.out" }, 38.2);
  tl.from("#s5 .claim", { opacity: 0, y: 24, duration: 0.6, ease: "power2.out" }, 38.7);
  tl.from("#s5 .url", { opacity: 0, duration: 0.6, ease: "none" }, 39.3);
  tl.set({}, {}, 45);

  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
})();
