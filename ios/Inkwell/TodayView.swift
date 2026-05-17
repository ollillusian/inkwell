import SwiftUI

struct TodayView: View {
    @EnvironmentObject var session: SessionStore
    @State private var draft = ""

    private var slot: PromptSlot { .current() }
    private var prompt: String {
        guard let id = session.userId else { return "" }
        return PromptEngine.pick(topics: session.topics, slot: slot, userId: id)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("\(slot.label) · \(Date.now.formatted(date: .complete, time: .omitted))")
                        .font(.caption)
                        .foregroundStyle(Color.inkMuted)
                        .textCase(.uppercase)
                    Text(prompt)
                        .font(.system(size: 26, design: .serif))
                        .foregroundStyle(Color.inkForeground)
                    Text("Your words only — no AI writes here.")
                        .font(.caption2)
                        .foregroundStyle(Color.inkMuted)
                    TextEditor(text: $draft)
                        .frame(minHeight: 200)
                        .padding(8)
                        .background(Color.inkSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    Button("Save to journal") { /* sync via Supabase */ }
                        .buttonStyle(InkPrimaryButtonStyle())
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(24)
            }
            .navigationTitle("Inkwell")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
