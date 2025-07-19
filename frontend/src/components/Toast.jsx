import React from 'react';

export function Toast({ message, type = 'info', onClose }) {
  React.useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => onClose?.(), 3000);
    return () => clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className={`toast toast-${type}`}>{message}</div>
  );
}
