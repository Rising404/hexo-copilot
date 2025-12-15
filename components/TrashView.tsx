import React, { useEffect, useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { realFileService } from '../services/realFileService';

type TrashViewProps = {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void; // called after restore or permanent delete to refresh UI
};

export default function TrashView({ open, onClose, onChanged }: TrashViewProps) {
  const [items, setItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) fetchTrash();
  }, [open]);

  const fetchTrash = async () => {
    setIsLoading(true);
    try {
      const list = await realFileService.listTrash?.();
      setItems(list || []);
    } catch (e) {
      console.error('Failed to fetch trash', e);
      alert('Failed to fetch trash list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (path: string) => {
    if (!confirm(`Restore '${path}' from trash?`)) return;
    try {
      await realFileService.restoreTrash?.(path);
      fetchTrash();
      onChanged?.();
    } catch (e: any) {
      alert(`Failed to restore: ${e?.message || e}`);
    }
  };

  const performPermanentDelete = async (path: string) => {
    try {
      await realFileService.permanentDelete?.(path);
      fetchTrash();
      onChanged?.();
    } catch (e: any) {
      alert(`Failed to permanently delete: ${e?.message || e}`);
    } finally {
      setPendingDelete(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center bg-black/50 p-6">
      <div className="bg-gray-900 text-gray-100 w-full max-w-3xl rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="text-lg font-semibold">Trash</div>
          <div className="flex items-center gap-2">
            <button onClick={fetchTrash} className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700">Refresh</button>
            <button onClick={onClose} className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700">Close</button>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="text-sm text-gray-400">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-400">Trash is empty</div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                  <div className="truncate text-sm">{it}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(it)}
                      className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-sm"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setPendingDelete(it)}
                      className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
                    >
                      Delete Permanently
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="Permanent Delete"
        message={pendingDelete ? `Type the filename to confirm permanent deletion: ${pendingDelete}` : undefined}
        strictLabel={pendingDelete ? pendingDelete.split('/').pop() : undefined}
        confirmText="Delete Permanently"
        cancelText="Cancel"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && performPermanentDelete(pendingDelete)}
      />
    </div>
  );
}
