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
  console.log('[cozy-bridge] script loaded on', location.href);

  // Block BentoPDF's own service worker — it intercepts every fetch
  // (including the HTML response) and triggers a reload on activation,
  // which throws the iframe.contentWindow / postMessage path into an
  // inconsistent state where messages are silently dropped. Patch must
  // run *before* the module-defer'd main-*.js calls
  // navigator.serviceWorker.register().
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        console.log('[cozy-bridge] blocked SW register call');
        return Promise.resolve(null);
      };
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        if (rs && rs.length) {
          console.log('[cozy-bridge] unregistering', rs.length, 'existing SW(s)');
          rs.forEach(function (r) { r.unregister(); });
        }
      });
    }
  } catch (swErr) {
    console.warn('[cozy-bridge] SW disable failed', swErr);
  }

  // Diagnostic catch-all: log every postMessage ever received.
  window.addEventListener('message', function (e) {
    console.log('[cozy-bridge:RAW] any message received', {
      origin: e.origin,
      dataType: typeof e.data,
      data: e.data
    });
  }, true);

  var EXPECTED_PARENTS = ['dev-twake.maudet.cloud'];
  function expectedOrigin(o) {
    return EXPECTED_PARENTS.some(function (d) {
      return o === 'https://' + d || o.endsWith('.' + d);
    });
  }

  function injectFile(file) {
    var input = document.getElementById('file-input');
    console.log('[cozy-bridge] looking for #file-input, found:', !!input);
    if (!input) {
      alert('Choisis d’abord un outil PDF (Fusionner, Scinder, Compresser…) puis recommence.');
      return;
    }
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[cozy-bridge] file injected:', file.name, file.size, 'bytes');
    } catch (err) {
      console.error('[cozy-bridge] inject failed', err);
      alert('Injection PDF échouée: ' + err.message);
    }
  }

  // Inject a "Ouvrir depuis le Drive" button next to BentoPDF's local
  // dropzone (#file-input). The dropzone wraps a transparent file-input
  // that covers it entirely; we shrink that input to the left half and
  // overlay our button on the right half, with a thin vertical divider
  // between them. Clicking the button posts {type:'cozy-open-picker'}
  // back to the parent coquille, which opens the Drive file picker.
  function injectDriveButton() {
    var input = document.getElementById('file-input');
    if (!input) return false;
    if (document.getElementById('cozy-drive-button')) return true; // already injected

    var dropzone = input.parentElement;
    if (!dropzone) return false;

    // Make sure the host element is a positioning context.
    var dzStyle = window.getComputedStyle(dropzone);
    if (dzStyle.position === 'static') dropzone.style.position = 'relative';

    // Shrink the transparent file-input to the left half so the right
    // half is clickable through to our button.
    input.style.width = '50%';
    input.style.left = '0';
    input.style.right = 'auto';

    // Vertical divider between local-drop area and Drive button.
    var div = document.createElement('div');
    div.id = 'cozy-drive-divider';
    div.style.cssText =
      'position:absolute;top:18%;bottom:18%;left:50%;width:1px;'
      + 'background:rgba(124,124,135,0.28);z-index:10;pointer-events:none;';
    dropzone.appendChild(div);

    // Drive button — anchored centered in the right half.
    var btn = document.createElement('button');
    btn.id = 'cozy-drive-button';
    btn.type = 'button';
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
      + 'stroke-linejoin="round" style="margin-right:.5em;vertical-align:-3px"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>'
      + 'Ouvrir depuis le Drive';
    btn.style.cssText =
      'position:absolute;top:50%;left:75%;transform:translate(-50%,-50%);'
      + 'z-index:20;padding:.65em 1.2em;font:600 .9em system-ui,sans-serif;'
      + 'background:#5e72e4;color:#fff;border:0;border-radius:6px;'
      + 'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);'
      + 'display:inline-flex;align-items:center;';
    btn.addEventListener('mouseover', function () { btn.style.background = '#4338ca'; });
    btn.addEventListener('mouseout', function () { btn.style.background = '#5e72e4'; });
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      window.parent.postMessage({ type: 'cozy-open-picker' }, '*');
      console.log('[cozy-bridge] cozy-open-picker sent to parent');
    });
    dropzone.appendChild(btn);
    console.log('[cozy-bridge] Drive button injected');
    return true;
  }

  // Tool pages are SPA-routed; the dropzone DOM appears asynchronously.
  // Try at first paint, then watch for new dropzones (tool changes,
  // re-mounts, route changes).
  if (!injectDriveButton()) {
    var dropzoneObserver = new MutationObserver(function () {
      injectDriveButton();
    });
    dropzoneObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('message', function (e) {
    console.log('[cozy-bridge] postMessage received', {
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
      console.log('[cozy-bridge] received blob (legacy), converting');
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
    console.log('[cozy-bridge] arrayBuffer received', {
      byteLength: ab.byteLength,
      name: d.name
    });
    var name = d.name || 'document.pdf';
    var file = new File([ab], name, { type: 'application/pdf' });
    injectFile(file);
  });
})();
