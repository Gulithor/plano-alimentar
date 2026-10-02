import SwiftUI

@main
struct PlanoAlimentarApp: App {
    @StateObject private var planStore = PlanStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(planStore)
        }
    }
}
