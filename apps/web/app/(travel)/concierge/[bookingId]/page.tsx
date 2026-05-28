'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from 'react';
import {
  processConciergeMessage,
  getBookingContext,
  type BookingContext,
  type HistoryMessage,
  type IntentCategory,
  type ProcessMessageResult,
} from '@/lib/travel/concierge-router';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'agent';
  content: string;
  intent?: IntentCategory;
  routedTo?: 'ai' | 'human';
  timestamp: Date;
}

// ─── Style constants ────────────────────────────────────────────────────────────

const INTENT_LABELS: Partial<Record<IntentCategory, string>> = {
  faq: 'FAQ',
  simple_modification: 'Modification',
  visa_inquiry: 'Visa Inquiry',
  safety_advisory: 'Safety',
  complaint: 'Complaint',
  accessibility_need: 'Accessibility',
  unknown: 'General',
};

const INTENT_COLORS: Partial<Record<IntentCategory, string>> = {
  faq: '#2563eb',
  simple_modification: '#16a34a',
  visa_inquiry: '#d97706',
  safety_advisory: '#dc2626',
  complaint: '#dc2626',
  accessibility_need: '#7c3aed',
  unknown: '#6b7280',
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

function BookingBanner({ ctx }: { ctx: BookingContext }): JSX.Element {
  return (
    <div
      style={{
        padding: '0.75rem 1.5rem',
        background: 'rgba(37,99,235,0.06)',
        borderBottom: '1px solid rgba(37,99,235,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        fontSize: 13,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 600, color: '#1e40af' }}>
        Booking #{ctx.bookingId.slice(0, 8).toUpperCase()}
      </span>
      {ctx.travelerName && <span style={{ color: '#374151' }}>{ctx.travelerName}</span>}
      {ctx.destination && (
        <span style={{ color: '#374151' }}>
          ✈ <strong>{ctx.destination}</strong>
        </span>
      )}
      {ctx.departureDate && (
        <span style={{ color: '#6b7280' }}>Dep: {ctx.departureDate}</span>
      )}
      {ctx.returnDate && (
        <span style={{ color: '#6b7280' }}>Ret: {ctx.returnDate}</span>
      )}
      {ctx.status && (
        <span
          style={{
            padding: '0.15rem 0.6rem',
            borderRadius: 999,
            background:
              ctx.status === 'confirmed'
                ? 'rgba(22,163,74,0.1)'
                : 'rgba(107,114,128,0.1)',
            color: ctx.status === 'confirmed' ? '#15803d' : '#4b5563',
            fontWeight: 500,
            textTransform: 'capitalize',
          }}
        >
          {ctx.status}
        </span>
      )}
    </div>
  );
}

function IntentBadge({ intent }: { intent: IntentCategory }): JSX.Element {
  const color = INTENT_COLORS[intent] ?? '#6b7280';
  const label = INTENT_LABELS[intent] ?? intent;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '0.1rem 0.45rem',
        borderRadius: 4,
        background: `${color}18`,
        color,
        marginTop: 4,
      }}
    >
      {label}
    </span>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }): JSX.Element {
  const isUser = msg.role === 'user';
  const isAgent = msg.role === 'agent';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isUser ? '#6b7280' : isAgent ? '#7c3aed' : '#2563eb',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {isUser ? 'You' : isAgent ? 'Human Agent' : 'AI Concierge'}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div
        style={{
          maxWidth: '72%',
          padding: '0.75rem 1rem',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser
            ? '#2563eb'
            : isAgent
              ? 'rgba(124,58,237,0.08)'
              : 'rgba(0,0,0,0.04)',
          color: isUser ? '#fff' : '#111827',
          fontSize: 14,
          lineHeight: 1.55,
          border: !isUser
            ? isAgent
              ? '1px solid rgba(124,58,237,0.2)'
              : '1px solid rgba(0,0,0,0.08)'
            : 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
      </div>
      {msg.intent && msg.intent !== 'unknown' && !isUser && (
        <IntentBadge intent={msg.intent} />
      )}
    </div>
  );
}

function AgentStatusBanner({ status }: { status: 'ai' | 'human' | null }): JSX.Element | null {
  if (!status) return null;
  if (status === 'human') {
    return (
      <div
        role="status"
        style={{
          padding: '0.5rem 1.5rem',
          background: 'rgba(124,58,237,0.07)',
          borderBottom: '1px solid rgba(124,58,237,0.15)',
          fontSize: 12,
          color: '#6d28d9',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#7c3aed',
            display: 'inline-block',
            animation: 'pulse 1.5s infinite',
          }}
        />
        Human agent connected — your conversation is being handled by our team
      </div>
    );
  }
  return null;
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function ConciergePageClient({
  params,
}: {
  params: { bookingId: string };
}): JSX.Element {
  const { bookingId } = params;

  const [bookingCtx, setBookingCtx] = useState<BookingContext>({ bookingId });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<'ai' | 'human' | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load booking context on mount
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await getBookingContext(bookingId);
        setBookingCtx(ctx);
      } catch {
        // Proceed with minimal context
      } finally {
        setCtxLoading(false);
      }
    };
    void load();
  }, [bookingId]);

  // Greet user after context loads
  useEffect(() => {
    if (ctxLoading) return;
    const greeting: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'ai',
      content: bookingCtx.travelerName
        ? `Hello ${bookingCtx.travelerName}! I'm your AI travel concierge for booking #${bookingId.slice(0, 8).toUpperCase()}. How can I help you today?`
        : `Hello! I'm your AI travel concierge for booking #${bookingId.slice(0, 8).toUpperCase()}. I can help with FAQ questions and simple modifications. How can I assist you?`,
      timestamp: new Date(),
    };
    setMessages([greeting]);
    setAgentStatus('ai');
  }, [ctxLoading, bookingCtx.travelerName, bookingId]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const historyForApi: HistoryMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'ai')
        .slice(-10)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const result: ProcessMessageResult = await processConciergeMessage(
        bookingCtx,
        content,
        historyForApi,
      );

      const replyRole: 'ai' | 'agent' = result.routedTo === 'human' ? 'agent' : 'ai';
      const replyMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: replyRole,
        content: result.reply,
        intent: result.intent,
        routedTo: result.routedTo,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, replyMsg]);

      if (result.routedTo === 'human') {
        setAgentStatus('human');
      }
    } catch (err) {
      setError(`Failed to process message: ${String(err)}`);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [inputValue, isLoading, messages, bookingCtx]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxHeight: '100vh',
        background: '#fff',
        color: '#111',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Travel Concierge
          </h1>
          <p style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 0' }}>
            AI-powered support · Complex cases escalated to a human agent
          </p>
        </div>
        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: '#b91c1c',
              background: 'rgba(220,38,38,0.08)',
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              maxWidth: 300,
            }}
          >
            {error}
          </div>
        )}
      </header>

      {/* Booking context banner */}
      {!ctxLoading && <BookingBanner ctx={bookingCtx} />}

      {/* Agent status banner */}
      <AgentStatusBanner status={agentStatus} />

      {/* Message timeline */}
      <div
        role="log"
        aria-label="Concierge conversation"
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          background: 'rgba(0,0,0,0.015)',
        }}
      >
        {ctxLoading ? (
          <div style={{ opacity: 0.5, fontSize: 14 }}>Loading booking details…</div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: 0.5,
                  fontSize: 13,
                  marginBottom: '1rem',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#2563eb',
                    display: 'inline-block',
                  }}
                />
                Concierge is typing…
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <footer
        style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || ctxLoading}
            placeholder="Ask a question or request a modification… (Enter to send)"
            rows={2}
            aria-label="Message input"
            style={{
              flex: 1,
              resize: 'none',
              padding: '0.65rem 0.9rem',
              borderRadius: 10,
              border: '1px solid rgba(0,0,0,0.15)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              lineHeight: 1.5,
              background: isLoading || ctxLoading ? 'rgba(0,0,0,0.04)' : '#fff',
              color: '#111',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || ctxLoading || !inputValue.trim()}
            aria-label="Send message"
            style={{
              padding: '0.65rem 1.2rem',
              borderRadius: 10,
              border: 'none',
              background:
                isLoading || !inputValue.trim() ? 'rgba(37,99,235,0.4)' : '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              flexShrink: 0,
              alignSelf: 'stretch',
            }}
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </div>
        <p
          style={{
            fontSize: 11,
            color: '#9ca3af',
            margin: '6px 0 0',
            lineHeight: 1.4,
          }}
        >
          AI handles FAQ &amp; simple requests · Visa, safety, complaints &amp; accessibility routed to a human agent
        </p>
      </footer>
    </main>
  );
}
