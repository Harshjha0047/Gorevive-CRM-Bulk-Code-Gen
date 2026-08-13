import { CheckCircle, XCircle, Trash2, UploadCloud, AlertCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { COLUMN_MAPPING } from '../lib/excel';

// Build the column list once: [{ label: 'Brand *', key: 'make' }, ...]
// This stays in sync automatically if COLUMN_MAPPING ever changes.
const COLUMNS = Object.entries(COLUMN_MAPPING).map(([label, key]) => ({ label, key }));

export function DataTable() {
  const { rows, isUploading, uploadProgress, removeRow, clearRows, submitValidRows } = useStore();

  if (rows.length === 0) return null;

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;

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
              <th className="px-4 py-3">Errors (If any)</th>
              <th className="px-4 py-3 text-right sticky right-0 bg-gray-50 z-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b hover:bg-gray-50 transition-colors ${!row.isValid ? 'bg-red-50/30' : ''}`}
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

                {/* Human-readable values — brand name, category name, "NEW", etc.
                    pulled from `original`, not the translated IDs in `data`. */}
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {row.original?.[col.key] || '-'}
                  </td>
                ))}

                <td className="px-4 py-3">
                  {!row.isValid && (
                    <div className="flex items-center text-red-600 max-w-xs overflow-hidden text-ellipsis">
                      <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
                      <span className="truncate" title={Object.values(row.errors).join(', ')}>
                        {Object.values(row.errors).join(', ')}
                      </span>
                    </div>
                  )}
                </td>
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