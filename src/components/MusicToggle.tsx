import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { music, useMusic, useMusicVolume } from '../audio/music';
import { IconSpeaker, IconSpeakerMuted } from './Icons';

/**
 * The speaker button: on landing, lobby and race screen it is the last item of the header, in the same place.
 * Clicking it shows a small volume popover with a volume slider and a mute/unmute toggle.
 * `hud` is the race-screen version (same look as the HUD's other round buttons); it must never take keyboard focus away
 * from the typing field when clicked, and hands focus back to it after a keyboard activation.
 */
export function MusicToggle({ variant = 'site' }: { variant?: 'site' | 'hud' }) {
  const { on, status } = useMusic();
  const volume = useMusicVolume();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const label = on ? 'Mute music' : 'Enable music';
  const hud = variant === 'hud';
  const pct = Math.round(volume * 100);

  const refocusGhost = () => {
    if (hud) document.querySelector<HTMLInputElement>('.ghost-input')?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        refocusGhost();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, hud]);

  return (
    <div className="music-wrap" ref={wrapRef}>
      <button
        type="button"
        className={hud ? `icon-btn music-hud${on ? '' : ' is-off'}${open ? ' is-open' : ''}` : `music-btn${on ? '' : ' is-off'}${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        onClick={(e) => {
          setOpen((v) => !v);
          // keyboard activation (detail 0) in the race: give typing focus back; a mouse click never took it (see onMouseDown)
          if (hud && e.detail === 0) refocusGhost();
        }}
        onMouseDown={hud ? (e) => e.preventDefault() : undefined}
      >
        {on ? <IconSpeaker width={16} height={16} /> : <IconSpeakerMuted width={16} height={16} />}
      </button>

      {/* While the browser is still holding sound back (autoplay blocked, nobody has clicked or typed yet): any click or
          key press starts the music and this goes away. It never takes a click itself. */}
      {status === 'blocked' && !open && (
        <span className="music-hint" aria-hidden="true">
          Tap anywhere for sound
        </span>
      )}

      {open && (
        <div
          className={`music-popover${hud ? ' is-hud' : ''}`}
          role="dialog"
          aria-label="Volume controls"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="music-pop-head">
            <span className="music-pop-title">Volume</span>
            <span className="music-pop-val">{on ? `${pct}%` : 'Muted'}</span>
          </div>
          <input
            type="range"
            className="music-slider"
            min={0}
            max={100}
            step={1}
            value={pct}
            aria-label="Music volume"
            style={{ '--vol': `${pct}%` } as CSSProperties}
            onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
            onPointerUp={refocusGhost}
            onKeyUp={refocusGhost}
          />
          <button
            type="button"
            data-music-toggle
            className={`music-mute-btn${on ? '' : ' is-off'}`}
            aria-label={label}
            title={label}
            aria-pressed={!on}
            onClick={(e) => {
              music.toggle();
              if (hud && e.detail === 0) refocusGhost();
            }}
            onMouseDown={hud ? (e) => e.preventDefault() : undefined}
          >
            {on ? <IconSpeaker width={14} height={14} /> : <IconSpeakerMuted width={14} height={14} />}
            <span>{on ? 'Mute' : 'Unmute'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
