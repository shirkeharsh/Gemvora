export interface TranslationKeys {
  welcomeTitle: string;
  welcomeSubtitle: string;
  uploadPdf: string;
  uploadImage: string;
  cameraCapture: string;
  chatWithAi: string;
  uploadHint: string;
  disclaimerText: string;
  homeTab: string;
  analysisTab: string;
  chatTab: string;
  settingsTab: string;
  themeLabel: string;
  lightMode: string;
  darkMode: string;
  languageLabel: string;
  clearHistory: string;
  clearHistoryConfirm: string;
  clearHistorySuccess: string;
  extractingLoader: string;
  analyzingLoader: string;
  exportPdf: string;
  downloadSummary: string;
  shareReport: string;
  noReportUploaded: string;
  normalValues: string;
  abnormalValues: string;
  criticalValues: string;
  recentReports: string;
  noRecentReports: string;
  chatPlaceholder: string;
  suggestedQuestions: string;
  apiError: string;
  memoryTitle: string;
  memorySubtitle: string;
  addMemoryPlaceholder: string;
  addMemoryBtn: string;
  noMemory: string;
  halfExplanationAlert: string;
}

export const translations: Record<string, TranslationKeys> = {
  en: {
    welcomeTitle: "Gemvora",
    welcomeSubtitle: "Your virtual medical companion. Upload your blood tests, reports, or scans for a simple explanation in plain English or Marathi. All reports are analyzed privately on your phone.",
    uploadPdf: "Upload PDF",
    uploadImage: "Upload Image",
    cameraCapture: "Camera Capture",
    chatWithAi: "Chat with AI",
    uploadHint: "Supports PDF, JPG, JPEG, PNG, WEBP files up to 10MB.",
    disclaimerText: "Disclaimer: This explanation is for educational purposes only and is not a medical diagnosis or treatment plan. Please consult a qualified healthcare professional for medical care.",
    homeTab: "Home",
    analysisTab: "Analysis",
    chatTab: "AI Chat",
    settingsTab: "Settings",
    themeLabel: "Theme Mode",
    lightMode: "Light",
    darkMode: "Dark",
    languageLabel: "Preferred Language",
    clearHistory: "Delete All Data",
    clearHistoryConfirm: "Are you sure you want to delete all reports and chat history? This action cannot be undone.",
    clearHistorySuccess: "All data cleared successfully.",
    extractingLoader: "Extracting report details...",
    analyzingLoader: "AI is analyzing findings...",
    exportPdf: "Export PDF",
    downloadSummary: "Download Summary",
    shareReport: "Share Summary",
    noReportUploaded: "No medical report uploaded yet. Please upload a report from the Home screen first.",
    normalValues: "Normal Parameters",
    abnormalValues: "Abnormal Parameters",
    criticalValues: "Critical Findings",
    recentReports: "Recent Reports",
    noRecentReports: "No analyzed reports found.",
    chatPlaceholder: "Ask follow-up questions about your report...",
    suggestedQuestions: "Suggested Questions",
    apiError: "Error calling server. Please make sure the backend is running.",
    memoryTitle: "Patient Health Memory",
    memorySubtitle: "Save critical medical history or allergies so the AI can use them as context in all chats.",
    addMemoryPlaceholder: "e.g., Allergic to penicillin, Diabetic, high LDL",
    addMemoryBtn: "Remember",
    noMemory: "No health history recorded yet.",
    halfExplanationAlert: "Even if you see the explanation is incomplete or cut off, you can still ask Gemvora questions about the full report in the chat."
  },
  mr: {
    welcomeTitle: "Gemvora",
    welcomeSubtitle: "तुमचा व्हर्च्युअल वैद्यकीय सोबती. तुमचे रक्त तपासणी अहवाल, रिपोर्ट किंवा स्कॅन अपलोड करा आणि साध्या इंग्रजी किंवा मराठी भाषेत स्पष्टीकरण मिळवा. सर्व माहिती तुमच्या फोनवर सुरक्षित राहते.",
    uploadPdf: "Upload PDF",
    uploadImage: "Upload Image",
    cameraCapture: "Camera Capture",
    chatWithAi: "AI शी चॅट करा",
    uploadHint: "PDF, JPG, JPEG, PNG, WEBP फाइल्स समर्थित (१०MB पर्यंत).",
    disclaimerText: "अस्वीकरण (Disclaimer): हे स्पष्टीकरण केवळ शैक्षणिक हेतूंसाठी आहे आणि हा वैद्यकीय निदान किंवा उपचार प्लॅन नाही. कृपया उपचारांसाठी डॉक्टरांचा सल्ला घ्या.",
    homeTab: "मुख्य",
    analysisTab: "अहवाल विश्लेषण",
    chatTab: "AI चॅट",
    settingsTab: "सेटिंग्ज",
    themeLabel: "थीम मोड",
    lightMode: "लाइट",
    darkMode: "डार्क",
    languageLabel: "पसंदगीची भाषा",
    clearHistory: "सर्व डेटा हटवा",
    clearHistoryConfirm: "तुम्हाला खात्री आहे की तुम्ही सर्व अहवाल आणि चॅट हिस्ट्री हटवू इच्छिता? ही क्रिया परत घेतली जाऊ शकत नाही.",
    clearHistorySuccess: "सर्व डेटा यशस्वीरित्या हटवला गेला.",
    extractingLoader: "अहवालाची माहिती गोळा करत आहे...",
    analyzingLoader: "AI अहवाल तपासत आहे...",
    exportPdf: "PDF म्हणून जतन करा",
    downloadSummary: "सारांश डाउनलोड करा",
    shareReport: "शेअर करा",
    noReportUploaded: "अद्याप कोणताही अहवाल अपलोड केलेला नाही. कृपया आधी मुख्य स्क्रीनवरून अहवाल अपलोड करा.",
    normalValues: "सामान्य मूल्ये",
    abnormalValues: "असामान्य मूल्ये",
    criticalValues: "महत्त्वाचे निष्कर्ष",
    recentReports: "नुकतेच तपासलेले अहवाल",
    noRecentReports: "कोणतेही अहवाल आढळले नाहीत.",
    chatPlaceholder: "तुमच्या अहवालाबद्दल प्रश्न विचारा...",
    suggestedQuestions: "सुचवलेले प्रश्न",
    apiError: "सर्व्हरशी संपर्क साधता आला नाही. कृपया बॅकएंड सुरू असल्याची खात्री करा।",
    memoryTitle: "रुग्णाचे आरोग्य रेकॉर्ड (स्मृती)",
    memorySubtitle: "महत्त्वाचे आजार किंवा ॲलर्जी जतन करा जेणेकरून AI गप्पांदरम्यान हे लक्षात ठेवेल.",
    addMemoryPlaceholder: "उदा., पेनिसिलिन ॲलर्जी, मधुमेही, उच्च कोलेस्टेरॉल",
    addMemoryBtn: "लक्षात ठेवा",
    noMemory: "अद्याप कोणताही आरोग्याचा इतिहास नोंदवलेला नाही.",
    halfExplanationAlert: "जरी तुम्हाला हे स्पष्टीकरण अपूर्ण किंवा निम्मे दिसत असले, तरीही तुम्ही चॅटमध्ये संपूर्ण रिपोर्टबद्दल प्रश्न विचारू शकता."
  }
};

export const defaultQuestions: Record<string, string[]> = {
  en: [
    "What do my abnormal values mean?",
    "What questions should I ask my doctor about this report?",
    "Are there any simple diet or lifestyle changes recommended?",
    "What are the typical next steps after these findings?"
  ],
  mr: [
    "माझ्या असामान्य मूल्यांचा अर्थ काय आहे?",
    "या रिपोर्टबद्दल मी माझ्या डॉक्टरांना कोणते प्रश्न विचारले पाहिजेत?",
    "आहार किंवा जीवनशैलीत काही सोपे बदल सुचवले आहेत का?",
    "या निष्कर्षांनंतर सामान्यतः पुढची पायरी काय असते?"
  ]
};
