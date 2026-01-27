# Game Hub

A mobile-first game hub featuring puzzle games. Start with the sliding puzzle, more games coming.

## Quick Start

### Option 1: Just open it (simplest)
Double-click `index.html` to open in your browser. 

**Note:** Some browsers restrict local file access. If the game doesn't work, use Option 2.

### Option 2: Run a local server (recommended)

```bash
# Navigate to the project folder
cd game-hub

# If you have Python installed (you do):
python3 -m http.server 8000

# Then open: http://localhost:8000
```

### Option 3: Use VS Code Live Server
1. Install the "Live Server" extension in VS Code
2. Right-click `index.html` → "Open with Live Server"

## Project Structure

```
game-hub/
├── index.html              # Main hub (game library)
├── games/
│   └── sliding-puzzle/
│       └── index.html      # Sliding puzzle game
└── README.md
```

## Features

- **Sliding Puzzle**: Classic 15-puzzle with 3×3, 4×4, and 5×5 modes
- **Auto-save**: Progress saved to browser localStorage
- **Best scores**: Tracked per difficulty level
- **Mobile-ready**: Touch-friendly, responsive design

## Adding to Mobile (later)

When ready to package for iOS/Android, you'll use Capacitor:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Game Hub" com.yourdomain.gamehub
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios  # Opens in Xcode
```

## Next Games to Add

1. **Word Paths** - Connect letters to form words
2. **Hex Tactics** - Turn-based strategy on hex grid
3. **Number Grid** - Sudoku-style logic puzzle

Each new game goes in `games/[game-name]/index.html` following the same pattern.
