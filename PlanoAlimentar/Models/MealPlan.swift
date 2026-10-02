import Foundation

struct MealPlan: Codable {
    var id: UUID = UUID()
    var fileName: String = ""
    var name: String = ""
    var objective: String = ""
    var meals: [Meal] = []
    var macros: MacroInfo?
    var fruitPortions: [FruitPortion] = []
    var meatPortionGuide: String = ""
    var fishPortionGuide: String = ""
    var recipes: [Recipe] = []
}

struct Meal: Codable, Identifiable {
    var id: UUID = UUID()
    var name: String
    var timeRange: String
    var options: [MealOption]
    var extras: [String] = []

    var emoji: String {
        switch name {
        case _ where name.contains("Pequeno"): return "☀️"
        case _ where name.contains("Manhã"): return "🥛"
        case _ where name.contains("Almoço"): return "🍽️"
        case _ where name.contains("Tarde"): return "🍎"
        case _ where name.contains("Jantar"): return "🌙"
        default: return "🥗"
        }
    }
}

struct MealOption: Codable, Identifiable {
    var id: UUID = UUID()
    var context: String? // e.g. "Nos dias em que não treinares de manhã"
    var items: [String]
}

struct MacroInfo: Codable {
    var proteinGrams: Int
    var proteinKcal: Int
    var carbsGrams: Int
    var carbsKcal: Int
    var fatGrams: Int
    var fatKcal: Int
    var totalKcal: Int
}

struct FruitPortion: Codable, Identifiable {
    var id: UUID = UUID()
    var fruit: String
    var portion: String
}

struct Recipe: Codable, Identifiable {
    var id: UUID = UUID()
    var name: String
    var ingredients: [String]
    var instructions: String
}
