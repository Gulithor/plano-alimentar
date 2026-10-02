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

// ── Meal parsing ─────────────────────────────────────────────────────────────

const MEAL_DEFS = [
  { name: 'Pequeno-Almoço', emoji: '☀️', pattern: 'Pequeno-Almoço' },
  { name: 'Lanche da Manhã', emoji: '🥛', pattern: 'Lanche da Manhã' },
  { name: 'Almoço',          emoji: '🍽️', pattern: 'Almoço' },
  { name: 'Lanche da Tarde', emoji: '🍎', pattern: 'Lanche da Tarde' },
  { name: 'Jantar',          emoji: '🌙', pattern: 'Jantar' }
];

// These mark the end of the meals content area
const STOP_PATTERNS = [
  'Recomendações', 'RECEITAS', 'O QUE É', 'LISTA DE COMPRAS',
  'porção de carne equivale', 'porção de peixe equivale',
  'Macronutriente', '---PAGE_BREAK---'
];

function parseMeals(text) {
  const lines = text.split('\n').map(l => l.trim());
  const meals = [];

  for (let di = 0; di < MEAL_DEFS.length; di++) {
    const def = MEAL_DEFS[di];

    // Find the header line: must contain the pattern name AND a time like (7h or (10h30
    const headerIdx = lines.findIndex(l =>
      l.includes(def.pattern) && l.includes('(') && /\(\d+h/.test(l)
    );
    if (headerIdx === -1) continue;

    const timeRange = extractTimeRange(lines[headerIdx]);

    // Find section end: next meal header OR a stop pattern
    const nextMealPatterns = MEAL_DEFS.slice(di + 1).map(d => d.pattern);
    let endIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Next meal: must also be a header (has time range)
      if (nextMealPatterns.some(p => line.includes(p) && /\(\d+h/.test(line))) {
        endIdx = i; break;
      }
      // Hard stop patterns
      if (STOP_PATTERNS.some(p => line.includes(p))) {
        endIdx = i; break;
      }
    }

    const sectionLines = lines.slice(headerIdx + 1, endIdx).filter(Boolean);
    const { options, extras } = parseMealContent(sectionLines, def.name);

    meals.push({ name: def.name, emoji: def.emoji, timeRange, options, extras });
  }

  return meals;
}

function extractTimeRange(header) {
  const m = header.match(/\(([^)]+)\)/);
  return m ? m[1] : '';
}

// ── Option content parsing ────────────────────────────────────────────────────

const EXTRAS_PREFIXES = ['Sobremesa:', 'bebida:', 'Sem pão', 'Sem broa'];

function parseMealContent(lines, mealName) {
  const options = [];
  const extrasAccum = [];

  // 1. Split into OU-separated blocks
  const blocks = splitIntoOptionBlocks(lines);

  // 2. Determine display style for this meal
  //    Component meals (Almoço, Jantar) have 3 structural items: veg + protein + carb
  const isComponentMeal = mealName === 'Almoço' || mealName === 'Jantar';

  for (const block of blocks) {
    // Separate extras from content
    const contentLines = [];
    for (const line of block.lines) {
      if (EXTRAS_PREFIXES.some(p => line.startsWith(p))) {
        extrasAccum.push(line);
      } else {
        contentLines.push(line);
      }
    }

    if (!contentLines.length) continue;

    const items = buildItems(contentLines, isComponentMeal);
    options.push({ context: block.context, items });
  }

  // Merge extras into a single string
  const extras = extrasAccum.length ? [extrasAccum.join(' · ')] : [];

  return { options, extras };
}

function splitIntoOptionBlocks(lines) {
  const blocks = [];
  let currentLines = [];
  let currentContext = null;

  for (const line of lines) {
    if (EXTRAS_PREFIXES.some(p => line.startsWith(p))) {
      // Don't split extras into blocks, they'll be handled in parseMealContent
      currentLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.toUpperCase() === 'OU') {
      if (currentLines.length || currentContext) {
        blocks.push({ context: currentContext, lines: currentLines });
      }
      currentLines = [];
      currentContext = null;
    } else if (/^\(Nos dias/i.test(trimmed) && currentLines.length === 0) {
      currentContext = trimmed.replace(/^\(|\)$/g, '').trim();
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length || currentContext) {
    blocks.push({ context: currentContext, lines: currentLines });
  }

  return blocks;
}

// ── Item construction per display mode ───────────────────────────────────────

function buildItems(lines, isComponentMeal) {
  // Join consecutive lines that are continuations (handles PDF line-wrap)
  const joined = joinWrappedLines(lines, isComponentMeal);

  if (isComponentMeal) {
    // Almoço/Jantar: 3 structural components (veg, protein, carb)
    // Each component starts with: "Salada", "Legumes", a quantity, or "•"
    return joined;
  }

  // Breakfast/snack style: single block of text, split by " + "
  if (joined.length === 1) {
    return splitByPlus(joined[0]);
  }

  // Multiple joined lines — split each by " + " and flatten
  return joined.flatMap(t => splitByPlus(t));
}

// Joins consecutive PDF lines, preserving hyphens at end of lines (word-wrap artifact).
// "Grão-de-" + "bico" → "Grão-de-bico"  (no space inserted after hyphen)
function joinLinesHyphen(parts) {
  let result = '';
  for (const part of parts) {
    if (!result) { result = part; continue; }
    result = result.endsWith('-') ? result + part : result + ' ' + part;
  }
  return result.trim().replace(/\s+/g, ' ');
}

// Joins PDF line-wrapped text back into logical items.
// For component meals: new item starts at Salada/Legumes or a quantity (180g, 150g...)
// For other meals: join everything into one string
function joinWrappedLines(lines, isComponentMeal) {
  if (!isComponentMeal) {
    return [joinLinesHyphen(lines)];
  }

  // Component meal: reconstruct wrapped bullet items
  const items = [];
  let currentParts = [];

  const startsNewItem = (line) =>
    /^Salada/i.test(line) ||
    /^Legumes/i.test(line) ||
    /^•/.test(line) ||
    /^\d+g\s+de\s/i.test(line) ||      // "150g de Arroz"
    /^\d+g\s+[A-Z]/i.test(line);       // "120g Batata"

  for (const line of lines) {
    if (startsNewItem(line) && currentParts.length) {
      items.push(joinLinesHyphen(currentParts));
      currentParts = [line];
    } else {
      currentParts.push(line);
    }
  }
  if (currentParts.length) items.push(joinLinesHyphen(currentParts));

  // Strip leading bullet char if present
  return items.map(i => i.replace(/^[•\-]\s*/, '').trim()).filter(Boolean);
}

// Splits a text block by " + " where the next token starts with a digit or uppercase.
// This correctly handles: "3 Tostas de Sésamo + 1 colher de Sobremesa... Queijo Cottage + 300ml Leite"
function splitByPlus(text) {
  if (!text) return [];

  const parts = text.split(/\s\+\s(?=[\dA-ZÁÉÍÓÚÀÃÇÕ])/);
  if (parts.length <= 1) return [text.trim()];

  return parts.map(p => {
    p = p.trim();
    // Remove trailing unmatched closing paren (PDF line-wrap artifact)
    const opens = (p.match(/\(/g) || []).length;
    const closes = (p.match(/\)/g) || []).length;
    if (closes > opens) p = p.replace(/\)+\s*$/, '').trim();
    return p;
  }).filter(Boolean);
}

// ── Macros ───────────────────────────────────────────────────────────────────

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

// ── Fruit portions ────────────────────────────────────────────────────────────

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
        const hasPortionInfo = /\d|Metade|terço|talhada|pares|bagos|morangos|ameixas|kiwi/i.test(portionText);
        if (portionText && hasPortionInfo) {
          portions.push({ fruit, portion: portionText });
        } else if (i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (next && /\d|Metade/i.test(next)) {
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
    { fruit: 'Ameixas frescas',   portion: '2 ameixas (170 g)' },
    { fruit: 'Ananás fresco',     portion: '1 rodela, já arranjado (130 g)' },
    { fruit: 'Banana',            portion: 'Metade (100 g)' },
    { fruit: 'Cerejas',           portion: '10 pares (110 g)' },
    { fruit: 'Kiwi',              portion: '1 kiwi (130 g)' },
    { fruit: 'Laranja / Pêssego', portion: '1 médio (200 g)' },
    { fruit: 'Maçã',              portion: '1 pequena (120 g)' },
    { fruit: 'Manga',             portion: '1 terço, já arranjada (100 g)' },
    { fruit: 'Melancia',          portion: '1 talhada (420 g)' },
    { fruit: 'Meloa',             portion: 'Metade (480 g)' },
    { fruit: 'Morangos',          portion: '10 a 14 morangos (230 g)' },
    { fruit: 'Pera',              portion: '1 média (160 g)' },
    { fruit: 'Tangerina',         portion: '2 pequenas (190 g)' },
    { fruit: 'Uva',               portion: '8 a 10 bagos (80 g)' },
  ];
}

// ── Portion guides ────────────────────────────────────────────────────────────

function parsePortionGuides(lines) {
  const DEFAULT_MEAT = '1 bife grande (tamanho da mão) ou 2 bifes pequenos (tamanho da palma da mão) ou 1 coxa/sobrecoxa/asa de Frango ou ½ peito de frango ou 1 costeleta do lombo de porco ou 2 nacos médios de carne estufada';
  const DEFAULT_FISH = '1 Lombo de bacalhau/salmão ou 2 medalhões de pescada ou 1 dourada/robalo pequeno ou 1 rabo de peixe vermelho (red fish) ou 3 tentáculos de Polvo ou 3 sardinhas/cavala/carapau ou 1 lata de atum ao natural/azeite bem escorrido';

  let meat = '', fish = '';
  let inMeat = false, inFish = false;

  for (const line of lines) {
    if (line.includes('porção de carne equivale')) {
      inMeat = true; inFish = false; meat += line + ' ';
    } else if (line.includes('porção de peixe equivale')) {
      inFish = true; inMeat = false; fish += line + ' ';
    } else if (inMeat) {
      if (!line || /^Lanche|^Jantar|^Almoço/.test(line)) inMeat = false;
      else meat += line + ' ';
    } else if (inFish) {
      if (!line || /^Lanche|^Jantar|^Almoço/.test(line)) inFish = false;
      else fish += line + ' ';
    }
  }

  const cleanMeat = meat.replace(/\*?1 porção de carne equivale:?\s*/i, '').trim();
  const cleanFish = fish.replace(/\*?1 porção de peixe equivale:?\s*/i, '').trim();

  return {
    meat: cleanMeat || DEFAULT_MEAT,
    fish: cleanFish || DEFAULT_FISH
  };
}

// ── Recipes ───────────────────────────────────────────────────────────────────

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
    } else if (!name && line.length > 2 && line.length < 60) {
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
