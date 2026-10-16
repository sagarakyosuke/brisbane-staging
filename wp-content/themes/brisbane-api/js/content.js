(function () {
  "use strict";

  /* ===============================================================
   * Loader (shared, from main.js via window.BL)
   * =============================================================== */

  var loaderStart = (window.BL && window.BL.loaderStart) || function () {};
  var loaderEnd = (window.BL && window.BL.loaderEnd) || function () {};

  /* ===============================================================
   * Helpers
   * =============================================================== */

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ---------------------------------------------------------------
   * Normalize a link to the current environment.
   *  - Absolute URLs (http://, https://, //) pass through unchanged.
   *  - Root-relative paths ("/home/how-it-works") are prefixed with
   *    the current site home URL (BL_CONFIG.homeUrl or "/").
   *  - Special schemes (mailto:, tel:, #) pass through unchanged.
   * --------------------------------------------------------------- */
  function resolveLink(url) {
    url = String(url || "").trim();
    if (!url || url === "#") return "#";

    if (/^(https?:)?\/\//i.test(url)) return url; // absolute
    if (/^(mailto:|tel:|#)/i.test(url)) return url; // special schemes

    if (url.charAt(0) === "/") {
      var base = (window.BL_CONFIG && window.BL_CONFIG.homeUrl) || "/";
      base = base.replace(/\/+$/, ""); // trim trailing slashes
      return base + url;
    }
    return url;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // Fallback used by the Team variant when no gallery match exists.
  var TEAM_PLACEHOLDER_URL =
    "https://brisbanelogistics.com.au/wp-content/uploads/2026/10/avatar-placeholder.jpg";

  // Fallback used by the Warehouse Team variant for the group photo.
  var WAREHOUSE_GROUP_PLACEHOLDER_URL =
    "https://brisbanelogistics.com.au/wp-content/uploads/2026/10/landscape-photo-placeholder.png";

  // Fallback for the See The Work In Action carousel when no galleries exist yet.
  var STW_PLACEHOLDER_URL =
    "https://brisbanelogistics.com.au/wp-content/uploads/2026/09/candid-image-1.png";

  /* ===============================================================
   * Embedded HTML — rendered from `details.embedded[]`
   * =============================================================== */

  function renderEmbedded(details) {
    var items = (details && details.embedded) || [];
    if (!items.length) return "";

    return items
      .map(function (item) {
        if (!item || !item.html) return "";
        var kind = esc(item.kind || "html");
        return (
          '<div class="section-embed section-embed--' +
          kind +
          '">' +
          item.html +
          "</div>"
        );
      })
      .join("");
  }

  /* ===============================================================
   * Page content
   * =============================================================== */

  function loadPageContent() {
    var root = document.getElementById("pageContent");
    if (!root) return;

    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";
    var path = root.dataset.slug || "";
    if (!path) return;

    var parts = path.split("/").filter(Boolean);
    var slug = parts.length ? parts[parts.length - 1] : path;

    loaderStart();
    fetch(API + "/content?slug=" + encodeURIComponent(slug), {
      credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var pages = (data["page-content"] && data["page-content"].pages) || [];
        var page = null;

        for (var i = 0; i < pages.length; i++) {
          if (pages[i].slug === slug) {
            page = pages[i];
            break;
          }
        }

        if (!page) {
          console.warn(
            "[content] page not found:",
            slug,
            "(from path: " + path + ")",
          );
          return;
        }

        renderHero(page);
        renderSections(page);
      })
      .catch(function (err) {
        console.error("[content] failed:", err);
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Hero
   * =============================================================== */

  function renderHero(page) {
    var hero =
      (page.content &&
        page.content[1] &&
        page.content[1]["hero-content"] &&
        page.content[1]["hero-content"][0]) ||
      {};

    var heroId = hero["section-id"] || "";

    var heroEl = document.querySelector(".hero");
    if (heroEl && heroId) {
      heroEl.setAttribute("data-section-id", heroId);
    }

    // ---- Eyebrow ----
    var titleEl = document.getElementById("heroTitle");
    if (titleEl) {
      var prevEyebrow = titleEl.parentNode
        ? titleEl.parentNode.querySelector(".hero-eyebrow")
        : null;
      if (prevEyebrow) prevEyebrow.remove();

      var desc0 =
        (hero["hero-description"] && hero["hero-description"][0]) || {};
      var eyebrowText = (desc0["sub-paragraph"] || "").trim();
      if (eyebrowText && titleEl.parentNode) {
        var eyebrowEl = document.createElement("p");
        eyebrowEl.className = "hero-eyebrow";
        eyebrowEl.textContent = eyebrowText;
        titleEl.parentNode.insertBefore(eyebrowEl, titleEl);
      }

      titleEl.textContent = hero["hero-title"] || "";
    }

    var leadEl = document.getElementById("heroLead");
    if (leadEl) {
      var desc =
        (hero["hero-description"] && hero["hero-description"][0]) || {};
      if (desc.paragraph) {
        leadEl.textContent = desc.paragraph;
      } else {
        leadEl.remove();
      }
    }

    // ---- Hero pill + chips (from hero-description[0].list-text) ----
    // Group 0 → chip grid (below the lead).
    // Group 1 → eyebrow pill (above the title).
    // Group 2 → stat card (floating on image + below image).
    var heroBodyEl = document.querySelector(".hero-body");

    if (heroBodyEl) {
      [".hero-bullets", ".hero-pill", ".hero-chips"].forEach(function (sel) {
        var el = heroBodyEl.querySelector(sel);
        if (el) el.remove();
      });
    }

    var heroDescList =
      (hero["hero-description"] && hero["hero-description"][0]) || {};
    var heroLists = Array.isArray(heroDescList["list-text"])
      ? heroDescList["list-text"]
      : [];

    if (heroLists.length && heroBodyEl) {
      var leadNode = document.getElementById("heroLead");
      var anchorNode = leadNode ? leadNode.nextSibling : null;
      var eyebrowNode = heroBodyEl.querySelector(".hero-eyebrow");

      var groupA = heroLists[0] || null;
      var groupB = heroLists[1] || null;

      // ---------- Eyebrow pill (from Group 1) ----------
      var pillItems = [];
      if (groupB) {
        var bKids = Array.isArray(groupB.children) ? groupB.children : [];
        if (bKids.length) {
          bKids.forEach(function (kid) {
            var t = (kid && kid["list-title"]) || "";
            if (t) pillItems.push(esc(t));
          });
        } else if (groupB["list-title"]) {
          pillItems.push(esc(groupB["list-title"]));
        }
      }

      if (pillItems.length) {
        var pillEl = document.createElement("div");
        pillEl.className = "hero-pill";
        pillEl.innerHTML = pillItems.join(
          '<span class="hero-pill-sep" aria-hidden="true">·</span>',
        );

        if (eyebrowNode && eyebrowNode.parentNode) {
          eyebrowNode.parentNode.insertBefore(pillEl, eyebrowNode.nextSibling);
        } else {
          var titleNode = document.getElementById("heroTitle");
          if (titleNode && titleNode.parentNode) {
            titleNode.parentNode.insertBefore(pillEl, titleNode);
          }
        }
      }

      // ---------- Chip grid (from Group 0) ----------
      var chipItems = [];
      if (groupA) {
        var aKids = Array.isArray(groupA.children) ? groupA.children : [];
        if (aKids.length) {
          aKids.forEach(function (kid) {
            var t = (kid && kid["list-title"]) || "";
            if (t) chipItems.push(esc(t));
          });
        } else if (groupA["list-title"]) {
          chipItems.push(esc(groupA["list-title"]));
        }
      }

      if (chipItems.length) {
        var chipsEl = document.createElement("div");
        chipsEl.className = "hero-chips";
        chipsEl.innerHTML = chipItems
          .map(function (t) {
            return '<span class="hero-chip">' + t + "</span>";
          })
          .join("");

        if (leadNode) {
          heroBodyEl.insertBefore(chipsEl, anchorNode);
        } else {
          heroBodyEl.appendChild(chipsEl);
        }
      }
    }

    var actMount = document.getElementById("heroActions");
    if (actMount) {
      var acts = (hero["hero-actions"] && hero["hero-actions"][0]) || {};
      var links = Array.isArray(acts.links) ? acts.links : [];
      var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];
      var parts = [];

      links.forEach(function (l) {
        if (!l.label) return;
        parts.push(
          '<a class="btn" href="' +
            esc(resolveLink(l.link || "#")) +
            '">' +
            esc(l.label) +
            (l.icon
              ? ' <i class="' + esc(l.icon) + '" aria-hidden="true"></i>'
              : "") +
            "</a>",
        );
      });

      buttons.forEach(function (b) {
        if (!b.label) return;
        var wpClass = (b.class || "").toLowerCase();
        var isFilled =
          wpClass.indexOf("has-white-background-color") !== -1 ||
          wpClass.indexOf("has-navy-background-color") !== -1 ||
          wpClass.indexOf("has-black-background-color") !== -1 ||
          wpClass.indexOf("has-gray-background-color") !== -1 ||
          wpClass.indexOf("has-primary-background-color") !== -1;
        var btnClass = isFilled ? "btn btn-primary" : "btn btn-outline";
        parts.push(
          '<a class="' +
            btnClass +
            '" href="#">' +
            esc(b.label) +
            (b.icon
              ? ' <i class="' + esc(b.icon) + '" aria-hidden="true"></i>'
              : "") +
            "</a>",
        );
      });

      actMount.innerHTML = parts.length
        ? '<div class="hero-actions">' + parts.join("") + "</div>"
        : "";
    }

    var imgMount = document.getElementById("heroMedia");
    if (imgMount) {
      var img = hero["hero-image"] || {};
      if (img.img) {
        var heroIdLower = (hero["section-id"] || "").toLowerCase();
        var badgeText = "Workplace photo placeholder";
        if (heroIdLower.indexOf("explore-our-warehouse") === 0) {
          badgeText = "Warehouse views";
        }

        imgMount.innerHTML =
          '<img src="' +
          esc(img.img) +
          '" alt="' +
          esc(img["alt-text"] || "") +
          '" class="hero-img">' +
          '<span class="hero-img-badge">' +
          esc(badgeText) +
          "</span>" +
          '<span class="hero-img-caption">Illustrative image</span>';
      } else {
        imgMount.remove();
      }
    }

    // ---- Hero stat card (from hero-description[0].list-text[2]) ----
    var heroMediaEl = document.getElementById("heroMedia");

    if (heroMediaEl && heroLists.length >= 3) {
      var statGroup = heroLists[2] || null;

      if (statGroup) {
        var statLabel = (statGroup["list-title"] || "").trim();
        var statKids = Array.isArray(statGroup.children)
          ? statGroup.children
          : [];
        var statValue = (statKids[0] && statKids[0]["list-title"]) || "";

        if (statLabel || statValue) {
          // Clean previous render.
          var prevFloating = heroMediaEl.querySelector(".hero-stat--floating");
          if (prevFloating) prevFloating.remove();

          var statHtml =
            '<span class="hero-stat-icon" aria-hidden="true">' +
            '<i class="fa-solid fa-check"></i>' +
            "</span>" +
            '<div class="hero-stat-body">' +
            (statValue
              ? '<strong class="hero-stat-value">' +
                esc(statValue) +
                "</strong>"
              : "") +
            (statLabel
              ? '<span class="hero-stat-label">' + esc(statLabel) + "</span>"
              : "") +
            "</div>";

          var statEl = document.createElement("div");
          statEl.className = "hero-stat hero-stat--floating";
          statEl.innerHTML = statHtml;
          heroMediaEl.appendChild(statEl);
        }
      }
    }
  }

  /* ===============================================================
   * Sections — dynamic loop
   * =============================================================== */

  function renderSections(page) {
    var mount = document.getElementById("sectionMount");
    if (!mount) return;

    var sections =
      (page.content &&
        page.content[2] &&
        page.content[2]["section-contents"]) ||
      [];

    if (!sections.length) {
      mount.innerHTML = "";
      return;
    }

    var parts = [];

    sections.forEach(function (sec, index) {
      var det =
        (sec.description && sec.description[0] && sec.description[0].details) ||
        {};

      var lists = Array.isArray(det["lists-text"]) ? det["lists-text"] : [];
      var acts = (det.actions && det.actions[0]) || { links: [], buttons: [] };
      var imgs = (det.images && det.images[0]) || {};
      var feat = imgs["image-feature"] || {};
      var gall = Array.isArray(imgs["image-galleries"])
        ? imgs["image-galleries"]
        : [];

      var variant = pickSectionVariant(sec, det, lists, feat);

      if (variant === "steps") {
        parts.push(renderSectionSteps(sec, det, lists, acts));
      } else if (variant === "location") {
        parts.push(renderSectionLocation(sec, det, acts, feat, gall, index));
      } else if (variant === "cta") {
        parts.push(renderSectionCta(sec, det, acts, lists, index));
      } else if (variant === "list") {
        parts.push(renderSectionList(sec, det, lists, acts, index));
      } else if (variant === "timeline") {
        parts.push(
          renderSectionTimeline(sec, det, lists, acts, feat, gall, index),
        );
      } else if (variant === "perspective") {
        parts.push(
          renderSectionPerspective(sec, det, lists, acts, feat, gall, index),
        );
      } else if (variant === "newsletter") {
        parts.push(renderSectionNewsletter(sec, det, index));
      } else if (variant === "team") {
        parts.push(renderSectionTeam(sec, det, lists, gall, feat, index));
      } else if (variant === "warehouse-team") {
        parts.push(
          renderSectionWarehouseTeam(sec, det, lists, feat, gall, index),
        );
      } else if (variant === "warehouse-explorer") {
        parts.push(renderSectionWarehouseExplorer(sec, det, feat, gall, index));
      } else if (variant === "pallet-storage") {
        parts.push(renderSectionPalletStorage(sec, det, feat, gall, index));
      } else if (variant === "receiving-dispatch") {
        parts.push(renderSectionReceivingDispatch(sec, det, feat, gall, index));
      } else if (variant === "warehouse-walkthrough") {
        parts.push(renderSectionWarehouseWalkthrough(sec, det, feat, index));
      } else if (variant === "delivery-ratings") {
        parts.push(renderSectionDeliveryRatings(sec, det, lists, index));
      } else if (variant === "see-the-work-in-action") {
        parts.push(
          renderSectionSeeTheWorkInAction(sec, det, feat, gall, index),
        );
      } else if (variant === "built-around-your-industry") {
        parts.push(
          renderSectionBuiltAroundYourIndustry(sec, det, lists, gall, index),
        );
      } else if (variant === "testimonial") {
        parts.push(renderSectionTestimonial(sec, det, lists, index));
      } else if (variant === "networks-behind-the-process") {
        parts.push(
          renderSectionNetworksBehindTheProcess(sec, det, lists, gall, index),
        );
      } else if (variant === "how-it-works-banner") {
        parts.push(renderSectionHowItWorksBanner(sec, det, feat, index));
      } else if (variant === "clear-answers-faqs") {
        parts.push(renderSectionClearAnswersFaqs(sec, det, lists, acts, index));
      } else if (variant === "about-us-local") {
        parts.push(renderSectionAboutUsLocal(sec, det, lists, acts, index));
      } else if (variant === "real-results") {
        parts.push(renderSectionRealResults(sec, det, lists, acts, index));
      } else if (variant === "tech-visibility") {
        parts.push(renderSectionTechVisibility(sec, det, lists, index));
      } else if (variant === "services-grid") {
        parts.push(renderSectionServicesGrid(sec, det, index));
      } else if (variant === "wms-tracked") {
        parts.push(renderSectionWmsTracked(sec, det, lists, acts, index));
      } else if (variant === "pick-a-service") {
        parts.push(renderSectionPickAService(sec, det, index));
      } else if (variant === "explore-other-services") {
        parts.push(renderSectionExploreOtherServices(sec, det, index));
      } else if (variant === "challenges") {
        parts.push(renderSectionChallenges(sec, det, lists, index));
      } else if (variant === "the-results-delivery-ratings") {
        parts.push(renderSectionTheResultsRatings(sec, det, lists, index));
      } else {
        parts.push(renderSectionMediaText(sec, det, acts, feat, gall));
      }
    });

    Promise.all(parts).then(function (resolved) {
      mount.innerHTML = resolved.join("");

      initGalleryModal();
      initWarehouseExplorerCarousels(mount);
      initPalletStorageMagnify(mount);
      initReceivingDispatch(mount);
      initSeeTheWorkInActionCarousel(mount);
      initFaqAccordions(mount);
      initInteractiveSections(mount);
    });
  }

  /* ===============================================================
   * Variant dispatch
   * =============================================================== */

  var VARIANT_PREFIXES = {
    "question-to-fit": "cta",
    "operation-orders": "steps",
    "our-murarrie": "location",
    "never-miss-important-updates": "newsletter",
    "our-journey": "timeline",
    "owner-s-perspective": "perspective",
    "our-team": "team",
    "our-warehouse-team": "warehouse-team",
    "warehouse-explorer": "warehouse-explorer",
    "pallet-storage": "pallet-storage",
    "receiving-and-dispatch": "receiving-dispatch",
    "warehouse-walkthrough": "warehouse-walkthrough",
    "delivery-ratings": "delivery-ratings",
    "built-around-your-industry": "built-around-your-industry",
    "end-to-end-logistics": "services-grid",
    "see-your-stock": "tech-visibility",
    "real-results": "real-results",
    "game-changer": "testimonial",
    "about-us-local": "about-us-local",
    "clear-answers": "clear-answers-faqs",
    "see-the-work-in-action": "see-the-work-in-action",
    "how-it-works-banner": "how-it-works-banner",
    "networks-behind-the-process": "networks-behind-the-process",
    newsletter: "newsletter",

    // Services
    "explore-other-services": "explore-other-services",
    "pick-a-service": "pick-a-service",
    "wms-tracked": "wms-tracked",

    // Case Studies
    challenges: "challenges",
    "the-results-delivery-ratings": "the-results-delivery-ratings",
  };

  var VARIANT_SUFFIXES = {
    "step-panels": "steps",
    steps: "steps",
    "footer-panels": "location",
    location: "location",
    warehouse: "location",
    "cta-panels": "cta",
    cards: "list",
    list: "list",
    "media-text": "media-text",
    newsletter: "newsletter",
  };

  function pickSectionVariant(sec, det, lists, feat) {
    var id = (sec["section-id"] || "").toLowerCase();

    for (var prefix in VARIANT_PREFIXES) {
      if (id === prefix || id.indexOf(prefix + "-") === 0) {
        return VARIANT_PREFIXES[prefix];
      }
    }

    if (VARIANT_SUFFIXES[id]) return VARIANT_SUFFIXES[id];

    var bestKey = "";
    var bestVariant = "";
    for (var key in VARIANT_SUFFIXES) {
      if (
        id.length > key.length &&
        id.slice(-key.length - 1) === "-" + key &&
        key.length > bestKey.length
      ) {
        bestKey = key;
        bestVariant = VARIANT_SUFFIXES[key];
      }
    }
    if (bestVariant) return bestVariant;

    if (lists.length > 0) return "list";
    if (looksLikeLocation(det, feat)) return "location";
    return "media-text";
  }

  function looksLikeLocation(det, feat) {
    var main = (det["main-text"] || "").trim();
    if (!main) return false;

    var hasAddressNumber = /^\d+\s/.test(main);
    var hasPostcode = /\b\d{4}\b/.test(main);

    return hasAddressNumber && hasPostcode;
  }

  /* ===============================================================
   * Variant A — Media/Text section
   * =============================================================== */

  function renderSectionMediaText(sec, det, acts, feat, gall) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var main = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var links = Array.isArray(acts.links) ? acts.links : [];
    var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];

    var mediaHtml = "";
    if (feat && feat.img) {
      mediaHtml =
        '<div class="section-media">' +
        '<img src="' +
        esc(feat.img) +
        '" alt="' +
        esc(feat["alt-text"] || "") +
        '" class="section-img">' +
        "</div>";
    }

    var galleryHtml = "";
    if (gall.length) {
      galleryHtml =
        '<div class="section-gallery">' +
        gall
          .map(function (g) {
            if (!g.img) return "";
            return (
              '<figure class="section-gallery-item">' +
              '<img src="' +
              esc(g.img) +
              '" alt="' +
              esc(g.title || "") +
              '">' +
              (g.caption
                ? "<figcaption>" + esc(g.caption) + "</figcaption>"
                : "") +
              "</figure>"
            );
          })
          .join("") +
        "</div>";
    }

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--media-text" data-section-id="' +
      esc(sec["section-id"] || "") +
      '">' +
      '<div class="container">' +
      '<div class="section-row">' +
      mediaHtml +
      '<div class="section-body">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (main ? '<p class="section-main-text">' + esc(main) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      actionsHtml +
      "</div>" +
      "</div>" +
      galleryHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant B — List / Cards section
   * =============================================================== */

  function renderSectionList(sec, det, lists, acts, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var main = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var links = Array.isArray(acts.links) ? acts.links : [];
    var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];

    var counter = 0;

    function renderItem(item) {
      if (!item) return "";

      var heading = item["list-title"] || "";
      var desc = item["list-description"] || "";
      var kids = Array.isArray(item.children) ? item.children : [];

      var childHtml = "";
      if (kids.length) {
        var first = kids[0];

        if (!desc && first && first["list-title"]) {
          desc = first["list-title"];
        }

        var restItems = [];

        if (first && Array.isArray(first.children)) {
          restItems = restItems.concat(first.children);
        }

        for (var i = 1; i < kids.length; i++) {
          restItems.push(kids[i]);
        }

        childHtml = restItems
          .map(function (child) {
            if (!child) return "";
            var text = child["list-title"] || child["list-description"] || "";

            var grandHtml = "";
            if (Array.isArray(child.children) && child.children.length) {
              grandHtml = child.children
                .map(function (g) {
                  var gt =
                    (g && (g["list-title"] || g["list-description"])) || "";
                  return gt
                    ? '<p class="section-list-text">' + esc(gt) + "</p>"
                    : "";
                })
                .join("");
            }

            return (
              (text
                ? '<p class="section-list-text">' + esc(text) + "</p>"
                : "") + grandHtml
            );
          })
          .join("");
      }

      var num = pad2(++counter);

      return (
        '<li class="section-list-item">' +
        '<span class="section-list-num" aria-hidden="true">' +
        num +
        "</span>" +
        '<div class="section-list-body">' +
        (heading
          ? '<h3 class="section-list-title">' + esc(heading) + "</h3>"
          : "") +
        (desc ? '<p class="section-list-desc">' + esc(desc) + "</p>" : "") +
        childHtml +
        "</div>" +
        "</li>"
      );
    }

    var itemsHtml = lists.map(renderItem).join("");

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--list" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (main ? '<p class="section-main-text">' + esc(main) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      "</div>" +
      '<ul class="section-list">' +
      itemsHtml +
      "</ul>" +
      actionsHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant C — Steps section (horizontal numbered timeline)
   * =============================================================== */

  function renderSectionSteps(sec, det, lists, acts) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var main = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var links = Array.isArray(acts.links) ? acts.links : [];
    var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];

    var itemsHtml = lists
      .map(function (item, i) {
        var num = String(i + 1);
        var heading = item["list-title"] || "";
        var desc = item["list-description"] || "";

        if (!desc && item.children && item.children.length) {
          var child = item.children[0] || {};
          if (!heading && child["list-title"]) {
            heading = child["list-title"];
          } else if (child["list-title"]) {
            desc = child["list-title"];
          }
        }

        return (
          '<li class="section-step">' +
          '<span class="section-step-num" aria-hidden="true">' +
          num +
          "</span>" +
          '<div class="section-step-body">' +
          (heading
            ? '<h3 class="section-step-title">' + esc(heading) + "</h3>"
            : "") +
          (desc ? '<p class="section-step-desc">' + esc(desc) + "</p>" : "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--steps" data-section-id="' +
      esc(sec["section-id"] || "") +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (main ? '<p class="section-main-text">' + esc(main) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      "</div>" +
      '<ol class="section-steps">' +
      itemsHtml +
      "</ol>" +
      actionsHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Timeline (vertical list + gallery column)
   * =============================================================== */

  function renderSectionTimeline(
    sec,
    det,
    lists,
    acts,
    feat,
    gall,
    sectionIndex,
  ) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var main = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var counter = 0;

    function flatten(item) {
      var heading = item["list-title"] || "";
      var year = "";
      var desc = "";
      var kids = Array.isArray(item.children) ? item.children : [];

      if (kids.length) {
        var first = kids[0] || {};
        year = first["list-title"] || "";

        if (first.children && first.children.length) {
          desc = first.children[0]["list-title"] || "";
        }
      }

      return { year: year, heading: heading, desc: desc };
    }

    var items = lists.map(flatten);

    var itemsHtml = items
      .map(function (it) {
        var num = pad2(++counter);
        return (
          '<li class="timeline-item">' +
          '<span class="timeline-num" aria-hidden="true">' +
          num +
          "</span>" +
          '<div class="timeline-body">' +
          (it.year
            ? '<span class="timeline-year">' + esc(it.year) + "</span>"
            : "") +
          (it.heading
            ? '<h3 class="timeline-title">' + esc(it.heading) + "</h3>"
            : "") +
          (it.desc ? '<p class="timeline-desc">' + esc(it.desc) + "</p>" : "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    var galleryHtml = "";
    if (gall.length) {
      galleryHtml =
        '<div class="timeline-gallery">' +
        gall
          .slice(0, 2)
          .map(function (g) {
            if (!g.img) return "";
            return (
              '<figure class="timeline-gallery-item">' +
              '<img src="' +
              esc(g.img) +
              '" alt="' +
              esc(g.title || "") +
              '" loading="lazy">' +
              "</figure>"
            );
          })
          .join("") +
        "</div>";
    }

    var actionsHtml = buildSectionActions(
      Array.isArray(acts.links) ? acts.links : [],
      Array.isArray(acts.buttons) ? acts.buttons : [],
    );

    return (
      '<section class="section-block section-block--timeline" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (main ? '<p class="section-main-text">' + esc(main) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      "</div>" +
      '<div class="timeline-row">' +
      '<ol class="timeline-list">' +
      itemsHtml +
      "</ol>" +
      galleryHtml +
      "</div>" +
      actionsHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Perspective (quote/attribution + image placeholder)
   * =============================================================== */

  function renderSectionPerspective(
    sec,
    det,
    lists,
    acts,
    feat,
    gall,
    sectionIndex,
  ) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var main = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var name = "";
    var role = "";

    if (lists.length > 0) {
      name = lists[0]["list-title"] || "";
      var kids = Array.isArray(lists[0].children) ? lists[0].children : [];
      if (kids.length > 0) {
        role = kids[0]["list-title"] || "";
      }
    }

    var links = Array.isArray(acts.links) ? acts.links : [];
    var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];

    var mediaHtml = "";
    var hasImage = feat && feat.img;
    var hasAttribution = name || role;

    if (hasImage) {
      mediaHtml =
        '<div class="perspective-media">' +
        '<img src="' +
        esc(feat.img) +
        '" alt="' +
        esc(feat["alt-text"] || "") +
        '" class="perspective-img">' +
        "</div>";
    } else if (hasAttribution) {
      mediaHtml =
        '<div class="perspective-media perspective-media--placeholder">' +
        '<span class="perspective-placeholder-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">' +
        '<path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>' +
        "</svg>" +
        "</span>" +
        '<p class="perspective-placeholder-text">' +
        esc(name) +
        "’s photograph<br>to be supplied." +
        "</p>" +
        "</div>";
    }

    var actionsHtml = buildSectionActions(links, buttons);

    var rowClass = mediaHtml
      ? "perspective-row"
      : "perspective-row perspective-row--single";

    return (
      '<section class="section-block section-block--perspective" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="' +
      rowClass +
      '">' +
      '<div class="perspective-body">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="perspective-title">' + esc(title) + "</h2>" : "") +
      (main ? '<p class="perspective-text">' + esc(main) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      (name || role
        ? '<div class="perspective-attribution">' +
          (name
            ? '<span class="perspective-name">' + esc(name) + "</span>"
            : "") +
          (role
            ? '<span class="perspective-role">' + esc(role) + "</span>"
            : "") +
          "</div>"
        : "") +
      renderEmbedded(det) +
      actionsHtml +
      "</div>" +
      mediaHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant D — Location / Warehouse section
   * =============================================================== */

  function renderSectionLocation(sec, det, acts, feat, gall, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var address = det["main-text"] || "";
    var sub = det["sub-text"] || "";
    var siteName = sec["tab-label"] || "Gateway Industrial Park";
    var mapEmbed = det["map-embed"] || "";

    var links = Array.isArray(acts.links) ? acts.links : [];
    var mapLink = links[0] || null;

    var mediaHtml = "";
    if (feat && feat.img) {
      mediaHtml =
        '<div class="location-hero">' +
        '<img src="' +
        esc(feat.img) +
        '" alt="' +
        esc(feat["alt-text"] || "") +
        '" class="location-hero-img">' +
        "</div>";
    }

    var galleryHtml = "";
    if (gall.length) {
      galleryHtml =
        '<div class="location-gallery">' +
        gall
          .slice(0, 3)
          .map(function (g) {
            if (!g.img) return "";
            return (
              '<figure class="location-gallery-item">' +
              '<img src="' +
              esc(g.img) +
              '" alt="' +
              esc(g.title || "") +
              '">' +
              "</figure>"
            );
          })
          .join("") +
        "</div>";
    }

    var cardHtml =
      '<aside class="location-card">' +
      '<span class="location-card-pin" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor">' +
      '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>' +
      "</svg>" +
      "</span>" +
      '<h3 class="location-card-name">' +
      esc(siteName) +
      "</h3>" +
      (address
        ? '<p class="location-card-address">' + esc(address) + "</p>"
        : "") +
      '<span class="location-card-preview">Google Maps preview</span>' +
      (mapEmbed
        ? '<div class="location-card-map">' +
          '<iframe src="' +
          esc(mapEmbed) +
          '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' +
          "</div>"
        : "") +
      (mapLink && mapLink.label
        ? '<a class="btn btn-primary location-card-btn" href="' +
          esc(mapLink.link || "#") +
          '">' +
          esc(mapLink.label) +
          ' <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>' +
          "</a>"
        : "") +
      "</aside>";

    return (
      '<section class="section-block section-block--location" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (address ? '<p class="section-main-text">' + esc(address) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      "</div>" +
      '<div class="location-row">' +
      '<div class="location-media">' +
      mediaHtml +
      galleryHtml +
      "</div>" +
      cardHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant E — CTA bar (title + lead + buttons + contacts)
   * =============================================================== */

  function renderSectionCta(sec, det, acts, lists, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var sub = det["sub-text"] || "";

    var links = Array.isArray(acts.links) ? acts.links : [];
    var buttons = Array.isArray(acts.buttons) ? acts.buttons : [];

    var contactHtml = "";
    if (lists.length) {
      contactHtml =
        '<div class="section-cta-contacts">' +
        lists
          .map(function (item) {
            var label = item["list-title"] || "";
            if (label === "") return "";

            var href =
              label.indexOf("@") !== -1
                ? "mailto:" + label
                : "tel:" + label.replace(/\s+/g, "");

            return (
              '<a class="section-cta-contact" href="' +
              esc(href) +
              '">' +
              esc(label) +
              "</a>"
            );
          })
          .join('<span class="section-cta-sep">|</span>') +
        "</div>";
    }

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--cta" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-cta-row">' +
      '<div class="section-cta-body">' +
      (eyebrow
        ? '<h2 class="section-cta-title">' + esc(eyebrow) + "</h2>"
        : "") +
      (title ? '<p class="section-cta-lead">' + esc(title) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      renderEmbedded(det) +
      "</div>" +
      '<div class="section-cta-side">' +
      actionsHtml +
      contactHtml +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant F — Newsletter (title + lead + embedded form)
   * =============================================================== */

  function renderSectionNewsletter(sec, det, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var sub = det["sub-text"] || "";

    return (
      '<section class="section-block section-block--newsletter" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-newsletter-row">' +
      '<div class="section-newsletter-body">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      "</div>" +
      '<div class="section-newsletter-form">' +
      renderEmbedded(det) +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Team (grid of member cards)
   * =============================================================== */

  function renderSectionTeam(sec, det, lists, gall, feat, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    var galleryByTitle = {};
    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g) return;
      var key = String(g.title || "")
        .trim()
        .toLowerCase();
      var url = String(g["file-url"] || g.img || "").trim();
      if (key && url && !galleryByTitle[key]) {
        galleryByTitle[key] = url;
      }
    });

    var featureUrl = ((feat && (feat["file-url"] || feat.img)) || "").trim();

    var cardsHtml = lists
      .map(function (item, index) {
        var name = item["list-title"] || "";
        var kids = Array.isArray(item.children) ? item.children : [];
        var role = (kids[0] && kids[0]["list-title"]) || "";

        var key = String(name).trim().toLowerCase();
        var photoUrl = galleryByTitle[key];

        if (!photoUrl && featureUrl && index === 0) {
          photoUrl = featureUrl;
        }

        if (!photoUrl) photoUrl = TEAM_PLACEHOLDER_URL;

        var photoHtml =
          '<img src="' +
          esc(photoUrl) +
          '" alt="' +
          esc(name) +
          '" class="team-card-img" loading="lazy" ' +
          "onerror=\"this.onerror=null;this.src='" +
          TEAM_PLACEHOLDER_URL +
          "';\">";

        return (
          '<li class="team-card">' +
          '<div class="team-card-media">' +
          photoHtml +
          "</div>" +
          '<div class="team-card-body">' +
          (name ? '<h3 class="team-card-name">' + esc(name) + "</h3>" : "") +
          (role ? '<p class="team-card-role">' + esc(role) + "</p>" : "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--team" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<ul class="team-grid">' +
      cardsHtml +
      "</ul>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Warehouse Team
   * =============================================================== */

  function renderSectionWarehouseTeam(
    sec,
    det,
    lists,
    feat,
    gall,
    sectionIndex,
  ) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var sub = det["sub-text"] || "";

    var groupUrl = ((feat && (feat.img || feat["file-url"])) || "").trim();
    if (!groupUrl) groupUrl = WAREHOUSE_GROUP_PLACEHOLDER_URL;

    var groupHtml =
      '<div class="warehouse-team-hero">' +
      '<img src="' +
      esc(groupUrl) +
      '" alt="' +
      esc(feat && feat["alt-text"] ? feat["alt-text"] : "Our warehouse team") +
      '" class="warehouse-team-hero-img" loading="lazy" ' +
      "onerror=\"this.onerror=null;this.src='" +
      WAREHOUSE_GROUP_PLACEHOLDER_URL +
      "';\">" +
      '<span class="warehouse-team-hero-badge">Group photo placeholder</span>' +
      "</div>";

    var galleryByTitle = {};
    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g) return;
      var key = String(g.title || "")
        .trim()
        .toLowerCase();
      var url = String(g["file-url"] || g.img || "").trim();
      if (key && url && !galleryByTitle[key]) {
        galleryByTitle[key] = url;
      }
    });

    function resolveItemPhoto(itemTitle) {
      var key = String(itemTitle || "")
        .trim()
        .toLowerCase();
      return galleryByTitle[key] || TEAM_PLACEHOLDER_URL;
    }

    var blocksHtml = (Array.isArray(lists) ? lists : [])
      .map(function (wrapper, index) {
        var subHeading = wrapper["list-title"] || "";
        var branch =
          (Array.isArray(wrapper.children) && wrapper.children[0]) || {};
        var subHeadingDesc = branch["list-title"] || "";
        var leaves = Array.isArray(branch.children) ? branch.children : [];

        if (!subHeading && !leaves.length) return "";

        var headHtml =
          '<div class="warehouse-team-subhead">' +
          (subHeading
            ? '<h3 class="warehouse-team-subhead-title">' +
              esc(subHeading) +
              "</h3>"
            : "") +
          (subHeadingDesc
            ? '<p class="warehouse-team-subhead-desc">' +
              esc(subHeadingDesc) +
              "</p>"
            : "") +
          "</div>";

        var gridHtml =
          index === 1
            ? renderWarehouseVideoGrid(leaves, resolveItemPhoto)
            : renderWarehousePhotoGrid(leaves, resolveItemPhoto);

        return (
          '<div class="warehouse-team-block" data-block-index="' +
          index +
          '">' +
          headHtml +
          gridHtml +
          "</div>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--warehouse-team" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      (sub ? '<p class="section-sub-text">' + esc(sub) + "</p>" : "") +
      "</div>" +
      groupHtml +
      blocksHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Warehouse Explorer
   * =============================================================== */

  function renderSectionWarehouseExplorer(sec, det, feat, gall, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var iconClass = sec["icon-class"];

    var slides = [];

    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g || !g.img) return;
      slides.push({
        img: g.img,
        full: g["file-url"] || g.img,
        caption: g.caption || "",
        alt: g["alt-text"] || "",
      });
    });

    if (!slides.length && feat && feat.img) {
      slides.push({
        img: feat.img,
        full: feat["file-url"] || feat.img,
        caption: feat.caption || "",
        alt: feat["alt-text"] || "",
      });
    }

    if (!slides.length) return "";

    var uid = "wxe-" + sectionIndex + "-" + Date.now();

    function pad2Local(n) {
      return n < 10 ? "0" + n : String(n);
    }

    function thumbHtml(s, i, isActive) {
      var cls = "warehouse-explorer-thumb" + (isActive ? " is-active" : "");
      return (
        '<button type="button" class="' +
        cls +
        '" data-slide="' +
        i +
        '" aria-label="View ' +
        esc(s.caption || "image " + (i + 1)) +
        '">' +
        '<span class="warehouse-explorer-thumb-media">' +
        '<img src="' +
        esc(s.img) +
        '" alt="' +
        esc(s.alt || s.caption) +
        '" loading="lazy">' +
        "</span>" +
        (s.caption
          ? '<span class="warehouse-explorer-thumb-label">' +
            esc(s.caption) +
            "</span>"
          : "") +
        "</button>"
      );
    }

    var first = slides[0];

    var thumbsHtml = slides
      .map(function (s, i) {
        return thumbHtml(s, i, i === 0);
      })
      .join("");

    return (
      '<section class="section-block section-block--warehouse-explorer" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<div class="warehouse-explorer-card" data-wxe="' +
      esc(uid) +
      '" data-slide-count="' +
      slides.length +
      '">' +
      '<div class="warehouse-explorer-head">' +
      '<span class="warehouse-explorer-badge">' +
      '<i class="' +
      esc(iconClass) +
      '" aria-hidden="true"></i>' +
      "<span>Warehouse views</span>" +
      "</span>" +
      '<span class="warehouse-explorer-counter">' +
      '<span class="warehouse-explorer-counter-now">01</span>' +
      '<span class="warehouse-explorer-counter-sep">/</span>' +
      '<span class="warehouse-explorer-counter-total">' +
      pad2Local(slides.length) +
      "</span>" +
      "</span>" +
      "</div>" +
      '<div class="warehouse-explorer-stage">' +
      '<div class="warehouse-explorer-stage-media">' +
      '<img src="' +
      esc(first.img) +
      '" alt="' +
      esc(first.alt || first.caption) +
      '" class="warehouse-explorer-stage-img" data-role="stage-img">' +
      (first.caption
        ? '<span class="warehouse-explorer-stage-caption" data-role="stage-caption">' +
          esc(first.caption) +
          "</span>"
        : '<span class="warehouse-explorer-stage-caption" data-role="stage-caption" hidden></span>') +
      '<span class="warehouse-explorer-stage-note">Illustrative photo</span>' +
      "</div>" +
      '<button type="button" class="warehouse-explorer-nav warehouse-explorer-nav--prev" data-role="prev" aria-label="Previous image">' +
      '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>' +
      "</button>" +
      '<button type="button" class="warehouse-explorer-nav warehouse-explorer-nav--next" data-role="next" aria-label="Next image">' +
      '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>' +
      "</button>" +
      "</div>" +
      '<div class="warehouse-explorer-thumbs" data-role="thumbs">' +
      thumbsHtml +
      "</div>" +
      '<div class="warehouse-explorer-foot">' +
      '<p class="warehouse-explorer-foot-text">Choose a thumbnail, or open the photograph for a closer look.</p>' +
      '<button type="button" class="warehouse-explorer-enlarge" data-role="enlarge">' +
      '<i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>' +
      "<span>Enlarge photo</span>" +
      "</button>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ---------- Carousel wiring ---------- */

  function initWarehouseExplorerCarousels(root) {
    var cards = (root || document).querySelectorAll("[data-wxe]");
    if (!cards.length) return;

    cards.forEach(function (card) {
      if (card.dataset.wxeBound === "1") return;
      card.dataset.wxeBound = "1";

      var slides = [];
      var thumbs = card.querySelectorAll(".warehouse-explorer-thumb");
      thumbs.forEach(function (btn) {
        var img = btn.querySelector("img");
        var label = btn.querySelector(".warehouse-explorer-thumb-label");
        slides.push({
          img: img ? img.getAttribute("src") : "",
          full: img ? img.getAttribute("src") : "",
          caption: label ? label.textContent : "",
          alt: img ? img.getAttribute("alt") : "",
        });
      });

      if (!slides.length) return;

      var stageImg = card.querySelector('[data-role="stage-img"]');
      var stageCaption = card.querySelector('[data-role="stage-caption"]');
      var counterNow = card.querySelector(".warehouse-explorer-counter-now");
      var current = 0;

      function pad2Local(n) {
        return n < 10 ? "0" + n : String(n);
      }

      function render() {
        var s = slides[current];
        if (stageImg) {
          stageImg.setAttribute("src", s.img);
          stageImg.setAttribute("alt", s.alt || s.caption);
        }
        if (stageCaption) {
          if (s.caption) {
            stageCaption.textContent = s.caption;
            stageCaption.hidden = false;
          } else {
            stageCaption.textContent = "";
            stageCaption.hidden = true;
          }
        }
        if (counterNow) counterNow.textContent = pad2Local(current + 1);

        thumbs.forEach(function (btn, i) {
          btn.classList.toggle("is-active", i === current);
        });
      }

      function go(step) {
        var n = slides.length;
        current = (current + step + n) % n;
        render();
      }

      card
        .querySelector('[data-role="prev"]')
        .addEventListener("click", function (e) {
          e.preventDefault();
          go(-1);
        });

      card
        .querySelector('[data-role="next"]')
        .addEventListener("click", function (e) {
          e.preventDefault();
          go(1);
        });

      thumbs.forEach(function (btn, i) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          current = i;
          render();
        });
      });

      card.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") {
          go(-1);
        } else if (e.key === "ArrowRight") {
          go(1);
        }
      });
      card.setAttribute("tabindex", "0");

      var enlarge = card.querySelector('[data-role="enlarge"]');
      if (enlarge) {
        enlarge.addEventListener("click", function (e) {
          e.preventDefault();
          var s = slides[current];

          window._galleryModalItems = slides.map(function (it) {
            return { src: it.img, alt: it.alt || it.caption };
          });
          window._galleryModalIndex = current;

          var modal = document.getElementById("galleryModal");
          if (modal) {
            var img = modal.querySelector(".gallery-modal-img");
            if (img) {
              img.src = s.img;
              img.alt = s.alt || s.caption;
            }
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
            document.body.classList.add("modal-open");
          }
        });
      }
    });
  }

  /* ---------- FAQ accordion wiring ---------- */

  function initFaqAccordions(root) {
    var lists = (root || document).querySelectorAll(".stw-faq-list");
    if (!lists.length) return;

    lists.forEach(function (list) {
      if (list.dataset.faqBound === "1") return;
      list.dataset.faqBound = "1";

      var items = list.querySelectorAll(".stw-faq-item");

      items.forEach(function (item) {
        var btn = item.querySelector(".stw-faq-q");
        var answer = item.querySelector(".stw-faq-a");
        if (!btn || !answer) return;

        btn.addEventListener("click", function (e) {
          e.preventDefault();

          var willOpen = !item.classList.contains("is-open");

          items.forEach(function (other) {
            other.classList.remove("is-open");
            var otherBtn = other.querySelector(".stw-faq-q");
            var otherAns = other.querySelector(".stw-faq-a");
            if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
            if (otherAns) otherAns.hidden = true;
          });

          if (willOpen) {
            item.classList.add("is-open");
            btn.setAttribute("aria-expanded", "true");
            answer.hidden = false;
          }
        });
      });
    });
  }

  /* ---------- See The Work In Action — carousel wiring ---------- */

  function initSeeTheWorkInActionCarousel(root) {
    var cards = (root || document).querySelectorAll("[data-stw]");
    if (!cards.length) return;

    cards.forEach(function (card) {
      if (card.dataset.stwBound === "1") return;
      card.dataset.stwBound = "1";

      var slides = card.querySelectorAll(".stw-slide");
      var dots = card.querySelectorAll(".stw-dot");
      var captionNum = card.querySelector('[data-role="caption-num"]');
      var captionLabel = card.querySelector('[data-role="caption-label"]');
      var current = 0;

      if (!slides.length) return;

      function render() {
        slides.forEach(function (s, i) {
          s.hidden = i !== current;
        });

        dots.forEach(function (d, i) {
          d.classList.toggle("is-active", i === current);
        });

        if (captionNum) captionNum.textContent = String(current + 1);
        if (captionLabel)
          captionLabel.textContent = slides[current].dataset.caption || "";
      }

      function go(step) {
        var n = slides.length;
        current = (current + step + n) % n;
        render();
      }

      var prev = card.querySelector('[data-role="prev"]');
      var next = card.querySelector('[data-role="next"]');

      if (prev)
        prev.addEventListener("click", function (e) {
          e.preventDefault();
          go(-1);
        });
      if (next)
        next.addEventListener("click", function (e) {
          e.preventDefault();
          go(1);
        });

      dots.forEach(function (d, i) {
        d.addEventListener("click", function (e) {
          e.preventDefault();
          current = i;
          render();
        });
      });

      card.setAttribute("tabindex", "0");
      card.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
      });
    });
  }

  /* ---------- Pallet Storage magnify → lightbox ---------- */

  function initPalletStorageMagnify(root) {
    var buttons = (root || document).querySelectorAll(
      ".pallet-storage-magnify",
    );
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      if (btn.dataset.psBound === "1") return;
      btn.dataset.psBound = "1";

      btn.addEventListener("click", function (e) {
        e.preventDefault();

        var modal = document.getElementById("galleryModal");
        if (!modal) return;

        var img = modal.querySelector(".gallery-modal-img");
        if (img) {
          img.src = btn.dataset.full || "";
          img.alt = btn.dataset.alt || "";
        }

        window._galleryModalItems = [
          { src: btn.dataset.full || "", alt: btn.dataset.alt || "" },
        ];
        window._galleryModalIndex = 0;

        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
      });
    });
  }

  /* ---------- Receiving & Dispatch → lightbox ---------- */

  function initReceivingDispatch(root) {
    var buttons = (root || document).querySelectorAll(
      ".rd-magnify, .rd-card-link",
    );
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      if (btn.dataset.rdBound === "1") return;
      btn.dataset.rdBound = "1";

      btn.addEventListener("click", function (e) {
        e.preventDefault();

        var modal = document.getElementById("galleryModal");
        if (!modal) return;

        var img = modal.querySelector(".gallery-modal-img");
        if (img) {
          img.src = btn.dataset.full || "";
          img.alt = btn.dataset.alt || "";
        }

        window._galleryModalItems = [
          { src: btn.dataset.full || "", alt: btn.dataset.alt || "" },
        ];
        window._galleryModalIndex = 0;

        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
      });
    });
  }

  /* ===============================================================
   * Variant — See The Work In Action (photo-brief carousel)
   * =============================================================== */

  function renderSectionSeeTheWorkInAction(sec, det, feat, gall, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    var slides = [];

    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g) return;

      var img = (g["file-url"] || g.img || "").trim();
      var alt = (g["alt-text"] || "").trim();
      var caption = (g.caption || g.title || "").trim();

      if (!img && !caption) return;

      slides.push({
        img: img,
        alt: alt || caption || "Warehouse photo",
        caption: caption,
      });
    });

    if (!slides.length) {
      slides.push({
        img: STW_PLACEHOLDER_URL,
        alt: "Illustrative photo",
        caption: "Pallet storage — Hemmant facility",
      });
    }

    var slidesHtml = slides
      .map(function (s, i) {
        return (
          '<div class="stw-slide"' +
          ' data-slide="' +
          i +
          '"' +
          ' data-caption="' +
          esc(s.caption) +
          '"' +
          (i === 0 ? "" : " hidden") +
          ">" +
          '<img src="' +
          esc(s.img) +
          '" alt="' +
          esc(s.alt) +
          '" loading="lazy">' +
          "</div>"
        );
      })
      .join("");

    var dotsHtml = slides
      .map(function (_, i) {
        return (
          '<button type="button" class="stw-dot' +
          (i === 0 ? " is-active" : "") +
          '" data-slide="' +
          i +
          '" aria-label="View slide ' +
          (i + 1) +
          '"></button>'
        );
      })
      .join("");

    var first = slides[0];

    return (
      '<section class="section-block section-block--see-the-work-in-action"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<div class="stw-card" data-stw="stw-' +
      sectionIndex +
      '">' +
      '<div class="stw-stage">' +
      slidesHtml +
      "</div>" +
      '<button type="button" class="stw-nav stw-nav--prev" data-role="prev" aria-label="Previous slide">' +
      '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>' +
      "</button>" +
      '<button type="button" class="stw-nav stw-nav--next" data-role="next" aria-label="Next slide">' +
      '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="stw-caption">' +
      '<span class="stw-caption-num" data-role="caption-num">1</span>' +
      '<span class="stw-caption-label" data-role="caption-label">' +
      esc(first.caption) +
      "</span>" +
      "</div>" +
      '<div class="stw-dots" data-role="dots">' +
      dotsHtml +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ---------- Warehouse Photo Grid ---------- */

  function renderWarehousePhotoGrid(leaves, resolveItemPhoto) {
    if (!Array.isArray(leaves) || !leaves.length) return "";

    var cardsHtml = leaves
      .map(function (leaf) {
        var caption = (leaf && leaf["list-title"]) || "";
        var photo = resolveItemPhoto(caption);

        return (
          '<li class="warehouse-team-card">' +
          '<div class="warehouse-team-card-media">' +
          '<img src="' +
          esc(photo) +
          '" alt="' +
          esc(caption) +
          '" class="warehouse-team-card-img" loading="lazy" ' +
          "onerror=\"this.onerror=null;this.src='" +
          TEAM_PLACEHOLDER_URL +
          "';\">" +
          "</div>" +
          '<div class="warehouse-team-card-body">' +
          (caption
            ? '<h3 class="warehouse-team-card-name">' + esc(caption) + "</h3>"
            : "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    return '<ul class="warehouse-team-grid">' + cardsHtml + "</ul>";
  }

  /* ---------- Warehouse Video Grid ---------- */

  function renderWarehouseVideoGrid(leaves, resolveItemPhoto) {
    if (!Array.isArray(leaves) || !leaves.length) return "";

    var cardsHtml = leaves
      .map(function (leaf) {
        var caption = (leaf && leaf["list-title"]) || "";
        var photo = resolveItemPhoto(caption);

        return (
          '<li class="warehouse-team-video-card">' +
          '<div class="warehouse-team-video-media">' +
          '<img src="' +
          esc(photo) +
          '" alt="' +
          esc(caption) +
          '" class="warehouse-team-video-img" loading="lazy" ' +
          "onerror=\"this.onerror=null;this.src='" +
          TEAM_PLACEHOLDER_URL +
          "';\">" +
          '<span class="warehouse-team-video-play" aria-hidden="true">' +
          '<i class="fa-solid fa-play"></i>' +
          "</span>" +
          '<span class="warehouse-team-video-badge">Video placeholder</span>' +
          "</div>" +
          (caption
            ? '<h3 class="warehouse-team-video-caption">' +
              esc(caption) +
              "</h3>"
            : "") +
          '<a class="warehouse-team-video-cta" href="#">' +
          "Watch video" +
          ' <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
          "</a>" +
          "</li>"
        );
      })
      .join("");

    return '<ul class="warehouse-team-video-grid">' + cardsHtml + "</ul>";
  }

  /* ===============================================================
   * Variant — Pallet Storage
   * =============================================================== */

  function renderSectionPalletStorage(sec, det, feat, gall, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var iconClass = sec["icon-class"] || "fa-solid fa-sitemap";

    var cards = [];

    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g || !g.img) return;
      cards.push({
        img: g.img,
        full: g["file-url"] || g.img,
        caption: g.caption || "",
        alt: g["alt-text"] || "",
      });
    });

    if (!cards.length && feat && feat.img) {
      cards.push({
        img: feat.img,
        full: feat["file-url"] || feat.img,
        caption: feat.caption || "",
        alt: feat["alt-text"] || "",
      });
    }

    if (!cards.length) return "";

    var cardsHtml = cards
      .map(function (c) {
        return (
          '<li class="pallet-storage-card">' +
          '<div class="pallet-storage-card-media">' +
          '<img src="' +
          esc(c.img) +
          '" alt="' +
          esc(c.alt || c.caption) +
          '" class="pallet-storage-card-img" loading="lazy">' +
          '<button type="button" class="pallet-storage-magnify" data-full="' +
          esc(c.full) +
          '" data-alt="' +
          esc(c.alt || c.caption) +
          '" aria-label="Enlarge photo">' +
          '<i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>' +
          "</button>" +
          "</div>" +
          '<div class="pallet-storage-card-foot">' +
          (c.caption
            ? '<h3 class="pallet-storage-card-name">' + esc(c.caption) + "</h3>"
            : "") +
          '<span class="pallet-storage-card-note">Illustrative photo</span>' +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--pallet-storage" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' +
          '<i class="' +
          esc(iconClass) +
          '" aria-hidden="true"></i>' +
          "<span>" +
          esc(eyebrow) +
          "</span>" +
          "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<ul class="pallet-storage-grid">' +
      cardsHtml +
      "</ul>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Receiving & Dispatch
   * =============================================================== */

  function renderSectionReceivingDispatch(sec, det, feat, gall, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var iconClass = sec["icon-class"] || "fa-regular fa-truck";

    var cards = [];

    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g || !g.img) return;
      cards.push({
        img: g.img,
        full: g["file-url"] || g.img,
        caption: g.caption || "",
        alt: g["alt-text"] || "",
      });
    });

    if (!cards.length && feat && feat.img) {
      cards.push({
        img: feat.img,
        full: feat["file-url"] || feat.img,
        caption: feat.caption || "",
        alt: feat["alt-text"] || "",
      });
    }

    if (!cards.length) return "";

    var cardsHtml = cards
      .map(function (c) {
        return (
          '<li class="rd-card">' +
          '<div class="rd-card-media">' +
          '<img src="' +
          esc(c.img) +
          '" alt="' +
          esc(c.alt || c.caption) +
          '" class="rd-card-img" loading="lazy">' +
          '<button type="button" class="rd-magnify" data-full="' +
          esc(c.full) +
          '" data-alt="' +
          esc(c.alt || c.caption) +
          '" aria-label="Enlarge photo">' +
          '<i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>' +
          "</button>" +
          "</div>" +
          '<div class="rd-card-foot">' +
          '<div class="rd-card-foot-row">' +
          (c.caption
            ? '<h3 class="rd-card-name">' + esc(c.caption) + "</h3>"
            : "") +
          '<span class="rd-card-note">Illustrative photo</span>' +
          "</div>" +
          '<button type="button" class="rd-card-link" data-full="' +
          esc(c.full) +
          '" data-alt="' +
          esc(c.alt || c.caption) +
          '">' +
          "<span>View photo</span>" +
          '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>' +
          "</button>" +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--receiving-dispatch" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' +
          '<i class="' +
          esc(iconClass) +
          '" aria-hidden="true"></i>' +
          "<span>" +
          esc(eyebrow) +
          "</span>" +
          "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<ul class="rd-grid">' +
      cardsHtml +
      "</ul>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Warehouse Walkthrough
   * =============================================================== */

  function renderSectionWarehouseWalkthrough(sec, det, feat, index) {
    var eyebrow = sec["tab-label"] || "";
    var title = sec.title || "";
    var lead = det["main-text"] || "";
    var iconClass = sec["icon-class"] || "fa-solid fa-video";

    var previewUrl = ((feat && (feat.img || feat["file-url"])) || "").trim();
    if (!previewUrl) previewUrl = WAREHOUSE_GROUP_PLACEHOLDER_URL;

    var previewHtml =
      '<div class="walkthrough-media">' +
      '<img src="' +
      esc(previewUrl) +
      '" alt="' +
      esc(
        feat && feat["alt-text"]
          ? feat["alt-text"]
          : "Warehouse walkthrough preview",
      ) +
      '" class="walkthrough-media-img" loading="lazy" ' +
      "onerror=\"this.onerror=null;this.src='" +
      WAREHOUSE_GROUP_PLACEHOLDER_URL +
      "';\">" +
      '<button type="button" class="walkthrough-play" aria-label="Play warehouse tour">' +
      '<i class="fa-solid fa-play" aria-hidden="true"></i>' +
      "</button>" +
      '<span class="walkthrough-badge walkthrough-badge--top">Video preview</span>' +
      '<span class="walkthrough-badge walkthrough-badge--bottom">Footage to be supplied.</span>' +
      "</div>";

    return (
      '<section class="section-block section-block--walkthrough" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      index +
      '">' +
      '<div class="container">' +
      '<div class="walkthrough-row">' +
      '<div class="walkthrough-body">' +
      (eyebrow
        ? '<span class="walkthrough-eyebrow">' +
          '<i class="' +
          esc(iconClass) +
          '" aria-hidden="true"></i>' +
          "<span>" +
          esc(eyebrow) +
          "</span>" +
          "</span>"
        : "") +
      (title ? '<h2 class="walkthrough-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="walkthrough-lead">' + esc(lead) + "</p>" : "") +
      '<div class="walkthrough-actions">' +
      '<button type="button" class="walkthrough-cta">' +
      '<i class="fa-solid fa-circle-play" aria-hidden="true"></i>' +
      "<span>Watch warehouse tour</span>" +
      "</button>" +
      "</div>" +
      "</div>" +
      previewHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Delivery Ratings (4-up stat row with colored bars)
   * Structure:
   *   lists-text[]                 → one stat per entry
   *     .list-title                → label       (e.g. "Order Accuracy")
   *     .children[0].list-title    → value       (e.g. "98%")
   *     .children[1]               → { "Color": "<Name>" }
   *                                  .children[0].list-title → color name
   * Design: no section head — just the 4 stats in a row.
   * =============================================================== */

  function renderSectionDeliveryRatings(sec, det, lists, sectionIndex) {
    if (!Array.isArray(lists) || !lists.length) return "";

    // Map human-readable color names from the WP data to CSS classes.
    function colorSlug(name) {
      var n = String(name || "")
        .toLowerCase()
        .trim();
      if (n === "cyan") return "cyan";
      if (n === "teal") return "teal";
      if (n === "amber") return "amber";
      if (n === "coral") return "coral";
      return "";
    }

    var itemsHtml = lists
      .map(function (item) {
        var label = (item["list-title"] || "").trim();
        var kids = Array.isArray(item.children) ? item.children : [];

        // Value = first child's title
        var value = (kids[0] && kids[0]["list-title"]) || "";

        // Color = second child's first grandchild's title
        var colorName = "";
        if (kids[1]) {
          var colorKids = Array.isArray(kids[1].children)
            ? kids[1].children
            : [];
          if (colorKids[0]) {
            colorName = colorKids[0]["list-title"] || "";
          }
        }

        var slug = colorSlug(colorName);
        var colorClass = slug ? " section-stat--" + slug : "";

        return (
          '<li class="section-stat' +
          colorClass +
          '">' +
          '<span class="section-stat-bar" aria-hidden="true"></span>' +
          (value
            ? '<span class="section-stat-value">' + esc(value) + "</span>"
            : "") +
          (label
            ? '<span class="section-stat-label">' + esc(label) + "</span>"
            : "") +
          "</li>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--delivery-ratings" data-section-id="' +
      esc(sec["section-id"] || "") +
      '" data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<ul class="section-stats">' +
      itemsHtml +
      "</ul>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Built Around Your Industry
   * =============================================================== */

  function renderSectionBuiltAroundYourIndustry(
    sec,
    det,
    lists,
    gall,
    sectionIndex,
  ) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    // Index gallery images by their Title field (exact match).
    var galleryByTitle = {};
    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g) return;
      var key = String(g.title || "")
        .trim()
        .toLowerCase();
      var url = String(g["file-url"] || g.img || "").trim();
      if (key && url && !galleryByTitle[key]) {
        galleryByTitle[key] = url;
      }
    });

    function tintFor(label) {
      var l = String(label || "").toLowerCase();
      if (l.indexOf("e-commerce") !== -1 || l.indexOf("retail") !== -1)
        return "stw-tint-blue";
      if (l.indexOf("wholesale") !== -1 || l.indexOf("distribution") !== -1)
        return "stw-tint-teal";
      if (l.indexOf("food") !== -1 || l.indexOf("beverage") !== -1)
        return "stw-tint-pink";
      if (l.indexOf("manufactur") !== -1 || l.indexOf("industrial") !== -1)
        return "stw-tint-amber";
      return "stw-tint-blue";
    }

    var cardsHtml = (Array.isArray(lists) ? lists : [])
      .map(function (item) {
        var label = item["list-title"] || "";
        if (!label) return "";

        var kids = Array.isArray(item.children) ? item.children : [];

        // child[0] = description, child[1] = "Icon" with the icon slug inside.
        var desc = (kids[0] && kids[0]["list-title"]) || "";

        var iconKey = "";
        if (
          kids[1] &&
          String(kids[1]["list-title"] || "").toLowerCase() === "icon"
        ) {
          var iconChild =
            Array.isArray(kids[1].children) && kids[1].children[0];
          if (iconChild)
            iconKey = String(iconChild["list-title"] || "")
              .trim()
              .toLowerCase();
        }

        var imgUrl = iconKey ? galleryByTitle[iconKey] || "" : "";
        var tint = tintFor(label);

        var iconHtml = imgUrl
          ? '<span class="stw-card-icon ' +
            tint +
            '">' +
            '<img src="' +
            esc(imgUrl) +
            '" alt="' +
            esc(label) +
            '" loading="lazy">' +
            "</span>"
          : "";

        return (
          '<li class="stw-card-item">' +
          iconHtml +
          (label ? '<h3 class="stw-card-title">' + esc(label) + "</h3>" : "") +
          (desc ? '<p class="stw-card-desc">' + esc(desc) + "</p>" : "") +
          "</li>"
        );
      })
      .join("");

    if (!cardsHtml) return "";

    return (
      '<section class="section-block section-block--built-around-your-industry"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<ul class="stw-card-grid">' +
      cardsHtml +
      "</ul>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Testimonial
   * =============================================================== */

  function renderSectionTestimonial(sec, det, lists, sectionIndex) {
    var quote = sec.title || "";

    var initials = "";
    var name = "";
    var role = "";

    if (lists[0] && lists[0]["list-title"]) {
      initials = (lists[0]["list-title"] || "").trim();
    }
    if (lists[1]) {
      name = (lists[1]["list-title"] || "").trim();
      var nameKids = Array.isArray(lists[1].children) ? lists[1].children : [];
      if (nameKids[0]) {
        role = (nameKids[0]["list-title"] || "").trim();
      }
    }

    if (!quote) return "";

    return (
      '<section class="section-block section-block--testimonial"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="stw-testi-card">' +
      '<div class="stw-testi-left">' +
      '<span class="stw-testi-quote" aria-hidden="true">&ldquo;</span>' +
      (initials || name
        ? '<div class="stw-testi-person">' +
          (initials
            ? '<span class="stw-testi-avatar">' + esc(initials) + "</span>"
            : "") +
          '<div class="stw-testi-meta">' +
          (name
            ? '<span class="stw-testi-name">' + esc(name) + "</span>"
            : "") +
          (role
            ? '<span class="stw-testi-role">' + esc(role) + "</span>"
            : "") +
          "</div>" +
          "</div>"
        : "") +
      "</div>" +
      '<div class="stw-testi-right">' +
      '<blockquote class="stw-testi-text">' +
      esc(quote) +
      "</blockquote>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Networks Behind The Process (grouped logo cards)
   * =============================================================== */

  function renderSectionNetworksBehindTheProcess(
    sec,
    det,
    lists,
    gall,
    sectionIndex,
  ) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    // Index gallery items by their title (exact, lower-cased) → image URL
    var galleryByTitle = {};
    (Array.isArray(gall) ? gall : []).forEach(function (g) {
      if (!g) return;
      var key = String(g.title || "")
        .trim()
        .toLowerCase();
      var url = String(g["file-url"] || g.img || "").trim();
      if (key && url && !galleryByTitle[key]) {
        galleryByTitle[key] = url;
      }
    });

    // Build one <li> per child — logo when matched, placeholder otherwise.
    function renderCard(child) {
      var label = (child && child["list-title"]) || "";
      if (!label) return "";

      var key = String(label).trim().toLowerCase();
      var imgUrl = galleryByTitle[key] || "";

      if (imgUrl) {
        return (
          '<li class="stw-partner-card is-logo">' +
          '<img src="' +
          esc(imgUrl) +
          '" alt="' +
          esc(label) +
          '" loading="lazy">' +
          "</li>"
        );
      }

      return (
        '<li class="stw-partner-card is-placeholder">' +
        '<span class="stw-partner-card-label">' +
        esc(label) +
        "</span>" +
        "</li>"
      );
    }

    // Build a group per top-level list item.
    var groupsHtml = (Array.isArray(lists) ? lists : [])
      .map(function (group) {
        if (!group) return "";
        var groupLabel = (group["list-title"] || "").trim();
        var kids = Array.isArray(group.children) ? group.children : [];

        var cardsHtml = kids.map(renderCard).join("");
        if (!cardsHtml) return "";

        // WMS group only has 1 child → narrow single-card layout.
        var gridClass =
          kids.length === 1
            ? "stw-partner-grid stw-partner-grid--single"
            : "stw-partner-grid";

        return (
          '<div class="stw-partner-group">' +
          (groupLabel
            ? '<h3 class="stw-partner-group-label">' + esc(groupLabel) + "</h3>"
            : "") +
          '<ul class="' +
          gridClass +
          '">' +
          cardsHtml +
          "</ul>" +
          "</div>"
        );
      })
      .join("");

    if (!groupsHtml) return "";

    return (
      '<section class="section-block section-block--networks-behind-the-process"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<div class="stw-partner-groups">' +
      groupsHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — How It Works Banner (wide placeholder / image)
   * =============================================================== */

  function renderSectionHowItWorksBanner(sec, det, feat, sectionIndex) {
    var brief = (det["sub-text"] || "").trim();

    if (!brief) {
      brief =
        'A wide, single banner photo (not another icon grid) showing steps 03/04 for real: a staff member scanning a barcode on a pallet mid-aisle, WMS handheld visible in shot, warehouse racking stretching into soft focus behind them. Natural warehouse lighting, not staged studio lighting. This is the one photo on this page that should feel the most "real 3PL floor" — it\'s doing the job of proving steps 3 and 4 actually happen, right after four fairly abstract numbered cards.';
    }

    // Use the feature image when present, otherwise show the dashed placeholder.
    var imgUrl = "";
    if (feat) {
      imgUrl = (feat.img || feat["file-url"] || "").trim();
    }

    var mediaHtml;
    if (imgUrl) {
      mediaHtml =
        '<div class="stw-banner-image">' +
        '<img src="' +
        esc(imgUrl) +
        '" alt="' +
        esc(feat["alt-text"] || "") +
        '" loading="lazy">' +
        "</div>";
    } else {
      mediaHtml =
        '<div class="stw-banner-ph">' +
        '<span class="stw-banner-ph-tag">Photo Brief — The Process in Action</span>' +
        '<p class="stw-banner-ph-text">' +
        esc(brief) +
        "</p>" +
        "</div>";
    }

    return (
      '<section class="section-block section-block--how-it-works-banner"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      mediaHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Clear Answers (FAQs)
   * =============================================================== */

  function renderSectionClearAnswersFaqs(sec, det, lists, acts, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";

    var buttons = acts && Array.isArray(acts.buttons) ? acts.buttons : [];
    var links = acts && Array.isArray(acts.links) ? acts.links : [];

    var itemsHtml = (Array.isArray(lists) ? lists : [])
      .map(function (item) {
        if (!item) return "";
        var question = (item["list-title"] || "").trim();
        if (!question) return "";

        var kids = Array.isArray(item.children) ? item.children : [];
        var answer =
          kids[0] && kids[0]["list-title"]
            ? String(kids[0]["list-title"]).trim()
            : "";

        return (
          '<li class="stw-faq-item">' +
          '<button type="button" class="stw-faq-q" aria-expanded="false">' +
          '<span class="stw-faq-q-text">' +
          esc(question) +
          "</span>" +
          '<span class="stw-faq-q-icon" aria-hidden="true"></span>' +
          "</button>" +
          (answer
            ? '<div class="stw-faq-a" hidden>' +
              '<p class="stw-faq-a-text">' +
              esc(answer) +
              "</p>" +
              "</div>"
            : "") +
          "</li>"
        );
      })
      .join("");

    if (!itemsHtml) return "";

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--clear-answers-faqs"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head center">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      "</div>" +
      '<ul class="stw-faq-list">' +
      itemsHtml +
      "</ul>" +
      (actionsHtml
        ? '<div class="stw-faq-actions">' + actionsHtml + "</div>"
        : "") +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — About Us Local
   * =============================================================== */

  function renderSectionAboutUsLocal(sec, det, lists, acts, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var brief = (det["sub-text"] || "").trim();

    if (!brief) {
      brief =
        'Candid, un-posed photo of 2–3 warehouse/office staff genuinely talking near the racking or a loading dock — not a stiff corporate lineup. Should feel like "a real local team," reinforcing the client-direct positioning against larger national competitors.';
    }

    var buttons = acts && Array.isArray(acts.buttons) ? acts.buttons : [];
    var links = acts && Array.isArray(acts.links) ? acts.links : [];

    // Stats: label = list-title, value = children[0].list-title
    var statsHtml = (Array.isArray(lists) ? lists : [])
      .map(function (item) {
        if (!item) return "";
        var label = (item["list-title"] || "").trim();
        var kids = Array.isArray(item.children) ? item.children : [];
        var value =
          kids[0] && kids[0]["list-title"]
            ? String(kids[0]["list-title"]).trim()
            : "";

        if (!label && !value) return "";

        return (
          '<li class="stw-about-stat">' +
          (value
            ? '<span class="stw-about-stat-value">' + esc(value) + "</span>"
            : "") +
          (label
            ? '<span class="stw-about-stat-label">' + esc(label) + "</span>"
            : "") +
          "</li>"
        );
      })
      .join("");

    var actionsHtml = buildSectionActions(links, buttons);

    return (
      '<section class="section-block section-block--about-us-local"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="stw-about-row">' +
      '<div class="stw-about-media">' +
      '<div class="stw-about-ph">' +
      '<span class="stw-about-ph-tag">About image brief</span>' +
      '<p class="stw-about-ph-text">' +
      esc(brief) +
      "</p>" +
      "</div>" +
      "</div>" +
      '<div class="stw-about-body">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      (statsHtml ? '<ul class="stw-about-stats">' + statsHtml + "</ul>" : "") +
      (actionsHtml
        ? '<div class="stw-about-actions">' + actionsHtml + "</div>"
        : "") +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Real Results (Case Studies)
   * =============================================================== */

  function renderSectionRealResults(sec, det, lists, acts, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    var buttons = acts && Array.isArray(acts.buttons) ? acts.buttons : [];
    var links = acts && Array.isArray(acts.links) ? acts.links : [];

    // Metric accent colour cycles per card.
    var metricTints = [
      "stw-metric-amber",
      "stw-metric-teal",
      "stw-metric-coral",
    ];

    var cardsHtml = (Array.isArray(lists) ? lists : [])
      .map(function (item, i) {
        if (!item) return "";

        var tag = (item["list-title"] || "").trim();
        var kids = Array.isArray(item.children) ? item.children : [];

        var cardTitle = "";
        var cardDesc = "";
        var metricLabel = "";
        var metricValue = "";

        // child[0] = title + nested description
        if (kids[0]) {
          cardTitle = (kids[0]["list-title"] || "").trim();
          var descKids = Array.isArray(kids[0].children)
            ? kids[0].children
            : [];
          if (descKids[0]) {
            cardDesc = (descKids[0]["list-title"] || "").trim();
          }
        }

        // child[1] = metric (label + value) — but sometimes only one child exists
        if (kids[1]) {
          metricLabel = (kids[1]["list-title"] || "").trim();
          var metricKids = Array.isArray(kids[1].children)
            ? kids[1].children
            : [];
          if (metricKids[0]) {
            metricValue = (metricKids[0]["list-title"] || "").trim();
          }
        } else if (kids[0]) {
          // Fallback for card 3 style: label on child[0], value on child[0].children[0]
          var fallbackKids = Array.isArray(kids[0].children)
            ? kids[0].children
            : [];
          if (fallbackKids[0]) {
            metricValue = (fallbackKids[0]["list-title"] || "").trim();
            metricLabel = cardTitle;
            cardTitle = "";
            cardDesc = "";
          }
        }

        var tint = metricTints[i % metricTints.length];

        return (
          '<li class="stw-case-card">' +
          (tag ? '<span class="stw-case-tag">' + esc(tag) + "</span>" : "") +
          (cardTitle
            ? '<h3 class="stw-case-title">' + esc(cardTitle) + "</h3>"
            : "") +
          (cardDesc
            ? '<p class="stw-case-desc">' + esc(cardDesc) + "</p>"
            : "") +
          (metricValue || metricLabel
            ? '<div class="stw-case-metric ' +
              tint +
              '">' +
              (metricValue
                ? '<span class="stw-case-metric-value">' +
                  esc(metricValue) +
                  "</span>"
                : "") +
              (metricLabel
                ? '<span class="stw-case-metric-label">' +
                  esc(metricLabel) +
                  "</span>"
                : "") +
              "</div>"
            : "") +
          "</li>"
        );
      })
      .join("");

    if (!cardsHtml) return "";

    var actionsHtml = "";
    if (buttons.length || links.length) {
      actionsHtml =
        '<div class="stw-case-actions">' +
        buildSectionActions(links, buttons) +
        "</div>";
    }

    return (
      '<section class="section-block section-block--real-results"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="section-head center">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      "</div>" +
      '<ul class="stw-case-grid">' +
      cardsHtml +
      "</ul>" +
      actionsHtml +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Technology & Visibility
   * =============================================================== */

  function renderSectionTechVisibility(sec, det, lists, sectionIndex) {
    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";
    var brief = (det["sub-text"] || "").trim();

    if (!brief) {
      brief =
        'A clean, simplified screenshot-style graphic of a stock dashboard: a bar chart of stock levels by SKU, a small map pin showing "Hemmant, QLD," and a "Last updated: just now" tag. Doesn\'t need to be a real functioning screenshot — a stylised UI mock in the site\'s navy/blue/amber palette communicates "we have real tech" even before the portal exists.';
    }

    var primary =
      lists[0] && Array.isArray(lists[0].children) ? lists[0].children : [];
    var secondary =
      lists[1] && Array.isArray(lists[1].children) ? lists[1].children : [];

    var tints = [
      "stw-tint-blue",
      "stw-tint-teal",
      "stw-tint-amber",
      "stw-tint-pink",
    ];

    var primaryHtml = primary
      .map(function (item, i) {
        var text = (item && item["list-title"]) || "";
        if (!text) return "";
        var tint = tints[i % tints.length];
        return (
          '<li class="stw-tech-primary-item">' +
          '<span class="stw-tech-primary-badge ' +
          tint +
          '">' +
          '<i class="fa-solid fa-check" aria-hidden="true"></i>' +
          "</span>" +
          '<span class="stw-tech-primary-text">' +
          esc(text) +
          "</span>" +
          "</li>"
        );
      })
      .join("");

    var secondaryHtml = secondary
      .map(function (item) {
        var text = (item && item["list-title"]) || "";
        if (!text) return "";
        return (
          '<li class="stw-tech-chip">' +
          '<i class="fa-solid fa-check" aria-hidden="true"></i>' +
          "<span>" +
          esc(text) +
          "</span>" +
          "</li>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--tech-visibility"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="stw-tech-row">' +
      '<div class="stw-tech-body">' +
      (eyebrow
        ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
        : "") +
      (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
      (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
      (primaryHtml
        ? '<ul class="stw-tech-primary">' + primaryHtml + "</ul>"
        : "") +
      (secondaryHtml
        ? '<ul class="stw-tech-chips">' + secondaryHtml + "</ul>"
        : "") +
      "</div>" +
      '<div class="stw-tech-media">' +
      '<div class="stw-tech-ph">' +
      '<span class="stw-tech-ph-tag">Dashboard mock brief</span>' +
      '<p class="stw-tech-ph-text">' +
      esc(brief) +
      "</p>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Services Grid
   * Fetches the main menu, finds the "Services" item, and renders
   * each child as a card.
   * =============================================================== */

  function renderSectionServicesGrid(sec, det, sectionIndex) {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";

    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    // Icon tints cycle through a palette; 6 services → 6 tints.
    var tints = [
      "stw-tint-blue",
      "stw-tint-teal",
      "stw-tint-amber",
      "stw-tint-navy",
      "stw-tint-red",
      "stw-tint-yellow",
    ];

    loaderStart();

    return fetch(API + "/menu", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : { menu: [] };
      })
      .then(function (data) {
        var items = (data && data.menu) || [];

        // Find the top-level "Services" item.
        var services = null;
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].label || "").toLowerCase() === "services") {
            services = items[i];
            break;
          }
        }

        var children =
          services && Array.isArray(services.children) ? services.children : [];

        // Exclude the current page's service.
        function lastSegment(url) {
          var clean = String(url || "").split(/[?#]/)[0];
          clean = clean.replace(/\/+$/, "");
          var parts = clean.split("/").filter(Boolean);
          return parts.length ? parts[parts.length - 1] : "";
        }
        var currentSlug = lastSegment(window.location.pathname);
        children = children.filter(function (item) {
          if (!currentSlug) return true;
          return lastSegment(item.link || "") !== currentSlug;
        });

        var cardsHtml = children
          .map(function (item, i) {
            var label = item.label || "";
            var desc = item.description || "";
            var icon = item.icon || "fa-solid fa-cube";
            var link = item.link || "#";
            var tint = tints[i % tints.length];

            return (
              '<li class="stw-service-card">' +
              '<span class="stw-service-icon ' +
              tint +
              '">' +
              '<i class="' +
              esc(icon) +
              '" aria-hidden="true"></i>' +
              "</span>" +
              (label
                ? '<h3 class="stw-service-title">' + esc(label) + "</h3>"
                : "") +
              (desc
                ? '<p class="stw-service-desc">' + esc(desc) + "</p>"
                : "") +
              '<a class="stw-service-link" href="' +
              esc(link) +
              '">' +
              "Learn more" +
              ' <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
              "</a>" +
              "</li>"
            );
          })
          .join("");

        return (
          '<section class="section-block section-block--services-grid"' +
          ' data-section-id="' +
          esc(sec["section-id"] || "") +
          '"' +
          ' data-section-index="' +
          sectionIndex +
          '">' +
          '<div class="container">' +
          '<div class="section-head">' +
          (eyebrow
            ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
            : "") +
          (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
          (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
          "</div>" +
          '<ul class="stw-service-grid">' +
          cardsHtml +
          "</ul>" +
          "</div>" +
          "</section>"
        );
      })
      .catch(function (err) {
        console.error("[services-grid] failed:", err);
        return "";
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
 * Variant — Explore Other Services
 * Fetches the main menu, finds "Services", and renders each child
 * as a card — excluding the current page's service.
 * =============================================================== */

  function renderSectionExploreOtherServices(sec, det, sectionIndex) {
      var API =
        (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";

      var eyebrow = sec["tab-label"] || sec.title || "";
      var title = sec["sub-title"] || "";

      var tints = [
        "stw-tint-blue",
        "stw-tint-teal",
        "stw-tint-amber",
        "stw-tint-navy",
        "stw-tint-red",
        "stw-tint-yellow",
      ];

      // Current page slug — normalized last segment of the URL path.
      function lastSegment(url) {
        var clean = String(url || "").split(/[?#]/)[0]; // strip query/hash
        clean = clean.replace(/\/+$/, "");               // strip trailing slash
        var parts = clean.split("/").filter(Boolean);
        return parts.length ? parts[parts.length - 1] : "";
      }

      var currentSlug = lastSegment(window.location.pathname);

      loaderStart();

      return fetch(API + "/menu", { credentials: "same-origin" })
        .then(function (r) {
          return r.ok ? r.json() : { menu: [] };
        })
        .then(function (data) {
          var items = (data && data.menu) || [];

          // Find the top-level "Services" item.
          var services = null;
          for (var i = 0; i < items.length; i++) {
            if (String(items[i].label || "").toLowerCase() === "services") {
              services = items[i];
              break;
            }
          }

          var children =
            services && Array.isArray(services.children) ? services.children : [];

          // Exclude the current page's service.
          function lastSegment(url) {
            var clean = String(url || "").split(/[?#]/)[0];
            clean = clean.replace(/\/+$/, "");
            var parts = clean.split("/").filter(Boolean);
            return parts.length ? parts[parts.length - 1] : "";
          }
          var currentSlug = lastSegment(window.location.pathname);
          children = children.filter(function (item) {
            if (!currentSlug) return true;
            return lastSegment(item.link || "") !== currentSlug;
          });

          // Exclude the current page's service.
          children = children.filter(function (item) {
            if (!currentSlug) return true;
            return lastSegment(item.link || "") !== currentSlug;
          });

          var cardsHtml = children
            .map(function (item, i) {
              var label = item.label || "";
              var desc = item.description || "";
              var icon = item.icon || "fa-solid fa-cube";
              var link = item.link || "#";
              var tint = tints[i % tints.length];

              return (
                '<li class="stw-service-card">' +
                '<span class="stw-service-icon ' +
                tint +
                '">' +
                '<i class="' +
                esc(icon) +
                '" aria-hidden="true"></i>' +
                "</span>" +
                (label
                  ? '<h3 class="stw-service-title">' + esc(label) + "</h3>"
                  : "") +
                (desc
                  ? '<p class="stw-service-desc">' + esc(desc) + "</p>"
                  : "") +
                '<a class="stw-service-link" href="' +
                esc(link) +
                '">' +
                "View details" +
                ' <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
                "</a>" +
                "</li>"
              );
            })
            .join("");

          return (
            '<section class="section-block section-block--explore-other-services"' +
            ' data-section-id="' +
            esc(sec["section-id"] || "") +
            '"' +
            ' data-section-index="' +
            sectionIndex +
            '">' +
            '<div class="container">' +
            '<div class="section-head">' +
            (eyebrow
              ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
              : "") +
            (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
            "</div>" +
            '<ul class="stw-service-grid">' +
            cardsHtml +
            "</ul>" +
            "</div>" +
            "</section>"
          );
        })
        .catch(function (err) {
          console.error("[explore-other-services] failed:", err);
          return "";
        })
        .finally(loaderEnd);
  }

    /* ===============================================================
   * Variant — Challenges / Solution (two-column labelled cards)
   * Structure:
   *   lists-text[0].list-title  → left card label  ("The Challenge")
   *   lists-text[0].children[0].list-title → left card body
   *   lists-text[1].list-title  → right card label ("The Solution")
   *   lists-text[1].children[0].list-title → right card body
   * =============================================================== */

  function renderSectionChallenges(sec, det, lists, sectionIndex) {

    if (!Array.isArray(lists) || lists.length < 2) return "";

    function card(item, index) {
      if (!item) return "";

      var label = (item["list-title"] || "").trim();
      var kids = Array.isArray(item.children) ? item.children : [];
      var body = (kids[0] && kids[0]["list-title"]) || "";

      var tone = index === 0 ? "challenge" : "solution";

      return (
        '<article class="challenges-card challenges-card--' +
        tone +
        '">' +
        (label
          ? '<span class="challenges-card-label">' + esc(label) + "</span>"
          : "") +
        (body
          ? '<p class="challenges-card-body">' + esc(body) + "</p>"
          : "") +
        "</article>"
      );
    }

    var cardsHtml = lists
      .slice(0, 2)
      .map(function (item, i) {
        return card(item, i);
      })
      .join("");

    return (
      '<section class="section-block section-block--challenges"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="challenges-grid">' +
      cardsHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

    /* ===============================================================
   * Variant — The Results (delivery ratings / stat row)
   * Same visual language as Challenges, but each item is a
   * number + label + coloured bar.
   * Structure:
   *   lists-text[i].list-title            → stat label
   *   lists-text[i].children[0].list-title → stat value
   *   lists-text[i].children[1].children[0].list-title → colour name
   * =============================================================== */

  function renderSectionTheResultsRatings(sec, det, lists, sectionIndex) {
    var eyebrow = sec["tab-label"] || sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    if (!Array.isArray(lists) || !lists.length) return "";

    function colorSlug(name) {
      var n = String(name || "").toLowerCase().trim();
      if (n === "cyan") return "cyan";
      if (n === "teal") return "teal";
      if (n === "amber") return "amber";
      if (n === "coral") return "coral";
      return "cyan";
    }

    var cardsHtml = lists
      .map(function (item) {
        if (!item) return "";

        var label = (item["list-title"] || "").trim();
        var kids = Array.isArray(item.children) ? item.children : [];
        var value = (kids[0] && kids[0]["list-title"]) || "";

        var colorName = "";
        if (kids[1]) {
          var colorKids = Array.isArray(kids[1].children)
            ? kids[1].children
            : [];
          if (colorKids[0]) {
            colorName = colorKids[0]["list-title"] || "";
          }
        }

        var slug = colorSlug(colorName);

        return (
          '<article class="results-rating results-rating--' +
          slug +
          '">' +
          '<span class="results-rating-bar" aria-hidden="true"></span>' +
          (value
            ? '<span class="results-rating-value">' + esc(value) + "</span>"
            : "") +
          (label
            ? '<span class="results-rating-label">' + esc(label) + "</span>"
            : "") +
          "</article>"
        );
      })
      .join("");

    return (
      '<section class="section-block section-block--the-results-delivery-ratings"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      (eyebrow || title || lead
        ? '<div class="section-head">' +
          (eyebrow
            ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
            : "") +
          (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
          (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
          "</div>"
        : "") +
      '<div class="results-ratings-grid">' +
      cardsHtml +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — WMS Tracked (checklist + photo-brief placeholder)
   * =============================================================== */

  function renderSectionWmsTracked(sec, det, lists, acts, sectionIndex) {
    var brief = (det["main-text"] || "").trim();

    if (!brief) {
      brief =
        "Wide interior shot of the pallet racking aisles, clean and well organised, a forklift mid-aisle carrying a pallet, natural light spilling in from the roller doors. The shot should communicate scale and order — this is the 'total control' promise made visible.";
    }

    var buttons = acts && Array.isArray(acts.buttons) ? acts.buttons : [];
    var links = acts && Array.isArray(acts.links) ? acts.links : [];

    // All list items render as identical checklist rows.
    var checklist = [];

    (Array.isArray(lists) ? lists : []).forEach(function (item) {
      var text = (item && item["list-title"]) || "";
      text = text.trim();
      if (!text) return;

      checklist.push(text);
    });

    // Cycle check-badge tint colours across the checklist items.
    var tints = [
      "stw-tint-blue",
      "stw-tint-teal",
      "stw-tint-amber",
      "stw-tint-pink",
    ];

    var itemsHtml = checklist
      .map(function (text, i) {
        var tint = tints[i % tints.length];
        return (
          '<li class="stw-secure-item">' +
          '<span class="stw-secure-badge ' +
          tint +
          '">' +
          '<i class="fa-solid fa-check" aria-hidden="true"></i>' +
          "</span>" +
          '<span class="stw-secure-text">' +
          esc(text) +
          "</span>" +
          "</li>"
        );
      })
      .join("");

    // Actions — force the FIRST button to amber primary, the rest to outline.
    var actionsParts = [];

    buttons.forEach(function (b, i) {
      if (!b || !b.label) return;
      var cls = i === 0 ? "btn btn-primary is-amber" : "btn btn-outline";
      actionsParts.push(
        '<a class="' +
          cls +
          '" href="#">' +
          esc(b.label) +
          (b.icon
            ? ' <i class="' + esc(b.icon) + '" aria-hidden="true"></i>'
            : "") +
          "</a>",
      );
    });

    links.forEach(function (l) {
      if (!l || !l.label) return;
      actionsParts.push(
        '<a class="section-link" href="' +
          esc(resolveLink(l.link || "#")) +
          '">' +
          esc(l.label) +
          (l.icon
            ? ' <i class="' + esc(l.icon) + '" aria-hidden="true"></i>'
            : "") +
          "</a>",
      );
    });

    var actionsHtml = actionsParts.length
      ? '<div class="section-actions">' + actionsParts.join("") + "</div>"
      : "";

    return (
      '<section class="section-block section-block--wms-tracked"' +
      ' data-section-id="' +
      esc(sec["section-id"] || "") +
      '"' +
      ' data-section-index="' +
      sectionIndex +
      '">' +
      '<div class="container">' +
      '<div class="stw-secure-row">' +
      '<div class="stw-secure-body">' +

      (itemsHtml ? '<ul class="stw-secure-list">' + itemsHtml + "</ul>" : "") +
      (actionsHtml
        ? '<div class="stw-secure-actions">' + actionsHtml + "</div>"
        : "") +
      "</div>" +
      '<div class="stw-secure-media">' +
      '<div class="stw-secure-ph">' +
      '<span class="stw-secure-ph-tag">Photo Brief</span>' +
      '<p class="stw-secure-ph-text">' +
      esc(brief) +
      "</p>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  /* ===============================================================
   * Variant — Pick A Service (Services page grid)
   * Fetches the main menu, finds the "Services" item, and renders
   * each child as a card with title + description + View details.
   * =============================================================== */

  function renderSectionPickAService(sec, det, sectionIndex) {
    var API =
      (window.BL_CONFIG && window.BL_CONFIG.apiBase) || "/wp-json/brisbane";

    var eyebrow = sec.title || "";
    var title = sec["sub-title"] || "";
    var lead = det["main-text"] || "";

    // Icon tints cycle through a palette; 6 services → 6 tints.
    var tints = [
      "stw-tint-blue",
      "stw-tint-teal",
      "stw-tint-amber",
      "stw-tint-navy",
      "stw-tint-red",
      "stw-tint-yellow",
    ];

    loaderStart();

    return fetch(API + "/menu", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : { menu: [] };
      })
      .then(function (data) {
        var items = (data && data.menu) || [];

        // Find the top-level "Services" item.
        var services = null;
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].label || "").toLowerCase() === "services") {
            services = items[i];
            break;
          }
        }

        var children =
          services && Array.isArray(services.children) ? services.children : [];

        // Exclude the current page's service.
        function lastSegment(url) {
          var clean = String(url || "").split(/[?#]/)[0];
          clean = clean.replace(/\/+$/, "");
          var parts = clean.split("/").filter(Boolean);
          return parts.length ? parts[parts.length - 1] : "";
        }
        var currentSlug = lastSegment(window.location.pathname);
        children = children.filter(function (item) {
          if (!currentSlug) return true;
          return lastSegment(item.link || "") !== currentSlug;
        });

        var cardsHtml = children
          .map(function (item, i) {
            var label = item.label || "";
            var desc = item.description || "";
            var icon = item.icon || "fa-solid fa-cube";
            var link = item.link || "#";
            var tint = tints[i % tints.length];

            return (
              '<li class="stw-service-card">' +
              '<span class="stw-service-icon ' +
              tint +
              '">' +
              '<i class="' +
              esc(icon) +
              '" aria-hidden="true"></i>' +
              "</span>" +
              (label
                ? '<h3 class="stw-service-title">' + esc(label) + "</h3>"
                : "") +
              (desc
                ? '<p class="stw-service-desc">' + esc(desc) + "</p>"
                : "") +
              '<a class="stw-service-link" href="' +
              esc(link) +
              '">' +
              "View details" +
              ' <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
              "</a>" +
              "</li>"
            );
          })
          .join("");

        return (
          '<section class="section-block section-block--pick-a-service"' +
          ' data-section-id="' +
          esc(sec["section-id"] || "") +
          '"' +
          ' data-section-index="' +
          sectionIndex +
          '">' +
          '<div class="container">' +
          '<div class="section-head">' +
          (eyebrow
            ? '<span class="section-eyebrow">' + esc(eyebrow) + "</span>"
            : "") +
          (title ? '<h2 class="section-title">' + esc(title) + "</h2>" : "") +
          (lead ? '<p class="section-main-text">' + esc(lead) + "</p>" : "") +
          "</div>" +
          '<ul class="stw-service-grid">' +
          cardsHtml +
          "</ul>" +
          "</div>" +
          "</section>"
        );
      })
      .catch(function (err) {
        console.error("[pick-a-service] failed:", err);
        return "";
      })
      .finally(loaderEnd);
  }

  /* ===============================================================
   * Shared — section actions
   * =============================================================== */

  function buildSectionActions(links, buttons) {
    var parts = [];

    links.forEach(function (l) {
      if (!l.label) return;
      parts.push(
        '<a class="section-link" href="' +
          esc(resolveLink(l.link || "#")) +
          '">' +
          esc(l.label) +
          (l.icon
            ? ' <i class="' + esc(l.icon) + '" aria-hidden="true"></i>'
            : "") +
          "</a>",
      );
    });

    buttons.forEach(function (b) {
      if (!b.label) return;

      var wpClass = (b.class || "").toLowerCase();
      var isFilled =
        wpClass.indexOf("has-white-background-color") !== -1 ||
        wpClass.indexOf("has-navy-background-color") !== -1 ||
        wpClass.indexOf("has-black-background-color") !== -1 ||
        wpClass.indexOf("has-gray-background-color") !== -1 ||
        wpClass.indexOf("has-primary-background-color") !== -1;

      var btnClass = isFilled ? "btn btn-primary" : "btn btn-outline";

      parts.push(
        '<a class="' +
          btnClass +
          '" href="#">' +
          esc(b.label) +
          (b.icon
            ? ' <i class="' + esc(b.icon) + '" aria-hidden="true"></i>'
            : "") +
          "</a>",
      );
    });

    return parts.length
      ? '<div class="section-actions">' + parts.join("") + "</div>"
      : "";
  }

    /* ===============================================================
   * Challenges + The Results — interactive enhancements
   * - Staggered reveal on scroll
   * - Bar-fill animation (Results)
   * - Counting numbers (Results)
   * All disabled under prefers-reduced-motion.
   * =============================================================== */

  function initInteractiveSections(root) {
    var scope = root || document;

    var cards = scope.querySelectorAll(
      ".challenges-card, .results-rating"
    );
    if (!cards.length) return;

    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- Counting helper ----

    function parseNumeric(str) {
      // Split into prefix / number / suffix so "99.9%" → { pre:"", num:99.9, dec:1, suf:"%" }
      var m = String(str).match(/^(\D*?)(\d+(?:\.\d+)?)(\D*)$/);
      if (!m) return null;
      var decimals = (m[2].split(".")[1] || "").length;
      return {
        prefix: m[1],
        value: parseFloat(m[2]),
        decimals: decimals,
        suffix: m[3],
      };
    }

    function countUp(el, target) {
      var parsed = parseNumeric(target);
      if (!parsed) {
        el.textContent = target;
        return;
      }

      var duration = 900;
      var start = null;

      function step(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        // easeOutCubic
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = parsed.value * eased;
        el.textContent =
          parsed.prefix +
          current.toFixed(parsed.decimals) +
          parsed.suffix;
        if (progress < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    }

    // ---- Single observer per card ----

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var card = entry.target;

          if (card.dataset.interactiveRevealed === "1") {
            observer.unobserve(card);
            return;
          }
          card.dataset.interactiveRevealed = "1";

          var delay = parseInt(card.dataset.revealDelay || "0", 10);
          setTimeout(function () {
            card.classList.add("is-revealed");

            // Count-up the value (Results only)
            var valueEl = card.querySelector(".results-rating-value");
            if (valueEl && valueEl.dataset.countTarget) {
              if (reduceMotion) {
                valueEl.textContent = valueEl.dataset.countTarget;
              } else {
                countUp(valueEl, valueEl.dataset.countTarget);
              }
            }

            // Animate the bar width (Results only)
            // Handled purely in CSS via .is-revealed on the card.
          }, reduceMotion ? 0 : delay);

          observer.unobserve(card);
        });
      },
      { threshold: 0.15 }
    );

    cards.forEach(function (card, i) {
      // Cap delay at 5 cards to avoid long staggered waits
      card.dataset.revealDelay = String(Math.min(i, 5) * 90);

      var valueEl = card.querySelector(".results-rating-value");
      if (valueEl) {
        // Stash the final value so we can re-apply after counting.
        var text = (valueEl.textContent || "").trim();
        valueEl.dataset.countTarget = text;
        if (!reduceMotion) {
          // Zero it out so the counter visibly animates from 0.
          var parsed = parseNumeric(text);
          if (parsed) {
            valueEl.textContent =
              parsed.prefix + (0).toFixed(parsed.decimals) + parsed.suffix;
          }
        }
      }

      observer.observe(card);
    });
  }

  /* ===============================================================
   * Gallery modal
   * =============================================================== */

  function initGalleryModal() {
    if (!document.getElementById("galleryModal")) {
      var modal = document.createElement("div");
      modal.id = "galleryModal";
      modal.className = "gallery-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-label", "Image preview");
      modal.innerHTML =
        '<button class="gallery-modal-close" type="button" aria-label="Close">' +
        '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
        "</button>" +
        '<button class="gallery-modal-prev" type="button" aria-label="Previous">' +
        '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>' +
        "</button>" +
        '<button class="gallery-modal-next" type="button" aria-label="Next">' +
        '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>' +
        "</button>" +
        '<div class="gallery-modal-stage">' +
        '<img class="gallery-modal-img" src="" alt="">' +
        "</div>";
      document.body.appendChild(modal);

      modal
        .querySelector(".gallery-modal-close")
        .addEventListener("click", closeGalleryModal);

      modal
        .querySelector(".gallery-modal-prev")
        .addEventListener("click", function (e) {
          e.stopPropagation();
          navigateGalleryModal(-1);
        });

      modal
        .querySelector(".gallery-modal-next")
        .addEventListener("click", function (e) {
          e.stopPropagation();
          navigateGalleryModal(1);
        });

      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeGalleryModal();
      });
    }

    var heroImgs = document.querySelectorAll(".location-hero-img");
    var galleryImgs = document.querySelectorAll(".location-gallery-item img");

    var items = [];
    heroImgs.forEach(function (img) {
      items.push({ src: img.src, alt: img.alt || "" });
    });
    galleryImgs.forEach(function (img) {
      items.push({ src: img.src, alt: img.alt || "" });
    });

    if (!items.length) return;

    window._galleryModalItems = items;
    window._galleryModalIndex = 0;

    var idx = 0;
    heroImgs.forEach(function (img) {
      if (img.dataset.gmBound === "1") {
        idx++;
        return;
      }
      img.dataset.gmBound = "1";
      img.dataset.gmIndex = String(idx++);
      img.style.cursor = "zoom-in";
      img.addEventListener("click", openGalleryModal);
    });
    galleryImgs.forEach(function (img) {
      if (img.dataset.gmBound === "1") {
        idx++;
        return;
      }
      img.dataset.gmBound = "1";
      img.dataset.gmIndex = String(idx++);
      img.style.cursor = "zoom-in";
      img.addEventListener("click", openGalleryModal);
    });
  }

  function openGalleryModal(e) {
    var idx = parseInt(e.currentTarget.dataset.gmIndex || "0", 10);
    window._galleryModalIndex = idx;

    var modal = document.getElementById("galleryModal");
    if (!modal) return;

    updateGalleryModalImage();

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeGalleryModal() {
    var modal = document.getElementById("galleryModal");
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function navigateGalleryModal(step) {
    var items = window._galleryModalItems || [];
    if (!items.length) return;

    var next = window._galleryModalIndex + step;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;

    window._galleryModalIndex = next;
    updateGalleryModalImage();
  }

  function updateGalleryModalImage() {
    var items = window._galleryModalItems || [];
    var modal = document.getElementById("galleryModal");
    if (!modal) return;

    var item = items[window._galleryModalIndex] || {};
    var img = modal.querySelector(".gallery-modal-img");
    if (img) {
      img.src = item.src || "";
      img.alt = item.alt || "";
    }
  }

  document.addEventListener("keydown", function (e) {
    var modal = document.getElementById("galleryModal");
    if (!modal || !modal.classList.contains("is-open")) return;

    if (e.key === "Escape") {
      closeGalleryModal();
    } else if (e.key === "ArrowLeft") {
      navigateGalleryModal(-1);
    } else if (e.key === "ArrowRight") {
      navigateGalleryModal(1);
    }
  });

  /* ===============================================================
   * Boot
   * =============================================================== */

  document.addEventListener("DOMContentLoaded", function () {
    loadPageContent();
  });
})();
