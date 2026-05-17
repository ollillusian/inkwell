import Foundation
import Combine

/// Lightweight session until Supabase Swift is wired in Xcode.
@MainActor
final class SessionStore: ObservableObject {
    @Published var userId: String?
    @Published var topics: [TopicId] = []
    @Published var onboardingComplete = false
    @Published var morningTime = "08:00"
    @Published var middayTime = "13:00"
    @Published var eveningTime = "20:00"

    var isSignedIn: Bool { userId != nil }

    func signIn(email: String) {
        userId = email.lowercased()
        if topics.isEmpty { onboardingComplete = false }
    }

    func signOut() {
        userId = nil
        topics = []
        onboardingComplete = false
    }

    func completeOnboarding(selected: [TopicId]) {
        topics = selected
        onboardingComplete = true
    }
}
