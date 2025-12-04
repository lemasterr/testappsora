
# Sora Suite V3.0 Pro

The ultimate universal automation platform. Design complex workflows, manage multiple browser sessions, and process media at scale. Now featuring Real-Time Analytics, Telegram 2.0 notifications, and a Selector Picker for automating any website.

## Key Features

*   **Universal Automation:** Automate any website (Sora, Midjourney, Gemini, etc.) using the built-in Selector Picker and Generic Action nodes.
*   **Workflow Automator:** Visual drag-and-drop builder to create complex pipelines (Prompt -> Download -> Blur -> Merge).
*   **True Parallel Execution:** Run multiple Chrome sessions simultaneously in isolated environments. No cookie conflicts.
*   **Real-Time Analytics:** Live tracking of Prompts Submitted, Downloads, and Errors directly in the UI.
*   **Telegram 2.0:** Get detailed notifications for every step of your workflow, including video previews of downloaded content.
*   **Local Processing:** Built-in FFmpeg tools for Watermark Removal (Blur/Delogo) and Video Merging.
*   **Session Management:** Organize prompts, titles, and downloads into isolated profiles.

## Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    cd python-core && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
    ```

2.  **Run Development Mode:**
    ```bash
    npm run dev
    ```

3.  **Build for Production:**
    ```bash
    npm run build
    ```

## Architecture

*   **Frontend:** React + TailwindCSS + React Flow (Zustand for state).
*   **Backend (Node):** Electron main process handles Chrome automation via Puppeteer (CDP).
*   **Backend (Python):** FastAPI server handles heavy lifting (FFmpeg video processing, analytics storage).

## Usage Guide

1.  **Launch:** Open the app. You will see the new Landing Page. Click "Start Automation".
2.  **Sessions:** Go to the Sessions page to create or configure a browser profile. Launch Chrome to log in to your target websites.
3.  **Integrations:** Use the Integrations page to pick selectors from websites if you want to use the Generic Automator.
4.  **Automator:** Drag and drop nodes to build your workflow.
    *   **Sora Mode:** Use "Prompts" and "Download" nodes for specialized Sora logic.
    *   **Generic Mode:** Use "Generic Action" nodes to click, type, or scroll on any site.
5.  **Run:** Click "Run" in the Automator. Monitor progress in the Real-Time Stats panel or via Telegram.

## Troubleshooting

*   **Chrome won't start:** Ensure the path in Settings is correct. Close any existing Chrome instances running on the same profile.
*   **Python API Error:** Ensure `python-core/venv` is active and requirements are installed. Check the logs in the "Logs" page.
*   **Selectors not working:** Re-pick the selector using the Integrations page inspector. Websites often change their layout.
