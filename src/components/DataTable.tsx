import { useState } from 'react';
import { CheckCircle, XCircle, Trash2, UploadCloud, AlertCircle, ChevronDown, Wand2, Download } from 'lucide-react';
import { useStore } from '../store/useStore';
import { COLUMN_MAPPING, getFieldOptions, downloadResults } from '../lib/excel';
import type { ValidatedRow } from '../lib/validation';

const COLUMNS = Object.entries(COLUMN_MAPPING).map(([label, key]) => ({ label, key }));

// ---------------------------------------------------------------------------
// One cell. Plain text if no error. If there's an error, shows the message,
// a one-click "Use '<suggestion>'" button when we have a close match, and a
// "Pick from list" dropdown loaded on demand with every valid option.
// ---------------------------------------------------------------------------
function FieldCell({ row, fieldKey }: { row: ValidatedRow; fieldKey: string }) {
  const updateRowField = useStore((s) => s.updateRowField);
  const [showPicker, setShowPicker] = useState(false);
  const [options, setOptions] = useState<string[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const value = row.original?.[fieldKey] || '';
  const error = row.errors?.[fieldKey];

  const openPicker = async () => {
    setShowPicker((v) => !v);
    if (options === null && !loadingOptions) {
      setLoadingOptions(true);
      try {
        const opts = await getFieldOptions(fieldKey, row.original);
        setOptions(opts);
      } finally {
        setLoadingOptions(false);
      }
    }
  };

  if (!error) {
    return <td className="px-4 py-3">{value || '-'}</td>;
  }

  return (
    <td className="px-4 py-3 align-top min-w-[180px]">
      <div className="flex flex-col gap-1">
        <span className="text-red-600 text-xs">{value || <span className="italic text-gray-400">empty</span>}</span>
        <div className="flex items-center gap-1 text-[11px] text-red-500 max-w-xs" title={error.message}>
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{error.message}</span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {error.suggestion && (
            <button
              onClick={() => updateRowField(row.id, fieldKey, error.suggestion!)}
              className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded px-2 py-0.5 transition-colors"
              title={`Replace with "${error.suggestion}"`}
            >
              <Wand2 className="w-3 h-3" />
              Use "{error.suggestion}"
            </button>
          )}

          <div className="relative">
            <button
              onClick={openPicker}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-0.5 transition-colors"
            >
              Pick <ChevronDown className="w-3 h-3" />
            </button>

            {showPicker && (
              <div className="absolute z-30 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-64 overflow-y-auto">
                {loadingOptions && (
                  <div className="px-3 py-2 text-xs text-gray-400">Loading options…</div>
                )}
                {!loadingOptions && options !== null && options.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-400">
                    No options available — fix a field this one depends on first (e.g. Brand).
                  </div>
                )}
                {!loadingOptions && options !== null && options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      updateRowField(row.id, fieldKey, opt);
                      setShowPicker(false);
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 text-gray-700"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </td>
  );
}

export function DataTable() {
  const { rows, results, isUploading, uploadProgress, removeRow, clearRows, submitValidRows } = useStore();

  if (rows.length === 0) return null;

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;
  const hasResults = Object.keys(results).length > 0;

  const progressPercentage = uploadProgress.total > 0
    ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
    : 0;

  return (
    <div className="w-full max-w-7xl mx-auto mt-8 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      {/* Header & Stats */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex gap-4">
          <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg text-sm font-semibold">
            Total: {rows.length}
          </div>
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg text-sm font-semibold">
            Ready: {validCount}
          </div>
          <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg text-sm font-semibold">
            Errors: {invalidCount}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={clearRows}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Clear All
          </button>
          {hasResults && (
            <button
              onClick={() => downloadResults(rows, results)}
              className="flex items-center px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4 mr-2 text-orange-500" />
              Download Results
            </button>
          )}
          <button
            onClick={submitValidRows}
            disabled={isUploading || validCount === 0}
            className="flex items-center px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-lg hover:from-orange-600 hover:to-red-600 disabled:opacity-50 transition-all shadow-md"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            Upload {validCount} Valid Models
          </button>
        </div>
      </div>

      {/* Progress Bar (Shows when uploading) */}
      {(isUploading || uploadProgress.total > 0) && (
        <div className="px-6 py-4 bg-orange-50 border-b border-orange-100">
          <div className="flex justify-between text-sm font-semibold text-orange-800 mb-2">
            <span>Uploading... {uploadProgress.current} / {uploadProgress.total}</span>
            <span>{progressPercentage}%</span>
          </div>
          <div className="w-full bg-orange-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-orange-500 h-2.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="flex gap-4 mt-2 text-xs font-medium text-gray-600">
            <span className="text-green-600">Successful: {uploadProgress.success}</span>
            <span className="text-red-600">Failed: {uploadProgress.failed}</span>
          </div>
        </div>
      )}

      {/* Scrollable Table — all columns rendered dynamically */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 sticky left-0 bg-gray-50 z-20">Status</th>
              <th className="px-4 py-3 sticky left-[52px] bg-gray-50 z-20">Row #</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3">{col.label}</th>
              ))}
              {hasResults && <th className="px-4 py-3">Model Code</th>}
              <th className="px-4 py-3 text-right sticky right-0 bg-gray-50 z-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b hover:bg-gray-50 transition-colors align-top ${!row.isValid ? 'bg-red-50/30' : ''}`}
              >
                <td className="px-4 py-3 sticky left-0 bg-white z-10">
                  {row.isValid ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900 sticky left-[52px] bg-white z-10">
                  {row.rowIndex}
                </td>

                {/* Each dropdown-backed cell can show its own inline fix UI. */}
                {COLUMNS.map((col) => (
                  <FieldCell key={col.key} row={row} fieldKey={col.key} />
                ))}

                {hasResults && (
                  <td className="px-4 py-3">
                    {results[row.id] ? (
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`text-xs font-semibold ${
                            results[row.id].status === 'success'
                              ? 'text-green-700'
                              : results[row.id].status === 'ambiguous'
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {results[row.id].modelCode || '—'}
                        </span>
                        <span className="text-[11px] text-gray-400 max-w-[160px] truncate" title={results[row.id].message}>
                          {results[row.id].message}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                )}

                <td className="px-4 py-3 text-right sticky right-0 bg-white z-10">
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={isUploading}
                    className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 p-1 rounded-md hover:bg-red-50"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}