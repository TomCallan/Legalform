/* LegalForm Visual Document Builder — builds a document spec (document +
 * sections) via a drag-and-drop interface with a live YAML preview, then
 * deploys through the shared deploy path. Depends on page globals:
 * window.jsyaml, window.esc, window.showToast, window.deploySpecObject. */
(function () {
  'use strict';

  /* Starting templates — mirror templates/*.yaml (keep in sync). */
  const TEMPLATES = {
    'Mutual NDA': `document:
  id: "nda-mutual"
  title: "MUTUAL NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT"
  jurisdiction: "International, EU eIDAS & State of Delaware, USA"
  expires_in_days: 30
  signing_order: "sequential"
  legal_footer: "IN WITNESS WHEREOF, the Parties have executed this Mutual Non-Disclosure Agreement electronically as of the timestamp recorded below."

parties:
  - id: "discloser"
    role: "Disclosing Party Signer"
    email: "discloser@company.com"
    sequence: 1
  - id: "recipient"
    role: "Receiving Party Signer"
    email: "recipient@partner.com"
    sequence: 2

sections:
  - type: "static"
    content: |
      ## PREAMBLE & CONFIDENTIALITY OBLIGATIONS
      This Mutual Non-Disclosure Agreement ("Agreement") governs the exchange of confidential technical and business information between the Disclosing Party and Receiving Party.

  - type: "form"
    fields:
      - name: "disclosing_party"
        label: "Disclosing Party Corporate Name"
        type: "text"
        required: true
        value: "Acme Corporation"

      - name: "receiving_party"
        label: "Receiving Party Corporate Name"
        type: "text"
        required: true

  - type: "signature"
    signer_label: "EXECUTION BLOCK"
    fields:
      - name: "signature_timestamp"
        label: "Execution Timestamp"
        type: "datetime-auto"
        required: true
`,
    'I-130 Affidavit': `document:
  id: "affidavit-uscis-i130"
  title: "USCIS SWORN AFFIDAVIT OF BONA FIDE MARRIAGE & RELATIONSHIP"
  jurisdiction: "United States Citizenship and Immigration Services (USCIS) & State of Delaware, USA"
  expires_in_days: 60
  signing_order: "sequential"
  legal_footer: "I DECLARE UNDER PENALTY OF PERJURY UNDER THE LAWS OF THE UNITED STATES OF AMERICA THAT THE FOREGOING IS TRUE AND CORRECT."

parties:
  - id: "affiant"
    role: "Affiant (Third-Party Witness/Relative/Friend)"
    sequence: 1
  - id: "notary_witness"
    role: "Attesting Witness / Notary Public"
    sequence: 2

sections:
  - type: "static"
    content: |
      ## SWORN STATEMENT IN SUPPORT OF FORM I-130 PETITION FOR ALIEN RELATIVE
      This affidavit is submitted to United States Citizenship and Immigration Services (USCIS) as evidence of a personal knowledge of the bona fide marriage between the Petitioner and Beneficiary.

  - type: "form"
    fields:
      - name: "petitioner_name"
        label: "USCIS Petitioner Full Legal Name"
        type: "text"
        required: true

      - name: "beneficiary_name"
        label: "USCIS Beneficiary Full Legal Name"
        type: "text"
        required: true

      - name: "affiant_name"
        label: "Affiant (Your) Full Legal Name"
        type: "text"
        required: true

      - name: "affiant_address"
        label: "Affiant Residential Address"
        type: "textarea"
        required: true

      - name: "affiant_relationship"
        label: "Relationship to Couple & Duration Known"
        type: "textarea"
        required: true
        placeholder: "Describe how and when you met the couple, social events attended together, and personal knowledge of their marital relationship."

  - type: "signature"
    signer_label: "AFFIANT SWORN SIGNATURE"
    fields:
      - name: "execution_date"
        label: "Date of Sworn Execution"
        type: "datetime-auto"
        required: true

  - type: "static"
    content: |
      ## ATTESTING WITNESS / NOTARY ACKNOWLEDGMENT
      I attest that the affiant personally appeared before me, presented satisfactory identification, and signed this affidavit in my presence.
`,
    'I-130 Personal Statement': `document:
  id: "personal-statement-uscis-i130"
  title: "USCIS PERSONAL STATEMENT IN SUPPORT OF FORM I-130 PETITION FOR ALIEN RELATIVE"
  jurisdiction: "United States Citizenship and Immigration Services (USCIS)"
  expires_in_days: 60
  signing_order: "sequential"
  legal_footer: "I DECLARE UNDER PENALTY OF PERJURY UNDER THE LAWS OF THE UNITED STATES OF AMERICA THAT THE FOREGOING IS TRUE AND CORRECT."

parties:
  - id: "author"
    role: "Statement Author (USCIS Petitioner or Beneficiary)"
    sequence: 1

sections:
  - type: "static"
    content: |
      ## PERSONAL STATEMENT IN SUPPORT OF FORM I-130 PETITION FOR ALIEN RELATIVE
      This personal statement is submitted to the United States Citizenship and Immigration Services (USCIS) in support of a Form I-130 Petition for Alien Relative. It describes, in my own words, the history and development of my relationship with my spouse. I understand that this statement is subject to verification and that knowingly false statements may be prosecuted under federal law.

  - type: "form"
    signer_label: "ABOUT THE AUTHOR OF THIS STATEMENT"
    fields:
      - name: "statement_author_name"
        label: "Full Legal Name of the Author of this Statement"
        type: "text"
        required: true

      - name: "author_role"
        label: "I am the"
        type: "select"
        options: ["USCIS Petitioner", "USCIS Beneficiary"]
        required: true

      - name: "author_dob"
        label: "Date of Birth"
        type: "text"
        required: true

      - name: "author_pob"
        label: "Place of Birth (City, State, Country)"
        type: "text"

      - name: "author_address"
        label: "Current Residential Address"
        type: "textarea"
        rows: 3

      - name: "author_a_number"
        label: "A-Number / USCIS Number (if applicable)"
        type: "text"

  - type: "form"
    signer_label: "1. HOW WE MET"
    fields:
      - name: "how_we_met"
        label: "Describe how, when, and where you and your spouse first met, and your first impressions."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "2. DEVELOPMENT OF THE RELATIONSHIP"
    fields:
      - name: "relationship_development"
        label: "Describe how the relationship developed: early dates, milestones, trips, and the growth of your commitment."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "3. COHABITATION & SHARED HOUSEHOLD"
    fields:
      - name: "cohabitation"
        label: "Describe where you have lived together, how long, and how you shared everyday household life."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "4. RELATIONSHIP WITH FAMILY & FRIENDS"
    fields:
      - name: "family_relationships"
        label: "Describe each other's relationships with family and friends, introductions, and any family events attended together."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "5. PERIODS OF SEPARATION & STAYING CONNECTED"
    fields:
      - name: "periods_of_separation"
        label: "Describe any time you spent apart, how you communicated, and how you maintained the relationship."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "6. ENGAGEMENT & MARRIAGE"
    fields:
      - name: "marriage_details"
        label: "Describe your engagement, wedding or marriage ceremony, and any administrative details (license, witnesses, officiant)."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "7. FINANCIAL SUPPORT & SHARED RESPONSIBILITIES"
    fields:
      - name: "financial_support"
        label: "Describe how you have supported each other financially, shared expenses, and divided household responsibilities."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "8. FUTURE PLANS"
    fields:
      - name: "future_plans"
        label: "Describe your plans together: career, residence, children, and long-term goals."
        type: "textarea"
        rows: 8
        required: true

  - type: "form"
    signer_label: "9. ADDITIONAL EVIDENCE / OTHER DETAILS"
    fields:
      - name: "additional_evidence"
        label: "Add any other details that demonstrate the bona fide nature of your marriage (optional)."
        type: "textarea"
        rows: 6

  - type: "signature"
    signer_label: "AUTHOR SWORN SIGNATURE"
    fields:
      - name: "execution_date"
        label: "Date of Statement Execution"
        type: "datetime-auto"
        required: true
`
  };

  const FIELD_TYPES = ['text', 'email', 'textarea', 'checkbox', 'select', 'radio', 'datetime-auto'];
  const META_KEYS = ['id', 'title', 'jurisdiction', 'expires_in_days', 'signing_order', 'legal_footer'];

  function esc(v) {
    if (window.esc) return window.esc(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function defaultField(n) {
    return { name: `field_${n}`, label: `Field ${n}`, type: 'text', required: false, _autoName: true, _ui: { open: false } };
  }

  function newSection(type) {
    const _ui = { open: true };
    if (type === 'static') return { type, content: '## SECTION HEADING\nDescribe the clause or statement here.', _ui };
    if (type === 'signature') return {
      type, signer_label: 'AUTHOR SWORN SIGNATURE',
      fields: [{ name: 'execution_date', label: 'Date of Execution', type: 'datetime-auto', required: true, _autoName: false, _ui: { open: false } }],
      _ui
    };
    return { type: 'form', signer_label: '', fields: [defaultField(1)], _ui };
  }

  function blankState() {
    return {
      document: { id: '', title: '', jurisdiction: '', expires_in_days: 30, signing_order: 'sequential', legal_footer: '' },
      sections: []
    };
  }

  let state = blankState();
  let container = null;

  /* spec <-> state */
  function cleanField(f) {
    if (!f || !f.name) return null;
    const out = { name: f.name, label: f.label || f.name, type: f.type || 'text' };
    if (f.required) out.required = true;
    if (f.value) out.value = f.value;
    if (f.placeholder) out.placeholder = f.placeholder;
    if (f.type === 'textarea' && f.rows) out.rows = f.rows;
    if ((f.type === 'select' || f.type === 'radio') && Array.isArray(f.options)) {
      const opts = f.options.map(o => String(o).trim()).filter(Boolean);
      if (opts.length) out.options = opts;
    }
    return out;
  }

  function toSpec() {
    const doc = {};
    META_KEYS.forEach(k => {
      const v = state.document[k];
      if (v !== '' && v !== undefined && v !== null) doc[k] = v;
    });
    const spec = { document: doc, sections: [] };
    if (Array.isArray(state.parties) && state.parties.length) spec.parties = state.parties;
    state.sections.forEach(s => {
      const out = { type: s.type };
      if (s.type === 'static') { out.content = s.content || ''; spec.sections.push(out); return; }
      if (s.signer_label) out.signer_label = s.signer_label;
      const fields = (s.fields || []).map(cleanField).filter(Boolean);
      if (fields.length) out.fields = fields;
      spec.sections.push(out);
    });
    return spec;
  }

  function specToState(spec) {
    const s = blankState();
    const doc = spec.document || {};
    s.document = {
      id: doc.id || '', title: doc.title || '', jurisdiction: doc.jurisdiction || '',
      expires_in_days: doc.expires_in_days != null ? doc.expires_in_days : 30,
      signing_order: doc.signing_order || 'sequential', legal_footer: doc.legal_footer || ''
    };
    if (Array.isArray(spec.parties)) s.parties = spec.parties;
    (spec.sections || []).forEach(sec => {
      const _ui = { open: false };
      if (sec.type === 'static') { s.sections.push({ type: 'static', content: sec.content || '', _ui }); }
      else {
        const out = { type: sec.type === 'signature' ? 'signature' : 'form', _ui };
        if (sec.signer_label) out.signer_label = sec.signer_label;
        out.fields = (sec.fields || []).map(f => ({ ...f, required: !!f.required, _autoName: false, _ui: { open: false } }));
        s.sections.push(out);
      }
    });
    return s;
  }

  function loadTemplate(name) {
    state = specToState(window.jsyaml.load(TEMPLATES[name]));
    renderPanel();
    updatePreview();
  }

  /* rendering */
  function renderFieldEditor(f, sIdx, fIdx) {
    const opts = (f.options || []).join('\n');
    const editable = f.type !== 'datetime-auto';
    const html = [`<div class="b-field-edit">`];
    if (editable) {
      html.push(`
        <div class="b-grid">
          <div><label class="b-lbl">Label</label>
            <input data-bind="sections.${sIdx}.fields.${fIdx}.label" class="b-input" value="${esc(f.label || '')}" /></div>
          <div><label class="b-lbl">Field name</label>
            <input data-bind="sections.${sIdx}.fields.${fIdx}.name" class="b-input" value="${esc(f.name || '')}" /></div>
        </div>
        <div class="b-grid">
          <div><label class="b-lbl">Type</label>
            <select data-bind="sections.${sIdx}.fields.${fIdx}.type" class="b-input">
              ${FIELD_TYPES.map(t => `<option value="${t}" ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}
            </select></div>
          <div class="b-check"><label>
            <input type="checkbox" data-bind="sections.${sIdx}.fields.${fIdx}.required" ${f.required ? 'checked' : ''} /> Required
          </label></div>
        </div>`);
      if (f.type === 'select' || f.type === 'radio') {
        html.push(`
        <div><label class="b-lbl">Options (one per line)</label>
          <textarea data-bind="sections.${sIdx}.fields.${fIdx}.options" class="b-input b-ta" rows="3">${esc(opts)}</textarea></div>`);
      }
      if (f.type === 'textarea') {
        html.push(`
        <div><label class="b-lbl">Rows</label>
          <input type="number" min="2" max="20" data-bind="sections.${sIdx}.fields.${fIdx}.rows" class="b-input b-num" value="${esc(f.rows || 4)}" /></div>`);
      }
      if (f.type === 'text' || f.type === 'email' || f.type === 'textarea') {
        html.push(`
        <div><label class="b-lbl">Placeholder (optional)</label>
          <input data-bind="sections.${sIdx}.fields.${fIdx}.placeholder" class="b-input" value="${esc(f.placeholder || '')}" /></div>`);
      }
    }
    html.push('</div>');
    return html.join('');
  }

  function renderField(f, sIdx, fIdx) {
    const open = !!(f._ui && f._ui.open);
    const editable = f.type !== 'datetime-auto';
    return `
      <div class="b-field" data-sindex="${sIdx}" data-findex="${fIdx}">
        <div class="b-row">
          <span class="b-handle" draggable="true" title="Drag to reorder">&#8801;</span>
          <span class="b-type">${esc(f.type)}</span>
          <span class="b-fname">${esc(f.label || f.name)}</span>
          ${f.required ? '<span class="b-req">REQUIRED</span>' : ''}
          <span class="b-actions">
            ${editable ? `<button type="button" data-act="field-toggle" data-sindex="${sIdx}" data-findex="${fIdx}">${open ? 'Close' : 'Edit'}</button>` : ''}
            <button type="button" data-act="field-up" data-sindex="${sIdx}" data-findex="${fIdx}" title="Move up">&#8593;</button>
            <button type="button" data-act="field-down" data-sindex="${sIdx}" data-findex="${fIdx}" title="Move down">&#8595;</button>
            <button type="button" data-act="field-delete" data-sindex="${sIdx}" data-findex="${fIdx}" class="b-danger" title="Delete">&#215;</button>
          </span>
        </div>
        ${open ? renderFieldEditor(f, sIdx, fIdx) : ''}
      </div>`;
  }

  function renderSection(s, idx) {
    const open = !!s._ui.open;
    const badge = s.type.toUpperCase();
    const label = s.type === 'static' ? 'Static text' : (s.signer_label || s.type);
    let body = '';
    if (open) {
      if (s.type === 'static') {
        body = `
          <div class="b-field-edit">
            <label class="b-lbl">Content</label>
            <textarea data-bind="sections.${idx}.content" class="b-input b-ta" rows="6">${esc(s.content)}</textarea>
            <p class="b-hint">Lines starting with <code>##</code> render as section headings.</p>
          </div>`;
      } else {
        body = `
          <div class="b-field-edit">
            <label class="b-lbl">Section label (optional)</label>
            <input data-bind="sections.${idx}.signer_label" class="b-input" value="${esc(s.signer_label || '')}" />
          </div>
          <div class="b-fields">
            ${s.fields.map((f, fi) => renderField(f, idx, fi)).join('')}
            ${s.type === 'form' ? `<button type="button" class="b-add-field" data-act="field-add" data-sindex="${idx}">+ Add Field</button>` : ''}
          </div>`;
      }
    }
    return `
      <div class="b-section" data-index="${idx}" data-type="${s.type}">
        <div class="b-row">
          <span class="b-handle" draggable="true" title="Drag to reorder">&#8801;</span>
          <span class="b-type">${esc(badge)}</span>
          <span class="b-fname">${esc(label)}</span>
          <span class="b-actions">
            <button type="button" data-act="section-toggle" data-index="${idx}">${open ? 'Close' : 'Edit'}</button>
            <button type="button" data-act="section-up" data-index="${idx}" title="Move up">&#8593;</button>
            <button type="button" data-act="section-down" data-index="${idx}" title="Move down">&#8595;</button>
            <button type="button" data-act="section-delete" data-index="${idx}" class="b-danger" title="Delete">&#215;</button>
          </span>
        </div>
        ${open ? `<div class="b-section-body">${body}</div>` : ''}
      </div>`;
  }

  function panelHtml() {
    return `
      <div class="b-templates">
        <span class="b-lbl" style="margin:0;">Start from:</span>
        ${Object.keys(TEMPLATES).map(n => `<button type="button" class="b-add" data-act="template" data-template="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>
      <div class="b-meta">
        <div><label class="b-lbl">Document id</label><input data-bind="document.id" class="b-input" value="${esc(state.document.id)}" placeholder="my-agreement" /></div>
        <div><label class="b-lbl">Title</label><input data-bind="document.title" class="b-input" value="${esc(state.document.title)}" placeholder="MUTUAL NON-DISCLOSURE AGREEMENT" /></div>
        <div><label class="b-lbl">Jurisdiction</label><input data-bind="document.jurisdiction" class="b-input" value="${esc(state.document.jurisdiction)}" placeholder="State of Delaware, USA" /></div>
        <div><label class="b-lbl">Expires in (days)</label><input type="number" min="1" data-bind="document.expires_in_days" class="b-input b-num" value="${esc(state.document.expires_in_days)}" /></div>
      </div>
      <div>
        <label class="b-lbl">Legal footer</label>
        <input data-bind="document.legal_footer" class="b-input" value="${esc(state.document.legal_footer)}" placeholder="I DECLARE UNDER PENALTY OF PERJURY..." />
      </div>
      <div class="b-sections">
        ${state.sections.map((s, i) => renderSection(s, i)).join('')}
      </div>
      <div class="b-addrow">
        <button type="button" class="b-add" data-act="add-static">+ Static Text</button>
        <button type="button" class="b-add" data-act="add-form">+ Form</button>
        <button type="button" class="b-add" data-act="add-signature">+ Signature</button>
      </div>
      <button type="button" class="btn" data-act="deploy" style="padding:0.5rem 1rem; font-size:0.8rem;">Deploy Document</button>
      <div class="b-preview">
        <div class="b-preview-head"><span class="b-lbl" style="margin:0;">Live YAML preview</span></div>
        <pre id="builder-preview"></pre>
      </div>`;
  }

  function renderPanel() {
    if (!container) return;
    container.innerHTML = panelHtml();
  }

  function updatePreview() {
    const pre = container && container.querySelector('#builder-preview');
    if (pre) pre.textContent = window.jsyaml.dump(toSpec());
  }

  /* events */
  function move(arr, from, dir) {
    const to = from + dir;
    if (to < 0 || to >= arr.length) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
  }

  function onAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const idx = Number(btn.dataset.index);
    const sIdx = Number(btn.dataset.sindex);
    const fIdx = Number(btn.dataset.findex);
    switch (act) {
      case 'section-toggle': state.sections[idx]._ui.open = !state.sections[idx]._ui.open; break;
      case 'section-delete': state.sections.splice(idx, 1); break;
      case 'section-up': move(state.sections, idx, -1); break;
      case 'section-down': move(state.sections, idx, 1); break;
      case 'field-toggle': state.sections[sIdx].fields[fIdx]._ui.open = !state.sections[sIdx].fields[fIdx]._ui.open; break;
      case 'field-delete': state.sections[sIdx].fields.splice(fIdx, 1); break;
      case 'field-up': move(state.sections[sIdx].fields, fIdx, -1); break;
      case 'field-down': move(state.sections[sIdx].fields, fIdx, 1); break;
      case 'field-add': state.sections[sIdx].fields.push(defaultField(state.sections[sIdx].fields.length + 1)); break;
      case 'add-static': state.sections.push(newSection('static')); break;
      case 'add-form': state.sections.push(newSection('form')); break;
      case 'add-signature': state.sections.push(newSection('signature')); break;
      case 'template': loadTemplate(btn.dataset.template); return;
      case 'deploy': deployBuilder(); return;
      default: return;
    }
    renderPanel();
    updatePreview();
  }

  function onInput(e) {
    const el = e.target;
    const bind = el.dataset && el.dataset.bind;
    if (!bind) return;
    const path = bind.split('.');
    let obj = state;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    const key = path[path.length - 1];
    if (key === 'expires_in_days' || key === 'rows') {
      const n = parseInt(el.value, 10);
      obj[key] = isNaN(n) ? (key === 'rows' ? undefined : '') : n;
    } else if (key === 'options') {
      obj[key] = String(el.value).split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      obj[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    if (key === 'label' && obj._autoName) obj.name = slugify(el.value) || obj.name;
    updatePreview();
  }

  let dragKind = null;
  let dragSrc = null;

  function onDragStart(e) {
    if (!e.target.closest('.b-handle')) { e.preventDefault(); return; }
    const sec = e.target.closest('.b-section');
    const f = e.target.closest('.b-field');
    if (sec) { dragKind = 'section'; dragSrc = { idx: Number(sec.dataset.index) }; }
    else if (f) { dragKind = 'field'; dragSrc = { sIdx: Number(f.dataset.sindex), fIdx: Number(f.dataset.findex) }; }
    else { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragKind);
  }

  function onDragOver(e) {
    if (!dragKind) return;
    const list = e.target.closest(dragKind === 'section' ? '.b-sections' : '.b-fields');
    if (!list) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.classList.add('b-dragover');
  }

  function onDrop(e) {
    if (!dragKind) return;
    const list = e.target.closest(dragKind === 'section' ? '.b-sections' : '.b-fields');
    if (!list) return;
    e.preventDefault();
    list.classList.remove('b-dragover');
    const items = [...list.querySelectorAll(dragKind === 'section' ? '.b-section' : '.b-field')];
    let to = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    if (dragKind === 'section') {
      const from = dragSrc.idx;
      const [m] = state.sections.splice(from, 1);
      state.sections.splice(from < to ? to - 1 : to, 0, m);
    } else {
      const { sIdx, fIdx } = dragSrc;
      const fields = state.sections[sIdx].fields;
      const [m] = fields.splice(fIdx, 1);
      fields.splice(fIdx < to ? to - 1 : to, 0, m);
    }
    dragKind = null; dragSrc = null;
    renderPanel();
    updatePreview();
  }

  function onDragEnd() {
    dragKind = null; dragSrc = null;
    if (container) container.querySelectorAll('.b-dragover').forEach(el => el.classList.remove('b-dragover'));
  }

  function deployBuilder() {
    const spec = toSpec();
    if (!spec.document.id) { window.showToast('Document id is required.', 'error'); return; }
    if (!spec.document.title) { window.showToast('Document title is required.', 'error'); return; }
    const names = {};
    for (const sec of spec.sections) {
      for (const f of (sec.fields || [])) {
        if (names[f.name]) { window.showToast(`Duplicate field name "${f.name}".`, 'error'); return; }
        names[f.name] = true;
      }
    }
    window.deploySpecObject(spec);
  }

  function renderBuilderPanel(el) {
    container = el;
    el.addEventListener('click', onAction);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragend', onDragEnd);
    renderPanel();
    updatePreview();
  }

  window.renderBuilderPanel = renderBuilderPanel;
  window.getBuilderSpec = toSpec;
})();
