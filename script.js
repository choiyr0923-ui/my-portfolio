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
