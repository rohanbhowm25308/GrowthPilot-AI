/*
 * GrowthPilot AI — Ambient Background System
 * -------------------------------------------------------------------------
 * A single fixed <canvas> that renders a premium fintech/AI particle network:
 * edge-concentrated "data clusters", curved data-flow streams with traveling
 * glow particles, faint neural connecting lines, and a handful of subtle
 * holographic fintech icon nodes — all while keeping the CENTER of the
 * screen clear so page content stays readable.
 *
 * Design is intentionally split into:
 *   - pure functions (generateField, drawFrame) with no DOM/window access,
 *     so this file can be loaded in Node (via `require`) for offline
 *     rendering/verification as well as in the browser.
 *   - a thin browser bootstrap (initBrowser) that owns the canvas, the
 *     requestAnimationFrame loop, resize/mouse listeners, and
 *     prefers-reduced-motion handling. This is the only part that touches
 *     `window`/`document`.
 *
 * Public browser API (attached to window.GrowthPilotBG):
 *   GrowthPilotBG.setIntensity(0..1)   — scales particle count/opacity/speed
 * -------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(); // Node — for offline rendering/tests
  } else {
    root.GrowthPilotBGCore = factory(); // browser — core exposed for the bootstrap below
  }
})(typeof self !== "undefined" ? self : this, function () {

  // ---------------------------------------------------------------------
  // Palette — 70% deep navy/black, 20% blue/cyan, 8% white highlights, 2% gold
  // ---------------------------------------------------------------------
  const COLORS = {
    bg0: "#020B14",
    bg1: "#050F1B",
    bgRadialA: "rgba(11, 34, 58, 0.55)",
    bgRadialB: "rgba(3, 14, 24, 0)",
    particleBlue: "rgba(64, 140, 255, OPA)",
    particleCyan: "rgba(0, 229, 255, OPA)",
    particleWhite: "rgba(220, 240, 255, OPA)",
    particleGold: "rgba(240, 169, 60, OPA)",
    lineCyan: "rgba(70, 170, 220, OPA)",
    flowCyan: "rgba(0, 229, 255, OPA)",
    flowGold: "rgba(240, 169, 60, OPA)",
    iconStroke: "rgba(90, 170, 230, OPA)",
    iconGlyph: "rgba(140, 200, 255, OPA)",
  };

  function withOpacity(template, opa) {
    return template.replace("OPA", opa.toFixed(3));
  }

  // ---------------------------------------------------------------------
  // Field generation — deterministic given a seed so it's testable, but
  // uses Math.random in practice (seed param unused in browser calls).
  // ---------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Corner "cluster" centers as fractions of canvas size, matching the
  // reference composition: complexity concentrated at the four corners,
  // fading toward an empty middle.
  const CORNERS = [
    { fx: 0.06, fy: 0.08 }, // top-left
    { fx: 0.94, fy: 0.1 },  // top-right
    { fx: 0.05, fy: 0.92 }, // bottom-left
    { fx: 0.95, fy: 0.9 },  // bottom-right
  ];

  // Center exclusion ellipse (fraction of width/height) — kept clear for content.
  const CENTER_CLEAR = { fx: 0.5, fy: 0.5, rx: 0.34, ry: 0.32 };

  function inCenterClearZone(x, y, w, h) {
    const dx = (x - CENTER_CLEAR.fx * w) / (CENTER_CLEAR.rx * w);
    const dy = (y - CENTER_CLEAR.fy * h) / (CENTER_CLEAR.ry * h);
    return dx * dx + dy * dy < 1;
  }

  function particleCountForWidth(w) {
    if (w < 640) return 55;   // mobile
    if (w < 1100) return 100; // tablet
    return 170;               // desktop
  }

  function generateField(width, height, opts) {
    opts = opts || {};
    const rand = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    const count = Math.round(particleCountForWidth(width) * (opts.density != null ? opts.density : 1));
    const clusterSpread = Math.min(width, height) * 0.38;

    const particles = [];
    for (let i = 0; i < count; i++) {
      // 82% of particles biased toward a corner cluster, 18% scattered but
      // rejected if they'd land in the center-clear zone.
      let x, y;
      if (rand() < 0.82) {
        const c = CORNERS[Math.floor(rand() * CORNERS.length)];
        const cx = c.fx * width, cy = c.fy * height;
        // Gaussian-ish via sum of uniforms, clamped to canvas bounds
        const ang = rand() * Math.PI * 2;
        const rad = (rand() * 0.6 + rand() * 0.4) * clusterSpread;
        x = Math.max(0, Math.min(width, cx + Math.cos(ang) * rad));
        y = Math.max(0, Math.min(height, cy + Math.sin(ang) * rad));
      } else {
        let tries = 0;
        do {
          x = rand() * width;
          y = rand() * height;
          tries++;
        } while (inCenterClearZone(x, y, width, height) && tries < 14);
        // If we still failed to land outside after 14 tries, push it toward
        // whichever edge is closest instead of giving up and rendering it anyway.
        if (inCenterClearZone(x, y, width, height)) {
          x = x < width / 2 ? x * 0.3 : width - (width - x) * 0.3;
        }
      }

      const roll = rand();
      let color, baseR;
      if (roll < 0.02) { color = "gold"; baseR = 1.6 + rand() * 1.8; }
      else if (roll < 0.12) { color = "white"; baseR = 1.2 + rand() * 1.4; }
      else if (roll < 0.55) { color = "cyan"; baseR = 0.8 + rand() * 1.6; }
      else { color = "blue"; baseR = 0.7 + rand() * 1.4; }

      particles.push({
        x, y,
        vx: (rand() - 0.5) * 0.06,
        vy: (rand() - 0.5) * 0.06,
        r: baseR,
        baseOpacity: 0.25 + rand() * 0.55,
        phase: rand() * Math.PI * 2,
        pulseSpeed: 0.4 + rand() * 0.6,
        color,
      });
    }

    // Curved data-flow paths — cubic beziers kept within the outer margins,
    // sweeping from one corner toward the opposite side without crossing
    // through the center-clear zone.
    const flows = [
      { // top-left down through left side
        p0: { x: width * 0.02, y: height * 0.05 },
        p1: { x: width * 0.22, y: height * 0.18 },
        p2: { x: width * 0.1, y: height * 0.42 },
        p3: { x: width * 0.3, y: height * 0.62 },
        color: "cyan", width: 1.1,
      },
      { // top-right down through right side
        p0: { x: width * 0.98, y: height * 0.04 },
        p1: { x: width * 0.78, y: height * 0.2 },
        p2: { x: width * 0.9, y: height * 0.4 },
        p3: { x: width * 0.7, y: height * 0.58 },
        color: "gold", width: 0.9,
      },
      { // bottom-left sweeping up
        p0: { x: width * 0.01, y: height * 0.98 },
        p1: { x: width * 0.24, y: height * 0.82 },
        p2: { x: width * 0.12, y: height * 0.6 },
        p3: { x: width * 0.32, y: height * 0.42 },
        color: "cyan", width: 1.0,
      },
      { // bottom-right sweeping up
        p0: { x: width * 0.99, y: height * 0.97 },
        p1: { x: width * 0.76, y: height * 0.8 },
        p2: { x: width * 0.88, y: height * 0.58 },
        p3: { x: width * 0.68, y: height * 0.4 },
        color: "gold", width: 0.9,
      },
    ].map((f, i) => ({
      ...f,
      travelers: new Array(3).fill(0).map((_, j) => ({ t: (j / 3) + i * 0.07, speed: 0.00028 + rand() * 0.0002 })),
    }));

    // Subtle holographic fintech icon nodes near the corners.
    const icons = [
      { type: "rupee", fx: 0.05, fy: 0.85, size: 30 },
      { type: "bars", fx: 0.045, fy: 0.6, size: 30 },
      { type: "growth", fx: 0.95, fy: 0.15, size: 30 },
      { type: "store", fx: 0.955, fy: 0.4, size: 30 },
      { type: "user", fx: 0.06, fy: 0.14, size: 28 },
    ].map(ic => ({ ...ic, x: ic.fx * width, y: ic.fy * height }));

    return { particles, flows, icons, width, height };
  }

  // ---------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------
  const MAX_LINK_DIST = 120;

  function drawIcon(ctx, icon, opacity) {
    const { x, y, size, type } = icon;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = withOpacity(COLORS.iconStroke, opacity);
    ctx.fillStyle = withOpacity(COLORS.iconGlyph, opacity * 0.9);
    ctx.lineWidth = 1;
    // rounded-square badge
    const r = 8, s = size;
    ctx.beginPath();
    ctx.moveTo(-s / 2 + r, -s / 2);
    ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, r);
    ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, r);
    ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, r);
    ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, r);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 1.3;
    if (type === "rupee") {
      ctx.font = `600 ${size * 0.42}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("\u20B9", 0, 1);
    } else if (type === "bars") {
      const bw = size * 0.12;
      [0.3, 0.55, 0.4, 0.7].forEach((h, i) => {
        const bx = -size * 0.28 + i * (bw + 3);
        ctx.fillRect(bx, size * 0.25 - h * size * 0.5, bw, h * size * 0.5);
      });
    } else if (type === "growth") {
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, size * 0.18);
      ctx.lineTo(-size * 0.05, -size * 0.05);
      ctx.lineTo(size * 0.08, size * 0.08);
      ctx.lineTo(size * 0.3, -size * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(size * 0.16, -size * 0.22);
      ctx.lineTo(size * 0.3, -size * 0.22);
      ctx.lineTo(size * 0.3, -size * 0.08);
      ctx.stroke();
    } else if (type === "store") {
      ctx.strokeRect(-size * 0.26, -size * 0.05, size * 0.52, size * 0.3);
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.05);
      ctx.lineTo(0, -size * 0.28);
      ctx.lineTo(size * 0.3, -size * 0.05);
      ctx.stroke();
    } else if (type === "user") {
      ctx.beginPath();
      ctx.arc(0, -size * 0.1, size * 0.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, size * 0.32, size * 0.24, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function bezierPoint(p0, p1, p2, p3, t) {
    const it = 1 - t;
    const x = it * it * it * p0.x + 3 * it * it * t * p1.x + 3 * it * t * t * p2.x + t * t * t * p3.x;
    const y = it * it * it * p0.y + 3 * it * it * t * p1.y + 3 * it * t * t * p2.y + t * t * t * p3.y;
    return { x, y };
  }

  function drawFrame(ctx, state, time, opts) {
    opts = opts || {};
    const { width, height } = state;
    const intensity = opts.intensity != null ? opts.intensity : 1;
    const animate = opts.animate !== false;
    const parallax = opts.parallax || { x: 0, y: 0 };

    // Base
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg0;
    ctx.fillRect(0, 0, width, height);

    // Soft corner glows
    const glow = ctx.createRadialGradient(width * 0.1, height * 0.1, 0, width * 0.1, height * 0.1, Math.max(width, height) * 0.5);
    glow.addColorStop(0, `rgba(30,111,234,${0.14 * intensity})`);
    glow.addColorStop(1, "rgba(30,111,234,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    const glow2 = ctx.createRadialGradient(width * 0.92, height * 0.85, 0, width * 0.92, height * 0.85, Math.max(width, height) * 0.5);
    glow2.addColorStop(0, `rgba(0,229,255,${0.09 * intensity})`);
    glow2.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(parallax.x, parallax.y);

    // Data-flow curves (very faint stroke) + traveling particles
    state.flows.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.p0.x, f.p0.y);
      ctx.bezierCurveTo(f.p1.x, f.p1.y, f.p2.x, f.p2.y, f.p3.x, f.p3.y);
      ctx.strokeStyle = withOpacity(f.color === "gold" ? COLORS.flowGold : COLORS.flowCyan, 0.10 * intensity);
      ctx.lineWidth = f.width;
      ctx.stroke();

      f.travelers.forEach(tr => {
        let t = tr.t;
        if (animate) {
          t = (tr.t + time * tr.speed) % 1;
        }
        const pt = bezierPoint(f.p0, f.p1, f.p2, f.p3, t);
        const fade = Math.sin(t * Math.PI); // fade in/out at path ends
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = withOpacity(f.color === "gold" ? COLORS.flowGold : COLORS.flowCyan, 0.75 * fade * intensity);
        ctx.shadowColor = f.color === "gold" ? "#F0A93C" : "#00E5FF";
        ctx.shadowBlur = 6 * Math.max(0.35, intensity);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    });

    // Neural connecting lines between nearby particles
    const pts = state.particles;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_LINK_DIST) {
          const op = (1 - dist / MAX_LINK_DIST) * 0.16 * intensity;
          if (op > 0.008) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = withOpacity(COLORS.lineCyan, op);
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    // Ambient particles
    pts.forEach(p => {
      if (animate) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10; if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10; if (p.y > height + 10) p.y = -10;
      }
      const pulse = animate ? (0.75 + 0.25 * Math.sin(time * 0.0015 * p.pulseSpeed + p.phase)) : 1;
      const opacity = p.baseOpacity * pulse * intensity;
      const colorTpl = COLORS["particle" + p.color[0].toUpperCase() + p.color.slice(1)];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = withOpacity(colorTpl, opacity);
      if (p.r > 1.6) {
        ctx.shadowColor = p.color === "gold" ? "#F0A93C" : p.color === "white" ? "#DCF0FF" : "#00E5FF";
        ctx.shadowBlur = 4 * Math.max(0.35, intensity);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Icon nodes
    state.icons.forEach(ic => drawIcon(ctx, ic, 0.22 * intensity));

    ctx.restore();
  }

  return { generateField, drawFrame, particleCountForWidth, COLORS };
});

// ---------------------------------------------------------------------------
// Browser bootstrap — only runs when loaded as a <script> in a real page.
// Creates one fixed full-viewport canvas behind all app content, owns the
// requestAnimationFrame loop, and exposes window.GrowthPilotBG.setIntensity().
// ---------------------------------------------------------------------------
(function () {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const core = window.GrowthPilotBGCore;
  if (!core) return;

  function boot() {
    const canvas = document.createElement("canvas");
    canvas.id = "bg-canvas";
    Object.assign(canvas.style, {
      position: "fixed", inset: "0", width: "100vw", height: "100vh",
      zIndex: "-1", pointerEvents: "none", display: "block",
    });
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext("2d");

    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = reduceMotionQuery.matches;
    let intensity = 1;
    let state = null;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let mouse = { x: 0, y: 0 };
    let parallax = { x: 0, y: 0 };
    let rafId = null;

    function sizeCanvas() {
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = core.generateField(w, h, { density: Math.max(0.45, intensity) });
    }

    function frame(t) {
      if (state) {
        // Smoothly ease the parallax toward the mouse-driven target
        parallax.x += (mouse.x - parallax.x) * 0.04;
        parallax.y += (mouse.y - parallax.y) * 0.04;
        core.drawFrame(ctx, state, t, { intensity, animate: !reduceMotion, parallax });
      }
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (rafId) cancelAnimationFrame(rafId);
      if (reduceMotion) {
        // Reduced motion: draw exactly one static frame, no loop, no drift.
        core.drawFrame(ctx, state, 0, { intensity, animate: false, parallax: { x: 0, y: 0 } });
      } else {
        rafId = requestAnimationFrame(frame);
      }
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { sizeCanvas(); start(); }, 150);
    });

    window.addEventListener("mousemove", (e) => {
      if (reduceMotion) return;
      const w = window.innerWidth, h = window.innerHeight;
      // Subtle parallax — a few pixels max, never enough to reveal canvas edges.
      mouse.x = ((e.clientX / w) - 0.5) * 14;
      mouse.y = ((e.clientY / h) - 0.5) * 10;
    });

    reduceMotionQuery.addEventListener?.("change", (e) => {
      reduceMotion = e.matches;
      start();
    });

    sizeCanvas();
    start();

    window.GrowthPilotBG = {
      setIntensity(v) {
        intensity = Math.max(0, Math.min(1, v));
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
