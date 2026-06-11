import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/auth'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
}

const SUGGESTED_KEYS = [
  'assistant.suggest_sale',
  'assistant.suggest_return',
  'assistant.suggest_barcode',
  'assistant.suggest_shift',
] as const

function pageContextFromPath(pathname: string): string {
  const path = pathname.replace(/^\//, '') || 'pos'
  return path.split('/')[0] || 'pos'
}

export default function AiAssistantWidget() {
  const { t, i18n } = useTranslation()
  const { hasFeature } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState<'ai' | 'faq'>('faq')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const pageContext = pageContextFromPath(location.pathname)

  useEffect(() => {
    if (!hasFeature('ai_assistant')) return
    api.get<{ mode: 'ai' | 'faq' }>('/assistant/status')
      .then(({ data }) => setMode(data.mode))
      .catch(() => setMode('faq'))
  }, [hasFeature])

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: t('assistant.welcome') as string,
      }])
    }
  }, [open, messages.length, t])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 120)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError(null)

    try {
      const { data } = await api.post<{ reply: string; source: string; lang: string }>('/assistant/chat', {
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        lang,
        page_context: pageContext,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      if (data.source === 'ai' || data.source === 'faq') {
        setMode(data.source)
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : (t('assistant.error') as string))
    } finally {
      setSending(false)
    }
  }, [messages, sending, lang, pageContext, t])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  if (!hasFeature('ai_assistant')) return null

  return (
    <div className="fixed bottom-5 end-5 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,24rem)] h-[min(70vh,32rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          role="dialog"
          aria-label={t('assistant.title') as string}
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0">
            <div className="p-2 rounded-xl bg-white/15">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">{t('assistant.title')}</div>
              <div className="text-xs text-white/80 flex items-center gap-1">
                {mode === 'ai' ? <Sparkles className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                {mode === 'ai' ? t('assistant.mode_ai') : t('assistant.mode_faq')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label={t('assistant.close') as string}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-ee-md'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-es-md shadow-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-es-md px-3 py-2 text-slate-500 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('assistant.thinking')}
                </div>
              </div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {messages.length <= 1 && !sending && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-slate-50 shrink-0">
              {SUGGESTED_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void sendMessage(t(key) as string)}
                  className="text-xs px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="p-3 border-t border-slate-200 bg-white shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage(input)
                  }
                }}
                rows={2}
                placeholder={t('assistant.placeholder') as string}
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label={t('assistant.send') as string}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
        aria-expanded={open}
        aria-label={t('assistant.open') as string}
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        <span className="text-sm font-medium hidden sm:inline">{t('assistant.ask')}</span>
      </button>
    </div>
  )
}
