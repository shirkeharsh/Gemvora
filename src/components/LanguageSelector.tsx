import React, { useState, useEffect } from 'react';

interface LanguageSelectorProps {
  onComplete: (username: string, lang: 'en' | 'mr') => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [selectedLang, setSelectedLang] = useState<'en' | 'mr' | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('Initializing companion...');

  const [existingProfiles] = useState<string[]>(() => {
    const saved = localStorage.getItem('pocket_ai_profiles');
    return saved ? JSON.parse(saved) : [];
  });

  // Handle auto-progress for step 2 (Nice Animation)
  useEffect(() => {
    if (step === 2) {
      setProgress(0);
      const startTime = Date.now();
      const duration = 2500; // 2.5 seconds total animation

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
        setProgress(pct);

        if (pct < 25) {
          setProgressText('Initializing health companion...');
        } else if (pct < 50) {
          setProgressText('Setting up secure database...');
        } else if (pct < 75) {
          setProgressText('Structuring bilingual modules...');
        } else if (pct < 95) {
          setProgressText('Tailoring user profile...');
        } else {
          setProgressText('Ready! ✨');
        }

        if (pct >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setStep(3);
          }, 300);
        }
      }, 40);

      return () => clearInterval(interval);
    }
  }, [step]);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setStep(2);
    }
  };

  const handleProfileSelect = (profile: string) => {
    setUsername(profile);
    const savedLang = localStorage.getItem(`pocket_ai_${profile}_lang`);
    if (savedLang === 'en' || savedLang === 'mr') {
      setSelectedLang(savedLang);
    }
    setStep(2);
  };

  const handleSubmit = () => {
    const cleanName = username.trim();
    if (cleanName && selectedLang) {
      onComplete(cleanName, selectedLang);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all duration-300">
      {/* Custom Keyframe Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-6px) scale(1.01); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(20, 184, 166, 0.4); transform: scale(1); }
          50% { box-shadow: 0 0 35px rgba(20, 184, 166, 0.8); transform: scale(1.05); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rotateDashed {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .custom-float {
          animation: float 4s ease-in-out infinite;
        }
        .custom-glow {
          animation: pulseGlow 2.5s infinite ease-in-out;
        }
        .custom-slide {
          animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .custom-rotate-dashed {
          animation: rotateDashed 8s linear infinite;
        }
      `}} />

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[32px] p-6 max-w-sm w-full shadow-2xl overflow-hidden relative min-h-[380px] flex flex-col justify-between custom-slide">
        
        {/* STEP 1: ENTER NAME */}
        {step === 1 && (
          <div className="flex flex-col justify-between h-full flex-1">
            <div>
              <div className="text-center mb-6">
                <img 
                  src="/logo.png" 
                  alt="Gemvora Logo" 
                  className="w-14 h-14 rounded-2xl mx-auto mb-3 object-contain custom-float shadow-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1.5" 
                />
                <h2 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Welcome to Gemvora
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Your smart, private clinical analyzer. Please enter your name to begin.
                </p>
              </div>

              <form onSubmit={handleNextStep} className="space-y-5">
                {/* User Name Entry */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider pl-1">
                    What is your name?
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4">
                      <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter patient name"
                      required
                      className="w-full bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-2xl py-3.5 pl-11 pr-4 outline-none text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] transition-all placeholder:text-xs placeholder:text-[var(--text-muted)] font-medium"
                    />
                  </div>
                </div>

                {/* Existing Profiles Selector */}
                {existingProfiles.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider pl-1">
                      Or select an existing profile
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1">
                      {existingProfiles.map((profile) => (
                        <button
                          key={profile}
                          type="button"
                          onClick={() => handleProfileSelect(profile)}
                          className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                            username === profile
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)] text-[var(--accent-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <span className="text-[10px]">👤</span>
                          <span>{profile}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Continue button */}
                <button
                  type="submit"
                  disabled={!username.trim()}
                  className="w-full py-3.5 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center font-bold text-xs shadow-md transition-all mt-4 active:scale-[0.98] cursor-pointer"
                >
                  <span>Continue</span>
                  <svg className="w-4 h-4 text-white ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            </div>

            <div className="mt-6 text-center border-t border-[var(--border-subtle)] pt-4">
              <p className="text-[10px] text-[var(--text-muted)]">
                Need support? Contact us at{' '}
                <a
                  href="mailto:your-email@example.com"
                  className="text-[var(--accent-primary)] hover:underline font-bold"
                >
                  your-email@example.com
                </a>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: NICE ANIMATION */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center py-8 text-center flex-1 my-auto">
            {/* Spinning/pulsing loader circle */}
            <div className="relative w-28 h-28 flex items-center justify-center mb-6">
              {/* Outer rotating dashed border */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--accent-primary)]/50 custom-rotate-dashed" />
              
              {/* Inner glowing pulsing orb */}
              <div className="w-20 h-20 bg-gradient-to-tr from-[var(--accent-primary)] to-teal-350 dark:to-cyan-400 rounded-full flex items-center justify-center shadow-lg shadow-teal-500/20 custom-glow overflow-hidden p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <img 
                  src="/logo.png" 
                  alt="Gemvora Logo" 
                  className="w-full h-full object-contain animate-pulse" 
                />
              </div>
            </div>

            <h3 className="text-lg font-bold text-[var(--text-primary)] transition-all duration-300">
              Welcome, {username}! ✨
            </h3>
            
            <p className="text-xs text-[var(--text-secondary)] mt-2 h-4 min-w-[200px] font-medium">
              {progressText}
            </p>

            {/* Premium Progress Bar */}
            <div className="w-60 h-1.5 bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-full overflow-hidden mt-6 relative shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-[var(--accent-primary)] via-teal-400 to-emerald-400 rounded-full transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className="text-[10px] text-[var(--text-muted)] font-bold mt-2.5">
              {progress}%
            </div>
          </div>
        )}

        {/* STEP 3: LANGUAGE CHOOSE */}
        {step === 3 && (
          <div className="flex flex-col justify-between h-full flex-1">
            <div>
              <div className="text-center mb-6">
                <h2 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Preferred Language
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Select the language you want to read and chat in. You can change this later in settings.
                </p>
              </div>

              {/* Language Selection cards */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedLang('mr')}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                    selectedLang === 'mr'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)] text-[var(--accent-primary)] shadow-sm'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇮🇳</span>
                    <div>
                      <span className="font-bold text-sm block">मराठी (Marathi)</span>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Marathi reports & explanations</p>
                    </div>
                  </div>
                  {selectedLang === 'mr' && (
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedLang('en')}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                    selectedLang === 'en'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)] text-[var(--accent-primary)] shadow-sm'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇬🇧</span>
                    <div>
                      <span className="font-bold text-sm block">English</span>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">English reports & explanations</p>
                    </div>
                  </div>
                  {selectedLang === 'en' && (
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>

              {/* Start Button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedLang}
                className="w-full py-3.5 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center font-bold text-xs shadow-md transition-all mt-6 active:scale-[0.98] cursor-pointer"
              >
                <span>Start Using Gemvora</span>
                <svg className="w-4 h-4 text-white ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Back Button */}
            <button
              onClick={() => setStep(1)}
              className="mt-5 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors self-center py-1 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Change profile name</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
