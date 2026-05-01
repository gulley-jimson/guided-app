import { useEffect, useState } from 'react';

export function useActiveApp() {
  const [app, setApp] = useState(null);

  useEffect(() => {
    let mounted = true;

    if (window.guided?.getActiveApp) {
      window.guided.getActiveApp().then((initial) => {
        if (mounted) setApp(initial ?? null);
      });
    }

    let unsubscribe = null;
    if (window.guided?.onAppChanged) {
      unsubscribe = window.guided.onAppChanged((next) => {
        if (mounted) setApp(next ?? null);
      });
    }

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return app;
}
