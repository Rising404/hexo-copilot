import React, { useState, useEffect } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  strictLabel?: string; // if provided, user must type this text to enable confirm
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

export default function ConfirmModal({
  open,
  title = 'Confirm',
  message = 'Are you sure?',
  strictLabel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  if (!open) return null;

  const strict = typeof strictLabel === 'string' && strictLabel.length > 0;
  const canConfirm = !strict || input === strictLabel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 text-white rounded-lg w-full max-w-md p-4 shadow-lg">
        <div className="font-semibold text-lg mb-2">{title}</div>
        <div className="text-sm text-gray-300 mb-4">{message}</div>

        {children}

        {strict && (
          <div className="mb-3">
            <label className="text-xs text-gray-400">Type <span className="font-mono">{strictLabel}</span> to confirm</label>
            <input
              className="w-full mt-1 p-2 rounded bg-gray-900 border border-gray-700 outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">{cancelText}</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-3 py-1 rounded ${canConfirm ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-800 opacity-60 cursor-not-allowed'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
