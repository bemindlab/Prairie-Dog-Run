# 🐿️ Prairie Dog Run

**Prairie Dog Run** is a procedurally generated 2D platformer where levels are designed in real-time by Google's **Gemini AI**. Play as a brave prairie dog navigating treacherous plains, dodging predators, and collecting seeds to survive the winter.

![Game Screenshot](https://via.placeholder.com/800x450?text=Prairie+Dog+Run+Gameplay)

## ✨ Features

-   **Generative Levels**: Every level is unique! The Gemini API designs platforms, enemy placements, and obstacles based on difficulty settings.
-   **Dynamic AI Enemies**:
    -   🐍 **Snakes**: Patrol the ground and charge when provoked.
    -   🦅 **Hawks**: Stalk you from the sky and dive-bomb.
    -   🦇 **Bats**: Fly in erratic patterns and swoop down.
    -   🐝 **Bugs**: Swarm in chaotic clusters.
    -   🥔 **Moles**: Pop out of the ground and spit projectiles.
-   **Power-ups & Physics**: Collect **Seeds** for score and **Shields** for temporary invincibility. Enjoy snappy, responsive platforming physics with air control and coyote time.
-   **Mobile Friendly**: Fully responsive design with on-screen touch controls and portrait mode support.
-   **Procedural Audio**: Custom sound effects and dynamic background music generated in real-time using the Web Audio API.
-   **Leaderboard**: Track your high scores and compete for the top spot locally.

## 🛠️ Tech Stack

-   **Frontend**: React 19, TypeScript
-   **Styling**: Tailwind CSS
-   **AI Integration**: Google GenAI SDK (`@google/genai`)
-   **Icons**: Phosphor React
-   **Build Tool**: Vite (Recommended)

## 🚀 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/prairie-dog-run.git
    cd prairie-dog-run
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure API Key**
    Create a `.env` file in the root directory and add your Google Gemini API key:
    ```env
    VITE_API_KEY=your_google_api_key_here
    # Note: If using a bundler other than Vite, the prefix might differ (e.g., REACT_APP_API_KEY).
    # The code expects process.env.API_KEY or import.meta.env.VITE_API_KEY depending on setup.
    ```

4.  **Start the development server**
    ```bash
    npm start
    # or
    npm run dev
    ```

5.  **Open in Browser**
    Navigate to `http://localhost:3000` (or the port shown in your terminal).

## 🎮 How to Play

### Controls

| Action | Keyboard | Mobile |
| :--- | :--- | :--- |
| **Move Left** | `Arrow Left` / `A` | Tap Left Arrow |
| **Move Right** | `Arrow Right` / `D` | Tap Right Arrow |
| **Jump** | `Space` / `Up` / `W` | Tap Jump Button |
| **Pause** | `Esc` | Pause Button (HUD) |

### Game Loop

1.  **Select Difficulty**: Choose Easy, Medium, or Hard to adjust level complexity and time limits.
2.  **Survive**: Avoid enemies and do not fall off the bottom of the screen.
3.  **Collect**: Grab **Seeds** (🌰) for points. Grab **Shields** (🛡️) to become invincible.
4.  **Win**: Reach the **Exit Burrow** at the far right of the level before time runs out.

## 🧠 AI Level Generation

This project uses the `gemini-2.5-flash` model to generate level layouts JSON. The AI is prompted to create:
-   **Platforms**: Safe zones, jumps, and "crumble" bridges.
-   **Obstacles**: Destructible crates that block paths.
-   **Entity Placement**: Strategic positioning of enemies and loot based on the requested difficulty.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ and 🤖 AI.*
