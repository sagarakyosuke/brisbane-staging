(function () {
  "use strict";

  /* ===============================================================
   * Hero — animated light-sweep
   * ---------------------------------------------------------------
   * Injects a real DOM element (.hero-sweep-band) inside every .hero
   * on the page. The band is styled and animated in stylesheet.css.
   *
   * Runs independent of data-section-id so it works on every hero
   * regardless of how the live content is authored.
   * =============================================================== */

  function initHeroSweep() {
    var heroes = document.querySelectorAll(".hero");
    if (!heroes.length) return;

    heroes.forEach(function (hero) {
      if (hero.querySelector(":scope > .hero-sweep-band")) return;

      var band = document.createElement("div");
      band.className = "hero-sweep-band";
      band.setAttribute("aria-hidden", "true");
      hero.appendChild(band);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSweep);
  } else {
    initHeroSweep();
  }
})();
