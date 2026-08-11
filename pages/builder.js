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
`,
    'Tom Statement': `document:
  id: "tom"
  title: "SPOUSAL RELATIONSHIP STATEMENT -- THOMAS"
  jurisdiction: "United Kingdom Home Office & US Department of State / USCIS"
  expires_in_days: 60
  signing_order: "sequential"
  legal_footer: "I DECLARE UNDER PENALTY OF PERJURY THAT THE FOREGOING IS TRUE AND CORRECT."

parties:
  - id: "author"
    role: "Statement Author (Thomas Callan)"
    sequence: 1

sections:
  - type: "static"
    content: |
      ## STATEMENT OF GENUINE AND SUBSISTING RELATIONSHIP
      This personal statement is submitted in support of our spousal visa / immigration application. It describes, in detail, the history, development, cohabitation, and ongoing commitment of our relationship.

  - type: "form"
    signer_label: "AUTHOR INFORMATION"
    fields:
      - name: "full_name"
        label: "Full Legal Name of Statement Author"
        type: "text"
        value: "Thomas Callan"
        required: true
      - name: "spouse_name"
        label: "Full Legal Name of Spouse"
        type: "text"
        value: "Madison Callan"
        required: true

  - type: "form"
    signer_label: "STATEMENT OF RELATIONSHIP HISTORY & COHABITATION"
    fields:
      - name: "relationship_statement"
        label: "Detailed Chronological Account of Relationship"
        type: "textarea"
        rows: 25
        required: true
        value: |
          From August 2024 to July 2025, I attended Embry-Riddle Aeronautical University as part of a study abroad program for my university degree. In November, I began utilizing the dating application Hinge, which Madison was also using at that time. Although we matched once, I deleted my account shortly after our initial contact. One night, while caring for my roommate's puppy, I returned to the application. Madison was one of the first profiles I encountered; as it happened, she had also decided to resume using the application that same day. We established an immediate rapport, characterized by a similar sense of humor and shared aspirations. Despite our cultural differences, we felt a significant connection. I deferred to Madison's familiarity with the area to arrange our first date. We met at the school library and spent the evening playing mini-golf and conversing. We felt immediately comfortable in each other's company.

          Over the following three weeks, we continued to date. I had committed to attending Thanksgiving with my roommate's family, and Madison was scheduled to visit her home for the Christmas holidays. To mitigate the time apart, when she suggested hiking in Sedona, I proposed that we stay in a cabin in Flagstaff and go skiing instead. It was our first experience with the sport; although we were beginners, we enjoyed the activity together. Madison prepared a meal for me, and during the evening, we expressed our mutual commitment to one another. When Madison fell ill before our departure from the cabin, I assumed responsibility for driving her vehicle - a milestone that marked the beginning of my role as her primary driver for the subsequent 10 months. Shortly after Christmas, I experienced mechanical issues with my own vehicle, and Madison offered the use of hers. In return, I invited her to dinner at my residence. What began as a practical arrangement quickly evolved into a committed partnership, as we preferred to spend our time together. We remained inseparable throughout the remainder of my time in the United States.

          Planning for the upcoming academic year, Madison decided to move out of university accommodation into her own residence in Prescott. To assist with her transition and support her flight training program, I contributed to her rent for the initial months beginning in early June. We spent the majority of our time together at this residence, and I was subsequently added as a resident on the lease. During spring break, we traveled to Missouri to visit Madison's parents. The visit was successful, and we spent time with her siblings and their partners. We returned from Missouri accompanied by Madison's cat, Wally, who became a central part of our household.

          I departed the United States in August upon the conclusion of my visa term to complete my degree. During my departure preparations, my passport was destroyed; consequently, we took the opportunity to visit the Los Angeles consulate and spend additional time together. We visited Santa Monica, the Griffith Observatory, and planned to visit the Echo Park swan boats, though we were unable to do so due to traffic. This period marked the beginning of our long-distance relationship. We maintained constant communication through video calls and digital platforms, ensuring we remained connected despite the 5,000-mile distance.

          Madison visited the United Kingdom during the final week of October to celebrate her birthday and Halloween. During this visit, she was introduced to my family, with whom she had already been in contact. At the Sheffield Botanical Gardens, I proposed with a handmade ruby ring. Although the circumstances were not ideal - the garden lights were dysfunctional, it was raining, and parts of the proposal were left at the hotel - I was resolved to refine the experience in the future.

          Earlier in the year, Madison concluded that her flight program at Embry-Riddle was not aligned with her long-term professional interests. With my support, she withdrew from the university with the intention of pursuing a different educational path in Alaska as making her happy was my primary concern. Following her withdrawal, we decided to convert a planned Christmas visit into a permanent relocation to the United Kingdom. To facilitate this, I leased an apartment in Sheffield city center. From mid-December through early June, Madison resided with me in the United Kingdom. During this period, as she was unable to work on a tourist visa, I provided financial support to enable her to explore her interests.

          In February, we chose to elope. Seeking a private ceremony, we arranged a stay in a mountain cabin in Colorado to coincide with Valentine's Day. We spent time with a childhood friend of Madison's and shared a meaningful experience together.

          In June, Madison returned to the United States to seek employment in Kansas City, necessitating a transition back to a long-distance relationship. We maintain daily contact. To reduce the time zone difference and facilitate greater proximity, I have obtained a working holiday visa for Canada, effective September 2nd. I intend to reside in Canada throughout the processing period of our visa to ensure that we can visit each other more easily.

          Our relationship is of the utmost significance to me. Since we met, I have felt a sense of comfort and authenticity that is unparalleled. Our commitment to one another and our shared vision for our future remain constant.

  - type: "signature"
    signer_label: "AUTHOR SWORN SIGNATURE"
    fields:
      - name: "execution_date"
        label: "Date of Sworn Execution"
        type: "datetime-auto"
        required: true
`,
    'Madi Statement': `document:
  id: "madi"
  title: "SPOUSAL RELATIONSHIP STATEMENT -- MADISON"
  jurisdiction: "United Kingdom Home Office & US Department of State / USCIS"
  expires_in_days: 60
  signing_order: "sequential"
  legal_footer: "I DECLARE UNDER PENALTY OF PERJURY THAT THE FOREGOING IS TRUE AND CORRECT."

parties:
  - id: "author"
    role: "Statement Author (Madison Callan)"
    sequence: 1

sections:
  - type: "static"
    content: |
      ## STATEMENT OF GENUINE AND SUBSISTING RELATIONSHIP
      This personal statement is submitted in support of our spousal visa / immigration application. It describes, in detail, the history, development, cohabitation, and ongoing commitment of our relationship.

  - type: "form"
    signer_label: "AUTHOR INFORMATION"
    fields:
      - name: "full_name"
        label: "Full Legal Name of Statement Author"
        type: "text"
        value: "Madison Callan"
        required: true
      - name: "spouse_name"
        label: "Full Legal Name of Spouse"
        type: "text"
        value: "Thomas Callan"
        required: true

  - type: "form"
    signer_label: "STATEMENT OF RELATIONSHIP HISTORY & COHABITATION"
    fields:
      - name: "relationship_statement"
        label: "Detailed Chronological Account of Relationship"
        type: "textarea"
        rows: 25
        required: true
        value: |
          Thomas and I met on a dating app called Hinge while we were both located in Prescott Arizona. Frankly I accidentally ignored him the first time we matched on the app but found him again later and hit it off swimmingly. After chatting for a few days we went on a date, which I planned as I was confident I could plan a much more fun date than he could as I knew more fun things to do as the resident American. Once again it went very well, and we continued to have dates at an italian restaurant, a date in the park, then another at his house before he left for Thanksgiving break. When he came back a week later we planned a trip before winter break to a cabin. There we bonded and I embarrassingly admitted I loved him, he admitted the same. From that point on we've been extremely close ever since, for when I left for winter break and came back two weeks later, we lived together. First out of an excuse for convenience since Tom's car broke down and we could drive to university together, then it just came that we simply enjoyed each other's company too much to leave. From that point on we were together everyday, I communicated regularly with his mother and grandmother via telephone. Subsequently, Thomas accompanied me to my family home in Missouri to be formally introduced to my parents. Our cohabitation continued for several months until we relocated to a joint residence with our cat, Waldo.

          In early August 2025, we entered a period of long-distance communication lasting approximately four months. Prior to Thomas's departure, we traveled to Los Angeles to secure an emergency travel document after his passport was inadvertently damaged. During our time apart, we maintained daily contact through Discord and WhatsApp, utilizing video calls and synchronized activities to remain connected. To mitigate the seven-hour time difference, I adjusted my sleep schedule to align with his, ensuring we could share our mornings and evenings together. In October, I traveled to the United Kingdom for ten days to celebrate my birthday, during which time I met his extended family and we formally announced our engagement. I have maintained a positive and close relationship with his family since that time.

          Following this visit, I elected to withdraw from my university in the United States to join Thomas in England and pursue a specialized aviation career path. After the initial four-month separation, I resided with Thomas in England for six months. During this period, we celebrated Christmas with his family and toured the country. On February 14, 2026, we were legally married in Colorado, USA. Our friend, Alice Nelson, assisted us in navigating the administrative requirements for our marriage license during a holiday weekend. Throughout this time, Thomas provided primary financial support for our household.

          In June 2026, I returned to the United States to secure employment and fund my upcoming flight training in Alaska. As of the present date, we await Thomas's return on August 20, prior to his scheduled employment in Canada commencing September 2. Our relationship is characterized by deep mutual affection and consistent financial and emotional support. My family can attest to the depth of our commitment and the genuine nature of our marriage. Based on the facts presented in this account, it is evident that our relationship is bona fide and enduring.

  - type: "signature"
    signer_label: "AUTHOR SWORN SIGNATURE"
    fields:
      - name: "execution_date"
        label: "Date of Sworn Execution"
        type: "datetime-auto"
        required: true
`
  };

  const FIELD_TYPES = ['text', 'email', 'textarea', 'checkbox', 'select', 'radio', 'datetime-auto', 'date', 'datetime'];
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
  let currentTemplateName = 'Tom Statement';

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

  function getYamlLib() {
    if (typeof window.jsyaml !== 'undefined') return window.jsyaml;
    if (typeof jsyaml !== 'undefined') return jsyaml;
    return null;
  }
  function parseYaml(str) {
    const lib = getYamlLib();
    if (lib && lib.load) return lib.load(str);
    return JSON.parse(str);
  }
  function dumpYaml(obj) {
    const lib = getYamlLib();
    if (lib && lib.dump) return lib.dump(obj);
    return JSON.stringify(obj, null, 2);
  }

  function loadTemplate(name) {
    if (!name) return;
    currentTemplateName = name;
    try {
      const raw = getTemplate(name);
      if (!raw) {
        if (window.showToast) window.showToast(`Template "${name}" not found.`, 'error');
        return;
      }
      const parsed = parseYaml(raw);
      state = specToState(parsed);
      renderPanel();
      updatePreview();
      if (window.showToast) window.showToast(`Loaded template "${name}".`, 'success');
    } catch (err) {
      console.error('Failed to load template', name, err);
      if (window.showToast) window.showToast(`Error loading template "${name}": ${err.message}`, 'error');
    }
  }

  /* custom templates — persisted in localStorage */
  const SAVED_KEY = 'legalform_builder_templates';

  function getSavedTemplates() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }

  function saveSavedTemplates(map) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function getTemplate(name) {
    const saved = getSavedTemplates();
    return saved[name] ? saved[name] : TEMPLATES[name];
  }

  function saveTemplate(name) {
    const spec = toSpec();
    if (!spec.document || (!spec.document.title && !(spec.sections && spec.sections.length))) {
      if (window.showToast) window.showToast('Nothing to save — build a document first.', 'error');
      return;
    }
    const yaml = dumpYaml(spec);
    const saved = getSavedTemplates();
    saved[name] = yaml;
    saveSavedTemplates(saved);
    currentTemplateName = name;
    renderPanel();
    updatePreview();
    if (window.showToast) window.showToast(`Template "${name}" saved cleanly.`, 'success');
  }

  function saveCurrentTemplate() {
    if (!currentTemplateName) {
      promptTemplateName();
      return;
    }
    saveTemplate(currentTemplateName);
  }

  function deleteSavedTemplate(name) {
    const saved = getSavedTemplates();
    if (saved[name]) { delete saved[name]; saveSavedTemplates(saved); }
    if (currentTemplateName === name) currentTemplateName = '';
    renderPanel();
    updatePreview();
    if (window.showToast) window.showToast(`Template "${name}" deleted.`, 'success');
  }

  function promptTemplateName() {
    const overlay = document.createElement('div');
    overlay.className = 'b-preview-overlay';
    overlay.innerHTML = `
      <div class="b-preview-modal" style="max-width:420px;">
        <div class="b-preview-toolbar">
          <span class="b-lbl" style="margin:0;">Save As New Template</span>
          <button type="button" class="b-close" data-st="cancel" aria-label="Cancel">&#215;</button>
        </div>
        <div style="padding:1rem 1rem 1.5rem;">
          <label class="b-lbl">Template name</label>
          <input id="template-name-input" class="b-input" value="${esc(currentTemplateName ? currentTemplateName + ' (Copy)' : '')}" placeholder="My Custom Statement" />
        </div>
        <div class="b-preview-toolbar b-preview-foot" style="justify-content:flex-end;">
          <button type="button" data-st="save" class="btn" style="padding:0.5rem 1rem; font-size:0.75rem;">Save Template</button>
          <button type="button" data-st="cancel" class="btn btn-outline" style="padding:0.5rem 1rem; font-size:0.75rem;">Cancel</button>
        </div>
      </div>`;
    overlay.querySelectorAll('[data-st="cancel"]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('[data-st="save"]').addEventListener('click', () => {
      const name = overlay.querySelector('#template-name-input').value.trim();
      overlay.remove();
      if (name) saveTemplate(name);
      else if (window.showToast) window.showToast('Template name is required.', 'error');
    });
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#template-name-input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') overlay.querySelector('[data-st="save"]').click(); });
    input.focus();
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
            <select data-bind="sections.${sIdx}.fields.${fIdx}.type" class="b-select">
              ${FIELD_TYPES.map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select></div>
          <div><label class="b-lbl">Placeholder</label>
            <input data-bind="sections.${sIdx}.fields.${fIdx}.placeholder" class="b-input" value="${esc(f.placeholder || '')}" /></div>
        </div>`);
      if (f.type === 'textarea') {
        html.push(`<div><label class="b-lbl">Initial pre-fill text</label><textarea data-bind="sections.${sIdx}.fields.${fIdx}.value" class="b-input b-ta" rows="${Math.max(4, Math.min(12, f.rows || 6))}" placeholder="Pre-filled statement text...">${esc(f.value || '')}</textarea></div>`);
      } else {
        html.push(`<div><label class="b-lbl">Default value</label><input data-bind="sections.${sIdx}.fields.${fIdx}.value" class="b-input" value="${esc(f.value || '')}" /></div>`);
      }
      if (f.type === 'select' || f.type === 'radio') {
        html.push(`<div><label class="b-lbl">Options (one per line)</label><textarea data-bind="sections.${sIdx}.fields.${fIdx}.options" class="b-input b-ta" rows="3">${esc(opts)}</textarea></div>`);
      }
      html.push(`
        <div style="margin-top:0.4rem;">
          <label class="b-check"><input type="checkbox" data-bind="sections.${sIdx}.fields.${fIdx}.required" ${f.required ? 'checked' : ''}> Required field</label>
        </div>`);
    } else {
      html.push(`<div class="b-hint">Auto timestamp field (read-only in signer UI)</div>`);
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
    const open = !!(s._ui && s._ui.open);
    const badge = s.type === 'static' ? 'STATIC' : s.type === 'signature' ? 'SIGNATURE' : 'FORM';
    let label = s.signer_label || (s.type === 'static' ? 'Static Text Block' : 'Form Section');
    let body = '';
    if (open) {
      if (s.type === 'static') {
        body = `
          <div class="b-field-edit">
            <label class="b-lbl">Markdown Content</label>
            <textarea data-bind="sections.${idx}.content" class="b-input b-ta" rows="8" placeholder="## Section Title&#10;Plain text...">${esc(s.content || '')}</textarea>
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
    const builtinBtns = Object.keys(TEMPLATES).map(n =>
      `<button type="button" class="b-add ${currentTemplateName === n ? 'active' : ''}" data-act="template" data-template="${esc(n)}">${esc(n)}</button>`
    ).join('');
    const saved = getSavedTemplates();
    const savedNames = Object.keys(saved);
    const savedBtns = savedNames.map(n =>
      `<span class="b-tpl"><button type="button" class="b-add ${currentTemplateName === n ? 'active' : ''}" data-act="template" data-template="${esc(n)}">${esc(n)}</button>` +
      `<button type="button" class="b-add b-del" data-act="template-delete" data-template="${esc(n)}" title="Delete template">&#215;</button></span>`
    ).join('');

    const isSel = (n) => currentTemplateName === n ? 'selected' : '';

    return `
      <div class="b-templates-bar" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-bottom:1.25rem; padding:0.85rem 1rem; background:var(--bg-base); border:1px solid var(--border-subtle);">
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; flex:1; min-width:280px;">
          <label class="b-lbl" style="margin:0; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-muted);">Template:</label>
          <select id="builder-template-select" class="b-input" style="max-width:320px; padding:0.4rem 0.6rem; font-size:0.85rem; font-weight:600; cursor:pointer;">
            <option value="" disabled ${!currentTemplateName ? 'selected' : ''}>-- Select a Template --</option>
            <optgroup label="Spousal Statements">
              <option value="Tom Statement" ${isSel('Tom Statement')}>Tom Statement (Thomas)</option>
              <option value="Madi Statement" ${isSel('Madi Statement')}>Madi Statement (Madison)</option>
              <option value="I-130 Personal Statement" ${isSel('I-130 Personal Statement')}>I-130 Personal Statement</option>
              <option value="I-130 Affidavit" ${isSel('I-130 Affidavit')}>I-130 Sworn Affidavit</option>
            </optgroup>
            <optgroup label="Agreements">
              <option value="Mutual NDA" ${isSel('Mutual NDA')}>Mutual NDA</option>
            </optgroup>
            ${savedNames.length ? `<optgroup label="Custom Saved Templates">${savedNames.map(n => `<option value="${esc(n)}" ${isSel(n)}>${esc(n)} (Saved)</option>`).join('')}</optgroup>` : ''}
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <button type="button" class="btn btn-outline" data-act="template-save-current" style="padding:0.4rem 0.85rem; font-size:0.75rem;">Save Changes</button>
          <button type="button" class="btn btn-outline" data-act="template-save-as" style="padding:0.4rem 0.85rem; font-size:0.75rem;">Save As New...</button>
        </div>
      </div>
      <div class="b-templates" style="margin-bottom:1rem;">
        <span class="b-lbl" style="margin:0;">Quick Load:</span>
        ${builtinBtns}${savedBtns}
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
      <div class="b-deployrow">
        <button type="button" class="btn btn-outline" data-act="preview" style="padding:0.5rem 1rem; font-size:0.8rem;">Preview</button>
        <button type="button" class="btn" data-act="deploy" style="padding:0.5rem 1rem; font-size:0.8rem;">Deploy Document</button>
      </div>
      <div class="b-preview">
        <div class="b-preview-head"><span class="b-lbl" style="margin:0;">Live YAML preview</span></div>
        <pre id="builder-preview"></pre>
      </div>`;
  }

  function renderPanel() {
    if (!container) return;
    container.innerHTML = panelHtml();
    const select = container.querySelector('#builder-template-select');
    if (select) {
      select.addEventListener('change', (e) => {
        if (e.target.value) loadTemplate(e.target.value);
      });
    }
  }

  function updatePreview() {
    const pre = container && container.querySelector('#builder-preview');
    if (pre) pre.textContent = dumpYaml(toSpec());
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
      case 'template-save-current': saveCurrentTemplate(); return;
      case 'template-save-as': promptTemplateName(); return;
      case 'template-save': promptTemplateName(); return;
      case 'template': loadTemplate(btn.dataset.template); return;
      case 'template-delete':
        if (window.confirmMonarch) {
          window.confirmMonarch({
            title: 'Delete Template',
            message: `Delete saved template "${btn.dataset.template}"?`,
            confirmLabel: 'Delete', danger: true,
            onConfirm: () => deleteSavedTemplate(btn.dataset.template)
          });
        } else {
          deleteSavedTemplate(btn.dataset.template);
        }
        return;
      case 'preview': showPreview(); return;
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

  /* preview */
  function previewFieldHtml(f) {
    const req = f.required ? ' *' : '';
    const label = `<label>${esc(f.label || f.name)}${req}</label>`;
    if (f.type === 'checkbox') {
      return `<div class="form-group"><label>${esc(f.label || f.name)}${req}</label><input type="checkbox" checked style="width:20px;height:20px;cursor:pointer;" disabled></div>`;
    }
    if (f.type === 'radio' && Array.isArray(f.options)) {
      return `<div class="form-group">${label}<div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">` +
        f.options.map(o => `<label style="display:flex;align-items:center;gap:0.5rem;"><input type="radio" disabled>${esc(o)}</label>`).join('') + `</div></div>`;
    }
    if (f.type === 'select' && Array.isArray(f.options)) {
      return `<div class="form-group">${label}<div class="form-control b-preview-empty">${esc(f.options[0] || '—')}</div></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-group">${label}<div class="form-control b-preview-empty" style="min-height:${Math.max(2, f.rows || 4) * 1.7}em;"></div></div>`;
    }
    if (f.type === 'datetime-auto') {
      return `<div class="form-group">${label}<div class="form-control">${esc(new Date().toLocaleString())}</div></div>`;
    }
    if (f.type === 'date' || f.type === 'datetime') {
      return `<div class="form-group">${label}<div class="form-control b-preview-empty"></div></div>`;
    }
    return `<div class="form-group">${label}<div class="form-control b-preview-empty"></div></div>`;
  }

  function buildPreviewHtml(spec) {
    const d = spec.document || {};
    const parts = [];
    parts.push(`
      <div class="signer-head" style="padding:1.5rem;">
        <div class="signer-eyebrow">${esc(d.jurisdiction || 'Electronic Execution')}</div>
        <h1 class="signer-title">${esc(d.title || 'Legal Document')}</h1>
      </div>
      <div class="signer-body">`);
    for (const sec of spec.sections || []) {
      if (sec.type === 'static') {
        const body = window.renderStaticBody
          ? window.renderStaticBody(sec.content)
          : esc(sec.content).replace(/\n/g, '<br>');
        parts.push(`<div class="signer-section"><div class="static-body">${body}</div></div>`);
      } else if (sec.type === 'form' || sec.type === 'signature') {
        parts.push(`<div class="signer-section">`);
        if (sec.signer_label) parts.push(`<div class="section-label">${esc(sec.signer_label)}</div>`);
        (sec.fields || []).forEach(f => parts.push(previewFieldHtml(f)));
        if (sec.type === 'signature') {
          if (d.legal_footer) parts.push(`<p class="legal-footer">${esc(d.legal_footer)}</p>`);
          parts.push(`<div class="form-group"><label>Signature Pad</label><div class="sig-pad"></div></div>`);
        }
        parts.push(`</div>`);
      }
    }
    parts.push(`</div>`);
    return parts.join('');
  }

  function showPreview() {
    const spec = toSpec();
    const overlay = document.createElement('div');
    overlay.className = 'b-preview-overlay';
    overlay.innerHTML = `
      <div class="b-preview-modal">
        <div class="b-preview-toolbar">
          <span class="b-lbl" style="margin:0;">Document Preview</span>
          <button type="button" class="b-close" data-act="preview-close" aria-label="Close preview">&#215;</button>
        </div>
        <div class="b-preview-scroll">${buildPreviewHtml(spec)}</div>
        <div class="b-preview-toolbar b-preview-foot">
          <button type="button" data-act="preview-deploy" class="btn" style="padding:0.5rem 1rem; font-size:0.8rem;">Deploy Document</button>
          <button type="button" data-act="preview-close" class="btn btn-outline" style="padding:0.5rem 1rem; font-size:0.8rem;">Back to Edit</button>
        </div>
      </div>`;
    overlay.querySelectorAll('[data-act="preview-close"]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('[data-act="preview-deploy"]').addEventListener('click', () => {
      overlay.remove();
      deployBuilder();
    });
    document.body.appendChild(overlay);
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
  window.loadSpecIntoBuilder = loadSpecIntoBuilder;

  function loadSpecIntoBuilder(spec) {
    state = specToState(spec || { document: {}, sections: [] });
    renderPanel();
    updatePreview();
    if (window.showToast) window.showToast('Document loaded into builder — deploy creates a fresh copy.', 'success');
  }
})();
