import SwiftUI
import WidgetKit

/// App mínimo: o macOS só oferece widgets de apps instalados.
@main
struct MinhasFinancasApp: App {
    var body: some Scene {
        WindowGroup("Minhas Finanças") {
            SetupView()
                .frame(width: 460)
                .fixedSize()
                // Abrir o app já pede dados novos ao widget
                .onAppear { WidgetCenter.shared.reloadAllTimelines() }
        }
        .windowResizability(.contentSize)
    }
}

struct SetupView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Widget \"Sobra do mês\"", systemImage: "wallet.bifold")
                .font(.title3.bold())
            Step(n: 1, text: "Deixe o app rodando: npm run dev (ou npm start) em dn-finance.")
            Step(n: 2, text: "No app, abra Planejamento → Widget do Mac → Gerar token e copie.")
            Step(n: 3, text: "Clique com o botão direito na mesa → Editar widgets → Minhas Finanças, e adicione \"Sobra do mês\".")
            Step(n: 4, text: "Botão direito no widget → Editar \"Sobra do mês\" → cole o token.")
            HStack {
                Button("Abrir Planejamento") {
                    NSWorkspace.shared.open(URL(string: "http://localhost:3000/planejamento")!)
                }
                Button("Atualizar widgets") {
                    WidgetCenter.shared.reloadAllTimelines()
                }
            }
            .padding(.top, 4)
        }
        .padding(24)
    }
}

private struct Step: View {
    let n: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(n)")
                .font(.caption.bold())
                .frame(width: 20, height: 20)
                .background(.tint.opacity(0.15), in: Circle())
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
    }
}
