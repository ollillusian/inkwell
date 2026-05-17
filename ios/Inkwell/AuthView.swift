import SwiftUI

struct AuthView: View {
    @EnvironmentObject var session: SessionStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("Inkwell")
                .font(.system(size: 36, design: .serif))
                .foregroundStyle(Color.inkForeground)
            Text("Sign in to your private journal")
                .font(.subheadline)
                .foregroundStyle(Color.inkMuted)
            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .padding()
                    .background(Color.inkSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                SecureField("Password", text: $password)
                    .padding()
                    .background(Color.inkSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            Button("Sign in") {
                session.signIn(email: email.isEmpty ? "you@example.com" : email)
            }
            .buttonStyle(InkPrimaryButtonStyle())
            Text("Wire Supabase Auth in Xcode — same project as web.")
                .font(.caption2)
                .foregroundStyle(Color.inkMuted)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .padding(24)
    }
}

struct InkPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.inkForeground)
            .foregroundStyle(Color.inkBackground)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
