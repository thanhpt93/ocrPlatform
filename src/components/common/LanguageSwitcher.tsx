import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { LANGUAGES, Language, useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark' | 'full';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'light',
  className,
}) => {
  const { lang, setLang, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  if (variant === 'full') {
    return (
      <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)} role="radiogroup" aria-label={t('common.languageLabel')}>
        {LANGUAGES.map((opt) => {
          const active = opt.code === lang;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => setLang(opt.code as Language)}
              className={cn(
                'flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all cursor-pointer',
                active
                  ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500/30'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center justify-center h-7 w-9 rounded-md text-[11px] font-bold tracking-wider border',
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  )}
                >
                  {opt.shortLabel}
                </span>
                <div>
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{opt.intlLocale}</div>
                </div>
              </div>
              {active && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = variant === 'dark';

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('common.languageLabel')}
        data-testid="language-switcher-trigger"
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer',
          isDark
            ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
        )}
      >
        <Globe className={cn('h-3.5 w-3.5', isDark ? 'text-blue-400' : 'text-slate-500')} />
        <span className="font-semibold">{currentOption.shortLabel}</span>
        <span className="hidden md:inline text-[11px] opacity-80">{currentOption.label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 mt-1.5 w-44 rounded-xl shadow-xl border py-1 z-50',
            isDark
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-white border-slate-200 text-slate-800'
          )}
        >
          {LANGUAGES.map((opt) => {
            const active = opt.code === lang;
            return (
              <button
                key={opt.code}
                type="button"
                data-testid={`language-option-${opt.code}`}
                onClick={() => {
                  setLang(opt.code as Language);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left cursor-pointer',
                  isDark
                    ? active
                      ? 'bg-slate-700/80 text-white font-semibold'
                      : 'hover:bg-slate-700/50 text-slate-300'
                    : active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'hover:bg-slate-50 text-slate-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block w-6 text-center py-0.5 rounded text-[10px] font-bold',
                      isDark
                        ? active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400'
                        : active
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {opt.shortLabel}
                  </span>
                  <span>{opt.label}</span>
                </div>
                {active && <Check className={cn('h-3.5 w-3.5', isDark ? 'text-blue-400' : 'text-blue-600')} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
