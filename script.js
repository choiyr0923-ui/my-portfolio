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
