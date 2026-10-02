import SwiftUI

struct CatalogueView: View {
    @EnvironmentObject var store: PlanStore
    @State private var selectedImage: UIImage?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ForEach(Array(store.catalogueImages.enumerated()), id: \.offset) { _, image in
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
                        .onTapGesture { selectedImage = image }
                }
            }
            .padding()
        }
        .navigationTitle("Catálogo de Produtos")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemGroupedBackground))
        .sheet(item: Binding(
            get: { selectedImage.map { IdentifiableImage(image: $0) } },
            set: { selectedImage = $0?.image }
        )) { identifiable in
            ZoomableImageView(image: identifiable.image)
        }
    }
}

// MARK: - Helpers

struct IdentifiableImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct ZoomableImageView: View {
    let image: UIImage
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical]) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fechar") { dismiss() }
                }
            }
        }
    }
}
