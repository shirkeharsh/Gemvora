import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import apiKeysConfig from '../config/keys.json';

// A drop-in universal fetch replacement that uses CapacitorHttp on native (bypassing CORS) and browser fetch on web
export const universalFetch = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}> => {
  if (Capacitor.isNativePlatform()) {
    let data: any = undefined;
    if (options.body) {
      try {
        data = JSON.parse(options.body);
      } catch (e) {
        data = options.body;
      }
    }

    const response = await CapacitorHttp.request({
      url,
      method: options.method || 'GET',
      headers: options.headers,
      data: data
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.data,
      text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    };
  }

  // Browser fetch fallback
  const res = await fetch(url, options);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json(),
    text: () => res.text()
  };
};

export const getStoredNvidiaApiKey = (): string => {
  return apiKeysConfig.nvidiaApiKey || '';
};

export const getActiveGeminiApiKey = (): { key: string; index: number } => {
  const keys = apiKeysConfig.geminiApiKeys || [];
  const validKeys = keys.filter(k => k && !k.includes('Placeholder'));
  if (validKeys.length === 0) {
    if (keys.length > 0) return { key: keys[0], index: 0 };
    throw new Error('No Gemini API keys configured in keys.json');
  }

  const cooldowns = JSON.parse(localStorage.getItem('pocket_ai_gemini_keys_cooldown') || '{}');
  const now = Date.now();

  // Find the first key that is not on cooldown
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key || key.includes('Placeholder')) continue;
    const cooldownExpiry = cooldowns[key];
    if (!cooldownExpiry || cooldownExpiry < now) {
      return { key, index: i };
    }
  }

  // If all valid keys are on cooldown, reset cooldowns
  localStorage.removeItem('pocket_ai_gemini_keys_cooldown');
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key && !key.includes('Placeholder')) return { key, index: i };
  }

  return { key: keys[0], index: 0 };
};

export const markGeminiKeyOnCooldown = async (key: string, index: number) => {
  const cooldowns = JSON.parse(localStorage.getItem('pocket_ai_gemini_keys_cooldown') || '{}');
  cooldowns[key] = Date.now() + 3600 * 1000; // 1 hour cooldown
  localStorage.setItem('pocket_ai_gemini_keys_cooldown', JSON.stringify(cooldowns));
  await postLog('warn', `Gemini key at index ${index} put on cooldown due to quota limit.`);
};

export const handleQuotaLimitExceeded = async (providerName: string) => {
  const msg = `${providerName} API quota has been exceeded! Please check your API keys configuration in code.`;
  await postLog('error', msg);
  
  // Show browser alert backup
  alert(msg);

  try {
    if (Capacitor.isNativePlatform()) {
      const hasPerm = await LocalNotifications.checkPermissions();
      if (hasPerm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '⚠️ AI Quota Limit Exceeded',
            body: `${providerName} API quota limit hit. Please update keys in keys.json.`,
            id: Date.now() % 100000,
            schedule: { at: new Date(Date.now() + 500) }
          }
        ]
      });
    }
  } catch (err) {
    console.error('Capacitor LocalNotifications failed', err);
  }
};

export type AIProvider = 'gemini';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64 data URL
}

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended)' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ]
  }
};

export const getDefaultModelForProvider = (provider: AIProvider): string => {
  return PROVIDERS[provider].models[0].id;
};

export const getApiKeyName = (provider: AIProvider): string => {
  return `pocket_ai_global_${provider}_api_key`;
};

export const getStoredApiKey = (_provider: AIProvider): string => {
  try {
    const { key } = getActiveGeminiApiKey();
    return key;
  } catch (e) {
    return '';
  }
};

export const postLog = async (level: 'info' | 'warn' | 'error' | 'ocr', message: string) => {
  console.log(`[${level.toUpperCase()}] ${message}`);
  try {
    await universalFetch('http://localhost:5174/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message
      })
    });
  } catch (err) {
    // Ignore log failures in production/native
  }
};

export const isFullNvidiaMode = (): boolean => {
  const activeUser = localStorage.getItem('pocket_ai_active_user');
  if (activeUser) {
    return localStorage.getItem(`pocket_ai_${activeUser}_full_nvidia_mode`) === 'true';
  }
  return localStorage.getItem('pocket_ai_global_full_nvidia_mode') === 'true';
};

export const callAI = async (
  _provider: AIProvider,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  temperature = 0.5,
  signal?: AbortSignal
): Promise<string> => {
  // Offline Mock Mode check
  if (localStorage.getItem('pocket_ai_mock_mode') === 'true') {
    await new Promise(resolve => setTimeout(resolve, 800)); // simulate network latency
    
    // Determine context (report summary analysis vs chat conversation)
    const isReportAnalysis = systemPrompt.toLowerCase().includes('medical educator') || 
                             systemPrompt.toLowerCase().includes('report explainer');
                             
    if (isReportAnalysis) {
      return `Disclaimer: This AI explanation is for educational purposes only and is not a medical diagnosis or treatment plan. Please consult a qualified healthcare professional for medical care.

# Medical Report Mock Analysis

**Summary**:
This is a mock clinical report analysis returned in Offline Demo Mode. All parameters have been parsed successfully.

**Key Findings & Values**:
- **Hemoglobin**: 14.2 g/dL (Reference Range: 12.0 - 16.0) [Normal]
- **Total Cholesterol**: 185 mg/dL (Reference Range: < 200) [Normal]
- **Blood Glucose (Fasting)**: 92 mg/dL (Reference Range: 70 - 100) [Normal]

**Important Observations & Detailed Parameter Breakdown**:
- Fasting Blood Sugar (Glucose) is 92 mg/dL, which is perfectly within the normal range.
- Cholesterol is 185 mg/dL, showing good cardiovascular health.

**Actionable Insights & Lifestyle Suggestions**:
- Continue eating a balanced diet and exercising regularly.

**Next Steps & Questions for Your Doctor**:
- Review these results at your next routine checkup.

Disclaimer: This AI explanation is for educational purposes only and is not a medical diagnosis or treatment plan. Please consult a qualified healthcare professional for medical care.

[MEMORY_POINTS]
- Normal Hemoglobin
- Healthy Cholesterol
- Normal Glucose
[/MEMORY_POINTS]`;
    } else {
      return "Offline Mock Mode: Simulated clinical answer. This is a local mock reply for testing UI layouts.";
    }
  }

  if (isFullNvidiaMode()) {
    await postLog('info', 'Full NVIDIA Mode active. Routing call to NVIDIA Maverick NIM...');
    const isNative = Capacitor.isNativePlatform();
    const endpoint = isNative 
      ? 'https://integrate.api.nvidia.com/v1/chat/completions' 
      : '/api-nvidia/v1/chat/completions';
      
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }))
    ];

    const response = await universalFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getStoredNvidiaApiKey()}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta/llama-4-maverick-17b-128e-instruct',
        messages: formattedMessages,
        max_tokens: 2048,
        temperature,
        stream: false
      }),
      signal
    });

    if (response.status === 429) {
      await handleQuotaLimitExceeded('NVIDIA NIM');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `NVIDIA NIM returned status ${response.status}`;
      await postLog('error', `NVIDIA NIM Call failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      const errorMsg = 'No response generated by NVIDIA Maverick NIM.';
      await postLog('error', errorMsg);
      throw new Error(errorMsg);
    }
    await postLog('info', 'NVIDIA NIM successfully generated response.');
    return content;
  }

  // Google Gemini Pipeline with Auto-Rotation
  const keys = apiKeysConfig.geminiApiKeys || [];
  let attempts = 0;
  const maxAttempts = Math.max(1, keys.filter(k => k && !k.includes('Placeholder')).length);

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError');
    }

    let activeKeyObj;
    try {
      activeKeyObj = getActiveGeminiApiKey();
    } catch (e: any) {
      throw new Error(e.message || 'No valid Gemini API keys found.');
    }

    const { key, index } = activeKeyObj;
    await postLog('info', `Attempting Gemini call using key index ${index}...`);

    try {
      // Construct Gemini structure
      const contents = messages.map(msg => {
        const parts: any[] = [];
        if (msg.image) {
          const match = msg.image.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            });
          }
        }
        parts.push({ text: msg.content });
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const isNative = Capacitor.isNativePlatform();
      const baseUrl = isNative ? 'https://generativelanguage.googleapis.com' : '/api-gemini';
      const response = await universalFetch(
        `${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              temperature,
              maxOutputTokens: 8192
            }
          }),
          signal
        }
      );

      if (response.status === 429) {
        await postLog('warn', `Gemini API hit status 429 at index ${index}. Rotating key.`);
        await markGeminiKeyOnCooldown(key, index);
        attempts++;
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `Gemini API returned status ${response.status}`;
        
        const isQuotaErr = errorMsg.toLowerCase().includes('quota') || 
                           errorMsg.toLowerCase().includes('limit') || 
                           errorMsg.toLowerCase().includes('exhausted') ||
                           errorMsg.toLowerCase().includes('429');
                           
        if (isQuotaErr) {
          await postLog('warn', `Gemini API returned quota error at index ${index}. Rotating key.`);
          await markGeminiKeyOnCooldown(key, index);
          attempts++;
          continue;
        }

        await postLog('error', `Gemini API Call failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        const errorMsg = 'No response generated by Gemini.';
        await postLog('error', errorMsg);
        throw new Error(errorMsg);
      }
      
      await postLog('info', `Google Gemini index ${index} successfully generated response.`);
      return content;

    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Aborted by user') {
        throw err;
      }
      
      const isQuotaErr = err.message?.toLowerCase().includes('quota') || 
                         err.message?.toLowerCase().includes('limit') || 
                         err.message?.toLowerCase().includes('429');
                         
      if (isQuotaErr) {
        await postLog('warn', `Caught rate limit exception for index ${index}. Rotating key.`);
        await markGeminiKeyOnCooldown(key, index);
        attempts++;
        continue;
      }

      throw err;
    }
  }

  throw new Error('All configured Gemini API keys are currently exhausted (on cooldown). Please try again later.');
};

export const nvidiaOCR = async (base64Image: string, signal?: AbortSignal): Promise<string> => {
  await postLog('info', 'Starting NVIDIA Maverick OCR transcription for image...');
  const isNative = Capacitor.isNativePlatform();
  const endpoint = isNative 
    ? 'https://integrate.api.nvidia.com/v1/chat/completions' 
    : '/api-nvidia/v1/chat/completions';
    
  const response = await universalFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getStoredNvidiaApiKey()}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: 'meta/llama-4-maverick-17b-128e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe all text from this medical report image. Extract all parameters, values, reference ranges, and units precisely. Do not explain them or add conversational intros/outros. Return only the raw text findings.'
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image
              }
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1,
      top_p: 1.0,
      stream: false
    }),
    signal
  });

  if (response.status === 429) {
    await handleQuotaLimitExceeded('NVIDIA NIM');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `NVIDIA NIM OCR returned status ${response.status}`;
    await postLog('error', `NVIDIA NIM OCR failed: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const errorMsg = 'NVIDIA NIM OCR failed to transcribe the image.';
    await postLog('error', errorMsg);
    throw new Error(errorMsg);
  }
  await postLog('ocr', `NVIDIA Maverick OCR successfully transcribed ${content.length} characters.`);
  return content;
};

export const loadPdfJS = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjs);
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  await postLog('info', 'Loading PDF.js from CDN to extract text...');
  const pdfjs = await loadPdfJS();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  await postLog('info', `PDF loaded. Total pages: ${pdf.numPages}. Starting local text extraction...`);
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += `[Page ${i}]\n${pageText}\n\n`;
  }

  await postLog('info', `Local PDF text extraction complete. Total characters: ${fullText.length}`);
  return fullText;
};

// Generates RAG chunks from text
export const chunkText = (text: string, chunkSize = 800, overlap = 150): string[] => {
  const chunks: string[] = [];
  if (!text) return chunks;
  
  let index = 0;
  while (index < text.length) {
    let end = index + chunkSize;
    if (end > text.length) {
      end = text.length;
    }
    
    // Adjust boundaries to avoid splitting sentences/words if possible
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const boundary = Math.max(lastPeriod, lastNewline);
      if (boundary > index + chunkSize - overlap) {
        end = boundary + 1;
      }
    }
    
    const chunk = text.substring(index, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    
    index = end - overlap;
    if (index >= text.length || end === text.length) {
      break;
    }
    if (index < 0 || index === end) {
      index = end;
    }
  }
  return chunks;
};

// Call Gemini Embeddings API
export const getEmbedding = async (text: string, provider: AIProvider, signal?: AbortSignal): Promise<number[]> => {
  if (localStorage.getItem('pocket_ai_mock_mode') === 'true' || isFullNvidiaMode()) {
    // Zero vector fallback to bypass Gemini Embeddings
    return new Array(3072).fill(0);
  }

  const apiKey = getStoredApiKey(provider);
  if (!apiKey) {
    throw new Error('API Key is missing for embeddings');
  }
  const isNative = Capacitor.isNativePlatform();
  const baseUrl = isNative ? 'https://generativelanguage.googleapis.com' : '/api-gemini';
  const response = await universalFetch(
    `${baseUrl}/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        }
      }),
      signal
    }
  );

  if (response.status === 429) {
    await handleQuotaLimitExceeded('Google Gemini');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Embedding API status ${response.status}`);
  }

  const data = await response.json();
  const embedding = data.embedding?.values;
  if (!embedding) {
    throw new Error('No embedding vector returned');
  }
  return embedding;
};

export const getEmbeddingsForChunks = async (
  chunks: string[],
  provider: AIProvider,
  signal?: AbortSignal
): Promise<number[][]> => {
  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    try {
      const emb = await getEmbedding(chunk, provider, signal);
      embeddings.push(emb);
    } catch (e) {
      await postLog('warn', `Failed to get embedding for chunk: ${e}. Using empty embedding fallback.`);
      embeddings.push([]);
    }
  }
  return embeddings;
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'minute' | 'day';
  waitTimeMs: number;
}

export const checkUserRateLimit = (
  username: string
): RateLimitResult => {
  const key = `pocket_ai_${username}_request_timestamps`;
  const now = Date.now();
  
  let timestamps: number[] = [];
  try {
    timestamps = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    timestamps = [];
  }
  
  const oneDayMs = 24 * 60 * 60 * 1000;
  const validTimestamps = timestamps.filter(t => now - t < oneDayMs);
  
  // 1. Check 24-hour limit (20 requests)
  if (validTimestamps.length >= 20) {
    const oldestInDay = validTimestamps[0];
    const waitTimeMs = oneDayMs - (now - oldestInDay);
    return { allowed: false, reason: 'day', waitTimeMs };
  }
  
  // 2. Check 1-minute limit (5 requests)
  const oneMinMs = 60 * 1000;
  const minuteTimestamps = validTimestamps.filter(t => now - t < oneMinMs);
  if (minuteTimestamps.length >= 5) {
    const oldestInMin = minuteTimestamps[0];
    const waitTimeMs = oneMinMs - (now - oldestInMin);
    return { allowed: false, reason: 'minute', waitTimeMs };
  }
  
  // Under limit, record this request
  validTimestamps.push(now);
  localStorage.setItem(key, JSON.stringify(validTimestamps));
  return { allowed: true, waitTimeMs: 0 };
};

export const checkIsMedicalDocument = async (text: string, signal?: AbortSignal): Promise<boolean> => {
  await postLog('info', 'Checking if document contains medical information via NVIDIA...');
  const isNative = Capacitor.isNativePlatform();
  const endpoint = isNative 
    ? 'https://integrate.api.nvidia.com/v1/chat/completions' 
    : '/api-nvidia/v1/chat/completions';
    
  const systemPrompt = `You are a medical document classifier. Your job is to analyze the provided text and determine if it represents a medical report, blood test, clinical lab result, doctor prescription, medical scan, or health-related document.
If the text contains clinical terms, health parameters, patient statistics, lab metrics, doctor instructions, or medical info, respond with EXACTLY "YES".
If the text is random, a photo of objects, animals, landscapes, code, or anything completely unrelated to a patient medical/clinical document, respond with EXACTLY "NO".
Do not output any other words, punctuation, or explanation. Only output "YES" or "NO".`;

  const userContent = `Text to analyze:\n"""\n${text.substring(0, 3000)}\n"""`;

  try {
    const response = await universalFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getStoredNvidiaApiKey()}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta/llama-4-maverick-17b-128e-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 5,
        temperature: 0.1,
        stream: false
      }),
      signal
    });

    if (!response.ok) {
      await postLog('warn', `NVIDIA validation check failed with status ${response.status}. Defaulting to true.`);
      return true;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    await postLog('info', `NVIDIA medical validation response: "${content}"`);

    return content.toUpperCase().includes('NO') ? false : true;
  } catch (e) {
    await postLog('warn', `Error during NVIDIA validation: ${e}. Defaulting to true.`);
    return true;
  }
};

