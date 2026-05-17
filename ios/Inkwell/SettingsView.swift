import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var session: SessionStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Reminder times") {
                    Text("Morning \(session.morningTime)")
                    Text("Midday \(session.middayTime)")
                    Text("Evening \(session.eveningTime)")
                }
                Section {
                    HumanOnlyCard()
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        session.signOut()
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.inkBackground)
            .navigationTitle("Settings")
        }
    }
}
