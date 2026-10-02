import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var store: PlanStore
    @Binding var showFilePicker: Bool

    var body: some View {
        TabView {
            MealsView(showFilePicker: $showFilePicker)
                .tabItem {
                    Label("Refeições", systemImage: "fork.knife")
                }

            InfoView()
                .tabItem {
                    Label("Informação", systemImage: "info.circle.fill")
                }

            RecipesView()
                .tabItem {
                    Label("Receitas", systemImage: "book.fill")
                }
        }
    }
}
