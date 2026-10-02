import { parsePlan } from './parser.js';

// ── pdf.js CDN (cached by service worker) ────────────────────────────────────
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

// ── State ────────────────────────────────────────────────────────────────────
let plan = null;
let pdfDoc = null;  // kept in memory for catalogue rendering
let cataloguePageNums = [];

const STORE_KEY = 'mealPlan_v1';
const CATALOGUE_KEY = 'catalogueDataURLs_v1';

// ── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();

  const saved = localStorage.getItem(STORE_KEY);
  if (saved) {
    try {
      plan = JSON.parse(saved);
      showApp();
    } catch { showWelcome(); }
  } else {
    showWelcome();
  }

  bindEvents();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
  // File input
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadPDF(file);
    fileInput.value = '';
  });

  // Welcome button
  document.getElementById('btn-load-welcome').addEventListener('click', () => {
    fileInput.click();
  });

  // Tab bar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// ── PDF loading ───────────────────────────────────────────────────────────────
async function loadPDF(file) {
  setLoading(true);
  try {
    const pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract text per page with line-break detection
    const pageTexts = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      pageTexts.push(await extractPageText(pdfDoc, p));
    }

    plan = parsePlan(pageTexts, file.name);
    localStorage.setItem(STORE_KEY, JSON.stringify(plan));

    // Find and render catalogue pages
    cataloguePageNums = findCataloguePages(pageTexts);
    await renderAndCacheCataloguePages();

    showApp();
  } catch (err) {
    alert('Erro ao carregar o PDF: ' + err.message);
    console.error(err);
  } finally {
    setLoading(false);
  }
}

async function extractPageText(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  const lines = [];
  let currentLine = '';
  let lastY = null;

  for (const item of content.items) {
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
    }
    currentLine += (item.str || '') + ' ';
    lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join('\n');
}

function findCataloguePages(pageTexts) {
  const nums = [];
  for (let i = 0; i < pageTexts.length; i++) {
    const t = pageTexts[i].toUpperCase();
    if (t.includes('LISTA DE COMPRAS') || t.includes('COMPRAS:')) {
      nums.push(i + 1); // 1-indexed for pdf.js
      if (i + 1 < pageTexts.length) nums.push(i + 2);
      break;
    }
  }
  return nums;
}

async function renderAndCacheCataloguePages() {
  if (!pdfDoc || cataloguePageNums.length === 0) return;
  const dataURLs = [];
  for (const pageNum of cataloguePageNums) {
    const dataURL = await renderPageToDataURL(pdfDoc, pageNum);
    if (dataURL) dataURLs.push(dataURL);
  }
  try {
    localStorage.setItem(CATALOGUE_KEY, JSON.stringify(dataURLs));
  } catch {
    // localStorage quota exceeded — skip caching images
  }
}

async function renderPageToDataURL(pdf, pageNum, scale = 1.6) {
  try {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch { return null; }
}

// ── Routing ───────────────────────────────────────────────────────────────────
function showWelcome() {
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderAll();
  switchTab('meals');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
}

function setLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  if (!plan) return;
  renderMeals();
  renderInfo();
  renderRecipes();
}

// ── Meals tab ─────────────────────────────────────────────────────────────────
function renderMeals() {
  const el = document.getElementById('tab-meals');
  const reloadBtn = `
    <button class="reload-btn" id="btn-reload" title="Carregar novo PDF">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`;

  const headerHTML = `
    <div class="section-header">
      <div>
        <h1>${esc(plan.name || 'Refeições')}</h1>
      </div>
      ${reloadBtn}
    </div>`;

  const objectiveHTML = plan.objective ? `
    <div class="objective-banner">
      <svg viewBox="0 0 24 24"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z"/></svg>
      ${esc(plan.objective)}
    </div>` : '';

  const mealsHTML = plan.meals.map(meal => mealCardHTML(meal)).join('');

  el.innerHTML = headerHTML + objectiveHTML + `<div class="cards">${mealsHTML}</div>`;

  // Reload button
  el.querySelector('#btn-reload').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  // Expand/collapse
  el.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.card').classList.toggle('open');
    });
  });
}

function mealCardHTML(meal) {
  const optionsHTML = meal.options.map((opt, i) => {
    const divider = i > 0 ? '<div class="or-divider">OU</div>' : '';
    const context = opt.context ? `<div class="option-context">${esc(opt.context)}</div>` : '';
    const items = opt.items.map(item => {
      const clean = item.replace(/^[•\-]\s*/, '');
      return `<div class="option-item">${esc(clean)}</div>`;
    }).join('');
    return `${divider}<div class="option-block">${context}${items}</div>`;
  }).join('');

  const extrasHTML = meal.extras.length
    ? `<div class="extras">${esc(meal.extras.join(' · '))}</div>`
    : '';

  return `
    <div class="card">
      <div class="card-header">
        <div class="meal-emoji">${meal.emoji}</div>
        <div class="meal-info">
          <div class="meal-name">${esc(meal.name)}</div>
          <div class="meal-time">${esc(meal.timeRange)}</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="card-body">
        ${optionsHTML}
        ${extrasHTML}
      </div>
    </div>`;
}

// ── Info tab ──────────────────────────────────────────────────────────────────
function renderInfo() {
  const el = document.getElementById('tab-info');

  const headerHTML = `<div class="section-header"><div><h1>Informação</h1></div></div>`;

  const macrosHTML = plan.macros ? macrosCardHTML(plan.macros) : '';

  const portionHTML = `
    <div class="card">
      <div class="card-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/>
        </svg>
        Equivalências de Porção
      </div>
      <div class="guide-block">
        <div class="guide-label">🥩 Carne</div>
        <div class="guide-text">${esc(plan.meatPortionGuide)}</div>
      </div>
      <div class="guide-block">
        <div class="guide-label">🐟 Peixe</div>
        <div class="guide-text">${esc(plan.fishPortionGuide)}</div>
      </div>
    </div>`;

  const fruitHTML = `
    <div class="card">
      <div class="card-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        O que é 1 porção de fruta?
      </div>
      <div class="fruit-note">Cada porção tem ≈ 12 g de hidratos de carbono.</div>
      ${plan.fruitPortions.map(fp => `
        <div class="fruit-row">
          <div class="fruit-name">${esc(fp.fruit)}</div>
          <div class="fruit-portion">${esc(fp.portion)}</div>
        </div>`).join('')}
    </div>`;

  const catalogueHTML = `
    <button class="catalogue-btn" id="btn-catalogue">
      <div class="catalogue-btn-left">
        <span class="catalogue-icon">🛒</span>
        Catálogo de Produtos
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`;

  el.innerHTML = headerHTML + `<div class="cards">${macrosHTML}${portionHTML}${fruitHTML}${catalogueHTML}</div>`;

  el.querySelector('#btn-catalogue').addEventListener('click', () => {
    renderCatalogue();
    switchTab('catalogue');
  });
}

function macrosCardHTML(m) {
  const total = m.totalKcal;
  const rows = [
    { name: 'Proteína',  grams: m.proteinGrams, kcal: m.proteinKcal, color: '#3b82f6' },
    { name: 'Hidratos',  grams: m.carbsGrams,   kcal: m.carbsKcal,   color: '#f97316' },
    { name: 'Gordura',   grams: m.fatGrams,      kcal: m.fatKcal,     color: '#eab308' },
  ];

  const rowsHTML = rows.map(r => {
    const pct = total ? Math.round((r.kcal / total) * 100) : 0;
    return `
      <div class="macro-row">
        <div class="macro-row-header">
          <span class="macro-name">${r.name}</span>
          <span class="macro-values">${r.grams}g · ${r.kcal} kcal · ${pct}%</span>
        </div>
        <div class="macro-bar-bg">
          <div class="macro-bar-fill" style="width:${pct}%;background:${r.color}"></div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card macros-card">
      <div class="card-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Macronutrientes
      </div>
      <div class="kcal-total">
        <div class="kcal-num">${m.totalKcal.toLocaleString('pt-PT')}</div>
        <div class="kcal-label">kcal / dia</div>
      </div>
      ${rowsHTML}
    </div>`;
}

// ── Catalogue tab ─────────────────────────────────────────────────────────────
function renderCatalogue() {
  const el = document.getElementById('tab-catalogue');

  const headerHTML = `
    <div class="catalogue-header">
      <button class="back-btn" id="btn-back-catalogue">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Informação
      </button>
      <span class="catalogue-title">Catálogo de Produtos</span>
    </div>`;

  // Try cached images
  let imagesHTML = '';
  try {
    const cached = localStorage.getItem(CATALOGUE_KEY);
    if (cached) {
      const dataURLs = JSON.parse(cached);
      if (dataURLs.length) {
        imagesHTML = `<div class="catalogue-pages">${dataURLs.map(url => `<img src="${url}" alt="Catálogo">`).join('')}</div>`;
      }
    }
  } catch {}

  if (!imagesHTML) {
    imagesHTML = `
      <div class="catalogue-empty">
        <div class="icon">🛒</div>
        <p>As imagens do catálogo ficam disponíveis após carregar um PDF.</p>
      </div>`;
  }

  el.innerHTML = headerHTML + imagesHTML;

  el.querySelector('#btn-back-catalogue').addEventListener('click', () => {
    switchTab('info');
  });
}

// ── Recipes tab ───────────────────────────────────────────────────────────────
function renderRecipes() {
  const el = document.getElementById('tab-recipes');

  const headerHTML = `<div class="section-header"><div><h1>Receitas</h1></div></div>`;

  if (!plan.recipes || plan.recipes.length === 0) {
    el.innerHTML = headerHTML + `<div class="empty-state"><div class="empty-icon">📖</div><p>Nenhuma receita encontrada.</p></div>`;
    return;
  }

  const recipesHTML = plan.recipes.map(recipe => {
    const ingredients = recipe.ingredients.map(i => `<div class="ingredient-item">${esc(i)}</div>`).join('');
    const instructions = recipe.instructions ? `
      <div class="recipe-instructions">
        <div class="instructions-label">Preparação</div>
        ${esc(recipe.instructions)}
      </div>` : '';

    return `
      <div class="card recipe-card">
        <div class="card-header">
          <div class="meal-emoji">🥣</div>
          <div class="meal-info">
            <div class="meal-name">${esc(recipe.name)}</div>
            <div class="recipe-meta">${recipe.ingredients.length} ingredientes</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="card-body">
          <div class="recipe-ingredients">${ingredients}</div>
          ${instructions}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = headerHTML + `<div class="cards">${recipesHTML}</div>`;

  el.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', () => header.closest('.card').classList.toggle('open'));
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
