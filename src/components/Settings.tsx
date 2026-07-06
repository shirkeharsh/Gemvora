import React, { useState } from 'react';
import type { TranslationKeys } from '../translations';
import { Settings as SettingsIcon, Languages, Trash2, Brain, X, Plus } from 'lucide-react';

interface SettingsProps {
  t: TranslationKeys;
  language: 'en' | 'mr';
  setLanguage: (lang: 'en' | 'mr') => void;
  onClearAll: () => void;
  userMemory: string[];
  onAddMemory: (text: string) => void;
  onDeleteMemory: (index: number) => void;
  username: string;
  onLogout: () => void;
  fullNvidiaMode: boolean;
  onToggleNvidiaMode: (val: boolean) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  t,
  language,
  setLanguage,
  onClearAll,
  userMemory,
  onAddMemory,
  onDeleteMemory,
  username,
  onLogout,
  fullNvidiaMode,
  onToggleNvidiaMode,
}) => {
  const [memoryInput, setMemoryInput] = useState('');
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const val = memoryInput.trim();
    if (!val) return;
    onAddMemory(val);
    setMemoryInput('');
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden animate-message relative">
      
      {/* Settings Header */}
      <div className="py-2.5 px-4 border-b border-[var(--border-subtle)] bg-white/70 dark:bg-black/50 backdrop-blur-md flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent-primary)]">
          <SettingsIcon className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
            {t.settingsTab}
          </h2>
          <p className="text-[9px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
            Configure patient metrics & data systems
          </p>
        </div>
      </div>

      {/* Settings Body Options */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 pb-24">
        
        {/* User Profile Card */}
        <div className="p-4 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Active Patient Profile
            </span>
            <span className="block text-sm font-bold text-[var(--text-primary)] mt-0.5">
              👤 {username}
            </span>
          </div>
          <button
            onClick={onLogout}
            type="button"
            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-variant)] transition-all font-bold text-xs text-[var(--text-secondary)]"
          >
            Switch Profile
          </button>
        </div>

        {/* Language Choice Panel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Languages className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{t.languageLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['en', 'mr'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all ${
                  language === lang
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface-variant)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {lang === 'en' && 'English'}
                {lang === 'mr' && 'मराठी'}
              </button>
            ))}
          </div>
        </div>

        {/* AI Patient Health Memory Summary trigger */}
        <div className="border-t border-[var(--border-subtle)] pt-6 space-y-3">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5 pr-2 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 flex-shrink-0">
                <Brain className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[var(--text-primary)] block">Patient Memory</span>
                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wide truncate block">
                  {userMemory.length} saved condition{userMemory.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowMemoryModal(true)}
              type="button"
              className="py-1.5 px-3.5 rounded-xl bg-[var(--accent-glow)] hover:opacity-90 text-[var(--accent-primary)] font-bold text-xs flex-shrink-0 transition-all active:scale-[0.98]"
            >
              View Memory
            </button>
          </div>
        </div>

        {/* Engine Toggle Settings Row */}
        <div className="border-t border-[var(--border-subtle)] pt-6 space-y-3">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)]">
            <div className="pr-2 min-w-0">
              <span className="text-xs font-bold text-[var(--text-primary)] block">AI Model Engine</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5 leading-normal block">
                {fullNvidiaMode ? 'NVIDIA Maverick Active (High Performance)' : 'Google Gemini Active (Recommended)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className={!fullNvidiaMode ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]'}>Gemini</span>
              <label className="relative inline-flex items-center cursor-pointer scale-90 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={fullNvidiaMode}
                  onChange={(e) => onToggleNvidiaMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-[var(--border-subtle)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[var(--accent-primary)] peer-checked:after:bg-white"></div>
              </label>
              <span className={fullNvidiaMode ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]'}>NVIDIA</span>
            </div>
          </div>
        </div>

        {/* Clear Data Settings Row */}
        <div className="border-t border-[var(--border-subtle)] pt-6 flex items-center justify-between">
          <div className="pr-3">
            <span className="text-red-500 font-bold text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {t.clearHistory}
            </span>
            <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Delete local cookies, reports caching, and chats.
            </span>
          </div>
          <button
            onClick={onClearAll}
            className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition-all font-bold text-xs flex-shrink-0"
          >
            Clear Data
          </button>
        </div>

      </div>

      {/* Sliding Bottom Sheet Modal for Patient Memory Manager */}
      {showMemoryModal && (
        <div 
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200"
          onClick={() => setShowMemoryModal(false)}
        >
          <div 
            className="w-full bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] rounded-t-[28px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-300 shadow-2xl max-h-[75dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-[var(--border-subtle)] rounded-full mx-auto mb-1 flex-shrink-0"></div>
            
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Patient Health Memory
                </h3>
              </div>
              <button 
                onClick={() => setShowMemoryModal(false)}
                className="p-1 rounded-full hover:bg-[var(--bg-surface-variant)] text-[var(--text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed flex-shrink-0">
              {t.memorySubtitle}
            </p>

            {/* Scrollable list of memory tags */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2">
              <div className="flex flex-wrap gap-1.5 min-h-6">
                {userMemory.length === 0 ? (
                  <span className="text-xs italic text-[var(--text-muted)] py-2">{t.noMemory}</span>
                ) : (
                  userMemory.map((mem, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 py-1 pl-3 pr-2 bg-[var(--bg-surface-variant)] text-[var(--text-primary)] rounded-full text-xs font-bold border border-[var(--border-subtle)] max-w-full break-words animate-in zoom-in-95 duration-150"
                    >
                      <span>{mem}</span>
                      <button
                        onClick={() => onDeleteMemory(idx)}
                        type="button"
                        className="p-0.5 hover:bg-[var(--bg-surface)] rounded-full text-[var(--text-muted)] hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Input field to add memory tags */}
            <form onSubmit={handleAddMemory} className="flex gap-2 pt-2.5 border-t border-[var(--border-subtle)] flex-shrink-0">
              <input
                type="text"
                value={memoryInput}
                onChange={(e) => setMemoryInput(e.target.value)}
                placeholder={t.addMemoryPlaceholder}
                className="flex-1 h-10 bg-[var(--bg-surface-variant)] border border-[var(--border-subtle)] rounded-xl px-3 outline-none text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] transition-all placeholder:text-xs placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                disabled={!memoryInput.trim()}
                className="h-10 px-4 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>Add</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
