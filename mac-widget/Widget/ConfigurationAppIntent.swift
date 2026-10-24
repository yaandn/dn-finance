import AppIntents
import WidgetKit

/// Configuração do widget (botão direito → Editar widget).
struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Minhas Finanças"
    static let description = IntentDescription(
        "Endereço do app e o token gerado em Planejamento → Widget do Mac."
    )

    @Parameter(title: "Endereço do app", default: "http://localhost:3000")
    var server: String

    @Parameter(title: "Token do widget")
    var token: String?
}
