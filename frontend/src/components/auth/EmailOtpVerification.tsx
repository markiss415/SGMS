/**
 * Step 2 of resident registration: enter the 6-digit code that was emailed.
 * Used by both the landing-page portal card and the Register modal.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

export interface PendingVerification {
  verification_id: string;
  email: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
}

interface Props {
  pending: PendingVerification;
  onVerified: (message: string) => void;
  onBack: () => void;
}

const LENGTH = 6;

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const EmailOtpVerification: React.FC<Props> = ({ pending, onVerified, onBack }) => {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState(pending.email);
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + pending.expires_in_seconds * 1000);
  const [resendAt, setResendAt] = useState(() => Date.now() + pending.resend_after_seconds * 1000);
  const [now, setNow] = useState(Date.now());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    inputs.current[0]?.focus();
    return () => clearInterval(t);
  }, []);

  const expiresIn = Math.round((expiresAt - now) / 1000);
  const resendIn = Math.round((resendAt - now) / 1000);
  const code = digits.join('');

  const submit = async (value = code) => {
    if (value.length !== LENGTH || submitting) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.verifyRegistration(pending.verification_id, value);
      onVerified(res.message);
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const setDigit = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (clean.length > 1) {
      // Pasted or auto-filled the whole code
      const next = clean.slice(0, LENGTH).split('');
      const filled = [...next, ...Array(LENGTH - next.length).fill('')];
      setDigits(filled);
      inputs.current[Math.min(next.length, LENGTH - 1)]?.focus();
      if (next.length === LENGTH) void submit(next.join(''));
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.join('').length === LENGTH) void submit(next.join(''));
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.resendRegistrationCode(pending.verification_id);
      setMaskedEmail(res.email);
      setExpiresAt(Date.now() + res.expires_in_seconds * 1000);
      setResendAt(Date.now() + res.resend_after_seconds * 1000);
      setDigits(Array(LENGTH).fill(''));
      setInfo(res.message);
      inputs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Could not send a new code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="text-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
            <MailCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 font-['Plus_Jakarta_Sans',sans-serif]">Verify your email</h2>
            <p className="mt-0.5 text-neutral-500 leading-relaxed">
              We sent a 6-digit code to <strong className="text-neutral-800">{maskedEmail}</strong>. Check your inbox (and Spam folder).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[10px] font-bold text-neutral-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
        >
          <ArrowLeft className="h-3 w-3" />
          Edit details
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">{info}</div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-neutral-700 font-semibold mb-2" htmlFor="otp-0">
          Verification code
        </label>
        <div className="flex justify-between gap-2" onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (/\d{6}/.test(text.replace(/\D/g, ''))) {
            e.preventDefault();
            setDigit(0, text);
          }
        }}>
          {digits.map((d, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={i === 0 ? LENGTH : 1}
              aria-label={`Digit ${i + 1}`}
              disabled={submitting}
              className="h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-neutral-50 text-center font-mono text-xl font-bold text-neutral-900 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
          <span>{expiresIn > 0 ? <>Code expires in <strong className="font-mono">{formatClock(expiresIn)}</strong></> : <span className="text-rose-700 font-semibold">Code expired — request a new one.</span>}</span>
          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0 || resending}
            className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline disabled:text-neutral-400 disabled:no-underline"
          >
            <RefreshCw className={`h-3 w-3 ${resending ? 'animate-spin' : ''}`} />
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        </div>

        <button
          type="submit"
          disabled={code.length !== LENGTH || submitting}
          className="mt-4 w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{submitting ? 'Verifying…' : 'Verify & Finish Registration'}</span>
        </button>
      </form>

      <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
        Never share this code. Barangay staff will never ask for it. After verifying, your Purok Leader still approves your account before you can sign in.
      </p>
    </div>
  );
};
