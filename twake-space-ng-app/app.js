/* =============================================================================
   TWAKE SPACE — app.js  (script classique, pas de module)
   Tous les comportements sont simulés, en mémoire, sans réseau ni stockage.
   Hooks via data-* + addEventListener (aucun handler inline — CSP stricte).
   Re-teintage de --spaceAccent via la CSSOM (autorisé par style-src).
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------------------
     0. HELPERS
     ------------------------------------------------------------------------ */
  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  const live = $("[data-live]");
  function announce(msg) { if (live) { live.textContent = ""; live.textContent = msg; } }

  // Normalisation pour recherche insensible à la casse/aux accents
  function norm(s) {
    return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  // Fabrique un <svg class="icon"> référençant un symbole du sprite (markup statique)
  function iconSvg(id, cls) {
    return '<svg class="icon ' + (cls || "") + '"><use href="#' + id + '"></use></svg>';
  }

  /* ---------------------------------------------------------------------------
     1. NAVIGATION PAR ONGLETS (E7 défaut) + clavier ARIA
     ------------------------------------------------------------------------ */
  const tabs   = $$(".tab");
  const panels = $$(".panel");
  const globalSearch = $('[data-input="search"]');

  function activateTab(name, focusPanel) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => {
      const on = p.dataset.panel === name;
      p.classList.toggle("is-active", on);
      if (on) { p.hidden = false; } else { p.hidden = true; }
    });
    // Réinitialise tout filtrage de recherche au changement d'onglet
    if (globalSearch) globalSearch.value = "";
    resetSearch();
    if (focusPanel) { const p = $('.panel[data-panel="' + name + '"]'); if (p) p.focus(); }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    // Flèches gauche/droite : navigation entre onglets visibles (activation auto)
    tab.addEventListener("keydown", (e) => {
      const visible = tabs.filter((t) => !t.hidden);
      const i = visible.indexOf(tab);
      let next = null;
      if (e.key === "ArrowRight") next = visible[(i + 1) % visible.length];
      else if (e.key === "ArrowLeft") next = visible[(i - 1 + visible.length) % visible.length];
      else if (e.key === "Home") next = visible[0];
      else if (e.key === "End") next = visible[visible.length - 1];
      if (next) { e.preventDefault(); activateTab(next.dataset.tab); next.focus(); }
    });
  });

  // Liens internes du Fil vers un onglet (ex. #général → Discussions)
  $$("[data-tab-link]").forEach((el) => {
    el.addEventListener("click", (e) => { e.preventDefault(); activateTab(el.dataset.tabLink); });
  });

  /* ---------------------------------------------------------------------------
     2. RECHERCHE — filtre en direct le contenu de l'onglet courant
     ------------------------------------------------------------------------ */
  function filterIn(container, query) {
    const q = norm(query);
    $$("[data-searchable]", container).forEach((item) => {
      const hit = !q || norm(item.dataset.searchable).indexOf(q) !== -1;
      item.hidden = !hit;
    });
  }
  function resetSearch() {
    $$("[data-searchable]").forEach((i) => (i.hidden = false));
    const hint = $("[data-files-hint]"); if (hint) hint.hidden = true;
  }

  if (globalSearch) {
    globalSearch.addEventListener("input", () => {
      const active = $(".panel.is-active");
      if (active) filterIn(active, globalSearch.value);
    });
  }

  // Recherche plein texte « IA » dans Fichiers (E12) — affiche un extrait
  // Délégué : survit au re-rendu des espaces (chaque espace a son propre champ)
  document.addEventListener("input", (e) => {
    if (!e.target.matches('[data-input="files-search"]')) return;
    const panel = e.target.closest(".panel");
    const hint = $("[data-files-hint]", panel);
    filterIn(panel, e.target.value);
    const q = e.target.value.trim();
    if (!hint) return;
    if (q) {
      hint.hidden = false;
      const visible = $$('.file-wrap[data-searchable]', panel).filter((f) => !f.hidden).length;
      hint.innerHTML = iconSvg("i-sparkles") +
        " Recherche plein texte : <strong>" + visible + "</strong> document(s) — extrait : « …mention de <mark>" +
        q.replace(/[<>&]/g, "") + "</mark> trouvée dans le document… »";
    } else { hint.hidden = true; }
  });

  /* ---------------------------------------------------------------------------
     3. DISCUSSIONS / CHAT (E8)
     ------------------------------------------------------------------------ */
  // 3a. Canaux (délégué — survit au re-rendu d'espace)
  document.addEventListener("click", (e) => {
    const ch = e.target.closest(".channel[data-channel]");
    if (!ch) return;
    $$(".channel").forEach((c) => c.classList.remove("is-active"));
    ch.classList.add("is-active");
    const title = $(".thread-title");
    if (title) title.textContent = "# " + ch.dataset.channel;
    const badge = $(".channel-badge", ch); if (badge) badge.remove();
  });

  // 3b. Envoi d'un message (aligné à droite, accusé de lecture) — délégué
  function sendMessage() {
    const input = $('[data-input="message"]');
    const messages = $("[data-messages]");
    if (!input || !messages) return;
    const text = input.value.trim();
    if (!text) return;
    const now = new Date(); // new Date() : autorisé ici (runtime navigateur)
    const hh = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

    const msg = document.createElement("div");
    msg.className = "msg msg--sent";
    msg.innerHTML =
      '<svg class="avatar avatar--blue" viewBox="0 0 40 40" role="img" aria-label="Vous — Camille Laurent">' +
        '<circle class="avatar-bg" cx="20" cy="20" r="20"/><text class="avatar-initials" x="20" y="21">CL</text></svg>' +
      '<div class="msg-body">' +
        '<p class="msg-head"><span class="msg-name">Vous</span> <span class="msg-time">' + hh + '</span></p>' +
        '<div class="bubble"></div>' +
        '<span class="read-receipt">' + iconSvg("i-check") + ' Envoyé</span>' +
      '</div>';
    $(".bubble", msg).textContent = text; // saisie utilisateur : textContent (anti-injection)
    messages.appendChild(msg);
    input.value = "";
    messages.scrollTop = messages.scrollHeight;
    const receipt = $(".read-receipt", msg);
    setTimeout(function () { receipt.innerHTML = iconSvg("i-check") + iconSvg("i-check") + " Lu"; }, 1400);
  }
  document.addEventListener("submit", (e) => {
    if (e.target.closest("[data-composer]")) { e.preventDefault(); sendMessage(); }
  });

  // 3c. Réactions emoji (clic = (dé)sélection + compteur)
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-reaction]");
    if (!r) return;
    const countEl = $(".reaction-count", r);
    let n = parseInt(countEl.textContent, 10) || 0;
    if (r.classList.toggle("is-active")) n += 1; else n -= 1;
    countEl.textContent = n;
    if (n <= 0) { r.classList.remove("is-active"); countEl.textContent = "0"; }
  });

  // 3d. « Lier un objet » à la conversation (délégué)
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="link-object"]'))
      toast("Lier un objet", "Choisissez une tâche, un document ou un événement à rattacher.", "i-link");
  });

  /* ---------------------------------------------------------------------------
     4. TÂCHES (E5) — changement de statut + avancement
     ------------------------------------------------------------------------ */
  const STATUS = ["todo", "doing", "done"];
  const STATUS_LABEL = { todo: "À faire", doing: "En cours", done: "Terminé" };

  function recomputeTasks() {
    const all = $$("[data-task]");
    const done = all.filter((t) => t.dataset.status === "done").length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const fill = $("[data-progress-fill]");
    if (fill) {
      fill.style.width = pct + "%"; // assignation de propriété CSSOM individuelle (autorisée par CSP)
      const bar = fill.closest(".progress");
      if (bar) bar.setAttribute("aria-valuenow", String(pct));
    }
    const label = $("[data-progress-label]"); if (label) label.textContent = pct + " %";
    const count = $("[data-progress-count]"); if (count) count.textContent = done;
    // Compteurs de colonnes
    STATUS.forEach((s) => {
      const c = $('[data-count="' + s + '"]');
      if (c) c.textContent = all.filter((t) => t.dataset.status === s).length;
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="cycle-status"]');
    if (!btn) return;
    const card = btn.closest("[data-task]");
    const cur = card.dataset.status;
    const next = STATUS[(STATUS.indexOf(cur) + 1) % STATUS.length];
    card.dataset.status = next;
    card.classList.toggle("task-card--done", next === "done");
    // Met à jour la pastille de statut
    btn.className = "chip-status chip-status--" + next;
    btn.innerHTML = '<span class="chip-dot"></span> ' + STATUS_LABEL[next];
    btn.setAttribute("aria-label", "Changer le statut : actuellement " + STATUS_LABEL[next]);
    // Déplace la carte dans la bonne colonne
    const col = $('[data-col="' + next + '"] .board-col-body');
    if (col) col.appendChild(card);
    recomputeTasks();
    announce("Tâche déplacée vers " + STATUS_LABEL[next]);
  });

  /* ---------------------------------------------------------------------------
     5. PERSONNALISATION (E2) — accent live, logo, widgets
     ------------------------------------------------------------------------ */
  const root = document.documentElement;

  // 5a. Couleur d'accent → re-teinte --spaceAccent en direct (CSSOM)
  $$("[data-accent]").forEach((sw) => {
    sw.addEventListener("click", () => {
      $$("[data-accent]").forEach((s) => s.classList.remove("is-active"));
      sw.classList.add("is-active");
      // On passe une référence de token (var(--xxx)) : aucune couleur littérale en JS
      root.style.setProperty("--spaceAccent", "var(" + sw.dataset.accent + ")");
      announce("Couleur d'accent mise à jour");
    });
  });

  // 5b. Logo de l'espace
  const headerLogo = $("[data-space-logo]");
  const CUBE_HTML = $("[data-space-logo]") ? $("[data-space-logo]").innerHTML : "";
  $$("[data-logo]").forEach((opt) => {
    opt.addEventListener("click", () => {
      $$("[data-logo]").forEach((o) => o.classList.remove("is-active"));
      opt.classList.add("is-active");
      if (!headerLogo) return;
      if (opt.dataset.logo === "grad") headerLogo.innerHTML = CUBE_HTML;
      else headerLogo.innerHTML = '<span class="space-mini space-mini--' + opt.dataset.logo + '" aria-hidden="true"></span>';
    });
  });

  // 5c. Widgets → affiche/masque l'onglet correspondant
  $$("[data-widget]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const name = cb.dataset.widget;
      const tab = $('.tab[data-tab="' + name + '"]');
      if (!tab) return;
      tab.hidden = !cb.checked;
      // Si on masque l'onglet actif, basculer vers le premier onglet visible
      if (!cb.checked && tab.classList.contains("is-active")) {
        const firstVisible = tabs.filter((t) => !t.hidden)[0];
        if (firstVisible) activateTab(firstVisible.dataset.tab);
        else { cb.checked = true; tab.hidden = false; } // garde au moins un onglet
      }
    });
  });

  /* ---------------------------------------------------------------------------
     6. OVERLAYS — modales, drawers, dropdown (focus + Échap + scrim)
     ------------------------------------------------------------------------ */
  const scrim = $("[data-scrim]");
  let openName = null;
  let lastFocus = null;

  function openOverlay(name) {
    const ov = $('[data-overlay="' + name + '"]');
    if (!ov) return;
    closeMenu();
    lastFocus = document.activeElement;
    if (scrim) scrim.hidden = false;
    ov.hidden = false;
    openName = name;
    const focusable = ov.querySelector("input, button, select, textarea, [tabindex]");
    if (focusable) focusable.focus();
  }
  function closeOverlay() {
    if (!openName) return;
    const ov = $('[data-overlay="' + openName + '"]');
    if (ov) ov.hidden = true;
    if (scrim) scrim.hidden = true;
    openName = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Délégué : couvre l'en-tête ET le badge de version re-rendu dans Fichiers
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open]");
    if (!btn) return;
    e.stopPropagation();
    const name = btn.dataset.open;
    if (name === "space-menu") toggleMenu();
    else if (name === "versions") openFileVersions();
    else openOverlay(name);
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlay(); });
  if (scrim) scrim.addEventListener("click", closeOverlay);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeOverlay(); closeMenu(); }
  });

  // Piège à focus basique dans l'overlay ouvert (a11y)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !openName) return;
    const ov = $('[data-overlay="' + openName + '"]');
    if (!ov) return;
    const f = $$("input, button, select, textarea, a[href], [tabindex]", ov).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // 6b. Dropdown menu de l'espace (… → Personnaliser / Membres / Archiver)
  const menu = $('[data-menu="space-menu"]');
  function toggleMenu() { if (menu) { menu.hidden = !menu.hidden; if (!menu.hidden) document.addEventListener("click", outside); } }
  function closeMenu() { if (menu && !menu.hidden) { menu.hidden = true; document.removeEventListener("click", outside); } }
  function outside(e) { if (menu && !menu.contains(e.target)) closeMenu(); }

  /* ---------------------------------------------------------------------------
     7. CRÉATION D'ESPACE (E1) + segmented control
     ------------------------------------------------------------------------ */
  $$("[data-seg]").forEach((b) => {
    b.addEventListener("click", () => {
      $$("[data-seg]", b.parentNode).forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
    });
  });
  const createBtn = $('[data-action="create-space-confirm"]');
  if (createBtn) createBtn.addEventListener("click", () => {
    closeOverlay();
    toast("Espace créé", "Votre nouvel espace a été créé (simulation).", "i-plus");
  });

  /* ---------------------------------------------------------------------------
     8. MEMBRES (E3) — invitation interne/externe + toggles de droits
     ------------------------------------------------------------------------ */
  let memberCount = 7;
  const inviteInput = $('[data-input="invite"]');
  const inviteBtn = $('[data-action="invite"]');
  const membersList = $("[data-members-list]");

  function inviteMember() {
    if (!inviteInput) return;
    const email = inviteInput.value.trim();
    if (!email || email.indexOf("@") === -1) { inviteInput.focus(); return; }
    const isExternal = !/@org\.fr$/i.test(email);
    const namePart = email.split("@")[0].replace(/[._-]+/g, " ");
    const initials = namePart.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "??";

    const row = document.createElement("div");
    row.className = "member";
    row.innerHTML =
      '<svg class="avatar avatar--indigo" viewBox="0 0 40 40" role="img" aria-label="' + email + '">' +
        '<circle class="avatar-bg" cx="20" cy="20" r="20"/><text class="avatar-initials" x="20" y="21"></text></svg>' +
      '<div class="member-id"><p class="member-name"></p><p class="muted small"></p></div>' +
      '<select class="select select--role" aria-label="Rôle"><option>Contributeur</option><option>Lecteur</option></select>';
    $(".avatar-initials", row).textContent = initials;
    const nameEl = $(".member-name", row);
    nameEl.textContent = namePart.replace(/\b\w/g, (c) => c.toUpperCase()) + " ";
    if (isExternal) { const b = document.createElement("span"); b.className = "badge badge-ext"; b.textContent = "Externe"; nameEl.appendChild(b); }
    $(".muted.small", row).textContent = email;
    membersList.insertBefore(row, membersList.firstChild);

    memberCount += 1;
    const mb = $("#mb-title"); if (mb) mb.lastChild.textContent = " Membres · " + memberCount;
    const sub = $(".space-sub"); if (sub) sub.lastChild.textContent = " Espace partagé · " + memberCount + " membres";
    inviteInput.value = "";
    toast("Invitation envoyée", email + (isExternal ? " (externe)" : "") + " a été invité·e.", "i-user-plus");
    announce("Invitation envoyée à " + email);
  }
  if (inviteBtn) inviteBtn.addEventListener("click", inviteMember);
  if (inviteInput) inviteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inviteMember(); } });

  // Toggles génériques (droits par ressource, préférences d'alerte)
  $$("[data-toggle]").forEach((t) => {
    t.addEventListener("click", () => {
      const on = t.classList.toggle("is-on");
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });

  /* ---------------------------------------------------------------------------
     9. NOTIFICATIONS (E9) — compteur, lecture, temps réel simulé
     ------------------------------------------------------------------------ */
  const bellBadge = $("[data-bell-badge]");
  const notifList = $("[data-notif-list]");

  function unreadCount() { return $$(".notif.is-unread").length; }
  function refreshBadge(bump) {
    const n = unreadCount();
    if (!bellBadge) return;
    bellBadge.textContent = n;
    bellBadge.hidden = n === 0;
    if (bump && n > 0) { bellBadge.classList.remove("is-bump"); void bellBadge.offsetWidth; bellBadge.classList.add("is-bump"); }
  }
  function markRead(notif) {
    if (!notif.classList.contains("is-unread")) return;
    notif.classList.remove("is-unread");
    notif.classList.add("is-read");
    refreshBadge(false);
  }
  // Marquage lu au survol ET au clic (consultation)
  $$("[data-notif]").forEach(bindNotif);
  function bindNotif(n) {
    let hov;
    n.addEventListener("mouseenter", () => { hov = setTimeout(() => markRead(n), 600); });
    n.addEventListener("mouseleave", () => clearTimeout(hov));
    n.addEventListener("click", () => markRead(n));
  }
  const markAll = $('[data-action="mark-all-read"]');
  if (markAll) markAll.addEventListener("click", () => {
    $$(".notif.is-unread").forEach((n) => { n.classList.remove("is-unread"); n.classList.add("is-read"); });
    refreshBadge(false);
    announce("Toutes les notifications sont marquées comme lues");
  });

  // Arrivée « temps réel » simulée (setTimeout, sans réseau)
  function pushNotification(data) {
    if (notifList) {
      const li = document.createElement("li");
      li.className = "notif is-unread is-entering";
      li.setAttribute("data-notif", "");
      li.setAttribute("data-type", data.type);
      li.innerHTML =
        '<span class="notif-ico notif-ico--' + data.type + '" aria-hidden="true">' + iconSvg(data.icon) + '</span>' +
        '<div class="notif-body"><p class="notif-text"><strong></strong> <span class="ntx"></span></p>' +
        '<p class="notif-when muted small">à l\'instant</p></div><span class="notif-dot" aria-label="Non lu"></span>';
      $("strong", li).textContent = data.title + " — ";
      $(".ntx", li).textContent = data.text;
      notifList.insertBefore(li, notifList.firstChild);
      bindNotif(li);
    }
    refreshBadge(true);
    toast(data.title, data.text, data.icon);
  }

  // Deux notifications différées pour matérialiser le « temps réel »
  setTimeout(function () {
    pushNotification({ type: "file", icon: "i-doc", title: "Document modifié",
      text: "Thomas Moreau a déposé « Specs techniques API.docx » (v5)." });
  }, 5200);
  setTimeout(function () {
    pushNotification({ type: "mention", icon: "i-at", title: "Nouvelle mention",
      text: "Sophie Dubois vous a mentionné dans #projet-b2b." });
  }, 12000);

  /* ---------------------------------------------------------------------------
     10. CYCLE DE VIE / ARCHIVAGE (E10)
     ------------------------------------------------------------------------ */
  const spaceRoot = $("[data-space-root]");
  const archiveBanner = $("[data-archive-banner]");
  const archiveBtn = $('[data-action="archive"]');
  const reactivateBtn = $('[data-action="reactivate"]');

  if (archiveBtn) archiveBtn.addEventListener("click", () => {
    closeMenu();
    spaceRoot.classList.add("is-archived");
    if (archiveBanner) archiveBanner.hidden = false;
    toast("Espace archivé", "Contenu passé en lecture seule. Historique conservé.", "i-archive");
    announce("Espace archivé, lecture seule");
  });
  if (reactivateBtn) reactivateBtn.addEventListener("click", () => {
    spaceRoot.classList.remove("is-archived");
    if (archiveBanner) archiveBanner.hidden = true;
    toast("Espace réactivé", "L'espace est de nouveau modifiable.", "i-check");
    announce("Espace réactivé");
  });

  /* ---------------------------------------------------------------------------
     11. FICHIERS — détails IA, historique de versions, suggestion IA (E4/E12)
     ------------------------------------------------------------------------ */
  document.addEventListener("click", (e) => {
    const detailBtn = e.target.closest('[data-action="toggle-file-detail"]');
    if (detailBtn) {
      const wrap = detailBtn.closest(".file-wrap");
      const detail = $("[data-file-detail]", wrap);
      const open = detail.hidden;
      detail.hidden = !open;
      detailBtn.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    const verBtn = e.target.closest('[data-action="toggle-versions"]');
    if (verBtn) {
      const versions = $("[data-versions]", verBtn.closest(".file-detail"));
      const open = versions.hidden;
      versions.hidden = !open;
      verBtn.setAttribute("aria-expanded", open ? "true" : "false");
      verBtn.innerHTML = iconSvg("i-history") + (open ? " Masquer l'historique" : " Voir l'historique des versions");
    }
  });

  // Badge « v3 » → ouvre directement la fiche + l'historique
  function openFileVersions() {
    const wrap = $(".file-wrap");
    if (!wrap) return;
    const detail = $("[data-file-detail]", wrap);
    const versions = $("[data-versions]", wrap);
    const detailBtn = $('[data-action="toggle-file-detail"]', wrap);
    if (detail) { detail.hidden = false; if (detailBtn) detailBtn.setAttribute("aria-expanded", "true"); }
    if (versions) {
      versions.hidden = false;
      const vb = $('[data-action="toggle-versions"]', wrap);
      if (vb) { vb.setAttribute("aria-expanded", "true"); vb.innerHTML = iconSvg("i-history") + " Masquer l'historique"; }
      versions.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // Suggestion de regroupement IA (E12) — délégué (re-rendu safe)
  function dismissAi(msg, title) {
    const aiSuggest = $("[data-ai-suggest]");
    if (!aiSuggest) return;
    aiSuggest.classList.add("is-collapsing");
    setTimeout(() => { aiSuggest.remove(); }, 380);
    toast(title, msg, "i-sparkles");
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="ai-group-apply"]')) dismissAi("3 documents regroupés sous « Conception B2B ».", "Regroupement appliqué");
    else if (e.target.closest('[data-action="ai-group-dismiss"]')) dismissAi("Suggestion ignorée.", "Suggestion IA");
  });

  /* ---------------------------------------------------------------------------
     12. SIDEBAR MOBILE (repli <768px)
     ------------------------------------------------------------------------ */
  const app = $("[data-app]");
  const hamburger = $('[data-action="toggle-sidebar"]');
  if (hamburger) hamburger.addEventListener("click", () => app.classList.toggle("sidebar-open"));
  // Choix d'un espace : bascule de contenu + referme la sidebar mobile
  $$(".nav-space").forEach((s) => s.addEventListener("click", () => {
    app.classList.remove("sidebar-open");
    if (s.dataset.space) selectSpace(s.dataset.space);
  }));

  /* ---------------------------------------------------------------------------
     13. TOASTS (notifications visuelles éphémères)
     ------------------------------------------------------------------------ */
  const toastStack = $("[data-toasts]");
  function toast(title, text, icon) {
    if (!toastStack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<span class="toast-ico" aria-hidden="true">' + iconSvg(icon || "i-bell") + "</span>" +
      '<div class="toast-body"><p class="toast-title"></p><p class="toast-text"></p></div>';
    $(".toast-title", el).textContent = title;
    $(".toast-text", el).textContent = text;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  /* ---------------------------------------------------------------------------
     13b. ASSISTANT IA D'ESPACE (souverain, simulé)
     Réponses pré-écrites, contextuelles aux données de l'espace. Aucun réseau :
     « réflexion » simulée par un indicateur de saisie + setTimeout.
     ------------------------------------------------------------------------ */
  const aiConv = $("[data-ai-conversation]");
  const aiComposer = $("[data-ai-composer]");
  const aiInput = $('[data-input="ai"]');

  const B2B_AI = {
    resume:
      "Voici l'activité récente de <strong>B2B Admin Panel</strong> :<ul>" +
      "<li>Camille a ajouté <span class=\"ai-ref\">Cahier des charges B2B v3.pdf</span> (diffusion externe restreinte).</li>" +
      "<li>Thomas a créé la tâche <span class=\"ai-ref\">Intégrer le SSO Keycloak</span> (en cours, échéance 18 juin).</li>" +
      "<li>Sophie a planifié le <span class=\"ai-ref\">Comité de pilotage</span> — aujourd'hui 14:00, Twake Visio Meeting.</li>" +
      "<li>Nadia El Amrani (externe) a rejoint l'espace.</li></ul>" +
      "Avancement global des tâches : <strong>33 %</strong> (2 terminées sur 6).",
    taches:
      "Sur les 6 tâches de l'espace : <strong>2 à faire, 2 en cours, 2 terminées</strong>.<ul>" +
      "<li>⚠️ <span class=\"ai-ref\">Rédiger les spécifications API</span> — Sophie, échéance <strong>14 juin</strong> (proche).</li>" +
      "<li><span class=\"ai-ref\">Auditer la conformité RGPD</span> — Marc, 22 juin.</li>" +
      "<li><span class=\"ai-ref\">Intégrer le SSO Keycloak</span> — Thomas, en cours pour le 18 juin.</li></ul>" +
      "La spécification API est la plus urgente. Voulez-vous que je prévienne Sophie&nbsp;?",
    search:
      "2 documents de l'espace correspondent (recherche plein texte) :<ul>" +
      "<li>📄 <span class=\"ai-ref\">Cahier des charges B2B v3.pdf</span> — entités : RGPD, Keycloak, SSO.</li>" +
      "<li>📄 <span class=\"ai-ref\">Specs techniques API.docx</span> (v5) — rangé par IA.</li></ul>" +
      "Extrait : « …le traitement des données B2B doit être conforme au RGPD et journalisé… ».",
    copil:
      "Projet de compte-rendu du <strong>Comité de pilotage</strong> :<ul>" +
      "<li><strong>Présents</strong> : Camille, Sophie, Thomas, Marc.</li>" +
      "<li><strong>Décisions</strong> : charte graphique validée par le client ; lancement de l'intégration.</li>" +
      "<li><strong>Sécurité</strong> : SSO Keycloak en cours (Thomas, 18 juin).</li>" +
      "<li><strong>Suites</strong> : specs API (Sophie, 14 juin), audit RGPD (Marc, 22 juin).</li></ul>" +
      "Je peux l'enregistrer comme document dans l'onglet Fichiers."
  };
  const AI_DEFAULT =
    "À partir des données de l'espace, je peux résumer l'activité, retrouver un document, " +
    "suivre l'avancement des tâches ou rédiger un compte-rendu. Essayez « Résume l'activité » " +
    "ou « Quelles tâches sont à risque ? ».";

  function aiScrollBottom() {
    if (aiConv && aiConv.parentNode) aiConv.parentNode.scrollTop = aiConv.parentNode.scrollHeight;
  }
  function aiAppendUser(text) {
    const m = document.createElement("div");
    m.className = "ai-msg ai-msg--user";
    m.innerHTML = '<div class="ai-bubble"></div>';
    $(".ai-bubble", m).textContent = text; // saisie utilisateur : textContent (anti-injection)
    aiConv.appendChild(m); aiScrollBottom();
  }
  function aiAppendBot(html) {
    const m = document.createElement("div");
    m.className = "ai-msg ai-msg--bot";
    m.innerHTML = '<span class="ai-avatar" aria-hidden="true">' + iconSvg("i-sparkles") +
      '</span><div class="ai-bubble">' + html + "</div>"; // html : contenu de confiance (pré-écrit)
    aiConv.appendChild(m); aiScrollBottom();
  }
  function aiShowTyping() {
    const t = document.createElement("div");
    t.className = "ai-msg ai-msg--bot";
    t.setAttribute("data-ai-typing", "");
    t.innerHTML = '<span class="ai-avatar" aria-hidden="true">' + iconSvg("i-sparkles") +
      '</span><div class="ai-typing"><span></span><span></span><span></span></div>';
    aiConv.appendChild(t); aiScrollBottom();
    return t;
  }
  function aiAsk(key, userText) {
    if (!aiConv) return;
    aiAppendUser(userText);
    const typing = aiShowTyping();
    setTimeout(function () {
      typing.remove();
      aiAppendBot(getAiAnswer(key)); // résolu selon l'espace courant (cf. module Espaces)
    }, 1300);
  }

  $$("[data-ai-prompt]").forEach((chip) => {
    chip.addEventListener("click", () => aiAsk(chip.dataset.aiPrompt, chip.textContent.trim()));
  });
  if (aiComposer) {
    aiComposer.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = aiInput.value.trim();
      if (!text) return;
      const n = norm(text);
      let key = null; // déduction simple du sujet par mots-clés
      if (/(resum|activit|recap|quoi de neuf)/.test(n)) key = "resume";
      else if (/(tache|task|retard|risque|avancement|a faire|echeance)/.test(n)) key = "taches";
      else if (/(copil|compte.?rendu|reunion|\bcr\b)/.test(n)) key = "copil";
      else if (/(document|fichier|rgpd|conformit|cherch|retrouv|trouv)/.test(n)) key = "search";
      aiInput.value = "";
      aiAsk(key, text);
    });
  }

  // Volet docké : ouverture/fermeture (split view ≥1200px, survol ≤1199px)
  const aiDock = $("[data-ai-dock]");
  const aiFab = $('[data-action="toggle-assistant"]');
  let aiLastFocus = null;
  function setAssistant(open) {
    if (!aiDock) return;
    app.classList.toggle("ai-open", open);
    if (open) {
      aiDock.removeAttribute("inert");
      aiLastFocus = document.activeElement;
      const inp = $('[data-input="ai"]'); if (inp) setTimeout(() => inp.focus(), 60);
    } else {
      aiDock.setAttribute("inert", "");
      if (aiLastFocus && aiLastFocus.focus) aiLastFocus.focus();
    }
    if (aiFab) aiFab.setAttribute("aria-expanded", open ? "true" : "false");
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="toggle-assistant"]')) setAssistant(!app.classList.contains("ai-open"));
    else if (e.target.closest('[data-action="close-assistant"]')) setAssistant(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && app.classList.contains("ai-open")) setAssistant(false);
  });

  /* ---------------------------------------------------------------------------
     14. DIVERS — neutralise les liens de démonstration, feedback léger
     ------------------------------------------------------------------------ */
  $$('a[data-noop]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  // Petit retour visuel sur quelques actions « live » de démonstration
  $$('.icon-btn[aria-label="Démarrer une visio"], .ocard-cta').forEach((b) =>
    b.addEventListener("click", () => toast("Twake Visio Meeting", "Démarrage de la réunion (simulation).", "i-video")));

  /* ---------------------------------------------------------------------------
     14b. ESPACES — modèle de données + rendu à la volée (bascule de contenu)
     B2B reste statique (vitrine E1–E12) ; les autres espaces sont rendus depuis
     les données ci-dessous, chacun avec son accent propre. Re-rendu = sans réseau.
     ------------------------------------------------------------------------ */
  let currentSpaceKey = "b2b";

  // Instantanés du contenu statique B2B (restaurés au retour sur B2B)
  const PANEL_SNAP = {};
  $$(".panel").forEach((p) => { PANEL_SNAP[p.dataset.panel] = p.innerHTML; });
  const MEMBERS_SNAP = $("[data-members-list]") ? $("[data-members-list]").innerHTML : "";

  // --- Données fictives des 4 autres espaces ---------------------------------
  const SPACES = {
    b2b: { name: "B2B Admin Panel", tint: "grad", accent: "--primaryColor", members: 7, chatCount: 5, agendaCount: 2, static: true },

    modsi: {
      name: "Modernisation du SI", tint: "teal", accent: "--infoColor", members: 6, chatCount: 4, agendaCount: 3,
      membersList: [
        { n: "Marc Lefèvre", i: "ML", c: "primary", role: "Owner" },
        { n: "Hugo Petit", i: "HP", c: "green", role: "Administrateur" },
        { n: "Inès Garnier", i: "IG", c: "violet", role: "Contributeur" },
        { n: "Julie Roche", i: "JR", c: "amber", role: "Contributeur" },
        { n: "Karim Benali", i: "KB", c: "indigo", role: "Contributeur", ext: true, email: "karim@conseil-si.com" },
        { n: "Camille Laurent", i: "CL", c: "blue", role: "Contributeur" }
      ],
      feed: [
        { who: "Hugo Petit", act: "a ajouté un document", when: "il y a 20 min", type: "doc", card: { kind: "doc", title: "Schéma cible architecture cloud.pdf", meta: '<span class="badge badge-version">' + iconSvg("i-layers") + ' v2</span> <span class="badge badge-warn">' + iconSvg("i-globe") + ' Diffusion externe restreinte</span>' } },
        { who: "Inès Garnier", act: "a créé une tâche", when: "il y a 1 h", type: "task", card: { kind: "task", title: "Migrer la messagerie vers le cloud souverain", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · échéance 24 juin' } },
        { who: "Marc Lefèvre", act: "a planifié une revue d'architecture", when: "il y a 2 h", type: "event", card: { kind: "event", title: "Revue d'architecture cible", day: "13", mon: "JUIN", time: "10:00", visio: true } },
        { who: "Karim Benali", act: "(externe) a rejoint l'espace", when: "il y a 4 h", type: "member", note: "Consultant cloud · invité par Marc Lefèvre" }
      ],
      tasks: [
        { title: "Migrer la messagerie vers le cloud souverain", status: "doing", who: "Hugo Petit", i: "HP", c: "green", due: "24 juin" },
        { title: "Auditer la dette technique applicative", status: "doing", who: "Karim Benali", i: "KB", c: "indigo", due: "27 juin" },
        { title: "Rédiger le plan de bascule", status: "todo", who: "Julie Roche", i: "JR", c: "amber", due: "30 juin" },
        { title: "Décommissionner les serveurs obsolètes", status: "todo", who: "Marc Lefèvre", i: "ML", c: "primary", due: "5 juil." },
        { title: "Cartographier les applications legacy", status: "done", who: "Inès Garnier", i: "IG", c: "violet" },
        { title: "Choisir l'ERP cible", status: "done", who: "Camille Laurent", i: "CL", c: "blue" }
      ],
      files: [
        { name: "Schéma cible architecture cloud.pdf", ico: "pdf", owner: "Hugo P.", oi: "HP", oc: "green", date: "13 juin", size: "3,8 Mo", kw: "cloud souverain infra", badges: [{ type: "version", text: "v2" }, { type: "ai", text: "Rangé par IA" }] },
        { name: "Cartographie applicative.xlsx", ico: "xls", owner: "Inès G.", oi: "IG", oc: "violet", date: "11 juin", size: "1,2 Mo", kw: "legacy applications" },
        { name: "Plan de migration.docx", ico: "doc", owner: "Julie R.", oi: "JR", oc: "amber", date: "9 juin", size: "640 Ko", kw: "bascule migration", badges: [{ type: "lock", text: "Modification verrouillée" }] },
        { name: "Étude ERP comparative.pdf", ico: "pdf", owner: "Camille L.", oi: "CL", oc: "blue", date: "6 juin", size: "2,1 Mo", kw: "erp progiciel" }
      ],
      agenda: [
        { dnum: "13", dlabel: "Aujourd'hui · jeudi", events: [{ title: "Revue d'architecture cible", day: "13", mon: "JUIN", time: "10:00 – 11:30", visio: true, people: "Marc, Hugo, Inès, Karim" }] },
        { dnum: "17", dlabel: "Mardi", events: [{ title: "Atelier migration messagerie", day: "17", mon: "JUIN", time: "14:00 – 16:00", place: "Conference Room C", people: "Hugo, Julie" }] },
        { dnum: "24", dlabel: "Mardi", events: [{ title: "Comité SI mensuel", day: "24", mon: "JUIN", time: "09:30 – 11:00", visio: true }] }
      ],
      channels: [{ name: "général", n: 2, active: true }, { name: "infra" }, { name: "migration", n: 4 }, { name: "erp" }],
      messages: [
        { who: "Marc Lefèvre", role: "Owner", i: "ML", c: "primary", time: "08:50", text: "On lance la phase de bascule cloud. <span class=\"mention\">@Hugo Petit</span> tu pilotes la messagerie ?" },
        { who: "Hugo Petit", role: "Administrateur", i: "HP", c: "green", time: "09:05", text: "Oui, je rattache la tâche 👇", card: { kind: "task", title: "Migrer la messagerie vers le cloud souverain", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · 24 juin' } },
        { who: "Karim Benali", role: "Contributeur", i: "KB", c: "indigo", time: "09:40", text: "J'ai partagé le schéma cible dans Fichiers." }
      ],
      mail: [
        { from: "Fournisseur Cloud Souverain", subj: "Proposition d'hébergement qualifié SecNumCloud", prev: "Suite à votre demande, veuillez trouver notre offre d'hébergement…", time: "08:30", i: "FC", c: "teal", unread: true },
        { from: "Karim Benali", subj: "Restitution audit dette technique", prev: "Bonjour, voici les premiers constats de l'audit applicatif…", time: "Hier", i: "KB", c: "indigo", ext: true },
        { from: "Inès Garnier", subj: "Cartographie applicative finalisée", prev: "La cartographie est à jour dans l'espace Fichiers.", time: "9 juin", i: "IG", c: "violet" }
      ]
    },

    equip: {
      name: "Équipements utilisateurs", tint: "amber", accent: "--warningColor", members: 5, chatCount: 3, agendaCount: 2,
      membersList: [
        { n: "Sophie Dubois", i: "SD", c: "violet", role: "Owner" },
        { n: "Lucas Bernard", i: "LB", c: "amber", role: "Administrateur" },
        { n: "Emma Laurent", i: "EL", c: "green", role: "Contributeur" },
        { n: "Nicolas Faure", i: "NF", c: "teal", role: "Contributeur" },
        { n: "Aïcha Diallo", i: "AD", c: "indigo", role: "Lecteur" }
      ],
      feed: [
        { who: "Lucas Bernard", act: "a ajouté un document", when: "il y a 35 min", type: "doc", card: { kind: "doc", title: "Catalogue matériel 2026.pdf", meta: '<span class="badge badge-version">' + iconSvg("i-layers") + ' v4</span> <span class="badge badge-ai">' + iconSvg("i-sparkles") + ' Rangé par IA</span>' } },
        { who: "Sophie Dubois", act: "a créé une tâche", when: "il y a 1 h", type: "task", card: { kind: "task", title: "Renouveler 120 postes de travail", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · échéance 28 juin' } },
        { who: "Nicolas Faure", act: "a planifié une livraison", when: "il y a 3 h", type: "event", card: { kind: "event", title: "Livraison lot PC portables", day: "16", mon: "JUIN", time: "09:00", place: "Quai de livraison B" } },
        { who: "Emma Laurent", act: "a publié un message important dans #commandes", when: "il y a 5 h", type: "msg", quote: "« Le bon de commande fournisseur est signé, livraison confirmée sous 8 jours. »" }
      ],
      tasks: [
        { title: "Renouveler 120 postes de travail", status: "doing", who: "Sophie Dubois", i: "SD", c: "violet", due: "28 juin" },
        { title: "Masteriser l'image Windows 11", status: "doing", who: "Nicolas Faure", i: "NF", c: "teal", due: "21 juin" },
        { title: "Commander les stations d'accueil", status: "todo", who: "Lucas Bernard", i: "LB", c: "amber", due: "19 juin" },
        { title: "Recycler les anciens postes (filière DEEE)", status: "todo", who: "Aïcha Diallo", i: "AD", c: "indigo", due: "2 juil." },
        { title: "Mettre à jour l'inventaire du parc", status: "done", who: "Emma Laurent", i: "EL", c: "green" },
        { title: "Négocier le contrat cadre fournisseur", status: "done", who: "Sophie Dubois", i: "SD", c: "violet" }
      ],
      files: [
        { name: "Catalogue matériel 2026.pdf", ico: "pdf", owner: "Lucas B.", oi: "LB", oc: "amber", date: "11 juin", size: "5,4 Mo", kw: "matériel postes", badges: [{ type: "version", text: "v4" }, { type: "ai", text: "Rangé par IA" }] },
        { name: "Inventaire parc.xlsx", ico: "xls", owner: "Emma L.", oi: "EL", oc: "green", date: "10 juin", size: "2,7 Mo", kw: "inventaire parc" },
        { name: "Bon de commande Q2.pdf", ico: "pdf", owner: "Sophie D.", oi: "SD", oc: "violet", date: "8 juin", size: "180 Ko", kw: "commande fournisseur", badges: [{ type: "lock", text: "Modification verrouillée" }] },
        { name: "Politique d'attribution.docx", ico: "doc", owner: "Aïcha D.", oi: "AD", oc: "indigo", date: "4 juin", size: "320 Ko", kw: "attribution règles" }
      ],
      agenda: [
        { dnum: "16", dlabel: "Lundi", events: [{ title: "Livraison lot PC portables", day: "16", mon: "JUIN", time: "09:00 – 10:00", place: "Quai de livraison B" }] },
        { dnum: "19", dlabel: "Jeudi", events: [{ title: "Point hebdomadaire parc", day: "19", mon: "JUIN", time: "11:00 – 11:30", visio: true, people: "Sophie, Lucas, Nicolas" }] }
      ],
      channels: [{ name: "général", n: 1, active: true }, { name: "commandes", n: 2 }, { name: "support-n1" }],
      messages: [
        { who: "Sophie Dubois", role: "Owner", i: "SD", c: "violet", time: "09:10", text: "On démarre le renouvellement du parc. <span class=\"mention\">@Nicolas Faure</span> où en est la masterisation ?" },
        { who: "Nicolas Faure", role: "Contributeur", i: "NF", c: "teal", time: "09:22", text: "Image Windows 11 prête à 80 %, je documente dans le catalogue 👇", card: { kind: "doc", title: "Catalogue matériel 2026.pdf", meta: '<span class="badge badge-version">' + iconSvg("i-layers") + ' v4</span>' } },
        { who: "Lucas Bernard", role: "Administrateur", i: "LB", c: "amber", time: "09:48", text: "Commande des stations d'accueil envoyée au fournisseur." }
      ],
      mail: [
        { from: "Fournisseur Matériel", subj: "Confirmation de commande — 120 PC portables", prev: "Votre commande est confirmée, livraison prévue le 16 juin…", time: "08:05", i: "FM", c: "amber", unread: true },
        { from: "Support utilisateurs", subj: "Tickets de remplacement en attente", prev: "7 demandes de remplacement de poste sont en file…", time: "Hier", i: "SU", c: "teal" }
      ]
    },

    cyber: {
      name: "Cybersécurité", tint: "violet", accent: "--roleBadgeText", members: 6, chatCount: 3, agendaCount: 2,
      membersList: [
        { n: "Marc Lefèvre", i: "ML", c: "primary", role: "Owner" },
        { n: "Thomas Moreau", i: "TM", c: "teal", role: "Administrateur" },
        { n: "Léa Rousseau", i: "LR", c: "green", role: "Contributeur" },
        { n: "Samuel Cohen", i: "SC", c: "amber", role: "Contributeur" },
        { n: "Nadia El Amrani", i: "NE", c: "indigo", role: "Contributeur", ext: true, email: "nadia@pentest-lab.com" },
        { n: "Camille Laurent", i: "CL", c: "blue", role: "Lecteur" }
      ],
      feed: [
        { who: "Nadia El Amrani", act: "(externe) a déposé un rapport", when: "il y a 25 min", type: "doc", card: { kind: "doc", title: "Rapport de test d'intrusion.pdf", meta: '<span class="badge badge-warn">' + iconSvg("i-globe") + ' Diffusion externe restreinte</span> <span class="badge badge-lock">' + iconSvg("i-lock") + ' Modification verrouillée</span>' } },
        { who: "Thomas Moreau", act: "a créé une tâche critique", when: "il y a 1 h", type: "task", card: { kind: "task", title: "Corriger les vulnérabilités critiques", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · échéance 15 juin' } },
        { who: "Marc Lefèvre", act: "a planifié un exercice", when: "il y a 2 h", type: "event", card: { kind: "event", title: "Exercice de crise cyber", day: "18", mon: "JUIN", time: "14:00", visio: true } },
        { who: "Léa Rousseau", act: "a publié un message important dans #incidents", when: "il y a 4 h", type: "msg", quote: "« Incident de phishing maîtrisé, comptes concernés réinitialisés et MFA forcé. »" }
      ],
      tasks: [
        { title: "Corriger les vulnérabilités critiques", status: "doing", who: "Thomas Moreau", i: "TM", c: "teal", due: "15 juin" },
        { title: "Réaliser le test d'intrusion externe", status: "doing", who: "Nadia El Amrani", i: "NE", c: "indigo", due: "17 juin" },
        { title: "Mettre à jour la PSSI", status: "todo", who: "Marc Lefèvre", i: "ML", c: "primary", due: "25 juin" },
        { title: "Sensibiliser les agents au phishing", status: "todo", who: "Samuel Cohen", i: "SC", c: "amber", due: "30 juin" },
        { title: "Déployer le MFA sur tous les comptes", status: "done", who: "Léa Rousseau", i: "LR", c: "green" },
        { title: "Préparer la certification ISO 27001", status: "done", who: "Marc Lefèvre", i: "ML", c: "primary" }
      ],
      files: [
        { name: "Rapport d'audit ISO 27001.pdf", ico: "pdf", owner: "Marc L.", oi: "ML", oc: "primary", date: "11 juin", size: "4,2 Mo", kw: "iso 27001 rgpd conformité audit", badges: [{ type: "version", text: "v2" }, { type: "warn", text: "Diffusion externe restreinte" }, { type: "ai", text: "Rangé par IA" }] },
        { name: "Rapport de test d'intrusion.pdf", ico: "pdf", owner: "Nadia E.", oi: "NE", oc: "indigo", date: "11 juin", size: "1,9 Mo", kw: "pentest vulnérabilités rgpd", badges: [{ type: "lock", text: "Modification verrouillée" }] },
        { name: "Registre des incidents.xlsx", ico: "xls", owner: "Thomas M.", oi: "TM", oc: "teal", date: "10 juin", size: "560 Ko", kw: "incidents soc" },
        { name: "Politique SSI.pdf", ico: "pdf", owner: "Marc L.", oi: "ML", oc: "primary", date: "5 juin", size: "880 Ko", kw: "pssi politique" }
      ],
      agenda: [
        { dnum: "18", dlabel: "Mercredi", events: [{ title: "Exercice de crise cyber", day: "18", mon: "JUIN", time: "14:00 – 17:00", visio: true, people: "Marc, Thomas, Léa, Samuel" }] },
        { dnum: "23", dlabel: "Lundi", events: [{ title: "Comité de sécurité", day: "23", mon: "JUIN", time: "10:00 – 11:00", place: "Conference Room B" }] }
      ],
      channels: [{ name: "général", active: true }, { name: "soc", n: 3 }, { name: "incidents", n: 2, alert: true }, { name: "conformité" }],
      messages: [
        { who: "Thomas Moreau", role: "Administrateur", i: "TM", c: "teal", time: "08:40", text: "Le rapport de pentest est arrivé. <span class=\"mention\">@Nadia El Amrani</span> merci, je crée la remédiation 👇", card: { kind: "task", title: "Corriger les vulnérabilités critiques", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · 15 juin' } },
        { who: "Nadia El Amrani", role: "Contributeur", i: "NE", c: "indigo", time: "08:52", text: "3 vulnérabilités critiques, détails dans le rapport (diffusion restreinte)." },
        { who: "Léa Rousseau", role: "Contributeur", i: "LR", c: "green", time: "09:15", text: "MFA déployé sur 100 % des comptes ✅" }
      ],
      mail: [
        { from: "CERT-FR", subj: "Alerte de sécurité — vulnérabilité critique", prev: "Une vulnérabilité critique affecte plusieurs produits…", time: "07:50", i: "CF", c: "violet", unread: true },
        { from: "Nadia El Amrani", subj: "Rapport de test d'intrusion — synthèse", prev: "Bonjour, veuillez trouver la synthèse exécutive du pentest…", time: "Hier", i: "NE", c: "indigo", ext: true }
      ]
    },

    collab: {
      name: "Plateforme collaborative", tint: "green", accent: "--successColor", members: 7, chatCount: 4, agendaCount: 2,
      membersList: [
        { n: "Léa Rousseau", i: "LR", c: "green", role: "Owner" },
        { n: "Camille Laurent", i: "CL", c: "blue", role: "Administrateur" },
        { n: "Hugo Petit", i: "HP", c: "teal", role: "Contributeur" },
        { n: "Inès Garnier", i: "IG", c: "violet", role: "Contributeur" },
        { n: "Sophie Dubois", i: "SD", c: "amber", role: "Contributeur" },
        { n: "Théo Marchand", i: "TM", c: "indigo", role: "Contributeur" },
        { n: "Aïcha Diallo", i: "AD", c: "primary", role: "Lecteur" }
      ],
      feed: [
        { who: "Léa Rousseau", act: "a ajouté un document", when: "il y a 15 min", type: "doc", card: { kind: "doc", title: "Guide d'adoption Twake.pdf", meta: '<span class="badge badge-version">' + iconSvg("i-layers") + ' v3</span> <span class="badge badge-ai">' + iconSvg("i-sparkles") + ' Rangé par IA</span>' } },
        { who: "Hugo Petit", act: "a créé une tâche", when: "il y a 1 h", type: "task", card: { kind: "task", title: "Former les ambassadeurs internes", meta: '<span class="chip-status chip-status--doing"><span class="chip-dot"></span> En cours</span> · échéance 26 juin' } },
        { who: "Inès Garnier", act: "a planifié un webinaire", when: "il y a 2 h", type: "event", card: { kind: "event", title: "Webinaire de lancement", day: "19", mon: "JUIN", time: "11:00", visio: true } },
        { who: "Théo Marchand", act: "a rejoint l'espace", when: "il y a 6 h", type: "member", note: "Ambassadeur · invité par Léa Rousseau" }
      ],
      tasks: [
        { title: "Former les ambassadeurs internes", status: "doing", who: "Hugo Petit", i: "HP", c: "teal", due: "26 juin" },
        { title: "Migrer les groupes de travail historiques", status: "doing", who: "Inès Garnier", i: "IG", c: "violet", due: "28 juin" },
        { title: "Rédiger la charte d'usage", status: "todo", who: "Sophie Dubois", i: "SD", c: "amber", due: "20 juin" },
        { title: "Mesurer l'adoption (tableau de bord)", status: "todo", who: "Théo Marchand", i: "TM", c: "indigo", due: "1 juil." },
        { title: "Configurer les espaces pilotes", status: "done", who: "Camille Laurent", i: "CL", c: "blue" },
        { title: "Déployer Twake Visio Meeting", status: "done", who: "Léa Rousseau", i: "LR", c: "green" }
      ],
      files: [
        { name: "Guide d'adoption Twake.pdf", ico: "pdf", owner: "Léa R.", oi: "LR", oc: "green", date: "11 juin", size: "6,1 Mo", kw: "adoption guide", badges: [{ type: "version", text: "v3" }, { type: "ai", text: "Rangé par IA" }] },
        { name: "Charte d'usage.docx", ico: "doc", owner: "Sophie D.", oi: "SD", oc: "amber", date: "9 juin", size: "210 Ko", kw: "charte usage" },
        { name: "Tableau de bord adoption.xlsx", ico: "xls", owner: "Théo M.", oi: "TM", oc: "indigo", date: "8 juin", size: "740 Ko", kw: "adoption métriques" },
        { name: "Kit de communication.pdf", ico: "pdf", owner: "Inès G.", oi: "IG", oc: "violet", date: "5 juin", size: "12 Mo", kw: "communication kit", badges: [{ type: "warn", text: "Diffusion externe restreinte" }] }
      ],
      agenda: [
        { dnum: "19", dlabel: "Jeudi", events: [{ title: "Webinaire de lancement", day: "19", mon: "JUIN", time: "11:00 – 12:00", visio: true, people: "Toute l'organisation" }] },
        { dnum: "24", dlabel: "Mardi", events: [{ title: "Atelier ambassadeurs", day: "24", mon: "JUIN", time: "14:00 – 16:00", place: "Conference Room A", people: "Hugo, Théo, ambassadeurs" }] }
      ],
      channels: [{ name: "général", n: 2, active: true }, { name: "ambassadeurs", n: 5 }, { name: "support" }, { name: "feedback" }],
      messages: [
        { who: "Léa Rousseau", role: "Owner", i: "LR", c: "green", time: "09:00", text: "Le guide d'adoption v3 est en ligne 🎉 <span class=\"mention\">@Hugo Petit</span> on cale la formation ?" },
        { who: "Hugo Petit", role: "Contributeur", i: "HP", c: "teal", time: "09:12", text: "Oui ! Je relie l'événement webinaire 👇", card: { kind: "event", title: "Webinaire de lancement", day: "19", mon: "JUIN", time: "11:00", visio: true } },
        { who: "Sophie Dubois", role: "Contributeur", i: "SD", c: "amber", time: "09:30", text: "Je finalise la charte d'usage pour vendredi." }
      ],
      mail: [
        { from: "Communication interne", subj: "Save the date — Webinaire Twake le 19 juin", prev: "Rejoignez le webinaire de lancement de la plateforme collaborative…", time: "08:15", i: "CI", c: "green", unread: true },
        { from: "Réseau ambassadeurs", subj: "Retours des espaces pilotes", prev: "Les premiers retours d'usage sont très positifs, voici la synthèse…", time: "Hier", i: "RA", c: "indigo" }
      ]
    }
  };

  // --- Constructeurs HTML (réutilisent les classes existantes) ---------------
  const SL = { todo: "À faire", doing: "En cours", done: "Terminé" };
  function avaSvg(i, c, label, xs) {
    return '<svg class="avatar avatar--' + c + (xs ? " avatar-xs" : "") + '" viewBox="0 0 40 40" role="img" aria-label="' + (label || i) + '"><circle class="avatar-bg" cx="20" cy="20" r="20"/><text class="avatar-initials" x="20" y="21">' + i + '</text></svg>';
  }
  const FEED_ICON = { doc: "i-doc", task: "i-check-square", event: "i-calendar", msg: "i-chat", member: "i-user-plus", lock: "i-lock" };
  function ocardHtml(c) {
    if (!c) return "";
    if (c.kind === "event") {
      return '<article class="ocard ocard--event"><span class="ocard-accent"></span><div class="ocard-date"><span class="ocard-day">' + c.day + '</span><span class="ocard-mon">' + c.mon + '</span></div><div class="ocard-main"><h4 class="ocard-title">' + c.title + '</h4><p class="ocard-meta">' + iconSvg("i-clock") + " " + c.time + (c.visio ? " · " + iconSvg("i-video") + " Twake Visio Meeting" : (c.place ? " · " + iconSvg("i-pin") + " " + c.place : "")) + '</p></div></article>';
    }
    return '<article class="ocard"><span class="ocard-accent"></span><span class="ocard-ico">' + iconSvg(c.kind === "task" ? "i-check-square" : "i-doc") + '</span><div class="ocard-main"><h4 class="ocard-title">' + c.title + '</h4><p class="ocard-meta">' + (c.meta || "") + '</p></div></article>';
  }
  function renderFeed(s) {
    const items = s.feed.map((f) =>
      '<li class="feed-item" data-searchable="' + norm(f.who + " " + f.act + " " + (f.card ? f.card.title : "") + " " + (f.note || "") + " " + (f.quote || "")) + '"><span class="feed-bullet feed-bullet--' + f.type + '">' + iconSvg(FEED_ICON[f.type]) + '</span><div class="feed-body"><p class="feed-line"><strong>' + f.who + '</strong> ' + f.act + ' <span class="feed-when">· ' + f.when + '</span></p>' +
      (f.card ? ocardHtml(f.card) : "") + (f.quote ? '<blockquote class="feed-quote">' + f.quote + '</blockquote>' : "") + (f.note ? '<p class="muted small">' + f.note + '</p>' : "") + '</div></li>'
    ).join("");
    return '<div class="panel-inner feed"><div class="section-head"><h3 class="section-title">Fil d\'actualité</h3><span class="muted">Toute l\'activité de l\'espace, agrégée en temps réel</span></div><ol class="feed-list" data-searchable-list>' + items + '</ol></div>';
  }
  function taskCardHtml(t) {
    return '<article class="task-card' + (t.status === "done" ? " task-card--done" : "") + '" data-task data-status="' + t.status + '" data-searchable="' + norm(t.title + " " + t.who) + '"><p class="task-title">' + t.title + '</p><div class="task-foot"><button class="chip-status chip-status--' + t.status + '" data-action="cycle-status" aria-label="Changer le statut : actuellement ' + SL[t.status] + '"><span class="chip-dot"></span> ' + SL[t.status] + '</button><span class="task-meta">' + (t.due ? iconSvg("i-clock") + " " + t.due + " " : "") + avaSvg(t.i, t.c, "Assigné à " + t.who, true) + '</span></div></article>';
  }
  function renderTasks(s) {
    const cols = { todo: [], doing: [], done: [] };
    s.tasks.forEach((t) => cols[t.status].push(t));
    const total = s.tasks.length, done = cols.done.length, pct = total ? Math.round(done / total * 100) : 0;
    function colHtml(key, label, dot) {
      return '<div class="board-col" data-col="' + key + '"><p class="board-col-head"><span class="chip-dot ' + dot + '"></span> ' + label + ' <span class="board-col-count" data-count="' + key + '">' + cols[key].length + '</span></p><div class="board-col-body" data-searchable-list>' + cols[key].map(taskCardHtml).join("") + '</div></div>';
    }
    return '<div class="panel-inner tasks"><div class="section-head"><h3 class="section-title">Tâches</h3><span class="muted">Cliquez sur le statut d\'une carte pour le faire évoluer</span></div><div class="progress-card"><div class="progress-head"><span>Avancement de l\'espace</span><strong data-progress-label>' + pct + ' %</strong></div><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Avancement de l\'espace"><div class="progress-fill" data-progress-fill></div></div><p class="muted small"><span data-progress-count>' + done + '</span> tâches terminées sur ' + total + '</p></div><div class="board" data-board>' + colHtml("todo", "À faire", "chip-dot--todo") + colHtml("doing", "En cours", "chip-dot--doing") + colHtml("done", "Terminé", "chip-dot--done") + '</div></div>';
  }
  const BADGE_MAP = { version: "badge-version", warn: "badge-warn", lock: "badge-lock", ai: "badge-ai", sync: "badge-sync" };
  const BADGE_ICO = { version: "i-layers", warn: "i-globe", lock: "i-lock", ai: "i-sparkles" };
  function fileRowHtml(f) {
    const badges = (f.badges || []).map((b) => '<span class="badge ' + (BADGE_MAP[b.type] || "badge-lock") + '">' + (BADGE_ICO[b.type] ? iconSvg(BADGE_ICO[b.type]) : "") + " " + b.text + '</span>').join(" ");
    return '<li class="file-wrap" data-searchable="' + norm(f.name + " " + f.owner + " " + (f.kw || "")) + '"><div class="files-row"><span class="file-name">' + iconSvg("i-doc", "file-ico file-ico--" + f.ico) + '<span>' + f.name + (badges ? ' <span class="file-badges">' + badges + '</span>' : "") + '</span></span><span class="file-owner">' + avaSvg(f.oi, f.oc, f.owner, true) + " " + f.owner + '</span><span class="muted">' + f.date + '</span><span class="muted">' + f.size + '</span><span class="col-end"><button class="icon-btn" data-noop aria-label="Télécharger">' + iconSvg("i-download") + '</button></span></div></li>';
  }
  function renderFiles(s) {
    return '<div class="panel-inner files"><nav class="breadcrumb" aria-label="Emplacement">' + iconSvg("i-folder") + ' <span>Espaces partagés</span> ' + iconSvg("i-chevron-right", "bc-sep") + ' <span>' + s.name + '</span> ' + iconSvg("i-chevron-right", "bc-sep") + ' <span class="bc-current">Documents</span> <span class="badge badge-sync">' + iconSvg("i-layers") + ' Synchronisé avec le Drive partagé</span></nav><div class="files-search"><div class="search search--inline">' + iconSvg("i-search", "search-icon") + '<input class="search-input" type="search" placeholder="Recherche plein texte dans les documents…" aria-label="Recherche plein texte" data-input="files-search"></div><span class="ai-tag">' + iconSvg("i-sparkles") + ' Recherche plein texte IA</span></div><p class="files-search-hint" data-files-hint hidden></p><div class="files-table" role="table" aria-label="Documents de l\'espace"><div class="files-row files-row--head" role="row"><span role="columnheader">Nom</span><span role="columnheader">Propriétaire</span><span role="columnheader">Modifié</span><span role="columnheader">Taille</span><span role="columnheader" class="col-end">Statut</span></div><ul class="files-body" data-searchable-list>' + s.files.map(fileRowHtml).join("") + '</ul></div></div>';
  }
  function renderAgenda(s) {
    const days = s.agenda.map((d) =>
      '<div class="agenda-day"><p class="agenda-date"><span class="agenda-dnum">' + d.dnum + '</span> <span class="agenda-dlabel">' + d.dlabel + '</span></p><div class="agenda-events" data-searchable-list>' +
      d.events.map((e) => '<article class="ocard ocard--event" data-searchable="' + norm(e.title + " " + (e.place || "")) + '"><span class="ocard-accent"></span><div class="ocard-date"><span class="ocard-day">' + e.day + '</span><span class="ocard-mon">' + e.mon + '</span></div><div class="ocard-main"><h4 class="ocard-title">' + e.title + '</h4><p class="ocard-meta">' + iconSvg("i-clock") + " " + e.time + (e.visio ? " · " + iconSvg("i-video") + " Twake Visio Meeting" : (e.place ? " · " + iconSvg("i-pin") + " " + e.place : "")) + '</p>' + (e.people ? '<p class="ocard-people">' + iconSvg("i-users") + " " + e.people + '</p>' : "") + '</div></article>').join("") + '</div></div>'
    ).join("");
    return '<div class="panel-inner agenda"><div class="section-head"><h3 class="section-title">Agenda partagé</h3><span class="muted">Échéances et réunions de l\'espace · juin 2026</span></div>' + days + '</div>';
  }
  function renderMail(s) {
    const rows = s.mail.map((m) =>
      '<li class="mail-row' + (m.unread ? " mail-row--unread" : "") + '" data-searchable="' + norm(m.from + " " + m.subj) + '">' + avaSvg(m.i, m.c, m.from, true) + '<div class="mail-main"><p class="mail-from">' + m.from + (m.ext ? ' <span class="badge badge-ext">Externe</span>' : "") + '</p><p class="mail-subject">' + m.subj + '</p><p class="mail-preview muted">' + m.prev + '</p></div><span class="mail-time muted">' + m.time + '</span></li>'
    ).join("");
    return '<div class="panel-inner mail"><div class="section-head"><h3 class="section-title">Mail de l\'espace</h3><span class="badge badge-sync">Vue allégée</span></div><ul class="mail-list" data-searchable-list>' + rows + '</ul></div>';
  }
  function renderChat(s) {
    const channels = s.channels.map((c) => '<button class="channel' + (c.active ? " is-active" : "") + '" data-channel="' + c.name + '"># ' + c.name + (c.n ? ' <span class="channel-badge' + (c.alert ? " channel-badge--alert" : "") + '">' + c.n + '</span>' : "") + '</button>').join("");
    const first = s.channels[0] ? s.channels[0].name : "général";
    const msgs = s.messages.map((m) =>
      '<div class="msg">' + avaSvg(m.i, m.c, m.who) + '<div class="msg-body"><p class="msg-head"><span class="msg-name">' + m.who + '</span> ' + (m.role ? '<span class="badge badge-role">' + m.role + '</span> ' : "") + '<span class="msg-time">' + m.time + '</span></p><div class="bubble">' + m.text + '</div>' + (m.card ? '<article class="ocard ocard--inchat' + (m.card.kind === "event" ? " ocard--event" : "") + '">' + ocardHtml(m.card).replace(/^<article class="ocard[^"]*">/, "") : "") + '</div></div>'
    ).join("");
    return '<div class="chat"><div class="channels" aria-label="Canaux"><p class="nav-section">Canaux</p>' + channels + '</div><div class="thread"><div class="thread-head"><h3 class="thread-title"># ' + first + '</h3><span class="muted small">Canal de l\'espace ' + s.name + ' · ' + s.members + ' membres</span></div><div class="messages" data-messages>' + msgs + '</div><form class="composer" data-composer><button type="button" class="icon-btn" data-action="link-object" aria-label="Lier un objet"><svg class="icon"><use href="#i-paperclip"></use></svg></button><input class="composer-input" type="text" placeholder="Envoyer un message à #' + first + '…" aria-label="Votre message" data-input="message"><button type="button" class="icon-btn" data-noop aria-label="Emoji"><svg class="icon"><use href="#i-smile"></use></svg></button><button type="submit" class="btn btn-primary composer-send" data-action="send" aria-label="Envoyer"><svg class="icon"><use href="#i-send"></use></svg></button></form></div></div>';
  }
  function renderMembers(s) {
    return s.membersList.map((m) => {
      const role = m.role === "Owner" ? '<span class="badge badge-role">Owner</span>' : '<select class="select select--role" aria-label="Rôle de ' + m.n + '" data-noop><option>' + m.role + '</option><option>Administrateur</option><option>Contributeur</option><option>Lecteur</option></select>';
      const email = m.email || (norm(m.n).replace(/ /g, ".") + "@org.fr");
      return '<div class="member">' + avaSvg(m.i, m.c, m.n) + '<div class="member-id"><p class="member-name">' + m.n + (m.ext ? ' <span class="badge badge-ext">Externe</span>' : "") + '</p><p class="muted small">' + email + '</p></div>' + role + '</div>';
    }).join("");
  }

  // --- Réponses de l'assistant selon l'espace courant ------------------------
  function genResume(s) {
    const lines = s.feed.slice(0, 4).map((f) => '<li>' + f.who + " " + f.act.replace(/^a /, "a ") + (f.card ? ' <span class="ai-ref">' + f.card.title + '</span>' : "") + '.</li>').join("");
    const total = s.tasks.length, done = s.tasks.filter((t) => t.status === "done").length, pct = total ? Math.round(done / total * 100) : 0;
    return "Voici l'activité récente de <strong>" + s.name + "</strong> :<ul>" + lines + "</ul>Avancement des tâches : <strong>" + pct + " %</strong> (" + done + " terminées sur " + total + ").";
  }
  function genTaches(s) {
    const c = { todo: 0, doing: 0, done: 0 }; s.tasks.forEach((t) => c[t.status]++);
    const risk = s.tasks.filter((t) => t.status !== "done").slice(0, 3).map((t) => '<li><span class="ai-ref">' + t.title + '</span> — ' + t.who + (t.due ? ", échéance " + t.due : "") + " (" + SL[t.status] + ").</li>").join("");
    return "Sur " + s.tasks.length + " tâches : <strong>" + c.todo + " à faire, " + c.doing + " en cours, " + c.done + " terminées</strong>.<ul>" + risk + "</ul>À suivre en priorité.";
  }
  function genCompte(s) {
    const ev = s.agenda[0] && s.agenda[0].events[0];
    const people = ev && ev.people ? ev.people : s.membersList.slice(0, 3).map((m) => m.n.split(" ")[0]).join(", ");
    return "Projet de compte-rendu" + (ev ? " — <strong>" + ev.title + "</strong>" : "") + " :<ul><li><strong>Participants</strong> : " + people + ".</li><li><strong>Points</strong> : avancement des tâches en cours et prochaines échéances.</li><li><strong>Suites</strong> : assignations et points de suivi.</li></ul>Je peux l'enregistrer comme document dans Fichiers.";
  }
  function genSearch(s) {
    const docs = s.files.slice(0, 3).map((f) => '<li>📄 <span class="ai-ref">' + f.name + '</span> — ' + f.owner + ".</li>").join("");
    return s.files.length + " documents dans l'espace (recherche plein texte) :<ul>" + docs + "</ul>Précisez un mot-clé pour affiner la recherche.";
  }
  function getAiAnswer(key) {
    if (currentSpaceKey === "b2b") return B2B_AI[key] || AI_DEFAULT;
    const s = SPACES[currentSpaceKey];
    if (!s) return AI_DEFAULT;
    if (key === "resume") return genResume(s);
    if (key === "taches") return genTaches(s);
    if (key === "copil") return genCompte(s);
    if (key === "search") return genSearch(s);
    return AI_DEFAULT;
  }
  function aiReset(spaceName) {
    if (!aiConv) return;
    aiConv.innerHTML = '<div class="ai-msg ai-msg--bot"><span class="ai-avatar" aria-hidden="true">' + iconSvg("i-sparkles") + '</span><div class="ai-bubble">Bonjour Camille 👋 Je suis l\'assistant de l\'espace <strong>' + spaceName + '</strong>. Je peux résumer l\'activité, retrouver des documents, suivre les tâches ou rédiger un compte-rendu — à partir des données de l\'espace, sans rien envoyer à l\'extérieur.</div></div>';
    const chips = $("[data-ai-chips]"); if (chips) chips.hidden = false;
  }

  // --- Bascule d'espace ------------------------------------------------------
  function setTabCount(tab, n) {
    const t = $('.tab[data-tab="' + tab + '"] .tab-count');
    if (!t) return;
    if (n) { t.textContent = n; t.hidden = false; } else { t.hidden = true; }
  }
  function selectSpace(key) {
    const s = SPACES[key];
    if (!s) return;
    currentSpaceKey = key;
    // En-tête
    const logo = $("[data-space-logo]");
    if (logo) logo.innerHTML = s.tint === "grad" ? CUBE_HTML : '<span class="space-mini space-mini--' + s.tint + '" aria-hidden="true"></span>';
    const nameEl = $(".space-name"); if (nameEl) nameEl.textContent = s.name;
    memberCount = s.members;
    const sub = $(".space-sub"); if (sub) sub.lastChild.textContent = " Espace partagé · " + s.members + " membres";
    root.style.setProperty("--spaceAccent", "var(" + s.accent + ")");
    // Sidebar : item actif
    $$(".nav-space").forEach((n) => n.classList.toggle("is-active", n.dataset.space === key));
    // Compteurs d'onglets
    setTabCount("chat", s.chatCount); setTabCount("agenda", s.agendaCount);
    // Panneaux
    if (s.static) {
      Object.keys(PANEL_SNAP).forEach((p) => { const el = $('.panel[data-panel="' + p + '"]'); if (el) el.innerHTML = PANEL_SNAP[p]; });
      const ml = $("[data-members-list]"); if (ml) ml.innerHTML = MEMBERS_SNAP;
    } else {
      $('.panel[data-panel="feed"]').innerHTML = renderFeed(s);
      $('.panel[data-panel="chat"]').innerHTML = renderChat(s);
      $('.panel[data-panel="files"]').innerHTML = renderFiles(s);
      $('.panel[data-panel="tasks"]').innerHTML = renderTasks(s);
      $('.panel[data-panel="agenda"]').innerHTML = renderAgenda(s);
      $('.panel[data-panel="mail"]').innerHTML = renderMail(s);
      const ml = $("[data-members-list]"); if (ml) ml.innerHTML = renderMembers(s);
    }
    const mb = $("#mb-title"); if (mb) mb.lastChild.textContent = " Membres · " + s.members;
    if (globalSearch) globalSearch.value = "";
    aiReset(s.name);
    activateTab("feed");
    recomputeTasks();
    announce("Espace " + s.name + " ouvert");
  }

  /* ---------------------------------------------------------------------------
     14c. PRÉFÉRENCES UTILISATEUR (panneau sur l'avatar)
     ------------------------------------------------------------------------ */
  const prefsPop = $('[data-pop="prefs"]');
  const prefsBtn = $('[data-open-pop="prefs"]');
  function closePrefs() { if (prefsPop && !prefsPop.hidden) { prefsPop.hidden = true; document.removeEventListener("click", prefsOutside); } }
  function prefsOutside(e) { if (prefsPop && !prefsPop.contains(e.target) && !(prefsBtn && prefsBtn.contains(e.target))) closePrefs(); }
  if (prefsBtn) prefsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prefsPop.hidden = !prefsPop.hidden;
    if (!prefsPop.hidden) document.addEventListener("click", prefsOutside);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePrefs(); });
  const logoutBtn = $('[data-action="logout"]');
  if (logoutBtn) logoutBtn.addEventListener("click", () => { closePrefs(); toast("Déconnexion", "Vous avez été déconnecté de l'ECS (simulation).", "i-logout"); });

  /* ---------------------------------------------------------------------------
     15. INIT
     ------------------------------------------------------------------------ */
  recomputeTasks();
  refreshBadge(false);
  announce("Espace B2B Admin Panel chargé");
})();
