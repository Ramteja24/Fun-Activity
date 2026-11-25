import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/outfit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/theme.css'; // the design system: tokens and the shared primitives (header, buttons, cards, fields)
import './ui/home.css'; // the Weekly Fun Activity dashboard, the in-room hub, the Funny Pose Challenge and Tech Trivia
import './ui/entry.css'; // the name / host / join pages of the three games
import './ui/lobby.css'; // TypeDrive's lobby, the teams and the difficulty picker
import './ui/race.css'; // TypeDrive's race and the spectator view
import './ui/results.css'; // race results, match results, podiums and the 40-player demo bar

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
