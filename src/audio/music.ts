import { useSyncExternalStore } from 'react';
import { createMusic, type MusicEnv } from './controller';

// The one music player for the whole app. It lives at module level — outside React — so moving between the landing
// page, lobby and race screen (components mounting and unmounting) never creates a second player or restarts the track.

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

const browserEnv: MusicEnv = {
  createAudio() {
    const el = new Audio();
    el.id = 'typedrive-music';
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el); // kept in the page so it is never garbage-collected and is easy to inspect
    return el;
  },
  storage: {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  },
  onGesture(fn) {
    const handler = (e: Event) => fn(e.target instanceof Element && e.target.closest('[data-music-toggle]') !== null);
    for (const type of GESTURES) window.addEventListener(type, handler, { capture: true, passive: true });
    return () => {
      for (const type of GESTURES) window.removeEventListener(type, handler, { capture: true });
    };
  },
  warn: (message, error) => console.warn(message, error ?? ''),
};

export const music = createMusic(browserEnv);

/** The music state for React (re-renders when it starts, stops or is muted). */
export function useMusic() {
  return useSyncExternalStore(music.subscribe, music.getState, music.getState);
}

/** Current background music volume (0..1) for React (re-renders when volume changes). */
export function useMusicVolume() {
  return useSyncExternalStore(music.subscribe, music.getVolume, music.getVolume);
}
