import SwiftUI

struct JournalView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "No entries yet",
                systemImage: "book.closed",
                description: Text("Saved pieces appear here once Supabase is connected.")
            )
            .navigationTitle("Journal")
        }
    }
}
