# 🧬 Neuro-Pacman Arena

**An Asymmetrical, Client-Side AI Evolutionary Sandbox**

Neuro-Pacman Arena is a 100% dependency-free, purely client-side Machine Learning simulation built natively in the browser. Watch a swarm of 35 neural-network-driven Pac-Men evolve, learn pathfinding, and evade ghosts in real-time—no cloud APIs, no server costs, and no NPM packages required.

---

## ⚡ The Pitch (Why This Wins)

Most AI projects are just cloud API wrappers. Neuro-Pacman Arena is built from scratch using raw **Vanilla JavaScript arrays and HTML5 Canvas**.

* **Zero Dependencies:** No React, no Webpack, no TensorFlow.js.
* **Zero Cloud Computing:** Unplug the Wi-Fi mid-demo and the AI keeps evolving perfectly.
* **Instant Scale:** Matrix math and genetic algorithms execute locally on the browser's single thread, locked at a smooth 60 FPS.

---

## 🎮 Core Features

* 🧠 **Real-Time Swarm Evolution:** 35 active neural networks calculate spatial trajectories simultaneously. The genetic algorithm selects for survival, applies tournament selection, and mutates weights every 10 seconds.
* 🌌 **Parallel Universe State Isolation:** Agents render on the same canvas but do not cannibalize each other's food. Each agent maintains an independent boolean array for the world state, ensuring fair fitness gradients.
* 🛡️ **The Validation Shield:** Engine-level intercept that stops neural networks from endlessly running into walls, forcing the math to pick the next best mathematically valid path.
* 🖱️ **Interactive Judge Mode:** Click anywhere on the live canvas to instantly drop a new Ghost threat and watch the neural swarm dynamically recalculate its evasion vectors on the fly.
* 💽 **Cold Start Champion:** Boots instantly with a hardcoded, pre-trained JSON weight matrix for an immediate, flawless "smart" demo, with a toggle to watch it learn from scratch.
* 💻 **Hacker Telemetry Dashboard:** A dark, high-contrast CSS Grid terminal streaming live epoch rollovers, mutation spikes, and target vectors alongside the game canvas.

---

## 🛠️ Tech Stack

* **Language:** Vanilla JavaScript (ES6+)
* **Rendering:** HTML5 `<canvas>`
* **Styling:** CSS3 (Flexbox/Grid)
* **Libraries/Packages:** **Absolute Zero.**

---

## 🚀 How to Run (Zero-Installation)

Because this project uses no build tools or package managers, running it takes exactly two seconds:

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/neuro-pacman-arena.git

```


2. **Navigate to the directory:**
```bash
cd neuro-pacman-arena

```


3. **Run the app:**
Double-click `index.html` to open it in any modern web browser.
*(Optional: Use VS Code Live Server for hot-reloading during development).*

---

## 🧠 Neural Architecture (The Brain)

Each of the 35 agents is powered by a custom 1D-array Feedforward Neural Network using a `Math.tanh` activation function.

* **Layer 1 (8 Inputs):** 4 Wall Proximity Sensors (Up/Down/Left/Right), 2 Normalized Ghost Vectors (X,Y), 2 Normalized Pellet Vectors (X,Y).
* **Layer 2 (Hidden):** 6 Active Nodes.
* **Layer 3 (4 Outputs):** Directional movement probabilities.
* **Composite Fitness Function:** `(Pellets Eaten * 100) + (Frames Survived * 0.2) - (Repeated Tile Penalty)`

---