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

// Iris reveal, Cover → Category. When the category starts to scroll in from below (detected
// with an IntersectionObserver, so trackpad, wheel, keys, scrollbar and touch all count), the
// real category section is lifted over the cover with a transform and shown through a circle
// growing from the centre of the viewport for 600ms. At the end the page is scrolled to the
// category and the transform is removed in the same frame, so layout is never changed.
(function () {
  var root = document.documentElement;
  var body = document.body;
  var section = document.querySelector(".category");
  var canvas = section && section.querySelector(".category__canvas");
  var DURATION = 600;            // ms
  var LOCK_KEYS = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Spacebar", "Home", "End"];

  if (!section || !canvas || !window.requestAnimationFrame || !("IntersectionObserver" in window)) {
    console.info("[iris] skipped: required browser features are missing");
    return;
  }
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

  // idle → playing → done → (back on the cover) idle …; "failed" after an error stays off
  var state = "idle";
  var observer;

  // Only during the 600ms: keep the page still where the browser lets us (cancelable events).
  // Where it does not (e.g. Safari trackpad momentum), the lifted section follows the scroll.
  var holdScroll = function (event) {
    if (event.cancelable) event.preventDefault();
  };
  var holdKeys = function (event) {
    if (LOCK_KEYS.indexOf(event.key) !== -1 && event.cancelable) event.preventDefault();
  };
  var addHold = function () {
    window.addEventListener("wheel", holdScroll, { passive: false });
    window.addEventListener("touchmove", holdScroll, { passive: false });
    window.addEventListener("keydown", holdKeys);
  };
  var removeHold = function () {
    window.removeEventListener("wheel", holdScroll);
    window.removeEventListener("touchmove", holdScroll);
    window.removeEventListener("keydown", holdKeys);
  };

  // Back to the normal page, whatever happened
  var reset = function () {
    section.style.transform = "";
    section.style.clipPath = "";
    body.style.backgroundImage = "";
    root.classList.remove("iris-playing");
    removeHold();
  };

  var play = function () {
    state = "playing";
    addHold();
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
      try {
        if (start === null) start = now;
        var progress = Math.min((now - start) / DURATION, 1);
        if (progress >= 1) {
          // Same frame: real scroll position replaces the transform
          window.scrollTo(0, docTop - targetTop);
          reset();
          state = "done";
          return;
        }
        var shift = targetTop - (docTop - window.pageYOffset);
        section.style.transform = "translateY(" + shift + "px)";
        section.style.clipPath =
          "circle(" + (easeInOut(progress) * maxRadius).toFixed(2) + "px at " + cx + "px " + cy + "px)";
        requestAnimationFrame(frame);
      } catch (error) {
        console.error("[iris] animation stopped, page restored:", error);
        reset();
        state = "failed";
      }
    };
    // First frame right away (radius 0), so the lifted section never shows unclipped
    frame(performance.now());
  };

  // Back on the cover: the category is out of view again (or the page is at the very top, for
  // mobile toolbars that change the viewport height). Only then can the reveal run again, so
  // scrolling up through the category, or turning back halfway, never replays it.
  var rearm = function () {
    if (state !== "done") return;
    if (window.pageYOffset <= 0 || section.getBoundingClientRect().top >= window.innerHeight - 1) {
      state = "idle";
    }
  };

  // Start when the category enters from below the fold. The root is shrunk by 1px at the bottom
  // so a section that only touches the fold does not count; small thresholds catch the first pixels.
  try {
    observer = new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      rearm();
      if (state !== "idle" || !entry.isIntersecting) return;
      if (entry.boundingClientRect.top > 0 && window.pageYOffset > 0) {
        try {
          play();
        } catch (error) {
          console.error("[iris] could not start, page left as is:", error);
          reset();
          state = "failed";
        }
      }
    }, { rootMargin: "0px 0px -1px 0px", threshold: [0, 0.01, 0.02, 0.05, 0.1, 0.2] });
    observer.observe(section);
    window.addEventListener("scroll", rearm, { passive: true });
  } catch (error) {
    console.error("[iris] setup failed, page left as is:", error);
  }
})();
