import { useState, useEffect } from "react";
import { 
  ModalRoot, 
  Field,
  Focusable
} from "@decky/ui";
import { getDllStats, DllStatsResult } from "../api/lsfgApi";

interface NerdStuffModalProps {
  closeModal?: () => void;
}

export function NerdStuffModal({ closeModal }: NerdStuffModalProps) {
  const [dllStats, setDllStats] = useState<DllStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDllStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getDllStats();
        setDllStats(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load DLL stats");
      } finally {
        setLoading(false);
      }
    };

    loadDllStats();
  }, []);

  const formatSHA256 = (hash: string) => {
    // Format SHA256 hash for better readability (add spaces every 8 characters)
    return hash.replace(/(.{8})/g, '$1 ').trim();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here if desired
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} onOK={closeModal}>
      {loading && (
        <div>Loading DLL information...</div>
      )}
      
      {error && (
        <div>Error: {error}</div>
      )}
      
      {!loading && !error && dllStats && (
        <>
          {!dllStats.success ? (
            <div>{dllStats.error || "Failed to get DLL stats"}</div>
          ) : (
            <div>
              <Field label="DLL Path">
                <Focusable
                  onClick={() => dllStats.dll_path && copyToClipboard(dllStats.dll_path)}
                  onActivate={() => dllStats.dll_path && copyToClipboard(dllStats.dll_path)}
                >
                  {dllStats.dll_path || "Not available"}
                </Focusable>
              </Field>
              
              <Field label="SHA256 Hash">
                <Focusable
                  onClick={() => dllStats.dll_sha256 && copyToClipboard(dllStats.dll_sha256)}
                  onActivate={() => dllStats.dll_sha256 && copyToClipboard(dllStats.dll_sha256)}
                >
                  {dllStats.dll_sha256 ? formatSHA256(dllStats.dll_sha256) : "Not available"}
                </Focusable>
              </Field>
              
              {dllStats.dll_source && (
                <Field label="Detection Source">
                  <div>{dllStats.dll_source}</div>
                </Field>
              )}
              
            </div>
          )}
        </>
      )}
    </ModalRoot>
  );
}
