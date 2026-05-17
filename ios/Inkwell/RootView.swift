import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: SessionStore

    var body: some View {
        Group {
            if !session.isSignedIn {
                AuthView()
            } else if !session.onboardingComplete {
                OnboardingView()
            } else {
                MainTabView()
            }
        }
        .background(Color.inkBackground.ignoresSafeArea())
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max") }
            JournalView()
                .tabItem { Label("Journal", systemImage: "book") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Color.inkAccent)
    }
}
