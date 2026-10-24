import Foundation

/// Resposta de GET /api/widget/plan (os números do card "Sobra do mês").
struct PlanSummary: Codable, Equatable {
    var updatedAt: String
    var configured: Bool
    var source: String
    /// false: as parcelas de compras antigas ainda não entraram na conta.
    var complete: Bool
    var salary: Double
    var otherIncome: Double
    var income: Double
    var fixedTotal: Double
    var billsTotal: Double
    var loansTotal: Double
    var savingsPct: Double
    var savingsTarget: Double
    var free: Double
    var perDay: Double
    var nextSalary: String
    var daysToSalary: Int

    var committed: Double { fixedTotal + billsTotal + loansTotal }
    /// Mesmo total da barra do app: renda ou tudo o que está comprometido, o que for maior.
    var barTotal: Double { max(income, committed + savingsTarget) }

    var updatedDate: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: updatedAt) ?? ISO8601DateFormatter().date(from: updatedAt)
    }

    /// Exemplo para a galeria de widgets.
    static let sample = PlanSummary(
        updatedAt: ISO8601DateFormatter().string(from: .now),
        configured: true, source: "mcp", complete: true,
        salary: 6000, otherIncome: 400, income: 6400,
        fixedTotal: 2369.97, billsTotal: 3502.04, loansTotal: 132.90,
        savingsPct: 0, savingsTarget: 0, free: 395.09, perDay: 13.17,
        nextSalary: "2026-11-05", daysToSalary: 12
    )
}

enum SummaryError: LocalizedError {
    case notConfigured
    case badURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Cole o token do widget: botão direito → Editar widget."
        case .badURL: "Endereço do app inválido."
        case .server(let message): message
        }
    }
}

enum SummaryClient {
    private struct ErrorBody: Decodable { let error: String }
    private static let cacheKey = "lastSummary"

    static func fetch(server: String, token: String) async throws -> PlanSummary {
        guard var url = URL(string: server.trimmingCharacters(in: .whitespaces)),
              url.scheme != nil
        else { throw SummaryError.badURL }
        url.append(path: "api/widget/plan")

        // A primeira busca pode demorar (a Belvo pagina um ano de lançamentos)
        var request = URLRequest(url: url, timeoutInterval: 50)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw SummaryError.server(message ?? "O app respondeu HTTP \(status).")
        }
        let summary = try JSONDecoder().decode(PlanSummary.self, from: data)
        if let encoded = try? JSONEncoder().encode(summary) {
            UserDefaults.standard.set(encoded, forKey: cacheKey)
        }
        return summary
    }

    /// Último valor recebido, para mostrar quando o app estiver fechado.
    static func cached() -> PlanSummary? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey) else { return nil }
        return try? JSONDecoder().decode(PlanSummary.self, from: data)
    }
}
