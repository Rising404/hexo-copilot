import React, { useEffect, useRef, useState } from 'react';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Batch operation state
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompleted, setBatchCompleted] = useState(0);
  const [itemStatuses, setItemStatuses] = useState<Record<string, { status: string; error?: string }>>({});
  const batchControllerRef = useRef<AbortController | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) fetchTrash();
  }, [open]);

  const fetchTrash = async () => {
    setIsLoading(true);
    try {
      const list = await realFileService.listTrash?.();
      setItems(list || []);
      // reset selection for items no longer present
      setSelected((prev) => {
        const ns = new Set<string>();
        (list || []).forEach((l) => { if (prev.has(l)) ns.add(l); });
        return ns;
      });
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

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (ns.has(path)) ns.delete(path);
      else ns.add(path);
      return ns;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items);
    });
  };

  const startBatchRestore = async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return alert('No items selected');

    const controller = new AbortController();
    batchControllerRef.current = controller;
    setIsBatchRunning(true);
    setBatchTotal(paths.length);
    setBatchCompleted(0);
    // init statuses
    const initStatuses: Record<string, { status: string }> = {};
    paths.forEach((p) => (initStatuses[p] = { status: 'in-progress' }));
    setItemStatuses(initStatuses);

    const onProgress = (completed: number, total: number, item?: string, ok?: boolean) => {
      setBatchCompleted(completed);
      if (item) {
        setItemStatuses((prev) => ({ ...prev, [item]: { status: ok ? 'success' : 'failed' } }));
      }
    };

    try {
      const results = await realFileService.restoreTrashBatch(paths, { signal: controller.signal, onProgress });
      // summarize
      const hadSuccess = results.some((r) => r.ok);
      if (hadSuccess) {
        fetchTrash();
        onChanged?.();
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError') {
        // cancelled
      } else {
        console.error('Batch restore failed', err);
        alert('Batch restore encountered an error');
      }
    } finally {
      setIsBatchRunning(false);
      batchControllerRef.current = null;
      // remove successfully restored from selection
      setSelected((prev) => {
        const ns = new Set(prev);
        Object.entries(itemStatuses).forEach(([p, s]) => { if (s.status === 'success') ns.delete(p); });
        return ns;
      });
    }
  };

  const cancelBatch = () => {
    batchControllerRef.current?.abort();
    setIsBatchRunning(false);
    // mark remaining pending as cancelled
    setItemStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k].status === 'in-progress') next[k].status = 'cancelled'; });
      return next;
    });
  };

  const startBatchPermanentDelete = async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return alert('No items selected');
    // show confirmation modal requiring strict input
    setShowBatchDeleteConfirm(true);
  };

  const confirmAndRunBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
    const paths = Array.from(selected);
    const controller = new AbortController();
    batchControllerRef.current = controller;
    setIsBatchRunning(true);
    setBatchTotal(paths.length);
    setBatchCompleted(0);
    const initStatuses: Record<string, { status: string }> = {};
    paths.forEach((p) => (initStatuses[p] = { status: 'in-progress' }));
    setItemStatuses(initStatuses);

    const onProgress = (completed: number, total: number, item?: string, ok?: boolean) => {
      setBatchCompleted(completed);
      if (item) {
        setItemStatuses((prev) => ({ ...prev, [item]: { status: ok ? 'success' : 'failed' } }));
      }
    };

    try {
      const results = await realFileService.permanentDeleteBatch(paths, { signal: controller.signal, onProgress });
      const hadSuccess = results.some((r) => r.ok);
      if (hadSuccess) {
        fetchTrash();
        onChanged?.();
      }
    } catch (err: any) {
      console.error('Batch delete failed', err);
      alert('Batch delete encountered an error');
    } finally {
      setIsBatchRunning(false);
      batchControllerRef.current = null;
      // remove successfully deleted from selection
      setSelected((prev) => {
        const ns = new Set(prev);
        Object.entries(itemStatuses).forEach(([p, s]) => { if (s.status === 'success') ns.delete(p); });
        return ns;
      });
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
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleSelectAll} />
                  <div className="text-sm">Select all ({items.length})</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startBatchRestore}
                    disabled={selected.size === 0 || isBatchRunning}
                    className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-sm disabled:opacity-50"
                  >
                    Restore Selected
                  </button>
                  <button
                    onClick={startBatchPermanentDelete}
                    disabled={selected.size === 0 || isBatchRunning}
                    className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-sm disabled:opacity-50"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>

              {isBatchRunning && (
                <div className="mb-2 p-2 bg-gray-800 rounded">
                  <div className="text-sm">Batch operation progress: {batchCompleted}/{batchTotal}</div>
                  <div className="w-full bg-gray-700 h-2 rounded mt-2">
                    <div style={{ width: `${(batchCompleted / Math.max(batchTotal, 1)) * 100}%` }} className="h-2 bg-green-600 rounded" />
                  </div>
                  <div className="mt-2">
                    <button onClick={cancelBatch} className="px-2 py-1 bg-yellow-600 rounded text-sm">Cancel</button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(it)} onChange={() => toggleSelect(it)} />
                      <div className="truncate text-sm">{it}</div>
                    </div>
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
                      {/* per-item status */}
                      {itemStatuses[it] && (
                        <div className="text-xs ml-2">
                          {itemStatuses[it].status === 'in-progress' && <span className="text-yellow-300">In progress</span>}
                          {itemStatuses[it].status === 'success' && <span className="text-green-400">Done</span>}
                          {itemStatuses[it].status === 'failed' && <span className="text-red-400">Failed</span>}
                          {itemStatuses[it].status === 'cancelled' && <span className="text-gray-400">Cancelled</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

      <ConfirmModal
        open={showBatchDeleteConfirm}
        title="Permanent Delete (Selected)"
        message={`Type DELETE to confirm permanent deletion of ${selected.size} selected items.`}
        strictLabel="DELETE"
        confirmText="Delete Selected"
        cancelText="Cancel"
        onCancel={() => setShowBatchDeleteConfirm(false)}
        onConfirm={confirmAndRunBatchDelete}
      />
    </div>
  );
}
