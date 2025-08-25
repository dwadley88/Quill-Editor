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
  toolbarEl.querySelectorAll(`.ql-${name}`).forEach(btn => {
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

wireCustomHandler('zoomIn',  () => nudgeZoom(+Z_STEP));
wireCustomHandler('zoomOut', () => nudgeZoom(-Z_STEP));
wireCustomHandler('print',   () => window.print());


/***************
 * Fixed toolbar height → CSS var for layout
 ***************/

function syncToolbarHeight() {
  const h = Math.ceil(toolbarEl.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--toolbar-h', `${h}px`);
}
syncToolbarHeight();
window.addEventListener('resize', syncToolbarHeight);

/***************
 * Register Parchment formats so classes persist
 ***************/
const Parchment = Quill.import('parchment');
const ParagraphClass = new Parchment.Attributor.Class('paragraphClass', 'paragraph', { scope: Parchment.Scope.BLOCK });
const BlackIndent    = new Parchment.Attributor.Class('blackIndent',    'black-indent',   { scope: Parchment.Scope.BLOCK });
const BlueLine       = new Parchment.Attributor.Class('blueLine',       'blue-line',      { scope: Parchment.Scope.BLOCK });
const BlueSubline    = new Parchment.Attributor.Class('blueSubline',    'blue-subline',   { scope: Parchment.Scope.BLOCK });
const ParaphraseMain = new Parchment.Attributor.Class('paraphraseMain', 'paraphrase-main',{ scope: Parchment.Scope.BLOCK });
const ParaphraseMinor= new Parchment.Attributor.Class('paraphraseMinor','paraphrase-minor',{ scope: Parchment.Scope.BLOCK });
const GreyText       = new Parchment.Attributor.Class('greyText',       'grey-text',      { scope: Parchment.Scope.INLINE });
const OrigTextAttr   = new Parchment.A
