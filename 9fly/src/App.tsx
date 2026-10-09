import { useEffect, useState } from 'react';

import { BookView } from './views/Book';
import { CheckInView } from './views/CheckIn';
import { TrackView } from './views/Track';

type View = 'theo-doi' | 've' | 'thu-tuc';

function readView(): View {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('ve')) return 've';
  if (hash.startsWith('thu-tuc')) return 'thu-tuc';
  return 'theo-doi';
}

export function App() {
  const [view, setView] = useState<View>(readView);
  const [checkKey, setCheckKey] = useState(0);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    if (!location.hash) location.hash = 'theo-doi';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(next: View) {
    location.hash = next;
    setView(next);
  }

  function openCheckIn(pnr: string, name: string) {
    sessionStorage.setItem('9fly.handoff', JSON.stringify({ pnr, name }));
    setCheckKey((value) => value + 1);
    go('thu-tuc');
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#theo-doi" onClick={() => setView('theo-doi')}>
          <span className="mark">9</span>
          <span>fly</span>
        </a>
        <div className="who">
          <span>Bình Trần</span>
          <small>9app.tech</small>
        </div>
      </header>
      <main>
        {view === 'theo-doi' && <TrackView />}
        {view === 've' && <BookView onCheckIn={openCheckIn} />}
        {view === 'thu-tuc' && <CheckInView key={checkKey} />}
      </main>
      <nav className="tabbar" aria-label="9fly">
        <button type="button" className={view === 'theo-doi' ? 'on' : ''} onClick={() => go('theo-doi')}>
          <PlaneIcon />
          Theo dõi
        </button>
        <button type="button" className={view === 've' ? 'on' : ''} onClick={() => go('ve')}>
          <TicketIcon />
          Mua vé
        </button>
        <button type="button" className={view === 'thu-tuc' ? 'on' : ''} onClick={() => go('thu-tuc')}>
          <PassIcon />
          Làm thủ tục
        </button>
      </nav>
    </div>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 13.5 10 12l.6 3.2 2.2-.7L11.6 10l5.2-2.2c1.1-.5 2.2-.2 2.8.6.4.5.3 1.1 0 1.5L14.2 13.2l.5 3.4-2-.9-1.4 2.2-1.1-.7 1.1-2.6-3.2-1.4z" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4z" />
      <path d="M12 8v8" />
    </svg>
  );
}

function PassIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8 8h8M8 12h5M8 15.5h8" />
    </svg>
  );
}
