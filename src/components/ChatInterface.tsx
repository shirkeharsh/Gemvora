import React, { useRef, useState, useEffect } from 'react';
import { defaultQuestions } from '../translations';
import type { TranslationKeys } from '../translations';
import { Send, Loader2, Sparkles, Bot, Paperclip, X, ArrowDown, RefreshCw, Mic } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import apiKeysConfig from '../config/keys.json';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

interface ChatInterfaceProps {
  t: TranslationKeys;
  language: 'en' | 'mr';
  messages: Message[];
  onSendMessage: (text: string, file?: File) => void;
  onRegenerate: () => void;
  loading: boolean;
  hasActiveReport: boolean;
  chatHistory: { reportId: string; fileName: string; timestamp: string; messages: Message[] }[];
  onResumeConversation: (reportId: string, messages: Message[]) => void;
  onNavigateToSettings?: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  t,
  language,
  messages,
  onSendMessage,
  onRegenerate,
  loading,
  hasActiveReport,
  chatHistory,
  onResumeConversation,
  onNavigateToSettings,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [prevMessageCount, setPrevMessageCount] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice input states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const checkVolumeRequestRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(Date.now());

  // Clean up recording timers/contexts on component unmount
  useEffect(() => {
    return () => {
      if (checkVolumeRequestRef.current !== null) {
        cancelAnimationFrame(checkVolumeRequestRef.current);
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.warn(e));
      }
    };
  }, []);

  const cleanupAudioResources = () => {
    if (checkVolumeRequestRef.current !== null) {
      cancelAnimationFrame(checkVolumeRequestRef.current);
      checkVolumeRequestRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(e => console.warn(e));
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const handleCancelVoice = () => {
    setIsRecording(false);
    setIsTranscribing(false);
    cleanupAudioResources();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  const recognitionRef = useRef<any>(null);
  const speechDetectedRef = useRef<boolean>(false);

  const stopRecordingAndTranscribe = () => {
    setIsRecording(false);
    cleanupAudioResources();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setIsTranscribing(true);
      mediaRecorderRef.current.stop();
    }
  };

  const setupVoiceActivityDetection = (stream: MediaStream, onSilence: () => void) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      lastSoundTimeRef.current = Date.now();

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Sound detected threshold (average > 8)
        if (average > 8) {
          lastSoundTimeRef.current = Date.now();
        }

        // Silence timeout: 2 seconds (2000ms)
        if (Date.now() - lastSoundTimeRef.current > 2000) {
          console.log("Auto-stopping recording due to 2 seconds of silence");
          onSilence();
        } else {
          checkVolumeRequestRef.current = requestAnimationFrame(checkVolume);
        }
      };

      checkVolumeRequestRef.current = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn("Failed to configure voice activity detection:", e);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    const groqKey = apiKeysConfig.groqApiKey || '';
    if (!groqKey) {
      setIsTranscribing(false);
      setVoiceError(
        language === 'mr'
          ? "Groq API की गहाळ आहे. कृपया keys.json मध्ये 'groqApiKey' जोडा."
          : "Groq API key is missing. Please add 'groqApiKey' in keys.json."
      );
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'speech.webm');
      formData.append('model', 'whisper-large-v3');
      // Force Groq Whisper to only transcribe in English, Hindi, and Marathi by providing a steering prompt
      formData.append('prompt', 'Transcribe the audio using English, Hindi, or Marathi only. Ignore or translate any other languages. Examples: "काय करत आहेस", "Mi office la chaloy", "mujhe fever hai", "Explain my blood report".');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Groq Whisper failed: status ${res.status}`);
      }

      const data = await res.json();
      const transcribedText = (data.text || '').trim();

      setIsTranscribing(false);

      if (transcribedText) {
        setInputText(transcribedText);
        // Auto-expand text area height to fit the new text
        setTimeout(() => {
          const textarea = textareaRef.current;
          if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
          }
        }, 50);
      } else {
        setVoiceError(
          language === 'mr'
            ? "आवाज स्पष्ट ऐकू आला नाही. कृपया पुन्हा प्रयत्न करा."
            : "No speech recognized. Please try speaking closer to the mic."
        );
      }
    } catch (err: any) {
      console.error("Groq Whisper transcription error:", err);
      setIsTranscribing(false);
      setVoiceError(err.message || "Failed to transcribe audio. Please try again.");
    }
  };

  const startVoiceRecording = async () => {
    setVoiceError(null);
    audioChunksRef.current = [];
    speechDetectedRef.current = false;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Audio recording is not supported on this browser.");
      }

      // Request microphone permission with echo cancellation, noise suppression, and auto gain control
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // If native SpeechRecognition already populated the input box, we don't need Groq Whisper!
        if (speechDetectedRef.current && inputText.trim().length > 0) {
          setIsTranscribing(false);
          return;
        }

        if (audioChunksRef.current.length === 0) {
          setIsTranscribing(false);
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await handleTranscription(audioBlob);
      };

      recorder.start();
      setIsRecording(true);

      // Start Web Speech API Recognition in parallel for real-time live transcribing in the input box!
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        // Native Indian English (en-IN) handles code-switching Hinglish/Marathi-English wonderfully,
        // while mr-IN handles pure Marathi/Hindi input.
        recognition.lang = language === 'mr' ? 'mr-IN' : 'en-IN';

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const combined = (finalTranscript || interimTranscript).trim();
          if (combined) {
            speechDetectedRef.current = true;
            setInputText(combined);
            // Reset silence VAD timer on speech detection
            lastSoundTimeRef.current = Date.now();
            
            // Adjust textarea height
            const textarea = textareaRef.current;
            if (textarea) {
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
            }
          }
        };

        recognition.onerror = (e: any) => {
          console.warn("Native speech recognition error, falling back to Groq Whisper:", e.error);
        };

        recognition.onend = () => {
          console.log("Native speech recognition ended");
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setupVoiceActivityDetection(stream, () => {
        stopRecordingAndTranscribe();
      });

    } catch (err: any) {
      console.error("Microphone startup failed:", err);
      setVoiceError(
        language === 'mr'
          ? "मायक्रोफोन परवानगी नाकारली किंवा डिव्हाइस सपोर्ट करत नाही."
          : err.message || "Microphone access denied or unsupported device."
      );
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startVoiceRecording();
    }
  };

  // Auto-scroll handler on new messages
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (messages.length > prevMessageCount) {
      // 1. If it's a generated medical report explanation (first message + active report mode),
      // we lock the scroll to the top of the explanation so they can read from the start.
      if (messages.length === 1 && hasActiveReport) {
        el.scrollTop = 0;
        setPrevMessageCount(messages.length);
        return;
      }

      const lastMessage = messages[messages.length - 1];
      const isUserMsg = lastMessage?.role === 'user';
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;

      // 2. Unconditionally scroll down when user sends a message, or if already near bottom
      if (isUserMsg || isNearBottom || messages.length === 1) {
        setTimeout(() => {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth',
          });
        }, 80);
      }
      setPrevMessageCount(messages.length);
    }
  }, [messages, prevMessageCount, hasActiveReport]);

  // Monitor user scrolling to toggle "↓ Go to Bottom" floating button
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 220;
    setShowScrollDown(isScrolledUp);
  };

  const handleScrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(160, textareaRef.current.scrollHeight)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text && !attachedFile) return;
    if (loading) return;

    onSendMessage(text, attachedFile || undefined);
    setInputText('');
    setAttachedFile(null);
    setFilePreview(null);

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, mode: 'photo' | 'file') => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      const mime = file.type.toLowerCase();

      if (mode === 'photo') {
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
        const isImageMime = mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('gif');
        const isAllowedExt = ext ? allowedExtensions.includes(ext) : false;
        
        if (!isImageMime && !isAllowedExt) {
          alert("This file type isn't supported. Please upload a photo or PDF.");
          return;
        }
      } else {
        const isPdfMime = mime === 'application/pdf';
        const isPdfExt = ext === 'pdf';

        if (!isPdfMime && !isPdfExt) {
          alert("This file type isn't supported. Please upload a photo or PDF.");
          return;
        }
      }

      setAttachedFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleRemoveAttachment = () => {
    setAttachedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handlePhotosClick = async () => {
    setShowAttachmentMenu(false);
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await CapacitorCamera.checkPermissions();
        if (status.photos !== 'granted') {
          const request = await CapacitorCamera.requestPermissions({ permissions: ['photos'] });
          if (request.photos === 'granted') {
            photoInputRef.current?.click();
          }
          return;
        }
      } catch (err: any) {
        console.error('Photos permission check failed:', err);
      }
    }
    photoInputRef.current?.click();
  };

  const handleFilesClick = () => {
    setShowAttachmentMenu(false);
    fileInputRef.current?.click();
  };

  const copyTextToClipboard = (text: string, e: React.MouseEvent) => {
    navigator.clipboard.writeText(text).then(() => {
      const btn = e.currentTarget as HTMLButtonElement;
      const originalText = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = originalText; }, 1500);
    });
  };

  const handleBubbleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href === 'action:settings') {
        e.preventDefault();
        onNavigateToSettings?.();
      }
    }
  };

  const suggestedQuestions = defaultQuestions[language] || defaultQuestions.en;

  const renderBubbleContent = (content: string) => {
    // Helper to escape raw HTML characters
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Helper to parse bold and links safely after escaping HTML
    const formatInlineMarkdown = (text: string): string => {
      const escaped = escapeHtml(text);
      const boldFormatted = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return boldFormatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-[#14b8a6] underline font-semibold cursor-pointer">$1</a>');
    };

    const lines = content.split('\n');
    const elements: React.ReactElement[] = [];
    
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];

    const flushTable = (key: string | number) => {
      if (tableHeaders.length === 0 && tableRows.length === 0) return;
      const headers = [...tableHeaders];
      const rows = [...tableRows];
      tableHeaders = [];
      tableRows = [];
      
      elements.push(
        <div key={`table-${key}`} className="w-full overflow-x-auto my-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
                {headers.map((h, i) => (
                  <th key={i} className="p-2 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-150 dark:border-slate-900 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/15">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="p-2 text-slate-700 dark:text-slate-350 whitespace-normal leading-normal">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const flushCodeBlock = (key: string | number) => {
      if (codeLines.length === 0) return;
      const codeText = codeLines.join('\n');
      codeLines = [];
      
      elements.push(
        <div key={`code-${key}`} className="w-full my-3 rounded-xl border border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-zinc-900/50 overflow-hidden">
          {codeLanguage && (
            <div className="px-4 py-1.5 bg-slate-150 dark:bg-zinc-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-250 dark:border-slate-800">
              {codeLanguage}
            </div>
          )}
          <pre className="overflow-x-auto p-4 text-xs font-mono whitespace-pre text-slate-800 dark:text-slate-200 leading-relaxed max-w-full">
            <code>{codeText}</code>
          </pre>
        </div>
      );
    };

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();

      // --- 1. Code Block Parsing ---
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          flushCodeBlock(idx);
        } else {
          if (inTable) {
            inTable = false;
            flushTable(idx);
          }
          inCodeBlock = true;
          codeLanguage = trimmed.substring(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // --- 2. Table Parsing ---
      if (trimmed.startsWith('|')) {
        inTable = true;
        const cols = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (trimmed.includes('---')) continue;

        if (tableHeaders.length === 0) {
          tableHeaders = cols;
        } else {
          tableRows.push(cols);
        }
        continue;
      }

      if (inTable && !trimmed.startsWith('|')) {
        inTable = false;
        flushTable(idx);
      }

      // --- 3. Regular Markdown Parsing ---
      if (trimmed.startsWith('###')) {
        elements.push(
          <h4 key={idx} className="text-sm font-bold text-slate-850 dark:text-slate-250 mt-3 mb-1 break-words">
            {trimmed.substring(3).trim()}
          </h4>
        );
        continue;
      }
      if (trimmed.startsWith('##')) {
        elements.push(
          <h3 key={idx} className="text-base font-bold text-slate-900 dark:text-white mt-4 mb-1.5 border-b border-slate-150 dark:border-slate-800 pb-0.5 break-words">
            {trimmed.substring(2).trim()}
          </h3>
        );
        continue;
      }
      if (trimmed.startsWith('1.') || trimmed.startsWith('2.') || trimmed.startsWith('3.') || trimmed.startsWith('4.') || trimmed.startsWith('5.')) {
        const splitIdx = line.indexOf('.');
        const num = line.substring(0, splitIdx).trim();
        const contentStr = line.substring(splitIdx + 1).trim();
        const formatted = formatInlineMarkdown(contentStr);
        elements.push(
          <div key={idx} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300 my-1.5 leading-relaxed box-border">
            <span className="font-bold text-[#14b8a6] flex-shrink-0">{num}.</span>
            <span className="flex-1 min-w-0 break-words" dangerouslySetInnerHTML={{ __html: formatted }} />
          </div>
        );
        continue;
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const char = trimmed.charAt(0);
        const contentStr = trimmed.substring(1).trim();
        const formatted = formatInlineMarkdown(contentStr);
        elements.push(
          <div key={idx} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300 my-1 leading-relaxed ml-2 box-border">
            <span className="text-[#14b8a6] flex-shrink-0">{char === '-' ? '•' : '•'}</span>
            <span className="flex-1 min-w-0 break-words" dangerouslySetInnerHTML={{ __html: formatted }} />
          </div>
        );
        continue;
      }

      const formatted = formatInlineMarkdown(trimmed);
      elements.push(
        trimmed ? (
          <p key={idx} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-1 break-words" dangerouslySetInnerHTML={{ __html: formatted }} />
        ) : (
          <div key={idx} className="h-1.5" />
        )
      );
    }

    if (inTable) {
      flushTable('end');
    }
    if (inCodeBlock) {
      flushCodeBlock('end');
    }

    return elements;
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-transparent relative">
      
      {/* Sleek Minimal Header */}
      <div className="py-2 px-4 border-b border-slate-150 dark:border-[#1c1c1e] bg-white/70 dark:bg-black/50 backdrop-blur-md flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <div className="w-6.5 h-6.5 rounded-full bg-[#14b8a6]/10 flex items-center justify-center text-[#0d9488] dark:text-[#14b8a6]">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                Gemvora AI
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#1c1c1e] text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                Gemini 2.5 Flash
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {hasActiveReport ? "Report Explainer mode" : "Online"}
              </span>
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-[#1c1c1e] hover:bg-slate-200 dark:hover:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Regenerate</span>
          </button>
        )}
      </div>

      {/* Message List Viewport */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-6 space-y-3.5 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center p-6 space-y-6 text-center">
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="inline-block p-3.5 bg-teal-500/10 text-teal-400 rounded-full animate-bounce mb-1">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                How can Gemvora help you understand?
              </h3>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-normal">
                Ask specific questions about blood test levels, medical codes, prescription acronyms, or overall symptoms.
              </p>
            </div>

            {/* Past Sessions List */}
            {chatHistory && chatHistory.length > 0 && (
              <div className="w-full max-w-md border-t border-slate-150 dark:border-[#1c1c1e] pt-5 space-y-2.5 animate-in fade-in duration-300">
                <h4 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-left">
                  🕒 Resume Past Conversations
                </h4>
                <div className="grid gap-2 max-h-52 overflow-y-auto pr-1">
                  {chatHistory.map((history, idx) => (
                    <button
                      key={idx}
                      onClick={() => onResumeConversation(history.reportId, history.messages)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-150 dark:border-[#1c1c1e] bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-all text-left text-xs"
                    >
                      <div className="overflow-hidden pr-2">
                        <p className="font-bold text-slate-700 dark:text-slate-200 truncate">
                          {history.fileName.length > 25 ? history.fileName.substring(0, 22) + '...' : history.fileName}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                          {history.messages.length} message{history.messages.length !== 1 ? 's' : ''} • {new Date(history.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-[9px] text-[#14b8a6] font-bold flex-shrink-0 uppercase tracking-wide">
                        Resume →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex w-full animate-message ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div className="flex flex-col w-fit max-w-[85%] min-w-0 group">
                <div 
                  className={`bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}
                  onClick={handleBubbleClick}
                >
                  {msg.image && msg.image.startsWith('data:image/') && (
                    <img src={msg.image} alt="uploaded content" className="w-full max-h-48 object-contain rounded-xl mb-2 border border-black/10 dark:border-white/10" />
                  )}
                  {msg.image && msg.image.startsWith('data:application/pdf') && (
                    <div className="flex items-center gap-2.5 p-2.5 bg-slate-250 dark:bg-zinc-800 rounded-xl mb-2">
                      <div className="px-2 py-1 bg-[#14b8a6]/10 text-[#14b8a6] rounded-lg font-bold text-[10px]">
                        PDF
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Medical Report PDF</p>
                        <p className="text-[9px] text-slate-400">Attached to conversation</p>
                      </div>
                    </div>
                  )}
                  {renderBubbleContent(msg.content)}
                </div>

                {/* Bubble Action tags (Sleek on-hover / long-press design) */}
                {msg.role === 'assistant' && (
                  <div className="flex gap-3 text-[10px] text-slate-400 pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 mb-1">
                    <button
                      onClick={(e) => copyTextToClipboard(msg.content, e)}
                      className="hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-0.5 font-bold uppercase tracking-wide text-[9px]"
                      title="Copy response"
                    >
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Premium Thinking indicator */}
        {loading && (
          <div className="flex gap-2.5 max-w-[82%] mr-auto animate-message">
            <div className="p-3.5 rounded-2xl border border-slate-150 dark:border-[#27272a] bg-[#f4f4f5] dark:bg-[#18181b] text-slate-500 rounded-tl-none flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14b8a6] animate-bounce"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#14b8a6] animate-bounce delay-150"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#14b8a6] animate-bounce delay-300"></span>
              <span>Thinking</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Scroll Down button */}
      {showScrollDown && (
        <button 
          onClick={handleScrollToBottom}
          className="scroll-down-anchor animate-in fade-in zoom-in duration-200"
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Floating Composer Area */}
      <div className="p-3 border-t border-slate-150 dark:border-[#1c1c1e] bg-white dark:bg-black">
        
        {attachedFile && (
          <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-zinc-900 rounded-xl relative border border-slate-200 dark:border-zinc-800 mb-2 animate-in fade-in duration-200">
            {filePreview ? (
              <img src={filePreview} alt="attachment" className="w-10 h-10 object-cover rounded-lg border border-slate-350 dark:border-slate-700" />
            ) : (
              <div className="w-10 h-10 bg-[#14b8a6]/10 text-[#14b8a6] rounded-lg flex items-center justify-center font-bold text-[10px]">
                PDF
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{attachedFile.name}</p>
              <p className="text-[9px] text-slate-400">{(attachedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={handleRemoveAttachment}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-red-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Suggested Queries */}
        {messages.length === 0 && (
          <div className="space-y-1 mb-2.5">
            <p className="text-[8.5px] uppercase font-bold tracking-wider text-slate-400">{t.suggestedQuestions}</p>
            <div className="flex flex-wrap gap-1">
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(q)}
                  className="py-1 px-2.5 bg-slate-50 dark:bg-zinc-900/60 border border-slate-150 dark:border-[#1c1c1e] rounded-full text-[11px] hover:border-[#14b8a6] hover:text-[#14b8a6] transition-all font-medium text-slate-600 dark:text-slate-400"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice Input States / Waveform Animation */}
        {(isRecording || isTranscribing || voiceError) && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 mb-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-250">
            <div className="flex items-center gap-2">
              {isRecording && (
                <>
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                  <span className="text-slate-700 dark:text-slate-350">Listening...</span>
                  <div className="flex items-end gap-0.5 h-3">
                    <span className="w-0.5 bg-red-500 animate-[pulse_0.4s_infinite_alternate]" style={{ height: '60%' }} />
                    <span className="w-0.5 bg-red-500 animate-[pulse_0.6s_infinite_alternate_0.2s]" style={{ height: '100%' }} />
                    <span className="w-0.5 bg-red-500 animate-[pulse_0.5s_infinite_alternate_0.1s]" style={{ height: '40%' }} />
                    <span className="w-0.5 bg-red-500 animate-[pulse_0.7s_infinite_alternate_0.3s]" style={{ height: '80%' }} />
                  </div>
                </>
              )}
              {isTranscribing && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-orange-500 flex-shrink-0" />
                  <span className="text-slate-700 dark:text-slate-350">Transcribing...</span>
                </>
              )}
              {voiceError && (
                <>
                  <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                  <span className="text-red-500 font-semibold text-[10px]">{voiceError}</span>
                </>
              )}
            </div>
            
            {(isRecording || isTranscribing) && (
              <button
                type="button"
                onClick={handleCancelVoice}
                className="text-[9px] text-red-500 hover:text-red-600 font-bold uppercase tracking-wider py-0.5 px-2 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-all"
              >
                Cancel
              </button>
            )}
            {voiceError && (
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Composer Form */}
        <form onSubmit={handleSend} className="imessage-input-wrapper">
          <button
            type="button"
            onClick={() => setShowAttachmentMenu(true)}
            className="p-1.5 mb-0.5 text-slate-400 hover:text-[#14b8a6] transition-colors rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 flex-shrink-0"
            title="Attach file or image"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          
          <input
            type="file"
            ref={photoInputRef}
            onChange={(e) => handleFileSelect(e, 'photo')}
            accept="image/jpeg,image/png,image/webp,image/heic,image/jpg"
            className="hidden"
          />
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileSelect(e, 'file')}
            accept="application/pdf"
            className="hidden"
          />

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t.chatPlaceholder}
            disabled={loading}
            className="composer-textarea outline-none focus:outline-none py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-xs placeholder-slate-400 disabled:opacity-50"
          />

          {/* Voice Input Microphone Button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={loading}
            className={`p-1.5 mb-0.5 rounded-lg transition-all flex-shrink-0 relative ${
              isRecording 
                ? 'bg-red-500/20 text-red-500 border border-red-500/30' 
                : isTranscribing 
                ? 'bg-orange-500/20 text-orange-500 animate-pulse border border-orange-500/30' 
                : 'text-slate-400 hover:text-[#14b8a6] hover:bg-slate-200 dark:hover:bg-zinc-800'
            }`}
            title={isRecording ? "Stop Recording" : "Voice Input"}
          >
            {isTranscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isRecording ? (
              <div className="w-3.5 h-3.5 flex items-center justify-center">
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75 animate-ping"></span>
                <Mic className="w-3.5 h-3.5 relative z-10 text-red-600 dark:text-red-400" />
              </div>
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="submit"
            disabled={(!inputText.trim() && !attachedFile) || loading}
            className="imessage-send-btn flex-shrink-0 mb-0.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>

      {/* ChatGPT-style Attachment Bottom Sheet Modal */}
      {showAttachmentMenu && (
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200" 
          onClick={() => setShowAttachmentMenu(false)}
        >
          <div 
            className="w-full bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] rounded-t-[28px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300 shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mb-1"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] pl-1">
              Attach content
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              <button 
                type="button"
                onClick={handlePhotosClick} 
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)]/15 text-left transition-all active:scale-[0.99]"
              >
                <span className="text-xl">📷</span>
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Photos</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wide">Upload images (JPG, PNG, WEBP, HEIC)</span>
                </div>
              </button>
              <button 
                type="button"
                onClick={handleFilesClick} 
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)]/15 text-left transition-all active:scale-[0.99]"
              >
                <span className="text-xl">📄</span>
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Files</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wide">Upload PDF documents only</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
