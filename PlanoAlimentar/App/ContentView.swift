import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: PlanStore
    @State private var showFilePicker = false
    @State private var showLoadError = false

    var body: some View {
        Group {
            if store.plan != nil {
                MainTabView(showFilePicker: $showFilePicker)
            } else {
                WelcomeView(showFilePicker: $showFilePicker)
            }
        }
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.pdf],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    store.loadFromPDF(url: url)
                }
            case .failure(let error):
                store.errorMessage = error.localizedDescription
            }
        }
        .overlay {
            if store.isLoading {
                ZStack {
                    Color.black.opacity(0.4).ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.5)
                            .tint(.white)
                        Text("A carregar plano...")
                            .foregroundStyle(.white)
                            .font(.headline)
                    }
                    .padding(32)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        .alert("Erro", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
