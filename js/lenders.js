/* Bank & Credit Union Finder.
   Loads data/lenders/index.json, then one state file. Texas is the only file shipped.
   Another state is a new JSON file plus one entry in the index. No lender is added here. */
(() => {
  'use strict';

  const panel = document.getElementById('panel-lenders');
  if (!panel) return;

  const VERTICALS = [
    { id: 'all', label: 'All', value: null },
    { id: 'powersports', label: 'Powersports', value: 'Powersports' },
    { id: 'boats', label: 'Boats', value: 'Boats/Marine' },
    { id: 'rvs', label: 'RVs', value: 'RVs' },
    { id: 'auto', label: 'Auto', value: 'Cars/Auto' }
  ];
  const COLUMNS = ['Lender', 'Vertical(s)', 'What they offer', 'Dealer-facing', 'Source link', 'Last verified'];

  let states = [];
  let stateData = null;
  let activeCode = '';
  let vertical = 'all';
  let query = '';
  let ready = false;
  let toastTimer = 0;
  const shareSupported = detectShare();

  const PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';
  const DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';
  const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>';

  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Research list</p>
        <h2>Bank &amp; Credit Union Finder</h2>
        <p class="lede">Dealer-directed lenders with a published program active in the state below, or nationwide including that state. Search and filter this starter list. It is not a complete database.</p>
        <div id="lf-state-slot"></div>
        <p class="lf-verified" id="lf-verified"></p>
      </div>
      <div class="lf-actions">
        <button class="btn" id="lf-print" type="button" disabled>${PRINT_ICON}Print</button>
        <button class="btn" id="lf-csv" type="button" disabled>${DOWN_ICON}Download for Excel / Sheets</button>
        <button class="btn" id="lf-copy" type="button" disabled>${COPY_ICON}Copy table</button>
        <button class="btn" id="lf-share" type="button" hidden disabled>${SHARE_ICON}Share</button>
      </div>
    </div>
    <p class="lf-print-meta" id="lf-print-meta"></p>
    <div class="callout lf-disc" id="lf-disclaimer"><strong>Research starter list from public sources.</strong> Not a recommendation or an offer of credit. Verify each program with the lender before use.</div>
    <div class="card lf-tools">
      <div class="field">
        <label for="lf-search">Search</label>
        <div class="inputwrap"><input id="lf-search" type="search" placeholder="Lender name or what they offer" autocomplete="off" enterkeyhint="search" aria-describedby="lf-search-hint"></div>
        <p class="hint" id="lf-search-hint">Matches the lender name and what they offer. Results update as you type.</p>
      </div>
      <div class="lbl" id="lf-vert-label">Vehicle type</div>
      <div class="chips lf-chips" role="group" aria-labelledby="lf-vert-label">
        ${VERTICALS.map(v => `<button type="button" class="chip${v.id === 'all' ? ' active' : ''}" data-lf-vertical="${v.id}" aria-pressed="${v.id === 'all' ? 'true' : 'false'}">${v.label}</button>`).join('')}
      </div>
    </div>
    <p class="lf-count" id="lf-count" aria-live="polite"></p>
    <div class="lf-list" id="lf-results"><p class="lf-loading">Loading the lender list…</p></div>`;

  const search = document.getElementById('lf-search');
  search.addEventListener('input', onQuery);
  search.addEventListener('search', onQuery);
  panel.addEventListener('click', onClick);
  window.addEventListener('beforeprint', () => {
    if (document.body.dataset.route !== 'lenders' || !stateData) return;
    const meta = document.getElementById('lf-print-meta');
    if (meta) meta.textContent = printLine(currentList());
  });

  load();

  function onQuery(e) {
    e.stopPropagation();
    query = search.value;
    render();
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn || !panel.contains(btn)) return;
    if (btn.dataset.lfVertical) {
      vertical = btn.dataset.lfVertical;
      syncChips();
      render();
      return;
    }
    if (btn.dataset.lfState) {
      const code = btn.dataset.lfState;
      if (code && code !== activeCode) loadState(code);
      return;
    }
    if (!ready) return;
    if (btn.id === 'lf-print') { window.print(); return; }
    if (btn.id === 'lf-csv') { downloadCSV(); return; }
    if (btn.id === 'lf-copy') { copyTable(); return; }
    if (btn.id === 'lf-share') shareCSV();
  }

  function syncChips() {
    panel.querySelectorAll('[data-lf-vertical]').forEach(btn => {
      const on = btn.dataset.lfVertical === vertical;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function syncActions() {
    ['lf-print', 'lf-csv', 'lf-copy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !ready;
    });
    const share = document.getElementById('lf-share');
    if (!share) return;
    const show = ready && shareSupported;
    share.hidden = !show;
    share.disabled = !show;
  }

  async function load() {
    try {
      states = parseIndex(await fetchJSON('data/lenders/index.json'));
      activeCode = states[0].code;
      renderStateSlot();
      await loadState(activeCode);
    } catch (err) {
      showError('The lender list did not load. No lenders are shown.');
    }
  }

  async function loadState(code) {
    const state = states.find(s => s.code === code);
    if (!state) return;
    ready = false;
    stateData = null;
    syncActions();
    document.getElementById('lf-results').innerHTML = '<p class="lf-loading">Loading the lender list…</p>';
    document.getElementById('lf-count').textContent = '';
    try {
      const data = await fetchJSON('data/lenders/' + state.file);
      assertState(data, code);
      stateData = data;
      activeCode = code;
      ready = true;
      const dates = [...new Set(data.lenders.map(l => l.lastVerified))];
      document.getElementById('lf-verified').textContent = dates.length === 1
        ? 'List verified ' + dates[0]
        : 'Verification dates vary. See each lender.';
      renderStateSlot();
      syncActions();
      render();
    } catch (err) {
      showError('The ' + state.name + ' lender list did not load. No lenders are shown.');
    }
  }

  function renderStateSlot() {
    const slot = document.getElementById('lf-state-slot');
    if (!slot) return;
    if (states.length <= 1) {
      const name = (stateData && stateData.name) || (states[0] && states[0].name) || '';
      slot.innerHTML = `<p class="lf-state"><span>State</span> <strong>${esc(name)}</strong></p>`;
      return;
    }
    slot.innerHTML = `<div class="chips lf-chips" role="group" aria-label="State">${states.map(s => {
      const on = s.code === activeCode;
      return `<button type="button" class="chip${on ? ' active' : ''}" data-lf-state="${esc(s.code)}" aria-pressed="${on ? 'true' : 'false'}">${esc(s.name)}</button>`;
    }).join('')}</div>`;
  }

  function render() {
    if (!stateData) return;
    const list = currentList();
    document.getElementById('lf-count').textContent = countLine(list);
    document.getElementById('lf-print-meta').textContent = printLine(list);
    const box = document.getElementById('lf-results');
    if (!list.length) {
      box.innerHTML = `<div class="card lf-empty"><h3>No matching lenders</h3><p class="sub">${esc(emptyMessage())}</p></div>`;
      return;
    }
    box.innerHTML = list.map(cardHTML).join('');
  }

  function currentList() {
    if (!stateData) return [];
    const q = query.trim().toLowerCase();
    const vert = VERTICALS.find(v => v.id === vertical);
    return stateData.lenders.filter(lender => {
      if (vert && vert.value && !lender.verticals.includes(vert.value)) return false;
      if (!q) return true;
      return lender.name.toLowerCase().includes(q) || lender.offer.toLowerCase().includes(q);
    });
  }

  function countLine(list) {
    const total = stateData.lenders.length;
    const vert = VERTICALS.find(v => v.id === vertical);
    const q = query.trim();
    let text = 'Showing ' + list.length + ' of ' + total + (total === 1 ? ' lender' : ' lenders');
    if (vertical !== 'all') text += ' · ' + vert.label;
    if (q) text += ' · search "' + q + '"';
    return text;
  }

  function printLine(list) {
    const vert = VERTICALS.find(v => v.id === vertical);
    const q = query.trim();
    const when = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const parts = [
      'F&I Calculators · Stover Advantage LLC',
      stateData.name,
      'Filters applied: ' + (vertical === 'all' ? 'All verticals' : vert.label),
      q ? 'Search: "' + q + '"' : 'No search text',
      list.length + (list.length === 1 ? ' lender' : ' lenders'),
      'Printed ' + when
    ];
    return parts.join(' · ');
  }

  function emptyMessage() {
    const vert = VERTICALS.find(v => v.id === vertical);
    const q = query.trim();
    if (q && vertical !== 'all') return 'No lenders match ' + vert.label + ' and the search "' + q + '".';
    if (q) return 'No lenders match the search "' + q + '".';
    return 'No lenders are listed for ' + vert.label + '.';
  }

  function cardHTML(lender) {
    const badges = lender.verticals.map(v => `<span class="lf-badge">${esc(v)}</span>`).join('');
    const links = lender.sourceUrls.map(url => {
      const href = safeUrl(url);
      const label = linkLabel(href || url);
      if (!href) return '';
      return `<a class="lf-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(href)}" aria-label="${esc(label)}, opens in a new tab">${esc(label)}</a>`;
    }).join('');
    const urls = lender.sourceUrls.map(url => `<span class="lf-url">${esc(url)}</span>`).join('');
    return `<article class="card lf-card">
      <div class="lf-card-top"><h3>${esc(lender.name)}</h3><p class="lf-when">Last verified ${esc(lender.lastVerified)}</p></div>
      <div class="lf-badges">${badges}</div>
      <p class="lf-offer">${esc(lender.offer)}</p>
      <p class="lf-dealer"><b>Dealer-facing:</b> ${esc(lender.dealerFacing)}</p>
      <div class="lf-sources">${links}</div>
      <div class="lf-urls"><span class="lf-url-k">Sources</span>${urls}</div>
    </article>`;
  }

  function tableRows(list) {
    return list.map(lender => [
      lender.name,
      lender.verticals.join(', '),
      lender.offer,
      lender.dealerFacing,
      lender.sourceUrls.join('; '),
      lender.lastVerified
    ]);
  }

  function toCSV(list) {
    const lines = [COLUMNS, ...tableRows(list)].map(row => row.map(csvEscape).join(','));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function toTSV(list) {
    const clean = value => String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    return [COLUMNS, ...tableRows(list)].map(row => row.map(clean).join('\t')).join('\n');
  }

  function fileName() {
    const name = (stateData && stateData.name) || 'lenders';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug + '-dealer-lenders.csv';
  }

  function downloadCSV() {
    const list = currentList();
    const blob = new Blob([toCSV(list)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(list.length ? 'CSV downloaded.' : 'CSV downloaded. No lenders matched the current filters.');
  }

  async function copyTable() {
    const list = currentList();
    const ok = await copyText(toTSV(list));
    if (!ok) { toast('Could not copy the table.'); return; }
    toast(list.length ? 'Table copied. Paste it into Excel or Google Sheets.' : 'Copied the column headers. No lenders matched the current filters.');
  }

  async function shareCSV() {
    const list = currentList();
    const file = new File([toCSV(list)], fileName(), { type: 'text/csv' });
    const payload = {
      files: [file],
      title: 'Bank & Credit Union Finder',
      text: (stateData ? stateData.name + ' dealer lender list' : 'Dealer lender list')
    };
    try {
      if (navigator.canShare && !navigator.canShare(payload)) {
        toast('Sharing a file is not available on this device.');
        return;
      }
      await navigator.share(payload);
    } catch (err) {
      if (!err || err.name !== 'AbortError') toast('Could not share the CSV.');
    }
  }

  function showError(message) {
    ready = false;
    stateData = null;
    syncActions();
    const verified = document.getElementById('lf-verified');
    if (verified) verified.textContent = '';
    const count = document.getElementById('lf-count');
    if (count) count.textContent = '';
    const box = document.getElementById('lf-results');
    if (box) box.innerHTML = `<div class="card lf-empty"><h3>Lender list unavailable</h3><p class="sub">${esc(message)}</p></div>`;
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }

  function detectShare() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const file = new File(['x'], 'lenders.csv', { type: 'text/csv' });
      return navigator.canShare({ files: [file] });
    } catch (err) {
      return false;
    }
  }

  async function fetchJSON(path) {
    const res = await fetch(new URL(path, document.baseURI).href);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function parseIndex(data) {
    if (!data || !Array.isArray(data.states) || !data.states.length) throw new Error('index');
    return data.states.map(state => {
      if (!state || !/^[A-Z]{2}$/.test(state.code) || typeof state.name !== 'string' || !/^[a-z0-9-]+\.json$/.test(state.file)) {
        throw new Error('index entry');
      }
      return { code: state.code, name: state.name, file: state.file };
    });
  }

  function assertState(data, expectCode) {
    if (!data || data.code !== expectCode || typeof data.name !== 'string' || !Array.isArray(data.lenders) || !data.lenders.length) {
      throw new Error('state file');
    }
    data.lenders.forEach(lender => {
      if (!lender || typeof lender.name !== 'string' || !lender.name) throw new Error('name');
      if (!Array.isArray(lender.verticals) || !lender.verticals.length || lender.verticals.some(v => typeof v !== 'string')) throw new Error('verticals');
      if (typeof lender.offer !== 'string' || !lender.offer) throw new Error('offer');
      if (typeof lender.dealerFacing !== 'string' || !lender.dealerFacing) throw new Error('dealer');
      if (!Array.isArray(lender.sourceUrls) || !lender.sourceUrls.length || lender.sourceUrls.some(v => typeof v !== 'string')) throw new Error('sources');
      if (typeof lender.lastVerified !== 'string' || !lender.lastVerified) throw new Error('date');
    });
  }

  function csvEscape(value) {
    const s = String(value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function linkLabel(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '') + (u.pathname + u.search).replace(/\/$/, '');
    } catch (err) {
      return url;
    }
  }

  function safeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch (err) {}
    return '';
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
})();
