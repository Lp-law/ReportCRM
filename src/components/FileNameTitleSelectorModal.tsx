import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

interface TitleOption {
  id: string;
  label: string;
}

interface FileNameTitleSelectorModalProps {
  isOpen: boolean;
  availableTitles: TitleOption[];
  selectedTitles: string[];
  onClose: () => void;
  onSave: (selected: string[]) => void;
}

const FileNameTitleSelectorModal: React.FC<FileNameTitleSelectorModalProps> = ({
  isOpen,
  availableTitles,
  selectedTitles,
  onClose,
  onSave,
}) => {
  const mapLabelsToIds = useMemo(() => {
    return (labels: string[]) => {
      const usedIds = new Set<string>();
      const ids: string[] = [];
      labels.forEach((label) => {
        const match = availableTitles.find(
          (option) => option.label === label && !usedIds.has(option.id)
        );
        if (match) {
          ids.push(match.id);
          usedIds.add(match.id);
        }
      });
      return ids;
    };
  }, [availableTitles]);

  const deriveInitialSelection = useCallback(() => {
    const mapped = mapLabelsToIds(selectedTitles);
    if (mapped.length) return mapped;
    return availableTitles.map((option) => option.id);
  }, [mapLabelsToIds, selectedTitles, availableTitles]);

  const [draftSelectionIds, setDraftSelectionIds] = useState<string[]>(deriveInitialSelection);

  useEffect(() => {
    if (isOpen) {
      setDraftSelectionIds(deriveInitialSelection());
    }
  }, [isOpen, deriveInitialSelection]);

  if (!isOpen) return null;

  const toggleTitle = (id: string) => {
    setDraftSelectionIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setDraftSelectionIds(availableTitles.map((option) => option.id));
  };

  const handleSave = () => {
    const orderedLabels = draftSelectionIds
      .map((id) => availableTitles.find((option) => option.id === id)?.label)
      .filter(Boolean) as string[];
    onSave(orderedLabels);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[900] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">Select File Name Titles</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {availableTitles.length === 0 && (
            <p className="text-sm text-gray-500">No sections available to include.</p>
          )}
          {availableTitles.map((option) => (
            <label key={option.id} className="flex items-center gap-3 border rounded-lg px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 text-lpBlue"
                checked={draftSelectionIds.includes(option.id)}
                onChange={() => toggleTitle(option.id)}
              />
              <span className="text-gray-800">{option.label || '[Untitled Section]'}</span>
            </label>
          ))}
          {availableTitles.length > 0 && (
            <button
              type="button"
              className="text-xs text-lpBlue hover:underline"
              onClick={handleSelectAll}
            >
              Select All
            </button>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t px-5 py-4 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-md">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-lpBlue text-white rounded-md font-semibold hover:bg-blue-900"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileNameTitleSelectorModal;

