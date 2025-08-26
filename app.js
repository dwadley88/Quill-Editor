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
const ClassAttributor = Quill.import('parchment/class');
const ParagraphClass = new ClassAttributor('paragraphClass', 'ql-paragraph', { scope: Parchment.Scope.BLOCK });
const GreyText = new ClassAttributor('greyText', 'ql-grey-text', { scope: Parchment.Scope.INLINE });


Quill.register(ParagraphClass, true);
Quill.register(GreyText, true);


/***************
 * Custom keyboard shortcuts
 ***************/
function insertFeedbackLine(index, indent, setCursor = true) {
  quill.insertText(index, '\n', 'user');
  quill.formatLine(index, 1, { list: 'bullet', indent });
  if (setCursor) quill.setSelection(index, 0, 'user');
  return index + 1;
}

function insertFeedbackBlock() {
  const range = quill.getSelection();
  if (!range || range.length === 0) return;

  const selText = quill.getText(range.index, range.length);
  const mirror = selText.split(/\n/).join('  ');

  // mark original text
  quill.formatText(range.index, range.length, { greyText: 'ql-grey-text' });

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
    if (f.list !== 'bullet' || (f.indent || 0) !== 0) break;
    insertIndex += line.length();
    const [blue] = quill.getLine(insertIndex);
    if (blue && blue.formats().list === 'bullet' && (blue.formats().indent || 0) === 1) {
      insertIndex += blue.length();
      const [sub] = quill.getLine(insertIndex);
      if (sub && sub.formats().list === 'bullet' && (sub.formats().indent || 0) === 2) insertIndex += sub.length();
    }
  }

  quill.insertText(insertIndex, mirror + '\n', 'user');
  quill.formatLine(insertIndex, mirror.length + 1, { list: 'bullet', indent: 0 });

  const firstBullet = insertIndex + mirror.length + 1;
  const afterFirst = insertFeedbackLine(firstBullet, 1, false);
  insertFeedbackLine(afterFirst, 2, false);
  quill.setSelection(firstBullet, 0, 'user');
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

quill.keyboard.addBinding({ key: 9 }, (range, context) => {
  const [line] = quill.getLine(range.index);
  if (!line) return true;
  const indent = (line.formats().indent || 0);
  return indent > 0; // block Tab if indent is 0
});

quill.keyboard.addBinding({ key: 9, shiftKey: true }, (range, context) => {
  const [line] = quill.getLine(range.index);
  if (!line) return true;
  const indent = (line.formats().indent || 0);
  return indent > 1; // block Shift+Tab if indent is 1 or less
});
