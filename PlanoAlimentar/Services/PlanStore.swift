import Foundation
import UIKit
import PDFKit
import Combine

@MainActor
class PlanStore: ObservableObject {
    @Published var plan: MealPlan?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var catalogueImages: [UIImage] = []

    private let planKey = "savedMealPlan"
    private let imagesDirectoryName = "CatalogueImages"

    init() {
        loadSavedPlan()
    }

    // MARK: - Load from saved storage

    private func loadSavedPlan() {
        guard let data = UserDefaults.standard.data(forKey: planKey),
              let savedPlan = try? JSONDecoder().decode(MealPlan.self, from: data) else { return }
        self.plan = savedPlan
        loadCachedImages()
    }

    private func loadCachedImages() {
        let dir = catalogueImagesDirectory()
        guard FileManager.default.fileExists(atPath: dir.path) else { return }

        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        let sorted = files.filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        self.catalogueImages = sorted.compactMap { UIImage(contentsOfFile: $0.path) }
    }

    // MARK: - Load from PDF

    func loadFromPDF(url: URL) {
        isLoading = true
        errorMessage = nil

        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing { url.stopAccessingSecurityScopedResource() }
        }

        do {
            let parsedPlan = try PDFParserService.parse(url: url)
            self.plan = parsedPlan
            savePlan(parsedPlan)

            // Extract and cache catalogue images
            let images = PDFParserService.extractCatalogueImages(url: url)
            self.catalogueImages = images
            saveCatalogueImages(images)

        } catch {
            errorMessage = "Erro ao carregar o PDF: \(error.localizedDescription)"
        }

        isLoading = false
    }

    // MARK: - Persistence

    private func savePlan(_ plan: MealPlan) {
        if let data = try? JSONEncoder().encode(plan) {
            UserDefaults.standard.set(data, forKey: planKey)
        }
    }

    private func catalogueImagesDirectory() -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return docs.appendingPathComponent(imagesDirectoryName)
    }

    private func saveCatalogueImages(_ images: [UIImage]) {
        let dir = catalogueImagesDirectory()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        // Clear old images
        let existing = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        existing.forEach { try? FileManager.default.removeItem(at: $0) }

        for (idx, image) in images.enumerated() {
            let url = dir.appendingPathComponent(String(format: "%02d.png", idx))
            if let data = image.pngData() {
                try? data.write(to: url)
            }
        }
    }

    func clearPlan() {
        plan = nil
        catalogueImages = []
        UserDefaults.standard.removeObject(forKey: planKey)
        let dir = catalogueImagesDirectory()
        try? FileManager.default.removeItem(at: dir)
    }
}
