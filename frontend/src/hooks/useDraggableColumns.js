import { useState } from 'react';

/**
 * Drag-to-reorder logic for the candidate table's column headers.
 *
 * Extracted from JobsPage.jsx (around line 1900) and UploadPage.jsx
 * (around line 197), where `handleDragStart` / `handleDragOver` /
 * `handleDragEnter` / `handleDragEnd` / `handleDrop` were byte-identical
 * copy-pasted implementations, both closing over a page-local `cols` /
 * `setCols` state pair holding the ordered array of column descriptors.
 *
 * Behavior preserved from the original:
 *   - `'_actions'` (the fixed row-actions column) can never be dragged or
 *     used as a drop target — both `handleDragOver`/`handleDragEnter` bail
 *     out early for it, and `handleDrop` also refuses if either the
 *     dragged or target key is `'_actions'`.
 *   - Dropping a column onto itself, or with no column currently being
 *     dragged, is a no-op (state is simply reset).
 *   - Reordering is done by removing the dragged column from its old index
 *     and re-inserting it at the target column's index (a splice-based
 *     move, not a swap).
 *
 * @param {Array<{ key: string }>} columns - The current ordered list of column descriptors.
 * @param {Function} setColumns - State setter for `columns` (e.g. React's `setCols`).
 * @returns {{
 *   draggedColKey: string|null,
 *   dragOverColKey: string|null,
 *   handleDragStart: (e: DragEvent, key: string) => void,
 *   handleDragOver: (e: DragEvent, key: string) => void,
 *   handleDragEnter: (e: DragEvent, key: string) => void,
 *   handleDragEnd: () => void,
 *   handleDrop: (e: DragEvent, targetKey: string) => void,
 * }}
 */
export function useDraggableColumns(columns, setColumns) {
    const [draggedColKey, setDraggedColKey] = useState(null);
    const [dragOverColKey, setDragOverColKey] = useState(null);

    const handleDragStart = (e, key) => {
        setDraggedColKey(key);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
    };

    const handleDragOver = (e, key) => {
        if (key === '_actions') return;
        e.preventDefault();
    };

    const handleDragEnter = (e, key) => {
        if (key === '_actions') return;
        setDragOverColKey(key);
    };

    const handleDragEnd = () => {
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    const handleDrop = (e, targetKey) => {
        e.preventDefault();
        if (!draggedColKey || draggedColKey === targetKey || targetKey === '_actions' || draggedColKey === '_actions') {
            setDraggedColKey(null);
            setDragOverColKey(null);
            return;
        }

        const dragIdx = columns.findIndex(c => c.key === draggedColKey);
        const targetIdx = columns.findIndex(c => c.key === targetKey);

        if (dragIdx !== -1 && targetIdx !== -1) {
            const updatedCols = [...columns];
            const [draggedItem] = updatedCols.splice(dragIdx, 1);
            updatedCols.splice(targetIdx, 0, draggedItem);
            setColumns(updatedCols);
        }
        setDraggedColKey(null);
        setDragOverColKey(null);
    };

    return {
        draggedColKey,
        dragOverColKey,
        handleDragStart,
        handleDragOver,
        handleDragEnter,
        handleDragEnd,
        handleDrop,
    };
}

export default useDraggableColumns;
