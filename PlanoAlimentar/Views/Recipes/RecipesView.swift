import SwiftUI

struct RecipesView: View {
    @EnvironmentObject var store: PlanStore

    var body: some View {
        NavigationStack {
            Group {
                if let recipes = store.plan?.recipes, !recipes.isEmpty {
                    List(recipes) { recipe in
                        NavigationLink {
                            RecipeDetailView(recipe: recipe)
                        } label: {
                            HStack(spacing: 12) {
                                Text("🥣")
                                    .font(.title2)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(recipe.name)
                                        .font(.headline)
                                    Text("\(recipe.ingredients.count) ingredientes")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.insetGrouped)
                } else {
                    ContentUnavailableView(
                        "Sem receitas",
                        systemImage: "book.closed",
                        description: Text("Nenhuma receita encontrada no plano.")
                    )
                }
            }
            .navigationTitle("Receitas")
        }
    }
}

struct RecipeDetailView: View {
    let recipe: Recipe

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack {
                    Text("🥣")
                        .font(.system(size: 60))
                    Spacer()
                }
                .padding(.bottom, 4)

                // Ingredients
                VStack(alignment: .leading, spacing: 12) {
                    Label("Ingredientes", systemImage: "list.bullet")
                        .font(.headline)
                        .foregroundStyle(.green)

                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(recipe.ingredients, id: \.self) { ingredient in
                            HStack(alignment: .top, spacing: 10) {
                                Circle()
                                    .fill(Color.green)
                                    .frame(width: 7, height: 7)
                                    .padding(.top, 6)
                                Text(ingredient)
                                    .font(.subheadline)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Instructions
                if !recipe.instructions.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Preparação", systemImage: "fork.knife.circle.fill")
                            .font(.headline)
                            .foregroundStyle(.orange)

                        Text(recipe.instructions)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding()
                            .background(Color(.secondarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }

                // Tip
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "lightbulb.fill")
                        .foregroundStyle(.yellow)
                    Text("Prepara na noite anterior para ter o pequeno-almoço pronto de manhã!")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color.yellow.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .padding()
        }
        .navigationTitle(recipe.name)
        .navigationBarTitleDisplayMode(.large)
        .background(Color(.systemGroupedBackground))
    }
}
