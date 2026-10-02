import SwiftUI

struct WelcomeView: View {
    @Binding var showFilePicker: Bool

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemGreen).opacity(0.15), Color(.systemBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 12) {
                    Text("🥗")
                        .font(.system(size: 80))
                    Text("Plano Alimentar")
                        .font(.largeTitle.bold())
                    Text("Carrega o teu plano em PDF\npara começar.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                Button(action: { showFilePicker = true }) {
                    Label("Carregar PDF", systemImage: "doc.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 32)

                Spacer().frame(height: 20)
            }
        }
    }
}
