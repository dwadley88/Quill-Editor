/***************
 * Quill init
 ***************/
const toolbarOptions = [
   ['bold', 'italic', 'underline', 'strike','clean', { color: [] }, { background: [] }],
  ['blockquote', { list: 'ordered'}, {list: 'bullet'}, { align: [] }],
  // custom buttons appended below
];

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: { container: toolbarOptions },
    keyboard: { bindings: {} }
  }
});

/***************
 * Add custom buttons inside Quill toolbar
 ***************/
// make one group for all custom controls
const toolbar = quill.getModule('toolbar');
const bar = toolbar.container;

const customGroup = document.createElement('span');
customGroup.className = 'ql-formats custom-controls';
bar.appendChild(customGroup);

function addCustom(name, label, title) {
  const btn = document.createElement('button');
  btn.className = `ql-${name}`;
  btn.type = 'button';
  btn.textContent = label;
  if (title) btn.title = title;
  customGroup.appendChild(btn);
}

// add all four to the ONE group
addCustom('zoomIn',  'A+', 'Zoom in');
addCustom('zoomOut', 'A-', 'Zoom out');
addCustom('print',   '🖨', 'Print');
addCustom('resetDoc','🧨', 'Reset template');

/* Make sure handlers fire even if Quill's custom handler doesn't bind */
function wireCustomHandler(name, handler) {
  toolbar.addHandler(name, handler);
  bar.querySelectorAll(`.ql-${name}`).forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handler(); });
  });
}

/***************
 * Sticky zoom
 ***************/
const ZOOM_KEY = 'editorZoom';
const Z_MIN = 0.6, Z_MAX = 2.0, Z_STEP = 0.1;

function getZoom() {
  const z = parseFloat(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(z) ? Math.min(Z_MAX, Math.max(Z_MIN, z)) : 1.0;
}
function setZoom(z) {
  const clamped = Math.min(Z_MAX, Math.max(Z_MIN, z));
  document.documentElement.style.setProperty('--editor-zoom', clamped);
  localStorage.setItem(ZOOM_KEY, clamped);
}
function nudgeZoom(delta) { setZoom(getZoom() + delta); }

setZoom(getZoom());
wireCustomHandler('zoomIn',  () => nudgeZoom(+Z_STEP));
wireCustomHandler('zoomOut', () => nudgeZoom(-Z_STEP));
wireCustomHandler('print',   () => window.print());
wireCustomHandler('resetDoc', () => { /* restore your template */ });

 /***************
  * Register Parchment formats so classes persist
  ***************/
const Parchment = Quill.import('parchment');
const ParagraphClass = new Parchment.Attributor.Class('paragraphClass', 'paragraph', { scope: Parchment.Scope.BLOCK });
const BlackIndent = new Parchment.Attributor.Class('blackIndent', 'black-indent', { scope: Parchment.Scope.BLOCK });
const BlueLine = new Parchment.Attributor.Class('blueLine', 'blue-line', { scope: Parchment.Scope.BLOCK });
const BlueSubline = new Parchment.Attributor.Class('blueSubline', 'blue-subline', { scope: Parchment.Scope.BLOCK });
const GreyText = new Parchment.Attributor.Class('greyText', 'grey-text', { scope: Parchment.Scope.INLINE });


Quill.register(ParagraphClass, true);
Quill.register(BlackIndent, true);
Quill.register(BlueLine, true);
Quill.register(BlueSubline, true);
Quill.register(GreyText, true);


/***************
 * Custom keyboard shortcuts
 ***************/
const Delta = Quill.import('delta');

function insertArrowLine(index, indent) {
  const arrow = indent === 0 ? '\u2192' : '\u21B3';
  const labelAttr = indent === 0 ? { paraphraseMainLabel: true } : { paraphraseMinorLabel: true };
  const lineAttr = indent === 0 ? { blueLine: true } : { blueSubline: true };
  quill.insertText(index, arrow, labelAttr, 'user');
  quill.insertText(index + 1, ' ', {}, 'user');
  quill.insertText(index + 2, '\n', 'user');
  quill.formatLine(index + 2, 1, lineAttr);
  quill.setSelection(index + 2, 0, 'user');
}

function insertFeedbackBlock() {
  const range = quill.getSelection();
  if (!range || range.length === 0) return;

  const selText = quill.getText(range.index, range.length);
  const mirror = selText.split(/\n/).join('  ');

  // mark original text
  quill.formatText(range.index, range.length, 'greyText', true);

  // find anchor line
  let anchorOffset = -1;
  for (let i = selText.length - 1; i >= 0; i--) {
    if (/\S/.test(selText[i])) { anchorOffset = i; break; }
  }
  let anchorIndex = anchorOffset >= 0 ? range.index + anchorOffset : range.index + range.length;
  const [anchorLine] = quill.getLine(anchorIndex);
  let insertIndex = quill.getIndex(anchorLine) + anchorLine.length();

  // skip existing feedback blocks
  while (true) {
    const [line] = quill.getLine(insertIndex);
    if (!line) break;
    const f = line.formats();
    if (!f.blackIndent) break;
    insertIndex += line.length();
    const [blue] = quill.getLine(insertIndex);
    if (blue && blue.formats().blueLine) {
      insertIndex += blue.length();
      const [sub] = quill.getLine(insertIndex);
      if (sub && sub.formats().blueSubline) insertIndex += sub.length();
    }
  }

  quill.insertText(insertIndex, mirror + '\n', 'user');
  quill.formatLine(insertIndex, mirror.length + 1, { blockquote: true, blackIndent: true });

  const blueIndex = insertIndex + mirror.length + 1;
  insertArrowLine(blueIndex, 0);
}

function applyCorrection() {
  const range = quill.getSelection();
  if (!range || range.length === 0) return;
  quill.formatText(range.index, range.length, { strike: true, color: 'orange' });
  quill.insertText(range.index + range.length, '  ', { color: 'orange' }, 'user');
  quill.insertText(range.index + range.length + 2, ' ', 'user');
  quill.setSelection(range.index + range.length + 1, 0, 'user');
}

let bracketStart = null;
quill.root.addEventListener('keydown', (e) => {
  if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
    bracketStart = quill.getSelection()?.index ?? null;
  } else if (e.key === ']' && bracketStart !== null) {
    e.preventDefault();
    const range = quill.getSelection();
    if (!range) return;
    const end = range.index;
    quill.deleteText(bracketStart, 1, 'user');
    const len = end - bracketStart;
    quill.formatText(bracketStart, len - 1, { color: 'orange' });
    quill.insertText(bracketStart + len - 1, ' ', { color: 'black'}, 'user');
    quill.setSelection(bracketStart + len, 0, 'user');
  }
});

quill.keyboard.addBinding({ key: '1', shortKey: true }, insertFeedbackBlock);
quill.keyboard.addBinding({ key: '2', shortKey: true }, applyCorrection);
quill.keyboard.addBinding({ key: 'Enter' }, (range, context) => {
  const [line] = quill.getLine(range.index);
  if (!line) return true;
  const formats = line.formats();
  const lineIndex = quill.getIndex(line);
  if (formats.blackIndent) {
    insertArrowLine(lineIndex + line.length(), 0);
    return false;
  }
  if (formats.blueLine) {
    const [prevLine] = quill.getLine(lineIndex - 1);
    if (line.length() <= 3 && prevLine && prevLine.formats().blueLine) {
      quill.deleteText(lineIndex, 2, 'user');
      quill.formatLine(lineIndex, 1, { blueLine: false, paragraphClass: true });
      quill.setSelection(lineIndex, 0, 'user');
      return false;
    }
    insertArrowLine(lineIndex + line.length(), 0);
    return false;
  }
  if (formats.blueSubline) {
    const [prevLine] = quill.getLine(lineIndex - 1);
    if (line.length() <= 3 && prevLine && prevLine.formats().blueSubline) {
      quill.deleteText(lineIndex, 2, 'user');
      quill.formatLine(lineIndex, 1, { blueSubline: false, paragraphClass: true });
      quill.setSelection(lineIndex, 0, 'user');
      return false;
    }
    insertArrowLine(lineIndex + line.length(), 1);
    return false;
  }
  return true;
});

quill.keyboard.addBinding({ key: 9 }, (range, context) => {
  const [line] = quill.getLine(range.index);
  if (!line) return true;
  const formats = line.formats();
  const lineIndex = quill.getIndex(line);
  if (formats.blueLine && range.index === lineIndex) {
    quill.deleteText(lineIndex, 2, 'user');
    quill.insertText(lineIndex, '\u21B3', { paraphraseMinorLabel: true }, 'user');
    quill.insertText(lineIndex + 1, ' ', {}, 'user');
    quill.formatLine(lineIndex, line.length(), { blueLine: false, blueSubline: true });
    quill.setSelection(lineIndex + 2, 0, 'user');
    return false;
  }
  return true;
});

quill.keyboard.addBinding({ key: 9, shiftKey: true }, (range, context) => {
  const [line] = quill.getLine(range.index);
  if (!line) return true;
  const formats = line.formats();
  const lineIndex = quill.getIndex(line);
  if (formats.blueSubline && range.index === lineIndex) {
    quill.deleteText(lineIndex, 2, 'user');
    quill.insertText(lineIndex, '\u2192', { paraphraseMainLabel: true }, 'user');
    quill.insertText(lineIndex + 1, ' ', {}, 'user');
    quill.formatLine(lineIndex, line.length(), { blueLine: true, blueSubline: false });
    quill.setSelection(lineIndex + 2, 0, 'user');
    return false;
  }
  return true;
});
