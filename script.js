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

// Iris reveal, Cover → Category. The first downward scroll on the cover is held for 600ms
// while the real category section, lifted over the cover with a transform, shows through a
// circle growing from the centre of the viewport. At the end the page is scrolled to the
// category and the transform is removed in the same frame, so layout is never changed.
(function () {
  var root = document.documentElement;
  var body = document.body;
  var section = document.querySelector(".category");
  var canvas = section && section.querySelector(".category__canvas");
  var DURATION = 600;            // ms
  var EMPTY_TOP_BAND = 20;       // pt: top band of the category artboard that holds no content
  var SCROLL_KEYS = ["ArrowDown", "PageDown", " ", "Spacebar"];
  var LOCK_KEYS = SCROLL_KEYS.concat(["ArrowUp", "PageUp", "Home", "End"]);

  if (!section || !canvas || !window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // CSS "ease-in-out" = cubic-bezier(0.42, 0, 0.58, 1)
  var easeInOut = function (t) {
    var lo = 0, hi = 1, s = t;
    for (var i = 0; i < 20; i++) {
      s = (lo + hi) / 2;
      var x = 3 * (1 - s) * (1 - s) * s * 0.42 + 3 * (1 - s) * s * s * 0.58 + s * s * s;
      if (x < t) lo = s; else hi = s;
    }
    return 3 * (1 - s) * s * s + s * s * s;
  };

  var state = "idle";   // idle → playing → done
  var touchStartY = null;

  // How much of the category is already on screen below the cover (px, negative = below the fold)
  var visiblePart = function () {
    return window.innerHeight - section.getBoundingClientRect().top;
  };
  // Plain black top of the section: the band above the centred stage plus the artboard's empty
  // top edge. While no more than this is visible, lifting the section changes nothing on screen.
  var emptyTop = function () {
    var canvasRect = canvas.getBoundingClientRect();
    return canvasRect.top - section.getBoundingClientRect().top + canvasRect.width / 708.661 * EMPTY_TOP_BAND;
  };
  var canStart = function () {
    return state === "idle" && visiblePart() <= emptyTop();
  };

  var cleanUp = function () {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onScroll);
  };

  var play = function () {
    state = "playing";
    root.classList.add("iris-playing");

    var viewW = section.clientWidth;
    var viewH = window.innerHeight;
    var sectionH = section.offsetHeight;
    var docTop = section.offsetTop;
    // Final framing: section top at the top of the screen; if the screen is taller than the
    // section (e.g. mobile toolbars hidden) it is bottom-aligned, above it the cover's white edge.
    var targetTop = Math.max(viewH - sectionH, 0);
    var cx = viewW / 2;
    var cy = viewH / 2 - targetTop;   // viewport centre in section coordinates
    var maxRadius = Math.ceil(Math.sqrt(cx * cx + (viewH / 2) * (viewH / 2))) + 1;
    var start = null;

    // The section's own place in the flow is painted in its background colour while it is lifted
    body.style.backgroundImage = "linear-gradient(to bottom, transparent " + docTop + "px, " +
      "#000105 " + docTop + "px, #000105 " + (docTop + sectionH) + "px, transparent " + (docTop + sectionH) + "px)";

    var frame = function (now) {
      if (state !== "playing") return;
      if (start === null) start = now;
      var progress = Math.min((now - start) / DURATION, 1);
      if (progress >= 1) {
        // Same frame: real scroll position replaces the transform
        window.scrollTo(0, docTop - targetTop);
        section.style.transform = "";
        section.style.clipPath = "";
        body.style.backgroundImage = "";
        root.classList.remove("iris-playing");
        state = "done";
        cleanUp();
        return;
      }
      var shift = targetTop - (docTop - window.pageYOffset);
      section.style.transform = "translateY(" + shift + "px)";
      section.style.clipPath =
        "circle(" + (easeInOut(progress) * maxRadius).toFixed(2) + "px at " + cx + "px " + cy + "px)";
      requestAnimationFrame(frame);
    };
    // First frame right away (radius 0), so the lifted section never shows unclipped
    frame(performance.now());
  };

  // Hold the page still while the circle grows; start on the first downward scroll intent
  var onWheel = function (event) {
    if (state === "playing") {
      event.preventDefault();
    } else if (event.deltaY > 0 && canStart()) {
      event.preventDefault();
      play();
    }
  };
  var onTouchStart = function (event) {
    touchStartY = event.touches[0].clientY;
  };
  var onTouchMove = function (event) {
    if (state === "playing") {
      event.preventDefault();
    } else if (touchStartY !== null && touchStartY - event.touches[0].clientY > 6 && canStart()) {
      event.preventDefault();
      play();
    }
  };
  var onKeyDown = function (event) {
    if (event.target !== body && event.target !== root) return;
    if (state === "playing" && LOCK_KEYS.indexOf(event.key) !== -1) {
      event.preventDefault();
    } else if (!event.shiftKey && SCROLL_KEYS.indexOf(event.key) !== -1 && canStart()) {
      event.preventDefault();
      play();
    }
  };
  // Reached the category some other way (scrollbar, link): leave it as it is
  var onScroll = function () {
    if (state === "idle" && visiblePart() > emptyTop()) {
      state = "done";
      cleanUp();
    }
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
