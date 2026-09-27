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

## 🎮 3 Distinct Game Modes

Neuro-Pacman Arena features a real-time mode switcher right in the header:

| Mode | What You Experience | Key Objective & Gameplay |
| :--- | :--- | :--- |
| **🕹️ ARCADE MODE** | **Classic Playable Pac-Man** | You control Pac-Man with Arrow Keys / WASD. 3 Lives, live score (0–100 max scale), Super Energizers (+10 pts), relentless lethal Ghost hunters, and dual warp tunnels. |
| **⚔️ 1v1 MAN vs MACHINE** | **Asymmetric Duel** | **YOU play Ghost Blinky**, hunting down the **#1 AI Champion Pac-Man** (1v1). Catch the neural network within 45 seconds before it clears the board! |
| **🔬 AI SWARM LAB** | **Genetic Algorithm Sandbox** | Watch 35 neural-network-driven Pac-Men evolve across generations. Features dynamic wall barrier architect mode, turbo 10G warp, and real-time neural synapse visualization. |

---

## 🕹️ Interactive Controls

* **Arrow Keys / WASD:** Steer Pac-Man in Arcade mode, or steer Ghost Blinky in Duel / Hunter modes.
* **Spacebar:** Pause / Resume game loop.
* **R Key:** Instant restart of the current stage / round.
* **Shift + Click (or B Key):** Enter **Maze Architect Mode** to drop dynamic neon force barriers and watch pathfinding reroute live.
* **Right-Click:** Drop a Super Energizer anywhere on an open corridor.
* **⚡ WARP 10G:** Fast-forwards 10 generations in ~150ms of headless memory.

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

Each of the 35 agents is powered by a high-performance 1D-array Feedforward Neural Network using `Math.tanh` activations with zero GC pressure during the forward pass.

* **Layer 1 (12 Sensory Inputs):**
  * 4 Wall Proximity Sensors (Up/Down/Left/Right Raycast Clearances)
  * 3 Ghost Threat Sensors (Ghost Proximity, Relative $\Delta X$, Relative $\Delta Y$)
  * 3 Pellet Path Sensors (BFS Shortest Path $\Delta X$, BFS Shortest Path $\Delta Y$, Pellet Proximity)
  * 2 Momentum/Heading Sensors (Current Velocity $\Delta X$, Velocity $\Delta Y$)
* **Layer 2 (Hidden):** 10 Active Nodes with Xavier/Glorot initialization.
* **Layer 3 (4 Outputs):** Directional movement activations (`[UP, DOWN, LEFT, RIGHT]`).
* **Multi-Elite Genetic Algorithm:** Top 2 champions preserved verbatim; remaining 33 slots bred via 3-way tournament selection, uniform blend crossover, and adaptive Gaussian mutation with entropy shock safeguards against stagnation.
* **Asymmetrical Ghost AI Personalities:**
  * 🔴 **Blinky (Red):** Direct aggressive hunter (shortest path tracking).
  * 🌸 **Pinky (Pink):** Ambush interceptor (targets 3 tiles ahead of leader).
  * 🔷 **Inky (Cyan):** Flanker / patrol router.
  * 🍊 **Clyde (Orange):** Cowardly roamer (chases when distant, retreats to scatter corner when close).
* **Composite Fitness Function:**
  $$\text{Fitness} = (\text{Pellets} \times 150) + (\text{Unique Tiles Explored} \times 20) + (\text{Frames Survived} \times 0.1) + (\text{Close Evades} \times 10) - \text{Loop Penalty}$$

---