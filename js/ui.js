/* Shared screen helpers. Every view uses these so screens look and behave the same. */
(function () {
  'use strict';
  const UI = {};
  UI.esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.money = (n) => '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  UI.date = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
  UI.time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  UI.dateTime = (v) => (v ? `${UI.date(v)}, ${UI.time(v)}` : '');
  const TONE = { 'On sale': 'good', 'Sold out': 'bad', Cancelled: 'bad', Draft: 'quiet', Scheduled: 'info', 'Sales closed': 'warn', Completed: 'quiet' };
  UI.badge = (text, tone) => `<span class="badge badge-${UI.esc(tone || TONE[text] || 'quiet')}">${UI.esc(text)}</span>`;
  UI.demo = (text) => `<p class="demo-note">Demo: ${UI.esc(text)}</p>`;
  UI.empty = (text) => `<div class="empty">${UI.esc(text)}</div>`;
  UI.pageHead = (title, actionsHtml, subtitle) => `<div class="page-head"><div><h1>${UI.esc(title)}</h1>${subtitle ? `<p class="muted">${UI.esc(subtitle)}</p>` : ''}</div><div class="page-actions">${actionsHtml || ''}</div></div>`;
  /* Responsive table: columns [{label, html(row)}]. Becomes cards on a phone through data-label.
     CSS display changes remove a table's meaning for screen readers, so the roles are set by hand. */
  UI.table = (columns, rows, opts) => {
    const o = opts || {};
    if (!rows.length) return UI.empty(o.emptyText || 'Nothing to show.');
    return `<div class="table-wrap"><table class="table" role="table"><thead role="rowgroup"><tr role="row">${columns.map((c) => `<th scope="col" role="columnheader">${UI.esc(c.label)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map((r) => `<tr role="row">${columns.map((c) => `<td role="cell" data-label="${UI.esc(c.label)}">${c.html(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };

  /* Remember an element well enough to find its replacement after a re-render. */
  UI.focusKey = (el) => {
    if (!el || el === document.body || !el.tagName) return null;
    let sel = '';
    if (el.id) sel = '#' + CSS.escape(el.id);
    else {
      const attrs = Array.from(el.attributes).filter((a) => a.name === 'name' || a.name === 'href' || a.name.startsWith('data-'));
      if (attrs.length) sel = el.tagName.toLowerCase() + attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    }
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* this input type has no caret */ }
    return sel ? { sel, start, end } : null;
  };
  /* Put focus back where it was, or on the main area if that element has gone. */
  UI.refocus = (key) => {
    let el = null;
    if (key) { try { el = document.querySelector(key.sel); } catch (e) { el = null; } }
    (el || document.getElementById('main')).focus({ preventScroll: true });
    if (el && key.start !== null && key.start !== undefined && el.setSelectionRange) { try { el.setSelectionRange(key.start, key.end); } catch (e) { /* not a text field */ } }
  };

  /* A modal dialog sits above the page. A popover is the only way to show toasts above it. */
  function liftToasts(box) {
    if (!box.showPopover) return;
    if (!box.hasAttribute('popover')) box.setAttribute('popover', 'manual');
    if (box.matches(':popover-open')) box.hidePopover();
    box.showPopover();
  }
  function lowerToasts(box) {
    if (box.children.length || !box.hasAttribute('popover')) return;
    if (box.matches(':popover-open')) box.hidePopover();
    box.removeAttribute('popover');
  }
  /* Toast tones: 'good', 'bad', 'warn', or none. */
  UI.toast = (text, tone) => {
    const show = () => {
      const box = document.getElementById('toasts');
      const t = document.createElement('div');
      t.className = `toast ${tone ? 'toast-' + tone : ''}`;
      t.textContent = text;
      box.appendChild(t);
      if (document.querySelector('dialog[open]')) liftToasts(box);
      setTimeout(() => { t.remove(); lowerToasts(box); }, tone === 'bad' ? 7000 : 4000);
    };
    /* Called from a dialog button, the dialog usually closes straight after. Wait, so screen readers hear it. */
    if (document.querySelector('dialog[open]')) setTimeout(show, 0); else show();
  };
  /* In-page dialog. Never use alert()/confirm()/prompt().
     UI.dialog({ title, body: html, actions: [{ label, kind: 'primary'|'danger'|'ghost', onClick(dialogEl, close) }], onOpen(dialogEl), wide })
     A button closes the dialog unless onClick returns false (use that to show a validation message).
     Long content scrolls inside .dialog-body, so the buttons stay on screen. */
  let dialogCount = 0;
  UI.dialog = ({ title, body, actions, onOpen, wide }) => {
    const d = document.createElement('dialog');
    const titleId = `dialog-title-${++dialogCount}`;
    d.className = 'dialog' + (wide ? ' dialog-wide' : '');
    d.setAttribute('aria-labelledby', titleId);
    const list = actions && actions.length ? actions : [{ label: 'Close', kind: 'ghost' }];
    d.innerHTML = `<h2 id="${titleId}">${UI.esc(title)}</h2><div class="dialog-body">${body || ''}</div><p class="form-error" role="alert" hidden></p><div class="dialog-actions">${list.map((a, i) => `<button type="button" class="btn btn-${a.kind || 'ghost'}" data-i="${i}">${UI.esc(a.label)}</button>`).join('')}</div>`;
    const opener = UI.focusKey(document.activeElement);
    const close = () => {
      const wasOpen = d.isConnected;
      if (d.open) d.close();
      d.remove();
      /* If the screen was redrawn while the dialog was open, the button that opened it has gone. */
      if (wasOpen && (!document.activeElement || document.activeElement === document.body) && !document.querySelector('dialog[open]')) UI.refocus(opener);
    };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.querySelectorAll('.dialog-actions button').forEach((b) => b.addEventListener('click', () => {
      const a = list[Number(b.dataset.i)];
      if ((a.onClick ? a.onClick(d, close) : undefined) !== false) close();
    }));
    document.body.appendChild(d);
    d.showModal();
    /* A long body would take first focus with a box round it. Start on the dialog itself; Tab goes into the body. */
    if (document.activeElement === d.querySelector('.dialog-body')) { d.tabIndex = -1; d.focus(); }
    if (onOpen) onOpen(d);
    return d;
  };
  UI.dialogError = (d, text) => { const e = d.querySelector('.form-error'); e.textContent = text; e.hidden = !text; };
  /* Real browser download. rows is an array of arrays; goes through Core.toCSV. */
  UI.downloadCSV = (filename, rows) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Core.toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  UI.options = (items, selected) => items.map((i) => `<option value="${UI.esc(i.value)}"${String(i.value) === String(selected) ? ' selected' : ''}>${UI.esc(i.label)}</option>`).join('');
  window.UI = UI;
})();
