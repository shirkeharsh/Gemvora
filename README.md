<p align="center">

  <img src="logo.png" alt="Gemvora AI" width="180">

</p>

<h1 align="center">Gemvora AI</h1>

<p align="center">

<b>Native Android Clinical Assistant powered by AI</b>

</p>

<p align="center">

Privacy-first • Medical Report Explainer • Voice Assistant • Multilingual

</p>
# 🩺 Gemvora AI — Native Android Clinical Assistant

Gemvora is a privacy-first, native Android application (APK) designed as a clinical assistant and medical report explainer. Built with React and packaged using Capacitor for Android, Gemvora allows patients to upload PDF reports or scan medical documents, and receive clear, structured explanations of blood levels, medical jargon, and symptoms in simple English or Marathi.

---

## 🌟 Key Features

- **📄 Document Upload & Scan**: Upload medical PDF documents or snap pictures of prescription and lab reports using native camera integration.
- **🤖 Multi-Engine Intelligence**: Connects to Google Gemini API (recommended) or falls back to Groq/NVIDIA NIM models for lightning-fast inference.
- **🎙️ Voice Input & Text-to-Speech**: Hands-free interactions using speech-to-text voice transcription for queries and native text-to-speech for reading AI responses.
- **🌐 Multilingual Explanations**: Seamless toggling between English and Marathi languages, tailored for local patients.
- **🧠 Patient Memory Shield**: Safe local memory bank that tracks patient health history, allergies, and chronic conditions to personalize future explanations.
- **🔒 Cookies & Cache Control**: One-click data purge option inside the settings to clean local logs, cache, and IndexedDB files instantly.
- **⚡ Smart Cache & Router**: Includes a client-side semantic and exact cache database using IndexedDB to store identical queries, reducing API token usage and improving load speeds.

---

## 🛠️ Tech Stack

- **Client Stack**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite
- **Mobile Runtime**: Capacitor Core, Android, Camera API, Local Notifications, Text-to-Speech
- **Services**: Google Generative AI (Gemini SDK), Web Audio Speech API, IndexedDB Cache System

---

## 📁 Directory Structure

```text
├── android/                  # Native Android Gradle configuration and Kotlin source
├── public/                   # Static icons and assets
├── src/
│   ├── components/           # UI modules (Home screen, Chat console, Settings panel)
│   ├── services/             # API gateways and cache routers
│   ├── App.tsx               # Primary interface orchestrator
│   ├── main.tsx              # React mounting root
│   └── index.css             # Tailwind setup and custom theme variables
├── .env.example              # Template for API keys
├── loggerServer.js           # Development log manager server
└── package.json              # Client dependencies config
```

---

## ⚙️ Setup & Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/Gemvora.git
   cd Gemvora
   ```

2. **Configure Environment Variables**:
   Copy the example file to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   Provide your Gemini API key in `VITE_GEMINI_API_KEY`.

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Launch Dev Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

5. **Build & Sync Capacitor Android App**:
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the project repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
