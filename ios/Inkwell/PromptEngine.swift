import Foundation

enum PromptSlot: String, CaseIterable {
    case morning, midday, evening

    var label: String {
        switch self {
        case .morning: return "Morning"
        case .midday: return "Midday"
        case .evening: return "Evening"
        }
    }

    static func current(date: Date = .init()) -> PromptSlot {
        let h = Calendar.current.component(.hour, from: date)
        if h < 12 { return .morning }
        if h < 17 { return .midday }
        return .evening
    }
}

enum TopicId: String, CaseIterable {
    case processing, gratitude, free, relationships, work
    case self_compassion = "self_compassion"
    case memories, hopes

    var label: String {
        switch self {
        case .processing: return "Processing what I'm going through"
        case .gratitude: return "Noticing small good things"
        case .free: return "Free writing, whatever comes"
        case .relationships: return "People and connection"
        case .work: return "Work and pressure"
        case .self_compassion: return "Being kinder to myself"
        case .memories: return "Memories and what was"
        case .hopes: return "Hopes and what might be"
        }
    }
}

enum PromptEngine {
  private static let prompts: [TopicId: [PromptSlot: [String]]] = [
    .processing: [
      .morning: [
        "What feeling is sitting closest to the surface right now, without explaining it?",
        "If your body could speak this morning, what one sentence would it say?",
      ],
      .midday: ["Pause and name what shifted since this morning, even slightly."],
      .evening: ["What surprised you about today?"],
    ],
    .free: [
      .morning: ["Start with 'Right now I' and don't stop for three minutes."],
      .midday: ["Go straight toward whatever you're thinking about."],
      .evening: ["Stream of consciousness until the page feels lighter."],
    ],
  ]

  static func pick(topics: [TopicId], slot: PromptSlot, userId: String, date: Date = .init()) -> String {
    let active = topics.isEmpty ? [TopicId.free] : topics
    var pool: [String] = []
    for topic in active {
      if let lines = prompts[topic]?[slot] {
        pool.append(contentsOf: lines)
      }
    }
    if pool.isEmpty {
      return "Write whatever is true right now. Your words only."
    }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    let seed = "\(userId):\(formatter.string(from: date)):\(slot.rawValue):\(active.map(\.rawValue).sorted().joined())"
    let hash = abs(seed.hashValue)
    return pool[hash % pool.count]
  }
}
