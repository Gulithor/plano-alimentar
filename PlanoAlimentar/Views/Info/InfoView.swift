import SwiftUI

struct InfoView: View {
    @EnvironmentObject var store: PlanStore
    @State private var showCatalogue = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let plan = store.plan {
                        // Macros section
                        if let macros = plan.macros {
                            MacrosCard(macros: macros)
                        }

                        // Portion guides
                        PortionGuidesCard(
                            meatGuide: plan.meatPortionGuide,
                            fishGuide: plan.fishPortionGuide
                        )

                        // Fruit portions
                        FruitPortionsCard(portions: plan.fruitPortions)

                        // Catalogue button
                        if !store.catalogueImages.isEmpty {
                            Button(action: { showCatalogue = true }) {
                                HStack {
                                    Image(systemName: "cart.fill")
                                    Text("Catálogo de Produtos")
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.secondary)
                                }
                                .font(.subheadline.bold())
                                .padding()
                                .background(Color(.secondarySystemGroupedBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Informação")
            .background(Color(.systemGroupedBackground))
            .navigationDestination(isPresented: $showCatalogue) {
                CatalogueView()
            }
        }
    }
}

// MARK: - Macros Card

struct MacrosCard: View {
    let macros: MacroInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Macronutrientes", systemImage: "chart.pie.fill")
                .font(.headline)
                .foregroundStyle(.green)

            // Calorie total
            HStack {
                Spacer()
                VStack(spacing: 2) {
                    Text("\(macros.totalKcal)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                    Text("kcal / dia")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            // Macro bars
            VStack(spacing: 12) {
                MacroRow(
                    name: "Proteína",
                    grams: macros.proteinGrams,
                    kcal: macros.proteinKcal,
                    total: macros.totalKcal,
                    color: .blue
                )
                MacroRow(
                    name: "Hidratos",
                    grams: macros.carbsGrams,
                    kcal: macros.carbsKcal,
                    total: macros.totalKcal,
                    color: .orange
                )
                MacroRow(
                    name: "Gordura",
                    grams: macros.fatGrams,
                    kcal: macros.fatKcal,
                    total: macros.totalKcal,
                    color: .yellow
                )
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct MacroRow: View {
    let name: String
    let grams: Int
    let kcal: Int
    let total: Int
    let color: Color

    var fraction: Double { total > 0 ? Double(kcal) / Double(total) : 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name)
                    .font(.subheadline.bold())
                Spacer()
                Text("\(grams)g")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("·")
                    .foregroundStyle(.secondary)
                Text("\(kcal) kcal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color.opacity(0.15))
                        .frame(height: 8)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: geo.size.width * fraction, height: 8)
                }
            }
            .frame(height: 8)
        }
    }
}

// MARK: - Portion Guides Card

struct PortionGuidesCard: View {
    let meatGuide: String
    let fishGuide: String
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: { withAnimation(.spring(duration: 0.3)) { isExpanded.toggle() } }) {
                HStack {
                    Label("Equivalências de Porção", systemImage: "scalemass.fill")
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider().padding(.horizontal)
                VStack(alignment: .leading, spacing: 12) {
                    if !meatGuide.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Carne", systemImage: "1.circle.fill")
                                .font(.subheadline.bold())
                                .foregroundStyle(.red)
                            Text(meatGuide.replacingOccurrences(of: "*1 porção de carne equivale:", with: "").trimmingCharacters(in: .whitespaces))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if !fishGuide.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Peixe", systemImage: "2.circle.fill")
                                .font(.subheadline.bold())
                                .foregroundStyle(.blue)
                            Text(fishGuide.replacingOccurrences(of: "*1 porção de peixe equivale:", with: "").trimmingCharacters(in: .whitespaces))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 12)
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Fruit Portions Card

struct FruitPortionsCard: View {
    let portions: [FruitPortion]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("O que é 1 porção de fruta?", systemImage: "leaf.fill")
                .font(.headline)
                .foregroundStyle(.green)

            Text("Cada porção tem ≈ 12g de hidratos de carbono.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(spacing: 0) {
                ForEach(Array(portions.enumerated()), id: \.element.id) { idx, portion in
                    HStack {
                        Text(portion.fruit)
                            .font(.subheadline)
                        Spacer()
                        Text(portion.portion)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 4)

                    if idx < portions.count - 1 {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
