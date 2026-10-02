// Parses text extracted from a meal plan PDF into structured data.

export function parsePlan(pageTexts, fileName) {
  const allText = pageTexts.join('\n---PAGE_BREAK---\n');
  const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

  const plan = {
    fileName,
    name: '',
    objective: '',
    meals: [],
    macros: null,
    fruitPortions: [],
    meatPortionGuide: '',
    fishPortionGuide: '',
    recipes: []
  };

  // Name and objective
  for (const line of lines.slice(0, 15)) {
    if (line.startsWith('Nome:')) plan.name = line.slice(5).trim();
    else if (line.startsWith('Objetivo:')) plan.objective = line.slice(9).trim();
  }

  plan.meals = parseMeals(allText);
  plan.macros = parseMacros(lines);
  plan.fruitPortions = parseFruitPortions(lines);
  const guides = parsePortionGuides(lines);
  plan.meatPortionGuide = guides.meat;
  plan.fishPortionGuide = guides.fish;
  plan.recipes = parseRecipes(allText);

  return plan;
}

// ── Meal parsing ────────────────────────────────────────────────────────────

const MEAL_DEFS = [
  { name: 'Pequeno-Almoço', emoji: '☀️', pattern: 'Pequeno-Almoço' },
  { name: 'Lanche da Manhã', emoji: '🥛', pattern: 'Lanche da Manhã' },
  { name: 'Almoço',          emoji: '🍽️', pattern: 'Almoço' },
  { name: 'Lanche da Tarde', emoji: '🍎', pattern: 'Lanche da Tarde' },
  { name: 'Jantar',          emoji: '🌙', pattern: 'Jantar' }
];

function parseMeals(text) {
  const lines = text.split('\n').map(l => l.trim());
  const meals = [];

  const STOP_PATTERNS = [
    'Recomendações', 'RECEITAS', 'O QUE É', 'LISTA DE COMPRAS',
    '*1 porção de carne', '*1 porção de peixe', 'Macronutriente', '---PAGE_BREAK---'
  ];

  for (let di = 0; di < MEAL_DEFS.length; di++) {
    const def = MEAL_DEFS[di];
    const headerIdx = lines.findIndex(l => l.includes(def.pattern) && l.includes('(') && /\dh/.test(l));
    if (headerIdx === -1) continue;

    const headerLine = lines[headerIdx];
    const timeRange = extractTimeRange(headerLine);

    // Find where this section ends
    const nextPatterns = MEAL_DEFS.slice(di + 1).map(d => d.pattern).concat(STOP_PATTERNS);
    let endIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (nextPatterns.some(p => lines[i].includes(p))) { endIdx = i; break; }
    }

    const sectionLines = lines.slice(headerIdx + 1, endIdx);
    const { options, extras } = parseMealContent(sectionLines);

    meals.push({ name: def.name, emoji: def.emoji, timeRange, options, extras });
  }

  return meals;
}

function extractTimeRange(header) {
  const m = header.match(/\(([^)]+)\)/);
  return m ? m[1] : '';
}

function parseMealContent(lines) {
  const options = [];
  const extras = [];
  const nonEmpty = lines.filter(Boolean);

  const EXTRAS_PREFIXES = ['Sobremesa:', 'bebida:', 'Sem pão', 'Sem broa'];

  let currentItems = [];
  let currentContext = null;
  let inExtras = false;
  let extrasText = '';

  function flushOption() {
    const filtered = currentItems.filter(i => i.toUpperCase().trim() !== 'OU' && i.trim() !== '');
    if (filtered.length) options.push({ context: currentContext, items: filtered });
    currentItems = [];
    currentContext = null;
  }

  for (const line of nonEmpty) {
    // Once we hit extras, accumulate them
    if (!inExtras && EXTRAS_PREFIXES.some(p => line.startsWith(p))) {
      inExtras = true;
      flushOption();
    }
    if (inExtras) {
      extrasText += (extrasText ? ' ' : '') + line;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.toUpperCase() === 'OU') {
      flushOption();
    } else if (/^\(Nos dias/i.test(trimmed) && currentItems.length === 0) {
      currentContext = trimmed.replace(/^\(|\)$/g, '').trim();
    } else {
      currentItems.push(trimmed);
    }
  }
  flushOption();

  if (extrasText) extras.push(extrasText);
  return { options, extras };
}

// ── Macros ──────────────────────────────────────────────────────────────────

function parseMacros(lines) {
  let proteinGrams = 0, proteinKcal = 0;
  let carbsGrams = 0, carbsKcal = 0;
  let fatGrams = 0, fatKcal = 0;
  let totalKcal = 0;

  for (const line of lines) {
    const nums = (line.match(/\d+/g) || []).map(Number);
    if (/^Prote[íi]na/.test(line) && nums.length >= 2) {
      [proteinGrams, proteinKcal] = nums;
    } else if (/^Hidratos/.test(line) && nums.length >= 2) {
      [carbsGrams, carbsKcal] = nums;
    } else if (/^Gordura/.test(line) && nums.length >= 2) {
      [fatGrams, fatKcal] = nums;
    } else if (/^Total/.test(line) && nums.length >= 1) {
      totalKcal = nums[0];
    }
  }

  if (!totalKcal) return null;
  return { proteinGrams, proteinKcal, carbsGrams, carbsKcal, fatGrams, fatKcal, totalKcal };
}

// ── Fruit portions ──────────────────────────────────────────────────────────

const KNOWN_FRUITS = [
  'Ameixas frescas', 'Ananás fresco', 'Banana', 'Cerejas', 'Kiwi',
  'Laranja / Pêssego', 'Laranja', 'Pêssego', 'Maçã', 'Manga',
  'Melancia', 'Meloa', 'Morangos', 'Pera', 'Tangerina', 'Uva'
];

function parseFruitPortions(lines) {
  const startIdx = lines.findIndex(l => l.includes('PORÇÃO DE FRUTA'));
  if (startIdx === -1) return defaultFruitPortions();

  const portions = [];
  for (let i = startIdx + 1; i < Math.min(startIdx + 35, lines.length); i++) {
    const line = lines[i];
    if (!line || line.includes('Alimentos') || line.includes('porção ou') || line === 'Fruta') continue;
    if (line.includes('Recomendações') || line.includes('LISTA')) break;

    for (const fruit of KNOWN_FRUITS) {
      if (line.startsWith(fruit) || line.includes(fruit)) {
        const portionText = line.slice(line.indexOf(fruit) + fruit.length).trim();
        if (portionText && (portionText.includes('g') || portionText.match(/\d/) || portionText.includes('Metade') || portionText.includes('terço') || portionText.includes('talhada') || portionText.includes('pares') || portionText.includes('bagos') || portionText.includes('morangos') || portionText.includes('ameixas') || portionText.includes('kiwi'))) {
          portions.push({ fruit, portion: portionText });
        } else if (i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (next && (next.includes('g') || next.match(/\d/) || next.includes('Metade'))) {
            portions.push({ fruit, portion: next });
            i++;
          }
        }
        break;
      }
    }
  }

  return portions.length ? portions : defaultFruitPortions();
}

function defaultFruitPortions() {
  return [
    { fruit: 'Ameixas frescas',  portion: '2 ameixas (170 g)' },
    { fruit: 'Ananás fresco',    portion: '1 rodela, já arranjado (130 g)' },
    { fruit: 'Banana',           portion: 'Metade (100 g)' },
    { fruit: 'Cerejas',          portion: '10 pares (110 g)' },
    { fruit: 'Kiwi',             portion: '1 kiwi (130 g)' },
    { fruit: 'Laranja / Pêssego',portion: '1 médio (200 g)' },
    { fruit: 'Maçã',             portion: '1 pequena (120 g)' },
    { fruit: 'Manga',            portion: '1 terço, já arranjada (100 g)' },
    { fruit: 'Melancia',         portion: '1 talhada (420 g)' },
    { fruit: 'Meloa',            portion: 'Metade (480 g)' },
    { fruit: 'Morangos',         portion: '10 a 14 morangos (230 g)' },
    { fruit: 'Pera',             portion: '1 média (160 g)' },
    { fruit: 'Tangerina',        portion: '2 pequenas (190 g)' },
    { fruit: 'Uva',              portion: '8 a 10 bagos (80 g)' },
  ];
}

// ── Portion guides ───────────────────────────────────────────────────────────

function parsePortionGuides(lines) {
  const DEFAULT_MEAT = '1 bife grande (tamanho da mão) ou 2 bifes pequenos (tamanho da palma da mão) ou 1 coxa/sobrecoxa/asa de Frango ou ½ peito de frango ou 1 costeleta do lombo de porco ou 2 nacos médios de carne estufada';
  const DEFAULT_FISH = '1 Lombo de bacalhau/salmão ou 2 medalhões de pescada ou 1 dourada/robalo pequeno ou 1 rabo de peixe vermelho (red fish) ou 3 tentáculos de Polvo ou 3 sardinhas/cavala/carapau ou 1 lata de atum ao natural/azeite bem escorrido';

  let meat = '', fish = '';
  let inMeat = false, inFish = false;

  for (const line of lines) {
    if (line.includes('porção de carne equivale') || line.includes('1 porção de carne')) {
      inMeat = true; inFish = false;
      meat += line + ' ';
    } else if (line.includes('porção de peixe equivale') || line.includes('1 porção de peixe')) {
      inFish = true; inMeat = false;
      fish += line + ' ';
    } else if (inMeat) {
      if (!line || line.includes('Lanche') || line.includes('Jantar') || line.includes('Almoço')) inMeat = false;
      else meat += line + ' ';
    } else if (inFish) {
      if (!line || line.includes('Lanche') || line.includes('Jantar') || line.includes('Almoço')) inFish = false;
      else fish += line + ' ';
    }
  }

  const cleanMeat = meat.replace(/\*?1 porção de carne equivale:?/i, '').trim();
  const cleanFish = fish.replace(/\*?1 porção de peixe equivale:?/i, '').trim();

  return {
    meat: cleanMeat || DEFAULT_MEAT,
    fish: cleanFish || DEFAULT_FISH
  };
}

// ── Recipes ──────────────────────────────────────────────────────────────────

function parseRecipes(text) {
  const startMatch = text.match(/RECEITAS:/i);
  if (!startMatch) return defaultRecipes();

  const afterRecipes = text.slice(startMatch.index + startMatch[0].length);
  const lines = afterRecipes.split('\n').map(l => l.trim()).filter(Boolean);

  const recipes = [];
  let name = '', ingredients = [], instructions = '', inInstructions = false;

  function flush() {
    if (name && ingredients.length) {
      recipes.push({ name, ingredients, instructions: instructions.trim() });
    }
    name = ''; ingredients = []; instructions = ''; inInstructions = false;
  }

  for (const line of lines) {
    if (line.includes('---PAGE_BREAK---')) continue;
    if (line.startsWith('•') || line.startsWith('-')) {
      inInstructions = false;
      ingredients.push(line.replace(/^[•\-]\s*/, '').trim());
    } else if (/^Misturar|^Leve |^Quando |^Cozinhar|^Preparar/i.test(line)) {
      inInstructions = true;
      instructions += line + ' ';
    } else if (inInstructions) {
      instructions += line + ' ';
    } else if (ingredients.length === 0 && line.length > 2 && line.length < 60) {
      flush();
      name = line.replace(/^\*+|_+/g, '').trim();
    }
  }
  flush();

  return recipes.length ? recipes : defaultRecipes();
}

function defaultRecipes() {
  return [{
    name: 'Overnight Oats',
    ingredients: [
      '125g de Iogurte Sólido Natural Proteico',
      '30g de Nestum de Arroz',
      '5g de Sementes de Chia',
      '30g de Proteína em Pó',
      'Leite Magro Proteico q.b.',
      '1 Peça de Fruta (120g – à sua escolha)'
    ],
    instructions: 'Misturar todos os ingredientes à exceção da Fruta. Leve ao frigorifico e deixe descansar por pelo menos 6 horas antes de consumir. Quando servir, parta a fruta aos pedaçinhos por cima da mistura anterior.'
  }];
}
