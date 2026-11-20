/* Every game in the hub, in one place. The dashboard draws its Home, Library and Daily tabs from this list.
   To add a game: add an entry here (and its files to sw.js). Fields:
     slug     the folder under games/        name, blurb (one line), about (for the details card)
     icon     emoji shown on its tile          bg      the tile's background
     cat      word | logic | puzzle | cards | arcade                  tags    little labels
     fresh    how new it is (higher = newer; missing = not new)      daily   link to its daily mode
     progress [storage key, field, label] to show "Level 12" in Jump back in */
window.HUB_GAMES = [
 {
  "slug": "pick-and-mix",
  "name": "Pick & Mix",
  "blurb": "Swap sweets, match three, 100 levels",
  "about": "Swap neighbouring sweets to line up three or more. Make striped, wrapped and rainbow sweets, clear jelly, break crates and bring cherries down across 100 levels.",
  "icon": "🍬",
  "bg": "linear-gradient(135deg, #ff7ab8, #7a1f5c)",
  "cat": "puzzle",
  "tags": [
   "Match 3",
   "Levels"
  ],
  "fresh": 19,
  "progress": [
   "pickmix_progress",
   "unlocked",
   "Level"
  ]
 },
 {
  "slug": "way-out",
  "name": "Way Out",
  "blurb": "Slide each block out of its door",
  "about": "Slide coloured blocks out through the doors that match them. Watch for icy doors, chains and covered rows. Finish fast for three stars.",
  "icon": "🧱",
  "bg": "linear-gradient(135deg, #3b82f6, #e5484d)",
  "cat": "puzzle",
  "tags": [
   "Puzzle",
   "Endless Levels"
  ],
  "fresh": 5,
  "progress": [
   "wayout_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "depot-dash",
  "name": "Depot Dash",
  "blurb": "Clear the depot, fill the buses",
  "about": "Get every bus out of the crowded depot by sliding them along their lanes, in the right order.",
  "icon": "🚌",
  "bg": "linear-gradient(135deg, #f59e0b, #ef4444)",
  "cat": "puzzle",
  "tags": [
   "Endless Levels"
  ],
  "fresh": 1,
  "progress": [
   "depotdash_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "sliding-puzzle",
  "name": "Sliding Puzzle",
  "blurb": "Classic tile-sliding challenge",
  "about": "Slide the numbered tiles back into order using the one empty space.",
  "icon": "🧩",
  "bg": "linear-gradient(135deg, #f59e0b, #d97706)",
  "cat": "puzzle",
  "tags": [
   "3 Levels"
  ]
 },
 {
  "slug": "moving-in",
  "name": "Moving In",
  "blurb": "Fit the rooms back into the floor plan",
  "about": "Fit each room into the floor plan so every door lines up. Turn rooms to make them fit.",
  "icon": "🏠",
  "bg": "linear-gradient(135deg, #f2b33d, #23395b)",
  "cat": "puzzle",
  "tags": [
   "Logic",
   "Levels"
  ],
  "fresh": 12,
  "progress": [
   "movingin_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "bubble-doubles",
  "name": "Bubble Doubles",
  "blurb": "Shoot numbers to merge and double them",
  "about": "Shoot numbered bubbles; two of the same merge into double the number. Keep the board from filling up.",
  "icon": "🎯",
  "bg": "linear-gradient(135deg, #3fa7f5, #1b2443)",
  "cat": "puzzle",
  "tags": [
   "Numbers",
   "Endless"
  ],
  "fresh": 10
 },
 {
  "slug": "fizz-drop",
  "name": "Fizz Drop",
  "blurb": "Drop bubbles, merge pairs, don’t overflow",
  "about": "Drop fizzy balls into the jar; two of the same size merge into a bigger one. How big can you go?",
  "icon": "🫙",
  "bg": "linear-gradient(135deg, #ffcf5c, #5a2d82)",
  "cat": "puzzle",
  "tags": [
   "Numbers",
   "Endless"
  ],
  "fresh": 9
 },
 {
  "slug": "twenty48",
  "name": "2048",
  "blurb": "Slide and merge tiles",
  "about": "Slide the tiles; matching numbers merge. Reach 2048, then keep going.",
  "icon": "🔢",
  "bg": "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "cat": "puzzle",
  "tags": [
   "Endless"
  ]
 },
 {
  "slug": "lights-out",
  "name": "Light Switch",
  "blurb": "Toggle all lights off",
  "about": "Each switch flips itself and its neighbours. Turn every light off.",
  "icon": "💡",
  "bg": "linear-gradient(135deg, #fbbf24, #f59e0b)",
  "cat": "puzzle",
  "tags": [
   "3 Levels"
  ]
 },
 {
  "slug": "sudoku",
  "name": "Sudoku",
  "blurb": "Number placement puzzle",
  "about": "Fill the grid so every row, column and box has the numbers 1 to 9.",
  "icon": "9️⃣",
  "bg": "linear-gradient(135deg, #6366f1, #4f46e5)",
  "cat": "puzzle",
  "tags": [
   "3 Levels"
  ]
 },
 {
  "slug": "tetris",
  "name": "Block Drop",
  "blurb": "Classic falling blocks",
  "about": "Turn and drop the falling blocks to fill whole rows and clear them.",
  "icon": "🧱",
  "bg": "linear-gradient(135deg, #06b6d4, #0891b2)",
  "cat": "puzzle",
  "tags": [
   "Endless"
  ]
 },
 {
  "slug": "spot-on",
  "name": "Spot On",
  "blurb": "Lay dominoes to fit every rule",
  "about": "Cover the board with dominoes so every coloured region meets its rule: a total, all equal, all different, more or less than. Three new puzzles every day, plus practice.",
  "icon": "🎲",
  "bg": "linear-gradient(135deg, #3a66b8, #23304a)",
  "cat": "logic",
  "tags": [
   "Logic",
   "Daily"
  ],
  "fresh": 18,
  "daily": "games/spot-on/index.html?mode=daily"
 },
 {
  "slug": "balance",
  "name": "Leaf & Drop",
  "blurb": "Even out the leaves and drops",
  "about": "Place leaves so each row and column balances, using the clues around the edge.",
  "icon": "🍃",
  "bg": "linear-gradient(135deg, #2f9e44, #1c6dd0)",
  "cat": "logic",
  "tags": [
   "Logic",
   "Endless Levels"
  ],
  "fresh": 4,
  "progress": [
   "balance_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "kingdoms",
  "name": "Kingdoms",
  "blurb": "One crown per row, column and kingdom",
  "about": "Place one crown in every row, column and coloured kingdom, with no two crowns touching.",
  "icon": "👑",
  "bg": "linear-gradient(135deg, #4a3872, #e0b44c)",
  "cat": "logic",
  "tags": [
   "Logic",
   "Endless Levels"
  ],
  "fresh": 3,
  "progress": [
   "kingdoms_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "deduce",
  "name": "Deduce: Logic Grids",
  "blurb": "Crack each case by pure deduction",
  "about": "Work out who did what from a set of clues, crossing off possibilities in the logic grid.",
  "icon": "🔎",
  "bg": "linear-gradient(135deg, #e3c27d, #b45309)",
  "cat": "logic",
  "tags": [
   "Logic",
   "Endless Cases"
  ],
  "fresh": 2,
  "progress": [
   "caseclosed_progress",
   "level",
   "Case"
  ]
 },
 {
  "slug": "memory-match",
  "name": "Memory Match",
  "blurb": "Flip cards, find pairs",
  "about": "Turn over cards two at a time and find all the matching pairs.",
  "icon": "🎴",
  "bg": "linear-gradient(135deg, #ec4899, #db2777)",
  "cat": "logic",
  "tags": [
   "3 Levels"
  ]
 },
 {
  "slug": "simon",
  "name": "Color Sequence",
  "blurb": "Repeat the color pattern",
  "about": "Watch the colours light up, then repeat the sequence. It gets one longer every round.",
  "icon": "🎨",
  "bg": "linear-gradient(135deg, #f97316, #ea580c)",
  "cat": "logic",
  "tags": [
   "Endless"
  ]
 },
 {
  "slug": "minesweeper",
  "name": "Mine Finder",
  "blurb": "Clear the field, avoid the mines",
  "about": "Clear the field without setting off a mine. The numbers tell you how many are next door.",
  "icon": "💣",
  "bg": "linear-gradient(135deg, #ef4444, #dc2626)",
  "cat": "logic",
  "tags": [
   "3 Levels"
  ]
 },
 {
  "slug": "go-between",
  "name": "Go-Between",
  "blurb": "Find the word that links each pair",
  "about": "Find the word that links each pair, like Sunday and potatoes: roast. The first letters spell a mystery word. One daily puzzle, plus practice.",
  "icon": "🔗",
  "bg": "linear-gradient(135deg, #e9b949, #2c3e2d)",
  "cat": "word",
  "tags": [
   "Words",
   "Daily"
  ],
  "fresh": 11,
  "daily": "games/go-between/index.html?mode=daily"
 },
 {
  "slug": "kindred",
  "name": "Kindred",
  "blurb": "Merge word bubbles into groups of four",
  "about": "Merge word bubbles into groups of four that belong together. Watch for half words and bubbles that fall.",
  "icon": "🫧",
  "bg": "linear-gradient(135deg, #7fd1c7, #163a4f)",
  "cat": "word",
  "tags": [
   "Words",
   "Levels"
  ],
  "fresh": 8,
  "progress": [
   "kindred_progress",
   "level",
   "Level"
  ]
 },
 {
  "slug": "fourfold",
  "name": "Fourfold",
  "blurb": "Crack four words at once in nine tries",
  "about": "Guess four words at once. Every guess counts for all four boards.",
  "icon": "🔡",
  "bg": "linear-gradient(135deg, #3b6fd8, #4e9a57)",
  "cat": "word",
  "tags": [
   "Words",
   "Endless"
  ],
  "fresh": 7
 },
 {
  "slug": "crackword",
  "name": "Crackword",
  "blurb": "Guess the hidden word in six tries",
  "about": "Guess the hidden word in six tries, with clues after every guess. British or American spelling.",
  "icon": "🔠",
  "bg": "linear-gradient(135deg, #4e9a57, #d1ad32)",
  "cat": "word",
  "tags": [
   "Words",
   "Endless"
  ],
  "fresh": 6
 },
 {
  "slug": "word-search",
  "name": "Word Search",
  "blurb": "Find hidden words",
  "about": "Find the hidden words in the letter grid, across, down or diagonally.",
  "icon": "🔤",
  "bg": "linear-gradient(135deg, #10b981, #059669)",
  "cat": "word",
  "tags": [
   "6 Themes"
  ]
 },
 {
  "slug": "hangman",
  "name": "Hangman",
  "blurb": "Guess the word",
  "about": "Guess the word one letter at a time before the picture is finished.",
  "icon": "📝",
  "bg": "linear-gradient(135deg, #64748b, #475569)",
  "cat": "word",
  "tags": [
   "5 Categories"
  ]
 },
 {
  "slug": "solitaire",
  "name": "Solitaire",
  "blurb": "Classic patience, Draw 1 or Draw 3",
  "about": "Classic patience: build the four suits up from Ace to King. Draw 1 or Draw 3, with winnable deals.",
  "icon": "🃏",
  "bg": "linear-gradient(135deg, #2e8b57, #0f3d2a)",
  "cat": "cards",
  "tags": [
   "Cards",
   "Classic"
  ],
  "fresh": 13
 },
 {
  "slug": "tripeaks",
  "name": "TriPeaks",
  "blurb": "Clear three peaks one card higher or lower",
  "about": "Clear three peaks by playing cards one higher or lower than the pile. Build long chains for big scores.",
  "icon": "⛰️",
  "bg": "linear-gradient(135deg, #2d7391, #133746)",
  "cat": "cards",
  "tags": [
   "Cards",
   "Chains"
  ],
  "fresh": 14
 },
 {
  "slug": "freecell",
  "name": "FreeCell",
  "blurb": "Every card face up, four cells to help",
  "about": "Every card face up, four free cells to help. Almost every deal can be won with careful play.",
  "icon": "🗂️",
  "bg": "linear-gradient(135deg, #6a4b99, #2d1f47)",
  "cat": "cards",
  "tags": [
   "Cards",
   "Skill"
  ],
  "fresh": 15
 },
 {
  "slug": "pyramid",
  "name": "Pyramid",
  "blurb": "Pair cards that add up to 13",
  "about": "Pair cards that add up to 13 to clear the pyramid. Kings go on their own.",
  "icon": "🔺",
  "bg": "linear-gradient(135deg, #9c7a35, #4a3812)",
  "cat": "cards",
  "tags": [
   "Cards",
   "Numbers"
  ],
  "fresh": 16
 },
 {
  "slug": "spider",
  "name": "Spider",
  "blurb": "Build King-to-Ace runs, 1, 2 or 4 suits",
  "about": "Build runs from King down to Ace in one suit. Play with 1, 2 or 4 suits.",
  "icon": "🕷️",
  "bg": "linear-gradient(135deg, #8c4646, #3f1d1d)",
  "cat": "cards",
  "tags": [
   "Cards",
   "Classic"
  ],
  "fresh": 17
 },
 {
  "slug": "tic-tac-toe",
  "name": "Tic Tac Toe",
  "blurb": "Classic X's and O's vs AI",
  "about": "Three in a row beats the computer, at three difficulty levels.",
  "icon": "⭕",
  "bg": "linear-gradient(135deg, #3b82f6, #2563eb)",
  "cat": "arcade",
  "tags": [
   "3 Difficulties"
  ]
 },
 {
  "slug": "connect-four",
  "name": "Four in a Row",
  "blurb": "Get four in a row vs AI",
  "about": "Drop counters to get four in a row before the computer does.",
  "icon": "🔴",
  "bg": "linear-gradient(135deg, #ef4444, #eab308)",
  "cat": "arcade",
  "tags": [
   "3 Difficulties"
  ]
 },
 {
  "slug": "snake",
  "name": "Snake",
  "blurb": "Eat food, grow longer",
  "about": "Steer the snake to the food. Every bite makes it longer, so don't bite yourself.",
  "icon": "🐍",
  "bg": "linear-gradient(135deg, #22c55e, #16a34a)",
  "cat": "arcade",
  "tags": [
   "Classic"
  ]
 },
 {
  "slug": "breakout",
  "name": "Brick Breaker",
  "blurb": "Break all the bricks",
  "about": "Bounce the ball off your paddle to break every brick.",
  "icon": "🎾",
  "bg": "linear-gradient(135deg, #a855f7, #9333ea)",
  "cat": "arcade",
  "tags": [
   "Levels"
  ]
 }
];
window.HUB_CATEGORIES = [
    { id: 'word', name: 'Word' }, { id: 'logic', name: 'Logic' }, { id: 'puzzle', name: 'Puzzle' },
    { id: 'cards', name: 'Cards' }, { id: 'arcade', name: 'Arcade' }
];
