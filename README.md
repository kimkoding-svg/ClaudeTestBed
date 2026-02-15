# AI Companion Desktop Application

A voice-enabled AI companion with persistent memory, built with Electron, React, and TypeScript.

## Features

- 🎤 **Voice Interface**: Natural conversational experience with speech-to-text and text-to-speech
- 🧠 **Permanent Memory**: Remembers personal context, learned topics, and behavioral patterns
- 🌐 **Web Browsing**: Integrates with Claude Desktop's MCP servers for internet access
- 🔒 **Privacy-First**: All data stored locally on your device
- 🖥️ **Cross-Platform**: Works on Windows, macOS, and Linux

## Tech Stack

- **Frontend**: React 18+ with TypeScript
- **Desktop Framework**: Electron 33+
- **Build Tool**: Vite
- **UI**: Tailwind CSS
- **AI**: Claude API (Anthropic) + OpenAI Whisper/TTS
- **Database**: SQLite + LanceDB (vector storage)

## Getting Started

### Prerequisites

- Node.js 20+ LTS
- npm or pnpm
- Claude Desktop installed (for MCP integration)

### Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd ai-companion-app
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Set up environment variables:
Create a `.env` file in the root directory:
\`\`\`
ANTHROPIC_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here
\`\`\`

### Development

Run the app in development mode:
\`\`\`bash
npm run electron:dev
\`\`\`

This will start both the Vite dev server and Electron.

### Building

Build the application for production:
\`\`\`bash
npm run electron:build
\`\`\`

The built application will be in the `dist` folder.

## Project Structure

\`\`\`
src/
├── main/              # Electron main process
│   ├── index.ts       # Entry point
│   ├── preload.ts     # Preload script
│   └── services/      # Backend services
├── renderer/          # React frontend
│   ├── App.tsx        # Main component
│   ├── components/    # UI components
│   └── hooks/         # Custom hooks
└── shared/            # Shared types & constants
    ├── types/         # TypeScript interfaces
    └── constants.ts   # App constants
\`\`\`

## Development Roadmap

- [x] Phase 1: Foundation (Electron + React + TypeScript setup)
- [ ] Phase 2: Voice Pipeline (STT + TTS integration)
- [ ] Phase 3: LLM Integration (Claude API)
- [ ] Phase 4: MCP Integration (Claude Desktop servers)
- [ ] Phase 5: Memory System - Storage
- [ ] Phase 6: Memory System - Intelligence
- [ ] Phase 7: Integration & Polish
- [ ] Phase 8: Testing & Optimization
- [ ] Phase 9: Packaging & Distribution

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
