import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { submitPart, type PartRowResult } from '../lib/apiUtils';
import {
  emptySharedContext,
  newPartRow,
  validateSharedContext,
  type SharedContext,
  type PartRow,
} from '../lib/partAdder';

const safeStorage = {
  getItem: (name: string) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      window.localStorage.setItem(name, value);
    } catch (error) {
      console.warn('Could not persist part-adder state:', error);
    }
  },
  removeItem: (name: string) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// Seeded with the CRM's own stock list (from the live form) so the library
// is useful on day one — everything else you add grows this list further.
const SEED_PART_NAMES = [
  'CPU', 'Battery', 'Cooling Fan', 'Screen', 'Keyboard', 'Speaker', 'Camera',
  'A Panel', 'B Panel', 'C Panel', 'D Panel', 'Display', 'Motherboard',
  'Logic Card', 'Touch Pad', 'Hinge Cap', 'IO CARD', 'Adapter', 'Touchpad Clicker',
];

interface PartAdderState {
  sharedContext: SharedContext;
  sharedContextErrors: Partial<Record<keyof SharedContext, string>>;
  isSharedContextValid: boolean;
  isValidatingContext: boolean;
  /**
   * Resolved (submission-ready) values from the last successful validation —
   * e.g. Sub Cat's real id instead of its display text. Kept SEPARATE from
   * sharedContext (which stays as raw display text) because the two don't
   * share a value space: Sub Cat/Model's resolved ids don't match any
   * <option> text, so writing them into sharedContext would make those
   * dropdowns appear to reset to blank after validating.
   */
  resolvedContext: Partial<SharedContext>;

  partRows: PartRow[];
  results: Record<string, PartRowResult>;

  /** Names ever typed/selected — persisted, grows over time so you don't retype. */
  partNameLibrary: string[];

  isSubmitting: boolean;
  submitProgress: { current: number; total: number; success: number; failed: number };

  setSharedContextField: (field: keyof SharedContext, value: string) => void;
  validateContext: () => Promise<void>;

  addPartRows: (partNames: string[]) => void;
  removePartRow: (id: string) => void;
  updatePartRowField: (id: string, field: keyof PartRow, value: string) => void;
  clearPartRows: () => void;
  addToLibrary: (partNames: string[]) => void;
  removeFromLibrary: (partName: string) => void;

  submitAllParts: () => Promise<void>;
}

export const usePartAdderStore = create<PartAdderState>()(
  persist(
    (set, get) => ({
      sharedContext: emptySharedContext,
      sharedContextErrors: {},
      isSharedContextValid: false,
      isValidatingContext: false,
      resolvedContext: {},

      partRows: [],
      results: {},
      partNameLibrary: SEED_PART_NAMES,

      isSubmitting: false,
      submitProgress: { current: 0, total: 0, success: 0, failed: 0 },

      setSharedContextField: (field, value) => set((state) => ({
        sharedContext: { ...state.sharedContext, [field]: value },
        // Any edit invalidates the previous validation result until re-checked.
        isSharedContextValid: false,
        resolvedContext: {},
      })),

      validateContext: async () => {
        set({ isValidatingContext: true });
        try {
          const { sharedContext } = get();
          const result = await validateSharedContext(sharedContext);
          set({
            // Kept separate from sharedContext — see the field's doc comment.
            resolvedContext: result.resolved,
            sharedContextErrors: result.errors,
            isSharedContextValid: result.isValid,
          });
        } finally {
          set({ isValidatingContext: false });
        }
      },

      addPartRows: (partNames) => set((state) => {
        const existingNames = new Set(state.partRows.map((r) => r.part_name));
        const newRows = partNames
          .filter((name) => !existingNames.has(name))
          .map((name) => newPartRow(name));

        // Anything added to a batch is remembered in the library too, so
        // next time it's a checkbox instead of retyping.
        const libSet = new Set(state.partNameLibrary);
        partNames.forEach((n) => libSet.add(n));

        return { partRows: [...state.partRows, ...newRows], partNameLibrary: Array.from(libSet).sort() };
      }),

      removePartRow: (id) => set((state) => ({
        partRows: state.partRows.filter((r) => r.id !== id),
      })),

      updatePartRowField: (id, field, value) => set((state) => ({
        partRows: state.partRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      })),

      clearPartRows: () => set({ partRows: [], results: {} }),

      addToLibrary: (partNames) => set((state) => {
        const libSet = new Set(state.partNameLibrary);
        partNames.forEach((n) => n.trim() && libSet.add(n.trim()));
        return { partNameLibrary: Array.from(libSet).sort() };
      }),

      removeFromLibrary: (partName) => set((state) => ({
        partNameLibrary: state.partNameLibrary.filter((n) => n !== partName),
      })),

      submitAllParts: async () => {
        const { sharedContext, resolvedContext, partRows, isSharedContextValid } = get();
        if (!isSharedContextValid || partRows.length === 0) return;

        set({
          isSubmitting: true,
          results: {},
          submitProgress: { current: 0, total: partRows.length, success: 0, failed: 0 },
        });

        // Built ONCE from resolvedContext (the submission-ready values from
        // the last validation) — e.g. Sub Cat's real id, not its display
        // text. purchase_price isn't part of validation, so it comes
        // straight from the raw context.
        const sharedFields: Record<string, string> = {
          part_type: resolvedContext.part_type || '',
          sub_product_id: resolvedContext.sub_product_id || '',
          make: resolvedContext.make || '',
          model: resolvedContext.model || '',
          hsn_code: resolvedContext.hsn_code || '',
          cat: resolvedContext.cat || '',
          purchase_price: sharedContext.purchase_price || '',
          part_compatible: resolvedContext.part_compatible || '',
        };

        for (let i = 0; i < partRows.length; i++) {
          const row = partRows[i];
          set((state) => ({ submitProgress: { ...state.submitProgress, current: i + 1 } }));

          const fields: Record<string, string> = {
            ...sharedFields,
            part_name: row.part_name,
            ome_part_name: row.ome_part_name,
            ome_part_number: row.ome_part_number,
            comp_part_name: row.comp_part_name,
            comp_part_number: row.comp_part_number,
          };

          // Diagnostic: check the browser console to confirm the EXACT value
          // sent for each field — especially sub_product_id — if something
          // comes back wrong on the CRM's side despite being sent here.
          console.log(`[Part Adder] submitting "${row.part_name}":`, fields);

          const result = await submitPart(fields);

          set((state) => ({
            results: { ...state.results, [row.id]: result },
            submitProgress: {
              ...state.submitProgress,
              success: state.submitProgress.success + (result.status === 'success' ? 1 : 0),
              failed: state.submitProgress.failed + (result.status !== 'success' ? 1 : 0),
            },
          }));
        }

        set({ isSubmitting: false });
      },
    }),
    {
      name: 'gorevive-part-adder-state',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        sharedContext: state.sharedContext,
        partRows: state.partRows,
        results: state.results,
        partNameLibrary: state.partNameLibrary,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isSubmitting = false;
          state.isSharedContextValid = false;
          state.resolvedContext = {};
          state.submitProgress = { current: 0, total: 0, success: 0, failed: 0 };
        }
      },
    }
  )
);
