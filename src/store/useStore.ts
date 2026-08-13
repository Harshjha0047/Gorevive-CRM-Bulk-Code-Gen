import { create } from 'zustand';
import { api } from '../lib/api';
import type { ValidatedRow } from '../lib/validation';

interface AppState {
  rows: ValidatedRow[];
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
}

export const useStore = create<AppState>((set, get) => ({
  rows: [],
  isUploading: false,
  uploadProgress: { current: 0, total: 0, success: 0, failed: 0 },

  setRows: (rows) => set({ rows }),

  removeRow: (id) => set((state) => ({
    rows: state.rows.filter(row => row.id !== id)
  })),

  clearRows: () => set({ 
    rows: [], 
    uploadProgress: { current: 0, total: 0, success: 0, failed: 0 } 
  }),

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

        const res = await api.post('/master/addmodel_new_all.php', params);
        const responseText = String(res.data);

        // CHECK 1: Did the PHP backend return a JavaScript alert?
        if (responseText.includes('alert(')) {
          // Extract the exact message from inside the alert('...')
          const match = responseText.match(/alert\(['"](.*?)['"]\)/);
          const errorMessage = match ? match[1] : "Rejected by server";
          
          throw new Error(errorMessage);
        }

        // CHECK 2: Any other common PHP failure strings you might have
        if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('failed')) {
           throw new Error("Server returned an error");
        }

        // If we made it here, it was a true success!
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, success: state.uploadProgress.success + 1 }
        }));

      } catch (error: any) {
        console.error(`Failed to upload row ${row.rowIndex}:`, error);
        
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, failed: state.uploadProgress.failed + 1 },
          rows: state.rows.map(r => 
            r.id === row.id 
              ? { 
                  ...r, 
                  isValid: false, 
                  errors: { ...r.errors, Server: error.message || "Upload Failed" } 
                } 
              : r
          )
        }));
      }
    }

    set({ isUploading: false });
  }
}));