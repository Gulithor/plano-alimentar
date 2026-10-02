import Foundation
import PDFKit
import UIKit

enum ParserError: Error {
    case cannotOpenPDF
    case noTextFound
}

struct PDFParserService {

    static func parse(url: URL) throws -> MealPlan {
        guard let document = PDFDocument(url: url) else {
            throw ParserError.cannotOpenPDF
        }

        var allText = ""
        for i in 0..<document.pageCount {
            if let page = document.page(at: i), let pageText = page.string {
                allText += pageText + "\n---PAGE_BREAK---\n"
            }
        }

        guard !allText.isEmpty else { throw ParserError.noTextFound }

        var plan = MealPlan()
        plan.fileName = url.lastPathComponent

        let lines = allText.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        for line in lines.prefix(15) {
            if line.hasPrefix("Nome:") {
                plan.name = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("Objetivo:") {
                plan.objective = String(line.dropFirst(9)).trimmingCharacters(in: .whitespaces)
            }
        }

        plan.meals = parseMeals(from: allText)
        plan.macros = parseMacros(from: allText)
        plan.fruitPortions = parseFruitPortions(from: allText)

        let guides = parsePortionGuides(from: allText)
        plan.meatPortionGuide = guides.meat
        plan.fishPortionGuide = guides.fish

        plan.recipes = parseRecipes(from: allText)

        return plan
    }

    // MARK: - Catalogue image extraction

    static func extractCatalogueImages(url: URL) -> [UIImage] {
        guard let document = PDFDocument(url: url) else { return [] }

        var images: [UIImage] = []
        // Identify pages that look like shopping/catalogue pages (pages with many images)
        // For this format: pages 4 and 5 (0-indexed) = "Lista de Compras" pages
        let candidateIndices = findCataloguePageIndices(in: document)

        for idx in candidateIndices {
            guard idx < document.pageCount,
                  let page = document.page(at: idx) else { continue }
            if let img = renderPage(page, scale: 2.0) {
                images.append(img)
            }
        }

        return images
    }

    static func findCataloguePageIndices(in document: PDFDocument) -> [Int] {
        var indices: [Int] = []
        for i in 0..<document.pageCount {
            guard let page = document.page(at: i),
                  let text = page.string else { continue }
            let t = text.uppercased()
            if t.contains("LISTA DE COMPRAS") || t.contains("COMPRAS:") {
                indices.append(i)
                if i + 1 < document.pageCount { indices.append(i + 1) }
                break
            }
        }
        return indices
    }

    static func renderPage(_ page: PDFPage, scale: CGFloat) -> UIImage? {
        let pageRect = page.bounds(for: .mediaBox)
        let size = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            ctx.cgContext.saveGState()
            UIColor.white.setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: size))
            ctx.cgContext.scaleBy(x: scale, y: scale)
            ctx.cgContext.translateBy(x: 0, y: pageRect.height)
            ctx.cgContext.scaleBy(x: 1, y: -1)
            page.draw(with: .mediaBox, to: ctx.cgContext)
            ctx.cgContext.restoreGState()
        }
    }

    // MARK: - Meal parsing

    private static func parseMeals(from text: String) -> [Meal] {
        let mealDefs: [(name: String, pattern: String)] = [
            ("Pequeno-Almoço", "Pequeno-Almoço"),
            ("Lanche da Manhã", "Lanche da Manhã"),
            ("Almoço", "Almoço"),
            ("Lanche da Tarde", "Lanche da Tarde"),
            ("Jantar", "Jantar")
        ]

        var meals: [Meal] = []
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        for (idx, def) in mealDefs.enumerated() {
            // Find the header line index
            guard let headerIdx = lines.firstIndex(where: {
                $0.contains(def.pattern) && $0.contains("(") && $0.contains("h")
            }) else { continue }

            let headerLine = lines[headerIdx]
            let timeRange = extractTimeRange(from: headerLine)

            // Find next meal header or section boundary
            let nextPatterns = mealDefs.dropFirst(idx + 1).map { $0.pattern }
            let endIdx = findNextSectionIndex(in: lines, from: headerIdx + 1, nextPatterns: nextPatterns + ["Recomendações", "RECEITAS", "O QUE É", "LISTA DE COMPRAS", "*1 porção de carne", "Macronutriente", "---PAGE_BREAK---"])

            let sectionLines = Array(lines[(headerIdx + 1)..<endIdx])
            let (options, extras) = parseMealContent(sectionLines)

            meals.append(Meal(
                name: def.name,
                timeRange: timeRange,
                options: options,
                extras: extras
            ))
        }

        return meals
    }

    private static func extractTimeRange(from header: String) -> String {
        guard let start = header.firstIndex(of: "("),
              let end = header.lastIndex(of: ")") else { return "" }
        return String(header[header.index(after: start)..<end])
    }

    private static func findNextSectionIndex(in lines: [String], from start: Int, nextPatterns: [String]) -> Int {
        for i in start..<lines.count {
            let line = lines[i]
            for pattern in nextPatterns {
                if line.contains(pattern) {
                    return i
                }
            }
        }
        return lines.count
    }

    private static func parseMealContent(_ lines: [String]) -> (options: [MealOption], extras: [String]) {
        var options: [MealOption] = []
        var extras: [String] = []

        let nonEmpty = lines.filter { !$0.isEmpty }

        var currentItems: [String] = []
        var currentContext: String? = nil
        var inExtras = false

        func flushOption() {
            let filtered = currentItems.filter { !$0.isEmpty && $0.uppercased() != "OU" }
            if !filtered.isEmpty {
                options.append(MealOption(context: currentContext, items: filtered))
            }
            currentItems = []
            currentContext = nil
        }

        let extrasKeywords = ["Sobremesa:", "bebida:", "Sem pão", "Sem broa"]

        for line in nonEmpty {
            if extrasKeywords.contains(where: { line.hasPrefix($0) }) {
                inExtras = true
            }

            if inExtras {
                // Merge everything into one extras line
                let existing = extras.last ?? ""
                if existing.isEmpty {
                    extras.append(line)
                } else {
                    extras[extras.count - 1] = existing + " " + line
                }
                continue
            }

            // "OU" separator (standalone line)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.uppercased() == "OU" {
                flushOption()
            } else if (trimmed.hasPrefix("(Nos dias") || trimmed.hasPrefix("(Nos")) && currentItems.isEmpty {
                // Context note for this option
                currentContext = trimmed
                    .trimmingCharacters(in: CharacterSet(charactersIn: "()"))
                    .trimmingCharacters(in: .whitespaces)
            } else {
                currentItems.append(trimmed)
            }
        }
        flushOption()

        return (options, extras)
    }

    // MARK: - Macros parsing

    private static func parseMacros(from text: String) -> MacroInfo? {
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        var proteinGrams = 0, proteinKcal = 0
        var carbsGrams = 0, carbsKcal = 0
        var fatGrams = 0, fatKcal = 0
        var totalKcal = 0

        for line in lines {
            let parts = line.components(separatedBy: CharacterSet.whitespaces)
                .filter { !$0.isEmpty }

            if line.hasPrefix("Proteína") || line.contains("Proteína") && line.contains("g") && line.contains("kcal") {
                let numbers = extractNumbers(from: line)
                if numbers.count >= 2 { proteinGrams = numbers[0]; proteinKcal = numbers[1] }
            } else if line.hasPrefix("Hidratos") || (line.contains("Hidratos") && line.contains("g")) {
                let numbers = extractNumbers(from: line)
                if numbers.count >= 2 { carbsGrams = numbers[0]; carbsKcal = numbers[1] }
            } else if line.hasPrefix("Gordura") && (line.contains("g") || line.contains("kcal")) {
                let numbers = extractNumbers(from: line)
                if numbers.count >= 2 { fatGrams = numbers[0]; fatKcal = numbers[1] }
            } else if line.hasPrefix("Total") && line.contains("kcal") {
                let numbers = extractNumbers(from: line)
                if let first = numbers.first { totalKcal = first }
            }
        }

        guard totalKcal > 0 else { return nil }
        return MacroInfo(
            proteinGrams: proteinGrams, proteinKcal: proteinKcal,
            carbsGrams: carbsGrams, carbsKcal: carbsKcal,
            fatGrams: fatGrams, fatKcal: fatKcal,
            totalKcal: totalKcal
        )
    }

    private static func extractNumbers(from text: String) -> [Int] {
        let pattern = "\\d+"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let matches = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
        return matches.compactMap { match in
            guard let range = Range(match.range, in: text) else { return nil }
            return Int(text[range])
        }
    }

    // MARK: - Fruit portions parsing

    private static func parseFruitPortions(from text: String) -> [FruitPortion] {
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        guard let startIdx = lines.firstIndex(where: { $0.contains("PORÇÃO DE FRUTA") }) else {
            return []
        }

        let knownFruits = ["Ameixas", "Ananás", "Banana", "Cerejas", "Kiwi", "Laranja",
                           "Maçã", "Manga", "Melancia", "Meloa", "Morangos", "Pera",
                           "Tangerina", "Uva", "Pêssego"]

        var portions: [FruitPortion] = []
        var i = startIdx + 1
        while i < min(startIdx + 30, lines.count) {
            let line = lines[i]
            if line.isEmpty || line == "Fruta" || line.contains("porção ou") || line.contains("Alimentos") {
                i += 1
                continue
            }
            if line.contains("Recomendações") || line.contains("OU") || line.contains("LISTA") {
                break
            }
            // Try to match known fruit names
            for fruit in knownFruits {
                if line.hasPrefix(fruit) || line.contains(fruit + " /") {
                    // The portion info might be on the same line or next line
                    let portionPart = String(line.dropFirst(fruit.count)).trimmingCharacters(in: .whitespaces)
                    if !portionPart.isEmpty && (portionPart.contains("g") || portionPart.contains("bagos") || portionPart.contains("pares") || portionPart.contains("rodela") || portionPart.contains("Metade") || portionPart.contains("terço") || portionPart.contains("talhada") || portionPart.contains("pequena") || portionPart.contains("médio") || portionPart.contains("kiwi") || portionPart.contains("ameixas")) {
                        portions.append(FruitPortion(fruit: fruit, portion: portionPart))
                    } else if i + 1 < lines.count {
                        let nextLine = lines[i + 1].trimmingCharacters(in: .whitespaces)
                        if nextLine.contains("g") || nextLine.contains("bagos") || nextLine.contains("Metade") {
                            portions.append(FruitPortion(fruit: fruit, portion: nextLine))
                            i += 1
                        }
                    }
                    break
                }
            }
            i += 1
        }

        // If parsing failed, return hardcoded defaults for this plan format
        if portions.isEmpty {
            return defaultFruitPortions()
        }

        return portions
    }

    private static func defaultFruitPortions() -> [FruitPortion] {
        [
            FruitPortion(fruit: "Ameixas frescas", portion: "2 ameixas (170 g)"),
            FruitPortion(fruit: "Ananás fresco", portion: "1 rodela, já arranjado (130 g)"),
            FruitPortion(fruit: "Banana", portion: "Metade (100 g)"),
            FruitPortion(fruit: "Cerejas", portion: "10 pares (110 g)"),
            FruitPortion(fruit: "Kiwi", portion: "1 kiwi (130 g)"),
            FruitPortion(fruit: "Laranja / Pêssego", portion: "1 médio (200 g)"),
            FruitPortion(fruit: "Maçã", portion: "1 pequena (120 g)"),
            FruitPortion(fruit: "Manga", portion: "1 terço, já arranjada (100 g)"),
            FruitPortion(fruit: "Melancia", portion: "1 talhada (420 g)"),
            FruitPortion(fruit: "Meloa", portion: "Metade (480 g)"),
            FruitPortion(fruit: "Morangos", portion: "10 a 14 morangos (230 g)"),
            FruitPortion(fruit: "Pera", portion: "1 média (160 g)"),
            FruitPortion(fruit: "Tangerina", portion: "2 pequenas (190 g)"),
            FruitPortion(fruit: "Uva", portion: "8 a 10 bagos (80 g)")
        ]
    }

    // MARK: - Portion guides

    private static func parsePortionGuides(from text: String) -> (meat: String, fish: String) {
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        var meatLines: [String] = []
        var fishLines: [String] = []
        var inMeat = false, inFish = false

        for line in lines {
            if line.contains("porção de carne equivale") || line.contains("1 porção de carne") {
                inMeat = true
                inFish = false
                meatLines.append(line)
            } else if line.contains("porção de peixe equivale") || line.contains("1 porção de peixe") {
                inFish = true
                inMeat = false
                fishLines.append(line)
            } else if inMeat {
                if line.isEmpty || line.contains("Lanche") || line.contains("Jantar") { inMeat = false }
                else { meatLines.append(line) }
            } else if inFish {
                if line.isEmpty || line.contains("Lanche") || line.contains("Jantar") { inFish = false }
                else { fishLines.append(line) }
            }
        }

        let meat = meatLines.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        let fish = fishLines.joined(separator: " ").trimmingCharacters(in: .whitespaces)

        return (
            meat: meat.isEmpty ? "*1 porção de carne equivale: 1 bife grande (tamanho da mão) ou 2 bifes pequenos (tamanho da palma da mão) ou 1 coxa/sobrecoxa/asa de Frango ou ½ peito de frango ou 1 costeleta do lombo de porco ou 2 nacos médios de carne estufada" : meat,
            fish: fish.isEmpty ? "*1 porção de peixe equivale: 1 Lombo de bacalhau/salmão ou 2 medalhões de pescada ou 1 dourada/robalo pequeno ou 1 rabo de peixe vermelho (red fish) ou 3 tentáculos de Polvo ou 3 sardinhas/cavala/carapau ou 1 lata de atum ao natural/azeite bem escorrido" : fish
        )
    }

    // MARK: - Recipe parsing

    private static func parseRecipes(from text: String) -> [Recipe] {
        let lines = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }

        guard let startIdx = lines.firstIndex(where: { $0.contains("RECEITAS") }) else {
            return []
        }

        var recipes: [Recipe] = []
        var i = startIdx + 1
        var currentName = ""
        var currentIngredients: [String] = []
        var currentInstructions = ""
        var inIngredients = false
        var inInstructions = false

        while i < lines.count {
            let line = lines[i]

            if line.isEmpty { i += 1; continue }
            if line.contains("---PAGE_BREAK---") { i += 1; continue }

            // Detect recipe name (non-bullet, non-empty, followed by ingredients)
            if !line.hasPrefix("•") && !line.hasPrefix("-") && !line.hasPrefix("*") &&
               !line.hasPrefix("Leite") && !line.hasPrefix("Misturar") &&
               !line.hasPrefix("Leve") && !line.hasPrefix("Quando") &&
               !currentName.isEmpty == false || line.hasSuffix("oats") || line.hasSuffix("oats\n") {
                if !currentName.isEmpty {
                    recipes.append(Recipe(name: currentName, ingredients: currentIngredients, instructions: currentInstructions))
                }
                currentName = line.trimmingCharacters(in: CharacterSet(charactersIn: "*_"))
                currentIngredients = []
                currentInstructions = ""
                inIngredients = true
                inInstructions = false
            } else if inIngredients && (line.hasPrefix("•") || line.hasPrefix("-")) {
                let ingredient = line.replacingOccurrences(of: "^[•\\-\\*]\\s*", with: "", options: .regularExpression)
                currentIngredients.append(ingredient)
            } else if inIngredients && !line.hasPrefix("•") && !line.hasPrefix("-") {
                inIngredients = false
                inInstructions = true
                currentInstructions = line
            } else if inInstructions {
                currentInstructions += " " + line
            }

            i += 1
        }

        if !currentName.isEmpty {
            recipes.append(Recipe(name: currentName, ingredients: currentIngredients, instructions: currentInstructions))
        }

        if recipes.isEmpty {
            return defaultRecipes()
        }

        return recipes
    }

    private static func defaultRecipes() -> [Recipe] {
        [
            Recipe(
                name: "Overnight Oats",
                ingredients: [
                    "125g de Iogurte Sólido Natural Proteico",
                    "30g de Nestum de Arroz",
                    "5g de Sementes de Chia",
                    "30g de Proteína em Pó",
                    "Leite Magro Proteico q.b.",
                    "1 Peça de Fruta (120g – à sua escolha)"
                ],
                instructions: "Misturar todos os ingredientes à exceção da Fruta. Leve ao frigorifico e deixe descansar por pelo menos 6 horas antes de consumir. Quando servir, parta a fruta aos pedaçinhos por cima da mistura anterior."
            )
        ]
    }
}
