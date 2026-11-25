import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface Props {
  text: string;
  pos: number;
  error: boolean;
  flashWord: number;
  /** Typing is allowed (countdown or racing, not finished) — keeps the hidden input focused. */
  enabled: boolean;
  onChar(ch: string): void;
}

type CharState = 'done' | 'cur' | 'err' | 'todo';

const Ch = memo(function Ch({ ch, i, state }: { ch: string; i: number; state: CharState }) {
  const isSpace = ch === ' ';
  const cls = state === 'done' ? 'done' : state === 'cur' ? 'cur' : state === 'err' ? 'cur err' : '';
  return (
    <span data-i={i} className={`ch ${isSpace ? 'sp' : ''} ${cls}`}>
      {isSpace ? ' ' : ch}
    </span>
  );
});

/**
 * The reel's typing strip: dim = typed, bright = to type, cyan caret, red flash on a wrong key,
 * boxed outline on the word you just finished. Also owns the (invisible) input that receives keystrokes —
 * one code path for desktop keyboards and phone soft keyboards.
 */
export function TypingBar({ text, pos, error, flashWord, enabled, onChar }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prev = useRef('');
  const [focused, setFocused] = useState(false);

  const words = useMemo(() => {
    const out: { chars: string[]; start: number }[] = [];
    let i = 0;
    for (const w of text.split(' ')) {
      out.push({ chars: [...w], start: i });
      i += w.length + 1;
    }
    return out;
  }, [text]);

  // Scroll so the caret sits ~42% across the text window (the line starts at 14% and only scrolls once the caret passes
  // the anchor). The window is the part of the bar to the right of the speedometer.
  useLayoutEffect(() => {
    const win = windowRef.current;
    const track = trackRef.current;
    if (!win || !track) return;
    const el = track.querySelector<HTMLElement>(`[data-i="${Math.min(pos, text.length - 1)}"]`);
    if (!el) return;
    const tx = Math.min(win.clientWidth * 0.14, win.clientWidth * 0.42 - el.offsetLeft);
    track.style.setProperty('--tx', `${tx}px`);
  });

  // Keep the input focused for the whole race (desktop), and let any tap/click on the page refocus it.
  useEffect(() => {
    if (!enabled) return;
    const el = inputRef.current;
    el?.focus({ preventScroll: true });
    const refocus = () => inputRef.current?.focus({ preventScroll: true });
    window.addEventListener('pointerdown', refocus);
    return () => window.removeEventListener('pointerdown', refocus);
  }, [enabled]);

  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const ne = e.nativeEvent as InputEvent;
    const el = e.currentTarget;
    const v = el.value;
    if (ne.inputType === 'insertFromPaste' || ne.inputType === 'insertFromDrop') {
      el.value = '';
      prev.current = '';
      return;
    }
    const before = prev.current;
    // Only *appended* characters count. Deletions/auto-corrections that rewrite earlier text are ignored.
    if (v.length > before.length && v.startsWith(before)) {
      for (const ch of v.slice(before.length)) onChar(ch);
    }
    // Keep the buffer tiny; clear at word boundaries (never mid-composition, which would break Android IMEs).
    if (!ne.isComposing && (v.endsWith(' ') || v.length > 24)) {
      el.value = '';
      prev.current = '';
    } else {
      prev.current = v;
    }
  };

  return (
    <div className="typebar" ref={barRef}>
      <div className="type-window" ref={windowRef}>
        <div className="type-track" ref={trackRef} aria-hidden>
          {words.map((w, wi) => (
            <Fragment key={wi}>
              <span className={`word${flashWord === wi ? ' flash' : ''}`}>
                {w.chars.map((c, ci) => {
                  const i = w.start + ci;
                  return <Ch key={i} ch={c} i={i} state={i < pos ? 'done' : i === pos ? (error ? 'err' : 'cur') : 'todo'} />;
                })}
              </span>
              {wi < words.length - 1 &&
                (() => {
                  const i = w.start + w.chars.length;
                  return <Ch ch=" " i={i} state={i < pos ? 'done' : i === pos ? (error ? 'err' : 'cur') : 'todo'} />;
                })()}
            </Fragment>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        className="ghost-input"
        type="text"
        inputMode="text"
        enterKeyHint="go"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Type the text to race"
        disabled={!enabled}
        onInput={onInput}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Tab never leaves the typing field mid-race; Shift+Tab does, so keyboard users can reach the HUD buttons
          // (standings, music) — the next Tab brings them straight back here.
          if (e.key === 'Tab' && !e.shiftKey) e.preventDefault();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {enabled && !focused && (
        <div className="tap-hint">
          <span>Tap here to type</span>
        </div>
      )}
    </div>
  );
}
