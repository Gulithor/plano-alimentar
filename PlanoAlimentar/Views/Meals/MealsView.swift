import SwiftUI

struct MealsView: View {
    @EnvironmentObject var store: PlanStore
    @Binding var showFilePicker: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if let plan = store.plan {
                        if !plan.objective.isEmpty {
                            HStack {
                                Image(systemName: "target")
                                    .foregroundStyle(.green)
                                Text(plan.objective)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 4)
                            .padding(.top, 4)
                        }
                        ForEach(plan.meals) { meal in
                            MealCard(meal: meal)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(store.plan?.name.isEmpty == false ? store.plan!.name : "Refeições")
            .navigationBarTitleDisplayMode(.large)
            .background(Color(.systemGroupedBackground))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showFilePicker = true }) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
            }
        }
    }
}

struct MealCard: View {
    let meal: Meal
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Button(action: { withAnimation(.spring(duration: 0.3)) { isExpanded.toggle() } }) {
                HStack {
                    Text(meal.emoji)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.name)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Text(meal.timeRange)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider()
                    .padding(.horizontal)

                VStack(alignment: .leading, spacing: 12) {
                    if meal.options.count == 1 {
                        // Single option: just show items
                        MealOptionView(option: meal.options[0], showDivider: false)
                    } else {
                        // Multiple OR options
                        ForEach(Array(meal.options.enumerated()), id: \.offset) { idx, option in
                            if idx > 0 {
                                HStack {
                                    Rectangle().frame(height: 1).foregroundStyle(Color(.separator))
                                    Text("OU")
                                        .font(.caption.bold())
                                        .foregroundStyle(.secondary)
                                        .padding(.horizontal, 8)
                                    Rectangle().frame(height: 1).foregroundStyle(Color(.separator))
                                }
                            }
                            MealOptionView(option: option, showDivider: false)
                        }
                    }

                    if !meal.extras.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(meal.extras, id: \.self) { extra in
                                Text(extra)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .italic()
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 12)
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct MealOptionView: View {
    let option: MealOption
    let showDivider: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let context = option.context {
                Text(context)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(.tertiarySystemFill))
                    .clipShape(Capsule())
            }
            ForEach(option.items, id: \.self) { item in
                HStack(alignment: .top, spacing: 8) {
                    if item.hasPrefix("•") || item.hasPrefix("-") {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                            .padding(.top, 6)
                        Text(item.replacingOccurrences(of: "^[•\\-]\\s*", with: "", options: .regularExpression))
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text(item)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}
