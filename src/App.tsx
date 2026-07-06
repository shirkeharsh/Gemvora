import { useState, useEffect } from 'react';
import { translations } from './translations';
import { LanguageSelector } from './components/LanguageSelector';
import { ReportAnalyzer } from './components/ReportAnalyzer';
import { ChatInterface } from './components/ChatInterface';
import { Settings } from './components/Settings';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Home, MessageSquare, Settings as SettingsIcon } from 'lucide-react';
import { callAI, getEmbedding, checkUserRateLimit } from './utils/aiService';
import type { AIProvider } from './utils/aiService';
import { queryChunksRAG, clearUserChunks } from './utils/db';
import { routeMessage, saveToCache, runRouterSelfTests } from './utils/SmartRequestRouter';

interface Report {
  id: string;
  fileName: string;
  description: string;
  timestamp: string;
  language: 'en' | 'mr';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

function App() {
  // One-time fresh restart cleanup of database and local storage to clear old data
  useEffect(() => {
    const hasReset = localStorage.getItem('pulse_health_fresh_restart_v3');
    if (!hasReset) {
      localStorage.clear();
      indexedDB.deleteDatabase('Gemvora_LocalDB');
      localStorage.setItem('pulse_health_fresh_restart_v3', 'true');
      console.log('Local storage and IndexedDB cleared for fresh restart.');
      window.location.reload();
    }
  }, []);


  // Active User Profile state
  const [username, setUsername] = useState<string | null>(() => {
    const saved = localStorage.getItem('pocket_ai_active_user');
    return saved;
  });

  // API Key state for Gemini (bypassed using local keys.json)
  const apiKey = 'configured';
  const setApiKey = (_key: string | null) => {};

  // Provider state (Gemini only)
  const provider: AIProvider = 'gemini';

  // Model state (enforce Gemini 2.5 Flash only)
  const model = 'gemini-2.5-flash';

  // Pipeline processing mode state
  const [fullNvidiaMode, setFullNvidiaMode] = useState<boolean>(() => {
    const activeUser = localStorage.getItem('pocket_ai_active_user');
    if (activeUser) {
      return localStorage.getItem(`pocket_ai_${activeUser}_full_nvidia_mode`) === 'true';
    }
    return localStorage.getItem('pocket_ai_global_full_nvidia_mode') === 'true';
  });

  const handleToggleNvidiaMode = (val: boolean) => {
    setFullNvidiaMode(val);
    if (username) {
      localStorage.setItem(`pocket_ai_${username}_full_nvidia_mode`, String(val));
    } else {
      localStorage.setItem('pocket_ai_global_full_nvidia_mode', String(val));
    }
  };

  // Language state
  const [language, setLanguage] = useState<'en' | 'mr' | null>(() => {
    const activeUser = localStorage.getItem('pocket_ai_active_user');
    if (activeUser) {
      const saved = localStorage.getItem(`pocket_ai_${activeUser}_lang`);
      if (saved === 'en' || saved === 'mr') return saved;
    }
    const saved = localStorage.getItem('med_app_lang');
    return (saved === 'en' || saved === 'mr') ? saved : null;
  });

  // User segments states (recentReports, userMemory, chatMessages)
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'settings'>('home');
  const [activeReport, setActiveReport] = useState<{ id?: string; fileName: string; description: string } | null>(null);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [userMemory, setUserMemory] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [isReportGenerating, setIsReportGenerating] = useState(false);
  const [showPrivacyAlert, setShowPrivacyAlert] = useState<boolean>(false);

  // Load initial chat history list from localStorage
  const [chatHistory, setChatHistory] = useState<{ reportId: string; fileName: string; timestamp: string; messages: Message[] }[]>(() => {
    const activeUser = localStorage.getItem('pocket_ai_active_user');
    if (activeUser) {
      const saved = localStorage.getItem(`pocket_ai_${activeUser}_chat_history`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Sync the Discord webhook URL to the local logger server on mount, so compile-and-send-app.sh can read it from file!
  useEffect(() => {
    const webhook = localStorage.getItem('pocket_ai_global_discord_webhook');
    if (webhook) {
      fetch('http://localhost:5174/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: webhook })
      }).catch(err => console.warn('Failed to sync webhook with loggerServer', err));
    }
  }, []);

  // Run Smart Request Router self-test verification on boot
  useEffect(() => {
    runRouterSelfTests().catch(err => console.error("Smart Router verification failed:", err));
  }, []);

  // Update chat history list in localStorage when active chatMessages changes
  useEffect(() => {
    if (!username || chatMessages.length === 0) return;

    // Only save the recent convo if a report was uploaded earlier (has a valid active report ID)
    const reportId = activeReport?.id;
    if (!reportId) return;

    const fileName = activeReport.fileName;

    setChatHistory(prev => {
      const existing = prev.find(h => h.reportId === reportId);
      if (existing && JSON.stringify(existing.messages) === JSON.stringify(chatMessages)) {
        return prev;
      }
      
      const filtered = prev.filter(h => h.reportId !== reportId);
      const updated = [
        {
          reportId,
          fileName,
          timestamp: new Date().toISOString(),
          messages: chatMessages
        },
        ...filtered
      ];
      localStorage.setItem(`pocket_ai_${username}_chat_history`, JSON.stringify(updated));
      return updated;
    });
  }, [chatMessages, activeReport, username]);

  // Sync user segmentation data from localStorage whenever username profile changes
  useEffect(() => {
    if (!username) {
      setRecentReports([]);
      setUserMemory([]);
      setChatMessages([]);
      setChatHistory([]);
      setActiveReport(null);
      return;
    }

    const savedReports = localStorage.getItem(`pocket_ai_${username}_reports`);
    setRecentReports(savedReports ? JSON.parse(savedReports) : []);

    const savedMemory = localStorage.getItem(`pocket_ai_${username}_memory`);
    setUserMemory(savedMemory ? JSON.parse(savedMemory) : []);

    const savedChats = localStorage.getItem(`pocket_ai_${username}_chats`);
    setChatMessages(savedChats ? JSON.parse(savedChats) : []);

    const savedChatsHistory = localStorage.getItem(`pocket_ai_${username}_chat_history`);
    setChatHistory(savedChatsHistory ? JSON.parse(savedChatsHistory) : []);

    const savedLang = localStorage.getItem(`pocket_ai_${username}_lang`);
    if (savedLang === 'en' || savedLang === 'mr') {
      setLanguage(savedLang);
    }

    setActiveReport(null);
  }, [username]);

  // Sync theme changes with body classList (always force proper class overrides)
  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const preferredTheme = systemPrefersDark ? 'dark' : 'light';
    
    if (preferredTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      body.classList.remove('dark');
      body.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      body.classList.remove('light');
      body.classList.add('dark');
    }
  }, [username]);

  // Show privacy alert dialog once per user when they onboard or switch to their profile
  useEffect(() => {
    if (username) {
      const shown = localStorage.getItem(`pocket_ai_${username}_privacy_alert_shown`) === 'true';
      if (!shown) {
        setShowPrivacyAlert(true);
      } else {
        setShowPrivacyAlert(false);
      }
    } else {
      setShowPrivacyAlert(false);
    }
  }, [username]);

  const handleAcceptPrivacy = () => {
    if (username) {
      localStorage.setItem(`pocket_ai_${username}_privacy_alert_shown`, 'true');
    }
    setShowPrivacyAlert(false);
  };

  // Translate helper lookup
  const t = translations[language || 'en'];

  // Triggered on Onboarding form complete
  const handleOnboardingComplete = async (name: string, lang: 'en' | 'mr') => {
    localStorage.setItem('pocket_ai_active_user', name);
    localStorage.setItem(`pocket_ai_${name}_lang`, lang);
    localStorage.setItem('med_app_lang', lang);

    // Track profile username
    const savedProfiles = localStorage.getItem('pocket_ai_profiles');
    let profiles: string[] = savedProfiles ? JSON.parse(savedProfiles) : [];
    if (!profiles.includes(name)) {
      profiles.push(name);
      localStorage.setItem('pocket_ai_profiles', JSON.stringify(profiles));
    }

    setUsername(name);
    setLanguage(lang);
  };

  const handleSelectLanguage = (lang: 'en' | 'mr') => {
    setLanguage(lang);
    localStorage.setItem('med_app_lang', lang);
    if (username) {
      localStorage.setItem(`pocket_ai_${username}_lang`, lang);
    }
  };



  const handleAddMemory = (text: string) => {
    if (!username) return;
    const savedMemoryStr = localStorage.getItem(`pocket_ai_${username}_memory`);
    const currentMemory: string[] = savedMemoryStr ? JSON.parse(savedMemoryStr) : [];
    if (!currentMemory.includes(text)) {
      const updated = [...currentMemory, text];
      setUserMemory(updated);
      localStorage.setItem(`pocket_ai_${username}_memory`, JSON.stringify(updated));
    }
  };

  const handleDeleteMemory = (index: number) => {
    if (!username) return;
    const savedMemoryStr = localStorage.getItem(`pocket_ai_${username}_memory`);
    const currentMemory: string[] = savedMemoryStr ? JSON.parse(savedMemoryStr) : [];
    const updated = currentMemory.filter((_, idx) => idx !== index);
    setUserMemory(updated);
    localStorage.setItem(`pocket_ai_${username}_memory`, JSON.stringify(updated));
  };

  const handleAnalysisComplete = (reportData: { id: string; fileName: string; description: string }) => {
    setIsReportGenerating(false);
    if (!username) return;
    
    // Clear chat messages to start the conversation fresh for this report context!
    setChatMessages([]);

    if (reportData.fileName && reportData.description) {
      let descriptionText = reportData.description;
      let extractedMemories: string[] = [];

      // 1. Extract memories automatically from prompt tags (case-insensitive)
      let memoryBlock = "";
      const memoryMatch = descriptionText.match(/\[MEMORY_POINTS\]([\s\S]*?)\[\/MEMORY_POINTS\]/i);
      if (memoryMatch) {
        memoryBlock = memoryMatch[1];
        descriptionText = descriptionText.replace(/\[MEMORY_POINTS\][\s\S]*?\[\/MEMORY_POINTS\]/i, '').trim();
      } else {
        // Fallback: match "**Memory Points**:" or "Memory Points:" at the end of the response
        const fallbackMatch = descriptionText.match(/(?:\*\*Memory Points\*\*|Memory Points):\s*\n?([\s\S]*?)$/i);
        if (fallbackMatch) {
          memoryBlock = fallbackMatch[1];
          descriptionText = descriptionText.replace(/(?:\*\*Memory Points\*\*|Memory Points):\s*\n?([\s\S]*?)$/i, '').trim();
        }
      }

      if (memoryBlock) {
        extractedMemories = memoryBlock
          .split('\n')
          .map(line => line.replace(/^[-*•\s\d.]+(\*\*|\*)?/, '').trim())
          .filter(line => line.length > 0 && line.length < 50);
      }

      // 2. Lenient Summary parser to save as a high-level memory point
      let autoSummaryPoint = "";
      const summaryMatch = descriptionText.match(/(?:\*\*Summary\*\*|\*\*सारांश\*\*|Summary|सारांश):\s*([\s\S]*?)(?:\n\n|\n\d\.|\n\*\*|$)/i);
      if (summaryMatch) {
        const cleanSummary = summaryMatch[1].replace(/[*_#]/g, '').trim();
        if (cleanSummary) {
          const truncatedSummary = cleanSummary.length > 80 ? cleanSummary.substring(0, 77) + "..." : cleanSummary;
          autoSummaryPoint = `Summary: ${truncatedSummary}`;
        }
      }
      
      if (autoSummaryPoint && !extractedMemories.includes(autoSummaryPoint)) {
        extractedMemories.push(autoSummaryPoint);
      }

      // 3. Ultimate Fallback: If no distinct memory points were extracted, scan the text for lines containing clinical keywords
      if (extractedMemories.length === 0 || (extractedMemories.length === 1 && extractedMemories[0].startsWith('Summary:'))) {
        const lines = descriptionText.split('\n');
        const clinicalKeywords = [
          'elevated', 'abnormal', 'critical', 'high', 'low', 'positive', 'negative', 'borderline',
          'cholesterol', 'blood pressure', 'glucose', 'diabetes', 'thyroid', 'liver', 'kidney', 'anemia',
          'वाढलेली', 'कमी', 'असामान्य', 'गंभीर'
        ];
        
        const candidatePoints = lines
          .map(line => line.replace(/^[-*•\s\d.]+(\*\*|\*)?/, '').replace(/[*#]/g, '').trim())
          .filter(line => {
            const lower = line.toLowerCase();
            return clinicalKeywords.some(kw => lower.includes(kw)) && line.length > 10 && line.length < 60;
          });
        
        const distinctCandidates = Array.from(new Set(candidatePoints)).slice(0, 3);
        extractedMemories = [...extractedMemories, ...distinctCandidates];
      }

      const newReport: Report = {
        id: reportData.id,
        fileName: reportData.fileName,
        description: descriptionText,
        timestamp: new Date().toISOString(),
        language: language || 'en'
      };

      const updated = [newReport, ...recentReports].slice(0, 10);
      setRecentReports(updated);
      localStorage.setItem(`pocket_ai_${username}_reports`, JSON.stringify(updated));
      setActiveReport({ id: reportData.id, fileName: reportData.fileName, description: descriptionText });
      
      // Auto-open in Chat tab with report explanation as the first message
      setChatMessages([{ role: 'assistant', content: descriptionText }]);
      setActiveTab('chat');

      if (extractedMemories.length > 0) {
        const savedMemoryStr = localStorage.getItem(`pocket_ai_${username}_memory`);
        const currentMemory: string[] = savedMemoryStr ? JSON.parse(savedMemoryStr) : [];
        let hasNew = false;
        extractedMemories.forEach(mem => {
          if (!currentMemory.includes(mem)) {
            currentMemory.push(mem);
            hasNew = true;
          }
        });
        if (hasNew) {
          setUserMemory(currentMemory);
          localStorage.setItem(`pocket_ai_${username}_memory`, JSON.stringify(currentMemory));
        }
      }
    } else {
      setActiveReport(null);
    }
  };

  const handleSelectReport = (report: Report) => {
    setActiveReport({
      id: report.id,
      fileName: report.fileName,
      description: report.description
    });
    setChatMessages([{ role: 'assistant', content: report.description }]);
    setActiveTab('chat');
  };

  const handleSendMessage = async (text: string, attachedFile?: File) => {
    if (!username) return;
    let base64Attachment: string | undefined = undefined;

    if (attachedFile) {
      base64Attachment = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(attachedFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
    }

    const userMsg: Message = { 
      role: 'user', 
      content: text + (attachedFile && attachedFile.type === 'application/pdf' ? `\n\n[Attached PDF: ${attachedFile.name}]` : ''),
      image: base64Attachment
    };
    
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatLoading(true);

    try {
      // SMART REQUEST ROUTER - Intercept query before network requests
      const routeResult = await routeMessage(
        text,
        provider,
        undefined, // default cache provider (IndexedDB)
        chatMessages.length,
        !!attachedFile
      );

      let content = "";
      if (routeResult.source !== 'gemini_fallback') {
        content = routeResult.response;
      } else {
        // Enforce client-side rate limit check (5 requests/min, 20 requests/day)
        const mockMode = localStorage.getItem('pocket_ai_mock_mode') === 'true';
        if (!mockMode) {
          const rateLimit = checkUserRateLimit(username);
          if (!rateLimit.allowed) {
            let cooldownMsg = '';
            if (rateLimit.reason === 'minute') {
              const secs = Math.ceil(rateLimit.waitTimeMs / 1000);
              cooldownMsg = `${secs} second(s)`;
            } else {
              const hrs = Math.floor(rateLimit.waitTimeMs / (1000 * 60 * 60));
              const mins = Math.ceil((rateLimit.waitTimeMs % (1000 * 60 * 60)) / (1000 * 60));
              cooldownMsg = `${hrs} hour(s) and ${mins} minute(s)`;
            }
            throw new Error(`USER_RATE_LIMIT_EXCEEDED: ${cooldownMsg}`);
          }
        }

        const chatLangInstruction = language === 'mr'
          ? `Language & Translation Guidelines:
- You MUST write your explanation primarily in Marathi (Primary language).
- However, keep all key medical terms, test parameters, symptoms, and diagnoses in English (Secondary language) in parentheses or alongside the Marathi description. E.g. "रक्तदाब (Blood Pressure)", "कोलेस्टेरॉल (Cholesterol) ची पातळी वाढलेली (Elevated) आहे", "यकृत (Liver)", "लाल रक्तपेशी (Red Blood Cells)". This is critical so that the patient can read the report comfortably while matching terms to their actual paper report.
- The reply must be written in Marathi as the primary language with English in parentheses. Do NOT write the main explanations in English.`
          : `Language & Translation Guidelines:
- You must write your explanation entirely in English. Ensure all medical terminology is clearly explained in simple, patient-friendly terms.`;

        // 1. Token Optimization via RAG context lookup
        let RAGContext = '';
        if (activeReport?.id) {
          let queryEmbedding: number[] | undefined = undefined;
          try {
            queryEmbedding = await getEmbedding(text, provider);
          } catch (e) {
            console.warn('Failed to generate embedding for query:', e);
          }
          
          const relevantChunks = await queryChunksRAG(username, activeReport.id, text, queryEmbedding, 4);
          if (relevantChunks.length > 0) {
            RAGContext = relevantChunks.map((c, i) => `[Report Excerpt ${i + 1}]\n${c.text}`).join('\n\n');
          }
        }

        // 2. Extract high-level summary of report to include in system instruction
        let reportSummary = '';
        if (activeReport?.description) {
          const summaryMatch = activeReport.description.match(/(?:Summary|सारांश):\s*([\s\S]*?)(?:\n\n|\n\d\.|\n\*\*|$)/i);
          reportSummary = summaryMatch ? summaryMatch[1].trim() : activeReport.description.substring(0, 300);
        }

        const systemPrompt = `You are a medical educator and helpful AI assistant helping the user.
The user can talk to you in English, Hinglish, Marathi-English, Marathi, Hindi, or any language or code-switching mixture.
You must understand whatever language they type in, and reply naturally in the same language, dialect, or style they are using.

${chatLangInstruction}

CONCISENESS REQUIREMENT:
- Do NOT output long paragraphs, repeating information, or summaries of the entire report.
- Provide short, extremely specific, direct answers to EXACTLY what the user is asking.
- Keep your answers under 3-4 lines or a very short, bulleted list. Be extremely direct and concise!
- NEVER output markdown or HTML tables. Instead, always write structured values as normal text lists, bullet points, or paragraphs so they fit the narrow mobile screens naturally.

Provide clear, supportive, helpful answers. Suggest treatments, remedies, or drug details if the user asks for them, and answer all off-topic or general questions naturally.

Patient Personal Memory Background (Known History/Allergies/Conditions):
${userMemory && userMemory.length > 0 ? userMemory.map(m => `- ${m}`).join('\n') : '- No historical health memory recorded.'}

Overall Report Summary:
${reportSummary ? `- ${reportSummary}` : 'No report uploaded.'}

Relevant Details from the Medical Report:
---
${RAGContext || "No additional relevant details found."}
---

Answer the user's questions helpfuly based on this context and patient memory.`;

        // Token Optimization: Limit the chat history sent to the model
        const recentMessages = updatedMessages.slice(-6);

        content = await callAI(provider, model, systemPrompt, recentMessages);
        
        // Save the successful AI reply into cache for later reuse
        await saveToCache(text, content, provider);
      }

      const finalMessages: Message[] = [...updatedMessages, { role: 'assistant', content: content }];
      setChatMessages(finalMessages);
      
      // Quota Protection: Remove base64 data for large attachments from persistent chat history
      const sanitizedMessages = finalMessages.map(m => {
        if (m.image && m.image.length > 500000) {
          return {
            ...m,
            image: undefined,
            content: m.content + " (Attachment omitted from chat history to save space)"
          };
        }
        return m;
      });
      localStorage.setItem(`pocket_ai_${username}_chats`, JSON.stringify(sanitizedMessages));
    } catch (error: any) {
      console.error(error);
      if (error.message?.startsWith('USER_RATE_LIMIT_EXCEEDED:')) {
        const waitTime = error.message.replace('USER_RATE_LIMIT_EXCEEDED: ', '');
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ **Request Limit Reached**

You have reached your request limit (maximum **5 per minute** and **20 per day**).

Please try again in **${waitTime}**.`
        }]);
      } else {
        const isQuotaError = error.message?.toLowerCase().includes('quota') ||
                             error.message?.toLowerCase().includes('limit') ||
                             error.message?.toLowerCase().includes('429');

        if (isQuotaError) {
          const now = new Date();
          const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
          const diffHourMs = nextHour.getTime() - now.getTime();
          const hourMins = Math.ceil(diffHourMs / (1000 * 60));

          const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
          const diffDayMs = nextMidnight.getTime() - now.getTime();
          const dayHours = Math.floor(diffDayMs / (1000 * 60 * 60));
          const dayMins = Math.floor((diffDayMs % (1000 * 60 * 60)) / (1000 * 60));

          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `⚠️ **AI Quota Limit Exceeded**
            
- Hourly rate limit resets in: **0 hours, ${hourMins} minutes**
- Daily quota resets in: **${dayHours} hours, ${dayMins} minutes**

To continue, please update your Gemini or NVIDIA API key in the **Settings** menu.`
          }]);
        } else {
          const rawMsg = error.message || "";
          const cleanMsg = rawMsg.length > 120 ? rawMsg.substring(0, 117) + "..." : rawMsg;
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `Error: ${cleanMsg || "Network error. Please check your internet connection."}`
          }]);
        }
      }
    } finally {
      setChatLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (chatMessages.length === 0 || chatLoading || !username) return;
    
    const lastMsg = chatMessages[chatMessages.length - 1];
    let thread = [...chatMessages];
    if (lastMsg.role === 'assistant') {
      thread.pop();
    }
    
    setChatMessages(thread);
    const lastUserText = thread[thread.length - 1]?.content;
    if (lastUserText) {
      thread.pop();
      setChatMessages(thread);
      handleSendMessage(lastUserText);
    }
  };

  const handleResumeConversation = (reportId: string, messages: Message[]) => {
    if (reportId !== 'general') {
      const matchedReport = recentReports.find(r => r.id === reportId);
      if (matchedReport) {
        setActiveReport({
          id: matchedReport.id,
          fileName: matchedReport.fileName,
          description: matchedReport.description
        });
      }
    } else {
      setActiveReport(null);
    }
    setChatMessages(messages);
    setActiveTab('chat');
  };

  const handleClearAll = async () => {
    if (!username) return;
    if (window.confirm(t.clearHistoryConfirm)) {
      // Clear logged in user specific items
      localStorage.removeItem(`pocket_ai_${username}_reports`);
      localStorage.removeItem(`pocket_ai_${username}_memory`);
      localStorage.removeItem(`pocket_ai_${username}_chats`);
      localStorage.removeItem(`pocket_ai_${username}_chat_history`);
      await clearUserChunks(username).catch(console.error);
      setRecentReports([]);
      setChatMessages([]);
      setChatHistory([]);
      setUserMemory([]);
      setActiveReport(null);
      alert(t.clearHistorySuccess);
    }
  };

  // Switch profiles trigger (Logs out current username)
  const handleLogout = () => {
    setUsername(null);
    localStorage.removeItem('pocket_ai_active_user');
    setRecentReports([]);
    setChatMessages([]);
    setUserMemory([]);
    setActiveReport(null);
    setActiveTab('home');
  };

  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-200 shadow-2xl overflow-hidden relative">
      
      {/* API Key configuration overlay */}
      {!apiKey && (
        <ApiKeyModal onSave={(key) => setApiKey(key)} />
      )}

      {/* Onboarding Dialog Modal */}
      {apiKey && (!language || !username) && (
        <LanguageSelector onComplete={handleOnboardingComplete} />
      )}

      {/* Privacy Notice Alert Modal */}
      {showPrivacyAlert && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-4 shadow-2xl flex flex-col items-center text-center animate-in scale-in duration-300">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0">
              <span className="text-xl">🔒</span>
            </div>
            
            <div className="space-y-4 text-left w-full">
              {/* English Version */}
              <div className="space-y-1 pb-3 border-b border-[var(--border-subtle)]">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-primary)]">Data Privacy & Security</h4>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">
                  We value your privacy: we do not collect, store, or sell any of your health or personal data. Please note that all medical report analysis and queries are processed directly by **Google Gemini**.
                </p>
              </div>

              {/* Marathi Version */}
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-primary)]">डेटा गोपनीयता आणि सुरक्षितता</h4>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">
                  आम्ही तुमच्या गोपनीयतेचा आदर करतो: आम्ही तुमचा कोणताही आरोग्य किंवा वैयक्तिक डेटा संकलित करत नाही, साठवून ठेवत नाही किंवा विकत नाही. कृपया नोंद घ्या की सर्व वैद्यकीय अहवाल विश्लेषण आणि प्रश्न थेट **Google Gemini** द्वारे प्रक्रियेसाठी पाठवले जातात.
                </p>
              </div>
            </div>

            <button
              onClick={handleAcceptPrivacy}
              className="w-full py-3 rounded-2xl bg-[var(--accent-primary)] hover:opacity-95 text-white font-extrabold text-xs transition-all active:scale-[0.98] shadow-lg shadow-[var(--accent-primary)]/20"
            >
              I Understand / मला समजले
            </button>
          </div>
        </div>
      )}

      {/* Primary body viewport */}
      <main className="flex-1 overflow-hidden p-0 pb-16 print:p-0 relative z-10 flex flex-col">
        {activeTab === 'home' && username && (
          <ReportAnalyzer
            t={t}
            language={language || 'en'}
            onAnalysisComplete={handleAnalysisComplete}
            recentReports={recentReports}
            onSelectReport={handleSelectReport}
            activeReport={null}
            onNavigateToChat={() => setActiveTab('chat')}
            userMemory={userMemory}
            provider={provider}
            model={model}
            username={username}
            onLoadingStateChange={setIsReportGenerating}
          />
        )}
        
        {activeTab === 'chat' && username && (
          <ChatInterface
            t={t}
            language={language || 'en'}
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            onRegenerate={handleRegenerate}
            loading={chatLoading}
            hasActiveReport={!!activeReport}
            chatHistory={chatHistory}
            onResumeConversation={handleResumeConversation}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}



        {activeTab === 'settings' && username && (
          <Settings
            t={t}
            language={language || 'en'}
            setLanguage={handleSelectLanguage}
            onClearAll={handleClearAll}
            userMemory={userMemory}
            onAddMemory={handleAddMemory}
            onDeleteMemory={handleDeleteMemory}
            username={username}
            onLogout={handleLogout}
            fullNvidiaMode={fullNvidiaMode}
            onToggleNvidiaMode={handleToggleNvidiaMode}
          />
        )}
      </main>

      {/* Bottom Nav anchored inside frame wrapper absolute position */}
      <nav className={`absolute bottom-0 left-0 right-0 bg-[var(--bg-surface)] backdrop-blur-md border-t border-[var(--border-subtle)] py-2.5 px-6 flex items-center justify-around z-30 shadow-lg print:hidden transition-all duration-300 ${
        isReportGenerating ? 'opacity-40 pointer-events-none' : ''
      }`}>
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition-all ${
            activeTab === 'home'
              ? 'text-[var(--accent-primary)] transform scale-105'
              : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
          }`}
        >
          <Home className="w-4.5 h-4.5" />
          <span>{t.homeTab}</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition-all ${
            activeTab === 'chat'
              ? 'text-[var(--accent-primary)] transform scale-105'
              : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
          }`}
        >
          <MessageSquare className="w-4.5 h-4.5" />
          <span>{t.chatTab}</span>
        </button>



        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition-all ${
            activeTab === 'settings'
              ? 'text-[var(--accent-primary)] transform scale-105'
              : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
          }`}
        >
          <SettingsIcon className="w-4.5 h-4.5" />
          <span>{t.settingsTab}</span>
        </button>
      </nav>

    </div>
  );
}

export default App;
