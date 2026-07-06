import React, { useState } from 'react';
import { Loader2, ExternalLink, Globe, Activity, Shield, Info } from 'lucide-react';

interface ApiKeyModalProps {
  onSave: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave }) => {
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideLang, setGuideLang] = useState<'en' | 'mr'>('en');
  const [redirected, setRedirected] = useState(false);

  const handleValidateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${key}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        localStorage.setItem('pocket_ai_global_gemini_api_key', key);
        onSave(key);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(
          guideLang === 'en'
            ? errData.error?.message || 'Invalid API Key. Please make sure it is correct.'
            : 'अवैध API की. कृपया ती बरोबर असल्याची खात्री करा.'
        );
      }
    } catch (err) {
      console.error(err);
      setError(
        guideLang === 'en'
          ? 'Network error. Please check your internet connection and try again.'
          : 'नेटवर्क त्रुटी. कृपया तुमचे इंटरनेट कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setKeyInput(text.trim());
        setError(null);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      setError(
        guideLang === 'en'
          ? 'Clipboard paste permission denied. Please paste manually.'
          : 'क्लिपबोर्डवरून पेस्ट करण्याची परवानगी नाकारली. कृपया स्वतः पेस्ट करा.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[32px] p-6 max-w-sm w-full shadow-2xl animate-message my-8">
        
        {/* Title Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-[var(--accent-glow)] text-[var(--accent-primary)] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Gemvora
          </h2>
          <p className="text-[10px] text-[var(--accent-primary)] font-bold tracking-wide uppercase mt-0.5">
            🩺 Your Personal Medical Explainer
          </p>
        </div>

        {/* Language Tabs */}
        <div className="bg-[var(--bg-surface-variant)] p-1 rounded-2xl flex gap-1 mb-4 border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setGuideLang('en')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              guideLang === 'en'
                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>English</span>
          </button>
          <button
            type="button"
            onClick={() => setGuideLang('mr')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              guideLang === 'mr'
                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>मराठी</span>
          </button>
        </div>

        {!redirected ? (
          <div className="space-y-4 animate-message">
            <div className="bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-xl p-3.5 text-xs text-[var(--text-secondary)] space-y-2 leading-relaxed">
              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1 border-b border-[var(--border-subtle)] pb-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>
                  {guideLang === 'en' ? 'Get Your Free Gemini API Key:' : 'मोफत गुगल एआय की मिळवा:'}
                </span>
              </div>
              <p>
                {guideLang === 'en' 
                  ? 'To run AI diagnostics locally and securely on your phone, you need a free API key from Google.'
                  : 'तुमच्या फोनवर सुरक्षितपणे एआय चालवण्यासाठी गुगलकडून मोफत एआय की मिळवणे आवश्यक आहे.'}
              </p>
              <ul className="space-y-1 pl-1 list-disc list-inside">
                <li>{guideLang === 'en' ? 'Sign in with your Gmail.' : 'जीमेलने लॉग इन करा.'}</li>
                <li>{guideLang === 'en' ? 'Click "Create API Key".' : '"Create API Key" निवडून प्रोजेक्टमध्ये की तयार करा.'}</li>
              </ul>
            </div>

            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setKeyInput('');
                localStorage.removeItem('pocket_ai_global_gemini_api_key');
                setRedirected(true);
              }}
              className="w-full py-3.5 bg-[var(--accent-primary)] hover:opacity-95 text-white rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-[0.98] gap-1.5 text-center"
            >
              <span>{guideLang === 'en' ? '1. Get Free Key from Google' : '१. गूगल वरून की मिळवा'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <form onSubmit={handleValidateAndSave} className="space-y-4 animate-message">
            <div className="bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-xl p-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)] block mb-1">
                {guideLang === 'en' ? 'Step 2: Paste your API Key' : 'पायरी २: तुमची एआय की पेस्ट करा'}
              </strong>
              <p>
                {guideLang === 'en'
                  ? 'Click the button below to paste the key you copied from Google AI Studio.'
                  : 'गूगलवरून कॉपी केलेली की खालील बटणावर क्लिक करून पेस्ट करा.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handlePasteKey}
              className="w-full py-3.5 bg-[var(--accent-glow)] border border-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <span>{guideLang === 'en' ? '📋 Paste Key from Clipboard' : '📋 क्लिपबोर्डवरून की पेस्ट करा'}</span>
            </button>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-1">
                {guideLang === 'en' ? 'Manual Input Backup:' : 'मॅन्युअल इनपुट बॅकअप:'}
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-2xl py-3 px-4 outline-none text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] transition-all placeholder:text-xs placeholder:text-[var(--text-muted)]"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-semibold text-center leading-relaxed">
                ⚠️ {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <button
                type="submit"
                disabled={!keyInput.trim() || loading}
                className="w-full py-3.5 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    <span>{guideLang === 'en' ? 'Validating API Key...' : 'किल्ली तपासून पाहत आहे...'}</span>
                  </>
                ) : (
                  <span>{guideLang === 'en' ? 'Save & Continue' : 'जतन करा आणि पुढे जा'}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRedirected(false)}
                className="w-full py-2 border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-variant)] text-[var(--text-muted)] rounded-2xl text-[10px] font-bold transition-all"
              >
                {guideLang === 'en' ? '← Back to Instructions' : '← सूचनांवर परत जा'}
              </button>
            </div>
          </form>
        )}

        {/* Security / Privacy notes block */}
        <div className="p-3 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex gap-2 items-start leading-normal mt-5 animate-message">
          <Shield className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
          <div>
            <strong className="text-[var(--text-primary)] block font-bold">100% Private & Secure:</strong> Gemvora processes medical reports directly on your device. We do not store your files on any cloud servers.
          </div>
        </div>

        <div className="mt-5 text-center border-t border-[var(--border-subtle)] pt-4">
          <p className="text-[9px] text-[var(--text-muted)]">
            {guideLang === 'en' ? 'Need support? Contact us at' : 'मदत हवी आहे? येथे संपर्क साधा:'}{' '}
            <a
              href="mailto:your-email@example.com"
              className="text-[var(--accent-primary)] hover:underline font-bold"
            >
              your-email@example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
