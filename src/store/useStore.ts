import { create } from 'zustand';
import { api } from '../lib/api';
import { validateRow } from '../lib/excel';
import { parseLegacyFormResponse } from '../lib/apiUtils';
import type { ValidatedRow } from '../lib/validation';

interface AppState {
  // Data
  rows: ValidatedRow[];

  isUploading: boolean;
  uploadProgress: {
    current: number;
    total: number;
    success: number;
    failed: number;
  };

  // Actions
  setRows: (rows: ValidatedRow[]) => void;
  removeRow: (id: string) => void;
  clearRows: () => void;
  submitValidRows: () => Promise<void>;
  /** Update a single field on a single row (e.g. "apply suggestion" or
   *  "picked from dropdown"), then re-validate just that row. */
  updateRowField: (id: string, field: string, value: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  rows: [],

  isUploading: false,
  uploadProgress: { current: 0, total: 0, success: 0, failed: 0 },

  setRows: (rows) => set({ rows }),

  removeRow: (id) => set((state) => ({
    rows: state.rows.filter(row => row.id !== id)
  })),

  clearRows: () => set({ rows: [], uploadProgress: { current: 0, total: 0, success: 0, failed: 0 } }),

  updateRowField: async (id, field, value) => {
    const { rows } = get();
    const target = rows.find((r) => r.id === id);
    if (!target) return;

    const newOriginal = { ...target.original, [field]: value };

    // Reflect the edit immediately so the input feels responsive while
    // re-validation is in flight.
    set((state) => ({
      rows: state.rows.map((r) => (r.id === id ? { ...r, original: newOriginal } : r)),
    }));

    const result = await validateRow(newOriginal);

    set((state) => ({
      rows: state.rows.map((r) =>
        r.id === id
          ? { ...r, data: result.data, errors: result.errors, isValid: result.isValid }
          : r
      ),
    }));
  },

  submitValidRows: async () => {
    const { rows } = get();
    const validRows = rows.filter(row => row.isValid);

    if (validRows.length === 0) return;

    set({
      isUploading: true,
      uploadProgress: { current: 0, total: validRows.length, success: 0, failed: 0 }
    });

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];

      try {
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, current: i + 1 }
        }));

        const params = new URLSearchParams();
        Object.entries(row.data).forEach(([key, value]) => {
          params.append(key, String(value));
        });

        params.append('Submit', 'ADD');

        const response = await api.post('/master/addmodel_new_all.php', params);
        const result = parseLegacyFormResponse(response.data);

        if (!result.success) {
          // e.g. "Model Already Available..." — a real failure, not a bug
          // in this app, so don't count it as uploaded.
          throw new Error(result.message);
        }

        set((state) => ({
          uploadProgress: { ...state.uploadProgress, success: state.uploadProgress.success + 1 }
        }));

      } catch (error) {
        console.error(`Failed to upload row ${row.rowIndex}:`, error);
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, failed: state.uploadProgress.failed + 1 }
        }));
      }
    }

    set({ isUploading: false });
  }
}));