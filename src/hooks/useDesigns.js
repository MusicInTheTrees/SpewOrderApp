import { useState, useEffect, useCallback } from 'react';
import { listDesigns, refreshDesigns } from '../api/designs';

export function useDesigns() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    listDesigns()
      .then(setDesigns)
      .catch(() => setToast("Couldn't reach Drive — showing cached designs"));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshDesigns();
      const updated = await listDesigns();
      setDesigns(updated);
    } catch {
      setToast("Couldn't reach Drive — showing cached designs");
    } finally {
      setLoading(false);
    }
  }, []);

  return { designs, loading, toast, clearToast: () => setToast(null), refresh };
}
