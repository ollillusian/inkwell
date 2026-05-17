import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var session: SessionStore
    @State private var selected: Set<TopicId> = []
    @State private var step = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if step == 0 {
                    Text("What do you want to write about?")
                        .font(.system(size: 28, design: .serif))
                    Text("Pick one or more. AI will craft prompts from these themes — you write the answers.")
                        .foregroundStyle(Color.inkMuted)
                    ForEach(TopicId.allCases, id: \.self) { topic in
                        Button {
                            if selected.contains(topic) { selected.remove(topic) }
                            else { selected.insert(topic) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(topic.label)
                                        .font(.body.weight(.medium))
                                        .foregroundStyle(Color.inkForeground)
                                }
                                Spacer()
                                if selected.contains(topic) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Color.inkAccent)
                                }
                            }
                            .padding()
                            .background(Color.inkSurface)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(selected.contains(topic) ? Color.inkAccent : Color.inkBorder, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                    }
                    Button("Continue") { step = 1 }
                        .buttonStyle(InkPrimaryButtonStyle())
                        .disabled(selected.isEmpty)
                        .opacity(selected.isEmpty ? 0.4 : 1)
                } else {
                    Text("Almost there")
                        .font(.system(size: 28, design: .serif))
                    HumanOnlyCard()
                    Text("Allow notifications when prompted. Write in your own voice — not from ChatGPT.")
                        .font(.subheadline)
                        .foregroundStyle(Color.inkMuted)
                    Button("Open my Inkwell") {
                        session.completeOnboarding(selected: Array(selected))
                    }
                    .buttonStyle(InkPrimaryButtonStyle())
                }
            }
            .padding(24)
        }
    }
}

struct HumanOnlyCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("You write the answer")
                .font(.subheadline.weight(.medium))
            Text("AI suggests prompts only. Your journal entries are always in your own words.")
                .font(.caption)
                .foregroundStyle(Color.inkMuted)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.inkSurface)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.inkBorder))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
