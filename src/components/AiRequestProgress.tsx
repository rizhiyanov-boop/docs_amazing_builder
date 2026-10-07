import { useEffect, useState } from 'react';

type Props = { message: string; announce?: boolean };

export function AiRequestProgress({ message, announce = true }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return <div className="ai-request-progress" role={announce ? 'status' : undefined} aria-label={announce ? 'Статус запроса к ИИ' : undefined}>
    <span className="ai-loader" aria-hidden="true" />
    <div className="ai-request-progress-copy">
      <div className="ai-request-progress-title">{message}</div>
      <div className="ai-request-progress-detail" aria-live="off">
        Прошло {elapsed} с{elapsed >= 20 && ' · Ожидание продолжается.'}
      </div>
    </div>
  </div>;
}
