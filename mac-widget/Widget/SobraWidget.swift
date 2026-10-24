import SwiftUI
import WidgetKit

@main
struct MinhasFinancasWidgets: WidgetBundle {
    var body: some Widget {
        SobraWidget()
    }
}

struct SobraWidget: Widget {
    let kind = "SobraDoMes"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ConfigurationAppIntent.self, provider: Provider()) { entry in
            SobraView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Sobra do mês")
        .description("Quanto sobra depois de tudo o que já está comprometido.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Views

struct SobraView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PlanEntry

    var body: some View {
        if let s = entry.summary {
            switch family {
            case .systemSmall: SmallView(s: s, error: entry.error)
            case .systemLarge: LargeView(s: s, error: entry.error)
            default: MediumView(s: s, error: entry.error)
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Label("Sobra do mês", systemImage: "wallet.bifold")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(entry.error ?? "Carregando…")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

private struct Segment: Identifiable {
    let id: String
    let label: String
    let value: Double
    let color: Color
}

private func segments(_ s: PlanSummary) -> [Segment] {
    [
        Segment(id: "fixas", label: "Contas fixas", value: s.fixedTotal, color: Theme.fixed),
        Segment(id: "faturas", label: "Faturas atuais", value: s.billsTotal, color: Theme.bills),
        Segment(id: "emprestimos", label: "Empréstimos", value: s.loansTotal, color: Theme.loans),
        Segment(id: "guardar", label: "Guardar", value: s.savingsTarget, color: Theme.savings),
        Segment(id: "livre", label: "Livre", value: max(0, s.free), color: Theme.free),
    ].filter { $0.value > 0 }
}

/// Barra empilhada, igual à do card do app.
private struct StackedBar: View {
    let s: PlanSummary
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(segments(s)) { seg in
                    seg.color.frame(width: geo.size.width * seg.value / max(s.barTotal, 1))
                }
                Spacer(minLength: 0)
            }
            .background(Color.secondary.opacity(0.15))
            .clipShape(Capsule())
        }
        .frame(height: height)
    }
}

private struct Header: View {
    let s: PlanSummary
    var showPerDay = true

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Sobra do mês")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            if showPerDay {
                Text(s.free < 0 ? "No vermelho" : "≈ \(s.perDay.brl) por dia")
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(s.free < 0 ? Theme.negative.opacity(0.18) : Theme.badge, in: Capsule())
            }
        }
    }
}

private struct BigValue: View {
    let s: PlanSummary
    var size: CGFloat = 30

    var body: some View {
        Text(s.free.brl)
            .font(.system(size: size, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(s.free < 0 ? Theme.negative : .primary)
            .minimumScaleFactor(0.6)
            .lineLimit(1)
    }
}

/// Rodapé: hora da atualização e avisos.
private struct Footer: View {
    let s: PlanSummary
    let error: String?

    var body: some View {
        HStack(spacing: 4) {
            if error != nil {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            }
            if let date = s.updatedDate {
                Text("Atualizado \(date, format: .dateTime.hour().minute())")
            }
            if !s.complete { Text("· parcelas antigas pendentes") }
            if !s.configured { Text("· planejamento não salvo") }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .help(error ?? "")
    }
}

private struct SmallView: View {
    let s: PlanSummary
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Header(s: s, showPerDay: false)
            BigValue(s: s, size: 24)
            Text(s.free < 0 ? "No vermelho" : "≈ \(s.perDay.brl) por dia")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            StackedBar(s: s, height: 8)
            Footer(s: s, error: error)
        }
    }
}

private struct MediumView: View {
    let s: PlanSummary
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Header(s: s)
            BigValue(s: s)
            StackedBar(s: s)
            Legend(s: s, columns: 2)
            Spacer(minLength: 0)
            Footer(s: s, error: error)
        }
    }
}

private struct LargeView: View {
    let s: PlanSummary
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Header(s: s)
            BigValue(s: s, size: 36)
            StackedBar(s: s, height: 12)
            Legend(s: s, columns: 2)
            Divider()
            VStack(spacing: 5) {
                Line("Salário", s.salary)
                Line("Outras rendas", s.otherIncome)
                Line("Contas fixas", -s.fixedTotal)
                Line("Faturas atuais dos cartões", -s.billsTotal, strong: true)
                Line("Parcelas de empréstimo", -s.loansTotal)
                Line("Guardar (\(Int(s.savingsPct))% do salário)", -s.savingsTarget)
                Divider()
                Line("Livre para o mês", s.free, strong: true, tone: true)
            }
            Spacer(minLength: 0)
            Footer(s: s, error: error)
        }
    }
}

private struct Legend: View {
    let s: PlanSummary
    let columns: Int

    var body: some View {
        let total = max(s.barTotal, 1)
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: columns),
            alignment: .leading, spacing: 3
        ) {
            ForEach(segments(s)) { seg in
                HStack(spacing: 4) {
                    Circle().fill(seg.color).frame(width: 7, height: 7)
                    Text(seg.label).foregroundStyle(.primary)
                    Text("\(seg.value.brl) · \(Int((seg.value / total * 100).rounded()))%")
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
        }
    }
}

private struct Line: View {
    let label: String
    let value: Double
    var strong = false
    var tone = false

    init(_ label: String, _ value: Double, strong: Bool = false, tone: Bool = false) {
        self.label = label
        self.value = value
        self.strong = strong
        self.tone = tone
    }

    var body: some View {
        HStack {
            Text(label).foregroundStyle(strong ? .primary : .secondary)
            Spacer()
            Text(value.brl)
                .monospacedDigit()
                .fontWeight(strong ? .semibold : .regular)
                .foregroundStyle(tone ? (value < 0 ? Theme.negative : Theme.positive) : .primary)
        }
        .font(.callout)
    }
}

#Preview(as: .systemMedium) {
    SobraWidget()
} timeline: {
    PlanEntry(date: .now, summary: .sample, error: nil)
}

#Preview(as: .systemLarge) {
    SobraWidget()
} timeline: {
    PlanEntry(date: .now, summary: .sample, error: nil)
}
