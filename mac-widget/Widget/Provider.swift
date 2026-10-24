import WidgetKit

struct PlanEntry: TimelineEntry {
    let date: Date
    let summary: PlanSummary?
    /// Problema na última atualização (o valor mostrado pode ser o anterior).
    let error: String?
}

struct Provider: AppIntentTimelineProvider {
    /// Atualiza a cada 30 minutos (o macOS pode espaçar mais).
    private let refresh: TimeInterval = 30 * 60

    func placeholder(in context: Context) -> PlanEntry {
        PlanEntry(date: .now, summary: .sample, error: nil)
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> PlanEntry {
        if context.isPreview { return placeholder(in: context) }
        return await load(configuration)
    }

    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<PlanEntry> {
        let entry = await load(configuration)
        return Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(refresh)))
    }

    private func load(_ configuration: ConfigurationAppIntent) async -> PlanEntry {
        guard let token = configuration.token?.trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty
        else {
            return PlanEntry(date: .now, summary: nil, error: SummaryError.notConfigured.localizedDescription)
        }
        do {
            let summary = try await SummaryClient.fetch(server: configuration.server, token: token)
            return PlanEntry(date: .now, summary: summary, error: nil)
        } catch {
            let message = (error as? URLError)?.code == .cannotConnectToHost
                ? "O app não está rodando em \(configuration.server)."
                : error.localizedDescription
            return PlanEntry(date: .now, summary: SummaryClient.cached(), error: message)
        }
    }
}
