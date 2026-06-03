// Bridge between the Cozy bentopdf coquille (parent window) and the
// BentoPDF iframe. Injected into every BentoPDF HTML response via
// nginx sub_filter, served as a static file from
// /etc/nginx/snippets/cozy-bridge.js for size reasons.
//
// 1. Disables the BentoPDF service worker (it triggers a hard reload
//    on activation which silently breaks postMessage between parent
//    and iframe).
// 2. Listens for postMessage({type:'cozy-load-pdf', name, arrayBuffer})
//    from the parent coquille and feeds the resulting File into
//    BentoPDF's #file-input (DataTransfer + change event).
(function () {
  // Verbose traces only when the iframe URL carries ?debug=1. The
  // parent coquille can flip the iframe URL to enable this for a
  // debug session.
  var DEBUG = new URLSearchParams(location.search).get('debug') === '1';
  function dbg() { if (DEBUG) console.log.apply(console, arguments); }

  dbg('[cozy-bridge] script loaded on', location.href);

  // Block BentoPDF's own service worker — it intercepts every fetch
  // (including the HTML response) and triggers a reload on activation,
  // which throws the iframe.contentWindow / postMessage path into an
  // inconsistent state where messages are silently dropped. Patch must
  // run *before* the module-defer'd main-*.js calls
  // navigator.serviceWorker.register().
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        return Promise.resolve(null);
      };
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        if (rs && rs.length) {
          rs.forEach(function (r) { r.unregister(); });
        }
      });
    }
  } catch (swErr) {
    console.warn('[cozy-bridge] SW disable failed', swErr);
  }

  var EXPECTED_PARENTS = ['dev-twake.maudet.cloud'];
  function expectedOrigin(o) {
    return EXPECTED_PARENTS.some(function (d) {
      return o === 'https://' + d || o.endsWith('.' + d);
    });
  }

  // If the host page hasn't rendered the tool's #file-input yet (e.g.
  // because the parent sent the file right after navigating the iframe
  // to /fr/edit-pdf), we stash the file and let the existing
  // MutationObserver pick it up when the input appears. Without this,
  // a fast deep-link from the dashboard or the Drive lands on an
  // empty tool view.
  var pendingFile = null;
  function injectFile(file) {
    var input = document.getElementById('file-input');
    dbg('[cozy-bridge] looking for #file-input, found:', !!input);
    if (!input) {
      dbg('[cozy-bridge] #file-input not mounted yet, stashing');
      pendingFile = file;
      return;
    }
    pendingFile = null;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      dbg('[cozy-bridge] file injected:', file.name, file.size, 'bytes');
    } catch (err) {
      console.error('[cozy-bridge] inject failed', err);
      alert('Injection PDF échouée: ' + err.message);
    }
  }
  function tryFlushPendingFile() {
    if (!pendingFile) return;
    var input = document.getElementById('file-input');
    if (!input) return;
    var file = pendingFile;
    pendingFile = null;
    injectFile(file);
  }

  // Wrap BentoPDF's local dropzone with a second, visually symmetric
  // "Depuis votre Drive" card on the right. The two cards share style
  // (border-dashed, padding, hover) so neither chrome wins visually:
  // left = local upload (existing dropzone, untouched apart from
  // shrinking to 50%), right = our card that posts cozy-open-picker
  // to the parent coquille on click.
  // Symmetric hover effect on both cards. Injected once, scoped by
  // class so we never collide with BentoPDF's own styles.
  function ensureCardStyles() {
    if (document.getElementById('cozy-card-styles')) return;
    var style = document.createElement('style');
    style.id = 'cozy-card-styles';
    style.textContent = [
      '.cozy-local-card, #cozy-drive-card {',
      '  transition: background 0.1s, border-color 0.1s;',
      '}',
      '.cozy-local-card:hover, #cozy-drive-card:hover, #cozy-drive-card:focus {',
      '  background: rgba(124,124,135,0.06) !important;',
      '  border-color: rgba(94,114,228,0.55) !important;',
      '  outline: none;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function injectDriveCard() {
    var input = document.getElementById('file-input');
    if (!input) return false;
    if (document.getElementById('cozy-drive-card')) return true;

    var dropzone = input.parentElement;
    if (!dropzone) return false;
    var parent = dropzone.parentElement;
    if (!parent) return false;

    ensureCardStyles();

    // Clean up artefacts from the previous "split inside dropzone" design.
    input.style.removeProperty('width');
    input.style.removeProperty('left');
    input.style.removeProperty('right');
    var oldDivider = dropzone.querySelector('#cozy-drive-divider');
    if (oldDivider) oldDivider.remove();
    var oldButton = dropzone.querySelector('#cozy-drive-button');
    if (oldButton) oldButton.remove();

    // Tag the BentoPDF dropzone so our shared :hover rule applies to it
    // too. We don't mutate the existing style attribute beyond that.
    dropzone.classList.add('cozy-local-card');

    // Build the flex wrapper hosting the 2 cards.
    var wrapper = document.createElement('div');
    wrapper.id = 'cozy-dropzone-split';
    wrapper.style.cssText =
      'display:flex;gap:1rem;width:100%;align-items:stretch;';

    parent.insertBefore(wrapper, dropzone);
    wrapper.appendChild(dropzone);
    dropzone.style.flex = '1 1 50%';
    dropzone.style.minWidth = '0';
    dropzone.style.width = 'auto';

    // Drive card, mirror of the dropzone style (dashed border, padding,
    // hover background). Icon + bold title + soft subtitle, all
    // centered. Entirely clickable.
    var card = document.createElement('div');
    card.id = 'cozy-drive-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Ouvrir un PDF depuis le Drive');
    card.style.cssText =
      'flex:1 1 50%;min-width:0;'
      + 'border:2px dashed rgba(124,124,135,0.4);'
      + 'border-radius:0.5rem;'
      + 'padding:3rem 1.5rem;'
      + 'display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:0.5rem;'
      + 'cursor:pointer;'
      + 'text-align:center;color:inherit;font:inherit;background:transparent;';

    card.innerHTML =
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
      + 'stroke-linejoin="round" style="opacity:.65"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>'
      + '<div style="font-weight:600;font-size:1rem;margin-top:.25rem;">Depuis votre Drive</div>'
      + '<div style="font-size:.875rem;opacity:.7;">Parcourir vos PDFs</div>';

    function openPicker() {
      window.parent.postMessage({ type: 'cozy-open-picker' }, '*');
      dbg('[cozy-bridge] cozy-open-picker sent to parent');
    }
    card.addEventListener('click', openPicker);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });

    wrapper.appendChild(card);
    dbg('[cozy-bridge] Drive card injected');
    return true;
  }

  // Tool pages are SPA-routed; the dropzone DOM appears asynchronously.
  // Try at first paint, then watch for new dropzones (tool changes,
  // re-mounts, route changes). Also re-inject if the dropzone gets
  // re-rendered (e.g. after the user removes a file).
  if (!injectDriveCard()) {
    var dropzoneObserver = new MutationObserver(function () {
      injectDriveCard();
      tryFlushPendingFile();
    });
    dropzoneObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    // Even if we injected immediately, keep watching for SPA route
    // changes so a fresh dropzone gets the card too.
    var dropzoneObserver = new MutationObserver(function () {
      injectDriveCard();
      tryFlushPendingFile();
    });
    dropzoneObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('message', function (e) {
    dbg('[cozy-bridge] postMessage received', {
      origin: e.origin,
      dataType: e.data && e.data.type
    });
    if (!expectedOrigin(e.origin)) {
      console.warn('[cozy-bridge] ignored: bad origin', e.origin);
      return;
    }
    var d = e.data || {};
    if (d.type !== 'cozy-load-pdf') return;
    var ab = d.arrayBuffer;
    if (!ab && d.blob) {
      dbg('[cozy-bridge] received blob (legacy), converting');
      d.blob.arrayBuffer().then(function (buf) {
        var name = d.name || 'document.pdf';
        var file = new File([buf], name, { type: 'application/pdf' });
        injectFile(file);
      });
      return;
    }
    if (!ab) {
      console.warn('[cozy-bridge] no arrayBuffer/blob in payload', d);
      return;
    }
    dbg('[cozy-bridge] arrayBuffer received', {
      byteLength: ab.byteLength,
      name: d.name
    });
    var name = d.name || 'document.pdf';
    var file = new File([ab], name, { type: 'application/pdf' });
    injectFile(file);
  });
})();
