import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ dark: controlledDark, setDark: setControlled }) {
  const isControlled = typeof controlledDark === 'boolean' && typeof setControlled === 'function';
  const [internalDark, setInternalDark] = useState(false);

  // initialize internal state only if uncontrolled
  useEffect(() => {
    if (!isControlled) {
      const saved = localStorage.getItem('prefers-dark') === 'true';
      setInternalDark(saved);
      document.body.classList.toggle('dark', saved);
    }
  }, [isControlled]);

  const dark = isControlled ? controlledDark : internalDark;

  function toggle() {
    if (isControlled) {
      setControlled(!controlledDark);
    } else {
      const next = !internalDark;
      setInternalDark(next);
      document.body.classList.toggle('dark', next);
      localStorage.setItem('prefers-dark', next);
    }
  }

  return (
    <button onClick={toggle} className="btn-secondary" title="Toggle theme">
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
