(function () {
  "use strict";

  /* ===============================================================
   * Loader (shared — exposed via window.BL for content.js)
   * =============================================================== */

  var loaderEl = document.getElementById("pageLoader");
  var pendingFetches = 0;

  function loaderStart() {
    pendingFetches++;
    if (loaderEl) loaderEl.classList.remove("is-hidden");
  }

  function loaderEnd() {
    pendingFetches--;
    if (pendingFetches <= 0 && loaderEl) {
      loaderEl.classList.add("is-hidden");
    }
  }

  // expose to other scripts (content.js)
  window.BL = window.BL || {};
  window.BL.loaderStart = loaderStart;
  window.BL.loaderEnd = loaderEnd;

  /* ===============================================================
   * Shared helpers
   * =============================================================== */

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ===============================================================
   * Shared: drawer + dropdown behaviour
   * =============================================================== */

  var drawer = document.getElementById("mobileDrawer");
  var overlay = document.getElementById("drawerOverlay");
  var hamburger = document.getElementById("hamburger");
  var closeBtn = document.getElementById("drawerClose");

  if (drawer && overlay && hamburger && closeBtn) {
    var openDrawer = function () {
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      overlay.hidden = false;
      requestAnimationFrame(function () {
        overlay.classList.add("show");
      });
      hamburger.setAttribute("aria-expanded", "true");
      document.body.classList.add("drawer-open");
    };

    var closeDrawer = function () {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      overlay.classList.remove("show");
      setTimeout(function () {
        overlay.hidden = true;
      }, 350);
      hamburger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("drawer-open");
    };

    hamburger.addEventListener("click", function (e) {
      e.stopPropagation();
      openDrawer();
    });
    closeBtn.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("open"))
        closeDrawer();
    });
  }

  function initDropdowns() {
    document.querySelectorAll(".has-dropdown > .nav-dropdown-toggle").forEach(function (btn) {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        var li = btn.closest(".has-dropdown");
        var isOpen = li.classList.contains("open");

        li.parentElement
          .querySelectorAll(".has-dropdown.open")
          .forEach(function (el) {
            if (el !== li) {
              el.classList.remove("open");
              var b = el.querySelector(":scope > button");
              if (b) b.setAttribute("aria-expanded", "false");
            }
          });

        li.classList.toggle("open", !isOpen);
        btn.setAttribute("aria-expanded", String(!isOpen));
      });
    });
  }

  document.addEventListener("click", function (e) {
    if (drawer && drawer.contains(e.target)) return;

    document
      .querySelectorAll(".main-nav .has-dropdown.open")
      .forEach(function (li) {
        li.classList.remove("open");
        var b = li.querySelector(":scope > .nav-dropdown-toggle");
        if (b) b.setAttribute("aria-expanded", "false");
      });
  });

  document.querySelectorAll(".nav-dropdown").forEach(function (panel) {
    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  });

  /* ===============================================================
   * Top menu
   * =============================================================== */

  function loadTopMenu() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var mount = document.getElementById("topMenuMount");
    if (!mount) return;

    function renderItem(item) {
      var icon = item && item.icon ? item.icon : "";
      var isExternal =
        item.target === "_blank" || /^https?:\/\//i.test(item.link || "");

      return (
        '<a class="topbar-item" href="' +
        esc(item.link) +
        '"' +
        (item.target ? ' target="' + esc(item.target) + '"' : "") +
        ">" +
        (icon
          ? '<span class="topbar-item-icon"><i class="' +
            esc(icon) +
            '" aria-hidden="true"></i></span>'
          : "") +
        '<span class="topbar-item-text">' +
        esc(item.label) +
        "</span>" +
        (isExternal
          ? '<i class="fa-solid fa-arrow-up-right-from-square topbar-item-ext" aria-hidden="true"></i>'
          : "") +
        "</a>"
      );
    }

    loaderStart();
    fetch(API + "/top-menu", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = data.menu || [];
        mount.innerHTML = items.map(renderItem).join("");
      })
      .catch(function (err) {
        console.error("[top-menu] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Client tools (topbar group 2)
   * =============================================================== */

  function loadClientTools() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var mount = document.getElementById("clientToolsMount");
    if (!mount) return;

    function renderItem(item) {
      var icon = item && item.icon ? item.icon : "";
      var isExternal =
        item.target === "_blank" || /^https?:\/\//i.test(item.link || "");

      return (
        '<a class="topbar-item" href="' +
        esc(item.link) +
        '"' +
        (item.target ? ' target="' + esc(item.target) + '"' : "") +
        ">" +
        (icon
          ? '<span class="topbar-item-icon"><i class="' +
            esc(icon) +
            '" aria-hidden="true"></i></span>'
          : "") +
        '<span class="topbar-item-text">' +
        esc(item.label) +
        "</span>" +
        (isExternal
          ? '<i class="fa-solid fa-arrow-up-right-from-square topbar-item-ext" aria-hidden="true"></i>'
          : "") +
        "</a>"
      );
    }

    loaderStart();
    fetch(API + "/client-tools", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = data.menu || [];
        mount.innerHTML = items.map(renderItem).join("");
      })
      .catch(function (err) {
        console.error("[client-tools] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Site identity (logo / icon) — from the Brisbane API
   * =============================================================== */

  function loadSiteIdentity() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";

    loaderStart();
    fetch(API + "/site", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        // header logo
        var headerLogo = document.getElementById("siteLogo");
        if (headerLogo && data.logo && data.logo.url) {
          headerLogo.src = data.logo.url;
          headerLogo.alt = data.logo.alt || "Brisbane Logistics";
        }

        // drawer logo
        var drawerLogo = document.getElementById("drawerLogo");
        if (drawerLogo && data.logo && data.logo.url) {
          drawerLogo.src = data.logo.url;
          drawerLogo.alt = data.logo.alt || "Brisbane Logistics";
        }

        // favicon
        if (data.icon && data.icon.url) {
          var iconLink = document.querySelector('link[rel="icon"]');
          if (!iconLink) {
            iconLink = document.createElement("link");
            iconLink.rel = "icon";
            document.head.appendChild(iconLink);
          }
          iconLink.href = data.icon.url;

          var appleLink = document.querySelector(
            'link[rel="apple-touch-icon"]',
          );
          if (!appleLink) {
            appleLink = document.createElement("link");
            appleLink.rel = "apple-touch-icon";
            document.head.appendChild(appleLink);
          }
          appleLink.href = data.icon.url;
        }
      })
      .catch(function (err) {
        console.error("[site] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Main menu
   * =============================================================== */

  function loadMainMenu() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var mount = document.getElementById("mainMenuMount");
    if (!mount) return;

    function renderItem(item) {
      var kids = Array.isArray(item.children) ? item.children : [];

      if (kids.length > 0) {
        var children = kids
          .map(function (child) {
            var icon = child.icon ? child.icon : "";
            var desc = child.description
              ? "<small>" + esc(child.description) + "</small>"
              : "";

            return (
              '<a href="' +
              esc(child.link) +
              '" role="menuitem">' +
              (icon ? '<i class="' + esc(icon) + '"></i>' : "") +
              "<span>" +
              esc(child.label) +
              desc +
              "</span>" +
              "</a>"
            );
          })
          .join("");

        return (
          '<li class="has-dropdown">' +
          '<a class="nav-parent-link" href="' + esc(item.link) + '">' +
          esc(item.label) +
          "</a>" +
          '<button type="button" class="nav-dropdown-toggle" aria-expanded="false" aria-haspopup="true" aria-label="Toggle ' + esc(item.label) + ' submenu">' +
          '<i class="fa-solid fa-chevron-down nav-caret" aria-hidden="true"></i>' +
          "</button>" +
          '<div class="nav-dropdown" role="menu" aria-label="' +
          esc(item.label) +
          ' submenu">' +
          children +
          "</div>" +
          "</li>"
        );
      }

      return (
        '<li><a href="' + esc(item.link) + '">' + esc(item.label) + "</a></li>"
      );
    }

    loaderStart();
    fetch(API + "/menu", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = data.menu || [];
        mount.innerHTML = items.map(renderItem).join("");
        initDropdowns();
      })
      .catch(function (err) {
        console.error("[main-menu] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Mobile menu (drawer) — same data as the desktop main menu
   * =============================================================== */

  function loadMobileMenu() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var mount = document.getElementById("mobileMenuMount");
    if (!mount) return;

    function renderItem(item) {
      var kids = Array.isArray(item.children) ? item.children : [];

      if (kids.length > 0) {
        var children = kids
          .map(function (child) {
            var icon = child.icon ? child.icon : "";
            var desc = child.description
              ? "<small>" + esc(child.description) + "</small>"
              : "";

            return (
              '<a href="' +
              esc(child.link) +
              '" role="menuitem">' +
              (icon ? '<i class="' + esc(icon) + '"></i>' : "") +
              "<span>" +
              esc(child.label) +
              desc +
              "</span>" +
              "</a>"
            );
          })
          .join("");

        return (
          '<li class="has-dropdown">' +
          '<a class="nav-parent-link" href="' + esc(item.link) + '">' +
          esc(item.label) +
          "</a>" +
          '<button type="button" class="nav-dropdown-toggle" aria-expanded="false" aria-label="Toggle ' + esc(item.label) + ' submenu">' +
          '<i class="fa-solid fa-chevron-down nav-caret" aria-hidden="true"></i>' +
          "</button>" +
          '<div class="nav-dropdown" role="menu">' +
          children +
          "</div>" +
          "</li>"
        );
      }

      return (
        '<li><a href="' + esc(item.link) + '">' + esc(item.label) + "</a></li>"
      );
    }

    loaderStart();
    fetch(API + "/menu", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = data.menu || [];
        mount.innerHTML = items.map(renderItem).join("");
        initDropdowns();
      })
      .catch(function (err) {
        console.error("[mobile-menu] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Breadcrumbs
   * =============================================================== */

  function loadBreadcrumbs() {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var mount = document.getElementById("breadcrumbMount");
    if (!mount) return;

    var slug = mount.dataset.slug;
    if (!slug) return;

    loaderStart();
    fetch(API + "/breadcrumbs?slug=" + encodeURIComponent(slug), {
      credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var crumbs = data.breadcrumbs || [];

        if (!crumbs.length) {
          mount.innerHTML = "";
          return;
        }

        mount.innerHTML = crumbs
          .map(function (c, i) {
            var sep = i > 0 ? '<span aria-hidden="true">/</span>' : "";
            var node = c.link
              ? '<a href="' + esc(c.link) + '">' + esc(c.label) + "</a>"
              : "<span>" + esc(c.label) + "</span>";
            return sep + node;
          })
          .join("");
      })
      .catch(function (err) {
        console.error("[breadcrumbs] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Boot
   * =============================================================== */

  document.addEventListener("DOMContentLoaded", function () {
    initDropdowns();
    loadSiteIdentity();
    loadTopMenu();
    loadClientTools();
    loadMainMenu();
    loadMobileMenu();
    loadBreadcrumbs();
  });
})();
