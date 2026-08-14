import { create } from 'zustand';
import { api } from '../lib/api';
import { validateRow, buildExpectedModelDescription, pickCandidateByDescription } from '../lib/excel';
import { parseLegacyFormResponse, searchModelsByName, type RowResult } from '../lib/apiUtils';
import type { ValidatedRow } from '../lib/validation';

interface AppState {
  rows: ValidatedRow[];
  /** Outcome (incl. generated Model Code) per row, keyed by row.id. */
  results: Record<string, RowResult>;

  isUploading: boolean;
  uploadProgress: {
    current: number;
    total: number;
    success: number;
    failed: number;
  };

  setRows: (rows: ValidatedRow[]) => void;
  removeRow: (id: string) => void;
  clearRows: () => void;
  submitValidRows: () => Promise<void>;
  updateRowField: (id: string, field: string, value: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  rows: [],
  results: {},

  isUploading: false,
  uploadProgress: { current: 0, total: 0, success: 0, failed: 0 },

  setRows: (rows) => set({ rows, results: {} }),

  removeRow: (id) => set((state) => ({
    rows: state.rows.filter(row => row.id !== id)
  })),

  clearRows: () => set({
    rows: [],
    results: {},
    uploadProgress: { current: 0, total: 0, success: 0, failed: 0 }
  }),

  updateRowField: async (id, field, value) => {
    const { rows } = get();
    const target = rows.find((r) => r.id === id);
    if (!target) return;

    const newOriginal = { ...target.original, [field]: value };

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
      uploadProgress: { current: 0, total: validRows.length, success: 0, failed: 0 },
      results: {},
    });

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];

      set((state) => ({
        uploadProgress: { ...state.uploadProgress, current: i + 1 }
      }));

      try {
        // The model text was already exact-match validated earlier, so
        // it's safe to use as-is for the search query.
        const modelName = row.original.model;

        // 1. Baseline — every Model Code that already exists for this
        //    model name, BEFORE we create this row.
        const before = await searchModelsByName(modelName);
        const beforeCodes = new Set(before.map((r) => r.modelCode));

        // 2. Submit
        const params = new URLSearchParams();
        Object.entries(row.data).forEach(([key, value]) => {
          params.append(key, String(value));
        });
        params.append('Submit', 'ADD');

        const response = await api.post('/master/addmodel_new_all.php', params);
        const legacy = parseLegacyFormResponse(response.data);

        if (!legacy.success) {
          // e.g. "Model Already Available..." — the model already exists,
          // so look it up and surface its REAL code instead of leaving it
          // blank. Only bother searching for duplicate-style failures;
          // other errors (malformed data, server error) have no code to find.
          const isDuplicate = /already/i.test(legacy.message);
          let modelCode: string | null = null;
          let message = legacy.message;

          if (isDuplicate) {
            const existing = await searchModelsByName(modelName);
            const rawBrand = row.original.make.trim().toUpperCase();
            const brandMatched = existing.filter(
              (r) => r.brand.trim().toUpperCase() === rawBrand
            );
            const candidates = brandMatched.length > 0 ? brandMatched : existing;

            if (candidates.length === 0) {
              message = `${legacy.message} (server says it's a duplicate, but no matching row was found on search — check manually).`;
            } else if (candidates.length === 1) {
              modelCode = candidates[0].modelCode;
              message = `Already exists as ${modelCode}`;
            } else {
              const expectedDesc = buildExpectedModelDescription(row.original);
              const { match, exact } = pickCandidateByDescription(candidates, expectedDesc);

              if (match && exact) {
                modelCode = match.modelCode;
                message = `Already exists as ${modelCode} (matched exactly by full spec description)`;
              } else if (match) {
                modelCode = match.modelCode;
                message = `Already exists — closest spec match is ${modelCode} out of ${candidates.length} candidates (no exact description match). Verify manually.`;
              } else {
                modelCode = candidates.map((c) => c.modelCode).join(', ');
                message = `Already exists — ${candidates.length} matching codes found (${modelCode}). Could not disambiguate by description — verify manually.`;
              }
            }
          }

          set((state) => ({
            results: {
              ...state.results,
              [row.id]: { modelCode, status: 'duplicate', message },
            },
            uploadProgress: { ...state.uploadProgress, failed: state.uploadProgress.failed + 1 },
          }));
          continue;
        }

        // 3. Diff — whatever Model Code appears now but wasn't in the
        //    baseline is the one we just created.
        const after = await searchModelsByName(modelName);
        const newRows = after.filter((r) => !beforeCodes.has(r.modelCode));

        // Narrow by brand as a safety net (in case the search matches
        // other brands with an identical model string).
        const rawBrand = row.original.make.trim().toUpperCase();
        const brandMatched = newRows.filter((r) => r.brand.trim().toUpperCase() === rawBrand);
        const candidates = brandMatched.length > 0 ? brandMatched : newRows;

        if (candidates.length === 1) {
          set((state) => ({
            results: {
              ...state.results,
              [row.id]: { modelCode: candidates[0].modelCode, status: 'success', message: 'Created' },
            },
            uploadProgress: { ...state.uploadProgress, success: state.uploadProgress.success + 1 },
          }));
        } else if (candidates.length > 1) {
          // More than one new code appeared — disambiguate using the exact
          // spec description rather than just guessing the most recent SNO.
          const expectedDesc = buildExpectedModelDescription(row.original);
          const { match, exact } = pickCandidateByDescription(candidates, expectedDesc);
          const chosen = match ?? candidates.reduce((a, b) => (Number(a.sno) > Number(b.sno) ? a : b));

          set((state) => ({
            results: {
              ...state.results,
              [row.id]: {
                modelCode: chosen.modelCode,
                status: exact ? 'success' : 'ambiguous',
                message: exact
                  ? `Created as ${chosen.modelCode} (confirmed by exact spec match)`
                  : `Created, but ${candidates.length} new matching rows appeared — closest spec match is ${chosen.modelCode}. Verify manually.`,
              },
            },
            uploadProgress: { ...state.uploadProgress, success: state.uploadProgress.success + 1 },
          }));
        } else {
          // Server said success, but re-search found no new row — don't
          // guess a code, surface it instead.
          set((state) => ({
            results: {
              ...state.results,
              [row.id]: {
                modelCode: null,
                status: 'ambiguous',
                message: 'Server confirmed creation, but no new matching row was found on re-search. Check manually.',
              },
            },
            uploadProgress: { ...state.uploadProgress, success: state.uploadProgress.success + 1 },
          }));
        }
      } catch (error) {
        console.error(`Failed to upload row ${row.rowIndex}:`, error);
        set((state) => ({
          results: {
            ...state.results,
            [row.id]: {
              modelCode: null,
              status: 'failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          },
          uploadProgress: { ...state.uploadProgress, failed: state.uploadProgress.failed + 1 },
        }));
      }
    }

    set({ isUploading: false });
  }
}));