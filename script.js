// Reveal cover text once web/local fonts have loaded (prevents a fallback-font flash).
(function () {
  var root = document.documentElement;
  var reveal = function () {
    root.classList.add("fonts-ready");
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(reveal);
    // Safety net in case a font request stalls
    setTimeout(reveal, 3000);
  } else {
    reveal();
  }
})();

// Category objects: mouse parallax (mouse / trackpad only, not with reduced motion) and
// pausing the floating loops while the category is off screen. Pointer moves only store a
// target; one requestAnimationFrame loop eases toward it, writes the `translate` of the five
// objects and stops as soon as they settle. After 1.2 s without movement, or when the
// pointer leaves the window, the target returns to the rest position.
(function () {
  var section = document.querySelector(".category");
  if (!section) return;
  var objects = Array.prototype.slice.call(section.querySelectorAll(".category__object"));
  if (!objects.length) return;

  var depth = objects.map(function (el) {
    var style = getComputedStyle(el);
    return [parseFloat(style.getPropertyValue("--px")) || 0, parseFloat(style.getPropertyValue("--py")) || 0];
  });

  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var IDLE_MS = 1200;
  var FOLLOW_MS = 180;   // easing time constant while following the pointer
  var RETURN_MS = 500;   // gentler easing back to the rest position

  var visible = false;
  var target = [0, 0];
  var current = [0, 0];
  var lastMove = 0;
  var lastTime = 0;
  var frame = 0;

  var enabled = function () {
    return finePointer.matches && !reduceMotion.matches;
  };

  var apply = function () {
    for (var i = 0; i < objects.length; i++) {
      var x = Math.round(current[0] * depth[i][0] * 100) / 100;
      var y = Math.round(current[1] * depth[i][1] * 100) / 100;
      objects[i].style.translate = x || y ? x + "px " + y + "px" : "";
    }
  };

  var idleTimer = 0;
  var SETTLE = 0.05 / 6;   // stop when every object is within 0.05px of its target (depth ≤ 6px)

  var tick = function (now) {
    frame = 0;
    var k = 1 - Math.exp(-Math.min(now - (lastTime || now), 64) / (lastMove ? FOLLOW_MS : RETURN_MS));
    lastTime = now;
    current[0] += (target[0] - current[0]) * k;
    current[1] += (target[1] - current[1]) * k;

    var settled = Math.abs(target[0] - current[0]) < SETTLE && Math.abs(target[1] - current[1]) < SETTLE;
    if (settled) {
      current[0] = target[0];
      current[1] = target[1];
      lastTime = 0;
    } else {
      frame = requestAnimationFrame(tick);   // runs only while easing
    }
    apply();
  };

  var start = function () {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  var rest = function () {
    clearTimeout(idleTimer);
    idleTimer = 0;
    target[0] = target[1] = 0;
    lastMove = 0;
    start();
  };

  // One timer per idle period: when it fires early (the pointer moved since), it waits out
  // the remaining time instead of being restarted on every pointer move
  var checkIdle = function () {
    var left = IDLE_MS - (performance.now() - lastMove);
    if (left > 0) idleTimer = setTimeout(checkIdle, left);
    else rest();
  };

  window.addEventListener("pointermove", function (event) {
    if (event.pointerType === "touch" || !visible || !enabled()) return;
    target[0] = (event.clientX / window.innerWidth) * 2 - 1;
    target[1] = (event.clientY / window.innerHeight) * 2 - 1;
    lastMove = performance.now();
    if (!idleTimer) idleTimer = setTimeout(checkIdle, IDLE_MS);
    start();
  }, { passive: true });

  document.documentElement.addEventListener("mouseleave", rest);
  window.addEventListener("blur", rest);

  var reset = function () {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(idleTimer);
    idleTimer = 0;
    lastTime = lastMove = 0;
    target = [0, 0];
    current = [0, 0];
    apply();
  };
  [finePointer, reduceMotion].forEach(function (query) {
    if (query.addEventListener) query.addEventListener("change", reset);
    else if (query.addListener) query.addListener(reset);
  });

  if ("IntersectionObserver" in window) {
    section.classList.add("is-offscreen");
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      section.classList.toggle("is-offscreen", !visible);
      if (!visible) rest();
    }).observe(section);
  } else {
    visible = true;
  }
})();

// About Me rings: pause the rotation while the section is off screen
(function () {
  var section = document.querySelector(".about");
  if (!section || !document.querySelector(".about__ring") || !("IntersectionObserver" in window)) return;
  section.classList.add("is-offscreen");
  new IntersectionObserver(function (entries) {
    section.classList.toggle("is-offscreen", !entries[entries.length - 1].isIntersecting);
  }).observe(section);
})();

// Circular cursor inversion (Category typography, About Me). Pointer moves only store the
// position; one requestAnimationFrame loop eases the circle toward it (slight lag), writes its
// transform and stops once it has caught up. Each page says where the circle may show:
// inside any "include" box and outside every "exclude" box (boxes measured once and on resize).
function circleCursor(section, canvas, circle, areas) {
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var FOLLOW_MS = 60;    // easing time constant: a slight lag, never sluggish

  var include = [];
  var exclude = [];
  var origin = [0, 0];   // canvas top-left in document px (changes only on resize)
  var scroll = [0, 0];   // page scroll, kept from the scroll event so no frame has to read layout
  var pointer = null;    // last pointer position in the viewport
  var current = [0, 0];  // circle centre, in canvas px
  var shown = false;
  var lastTime = 0;
  var frame = 0;

  var enabled = function () {
    return finePointer.matches && !reduceMotion.matches;
  };

  var measure = function () {
    var c = canvas.getBoundingClientRect();
    var box = function (el) {
      var r = el.getBoundingClientRect();
      return [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top];
    };
    scroll = [window.scrollX, window.scrollY];
    origin = [c.left + scroll[0], c.top + scroll[1]];
    include = areas.include.map(box);
    exclude = areas.exclude.map(box);
  };

  var inside = function (b, x, y) {
    return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  };

  var place = function () {
    circle.style.transform = "translate3d(" + current[0].toFixed(2) + "px, " + current[1].toFixed(2) + "px, 0)";
  };

  var show = function (on) {
    if (on === shown) return;
    shown = on;
    circle.classList.toggle("is-visible", on);
    section.classList.toggle("is-cursor-on", on);
  };

  var tick = function (now) {
    frame = 0;
    if (!pointer || !enabled()) { show(false); lastTime = 0; return; }
    var x = pointer[0] - origin[0] + scroll[0], y = pointer[1] - origin[1] + scroll[1];
    var over = include.some(function (b) { return inside(b, x, y); }) &&
               !exclude.some(function (b) { return inside(b, x, y); });

    if (over && !shown) {          // appear right under the pointer, not sliding in from elsewhere
      current[0] = x; current[1] = y; lastTime = 0;
    }
    show(over);
    if (!over) { lastTime = 0; return; }

    var k = 1 - Math.exp(-Math.min(now - (lastTime || now - 16), 64) / FOLLOW_MS);
    lastTime = now;
    current[0] += (x - current[0]) * k;
    current[1] += (y - current[1]) * k;
    if (Math.abs(x - current[0]) < 0.1 && Math.abs(y - current[1]) < 0.1) {
      current[0] = x; current[1] = y; lastTime = 0;
    } else {
      frame = requestAnimationFrame(tick);   // runs only while catching up
    }
    place();
  };

  var request = function () {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  window.addEventListener("pointermove", function (event) {
    if (event.pointerType === "touch") return;
    pointer = [event.clientX, event.clientY];
    request();
  }, { passive: true });
  // While scrolling the page moves under a still pointer: re-check only while the section is on
  // screen, so the Cover → Category wipe keeps running with no script work
  var onScreen = !("IntersectionObserver" in window);
  if (!onScreen) new IntersectionObserver(function (entries) {
    onScreen = entries[entries.length - 1].isIntersecting;
    if (!onScreen) request();
  }).observe(section);
  window.addEventListener("scroll", function () {
    scroll = [window.scrollX, window.scrollY];
    if (pointer && (onScreen || shown)) request();
  }, { passive: true });
  window.addEventListener("resize", function () { measure(); request(); });
  document.documentElement.addEventListener("mouseleave", function () { pointer = null; request(); });
  window.addEventListener("blur", function () { pointer = null; request(); });
  [finePointer, reduceMotion].forEach(function (query) {
    if (query.addEventListener) query.addEventListener("change", request);
    else if (query.addListener) query.addListener(request);
  });

  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
}

// Category: over the title, tagline, lead, statement and the four category labels
(function () {
  var section = document.querySelector(".category");
  var canvas = section && section.querySelector(".category__canvas");
  var circle = canvas && canvas.querySelector(".category__cursor");
  if (!circle) return;
  circleCursor(section, canvas, circle, {
    include: Array.prototype.slice.call(canvas.querySelectorAll(
      "h2 > .category__item, p > .category__item, .category__lead, .category__statement, .category__list .category__item")),
    exclude: []
  });
})();

// About Me: the whole page except the grey profile card
(function () {
  var section = document.querySelector(".about");
  var canvas = section && section.querySelector(".about__canvas");
  var circle = canvas && canvas.querySelector(".about__cursor");
  var card = canvas && canvas.querySelector(".about__card");
  if (!circle || !card) return;
  circleCursor(section, canvas, circle, { include: [canvas], exclude: [card] });
})();
