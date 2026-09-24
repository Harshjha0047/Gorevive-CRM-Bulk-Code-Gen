import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, XCircle, Trash2, PlusCircle, Loader2, ListPlus, Search, X } from 'lucide-react';
import { usePartAdderStore } from '../store/usePartAdderStore';
import {
  getPartTypeOptions,
  getSubCatOptions,
  getBrandOptions,
  getModelOptions,
  getHsnCodeOptions,
  getCategoryOptions,
  getPartCompatibleOptions,
  getPartNameOptions,
  type SharedContext,
} from '../lib/partAdder';

function ContextSelect({
  label,
  field,
  value,
  options,
  error,
  disabled,
  onChange,
}: {
  label: string;
  field: keyof SharedContext;
  value: string;
  options: string[];
  error?: string;
  disabled?: boolean;
  onChange: (field: keyof SharedContext, value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:text-gray-400 ${
          error ? 'border-red-400' : 'border-gray-200'
        }`}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function PartAdder() {
  const sharedContext = usePartAdderStore((s) => s.sharedContext);
  const sharedContextErrors = usePartAdderStore((s) => s.sharedContextErrors);
  const isSharedContextValid = usePartAdderStore((s) => s.isSharedContextValid);
  const setSharedContextField = usePartAdderStore((s) => s.setSharedContextField);
  const validateContext = usePartAdderStore((s) => s.validateContext);

  const partRows = usePartAdderStore((s) => s.partRows);
  const results = usePartAdderStore((s) => s.results);
  const addPartRows = usePartAdderStore((s) => s.addPartRows);
  const removePartRow = usePartAdderStore((s) => s.removePartRow);
  const updatePartRowField = usePartAdderStore((s) => s.updatePartRowField);
  const clearPartRows = usePartAdderStore((s) => s.clearPartRows);
  const partNameLibrary = usePartAdderStore((s) => s.partNameLibrary);
  const addToLibrary = usePartAdderStore((s) => s.addToLibrary);
  const removeFromLibrary = usePartAdderStore((s) => s.removeFromLibrary);
  const isSubmitting = usePartAdderStore((s) => s.isSubmitting);
  const submitProgress = usePartAdderStore((s) => s.submitProgress);
  const submitAllParts = usePartAdderStore((s) => s.submitAllParts);

  const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);
  const [subCatOptions, setSubCatOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [hsnOptions, setHsnOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [compatibleOptions, setCompatibleOptions] = useState<string[]>([]);
  const [availablePartNames, setAvailablePartNames] = useState<string[]>([]);
  const [selectedPartNames, setSelectedPartNames] = useState<Set<string>>(new Set());
  const [loadingPartNames, setLoadingPartNames] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [newNameInput, setNewNameInput] = useState('');

  // Load the static/near-static dropdowns once.
  useEffect(() => {
    (async () => {
      const [pt, sc, br, hsn, cat, compat] = await Promise.all([
        getPartTypeOptions(),
        getSubCatOptions(),
        getBrandOptions(),
        getHsnCodeOptions(),
        getCategoryOptions(),
        getPartCompatibleOptions(),
      ]);
      setPartTypeOptions(Object.keys(pt));
      setSubCatOptions(Object.keys(sc));
      setBrandOptions(Object.keys(br));
      setHsnOptions(Object.keys(hsn));
      setCategoryOptions(Object.keys(cat));
      setCompatibleOptions(Object.keys(compat));
    })();
  }, []);

  // Model options depend on Brand.
  useEffect(() => {
    (async () => {
      if (!sharedContext.make) {
        setModelOptions([]);
        return;
      }
      const brandMap = await getBrandOptions();
      const brandId = brandMap[sharedContext.make];
      if (!brandId) return;
      const models = await getModelOptions(brandId);
      setModelOptions(Object.keys(models));
    })();
  }, [sharedContext.make]);

  const handleContextChange = (field: keyof SharedContext, value: string) => {
    setSharedContextField(field, value);
  };

  const handleFetchPartNames = async () => {
    setLoadingPartNames(true);
    try {
      await validateContext();
      const names = await getPartNameOptions(sharedContext);
      setAvailablePartNames(Object.keys(names));
      setChecklistLoaded(true);
    } finally {
      setLoadingPartNames(false);
    }
  };

  const togglePartName = (name: string) => {
    setSelectedPartNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAddSelected = () => {
    addPartRows(Array.from(selectedPartNames));
    setSelectedPartNames(new Set());
  };

  // Adds brand-new name(s) — comma separated — straight into the persistent
  // library (so they show up as checkboxes from now on) AND pre-selects
  // them, ready to go into the batch via the same "Add Selected" button.
  const handleAddNewToLibrary = () => {
    const names = newNameInput
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;

    addToLibrary(names);
    setSelectedPartNames((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      return next;
    });
    setNewNameInput('');
  };

  const filteredLibrary = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    const combined = Array.from(new Set([...partNameLibrary, ...availablePartNames])).sort();
    if (!term) return combined;
    return combined.filter((n) => n.toLowerCase().includes(term));
  }, [partNameLibrary, availablePartNames, librarySearch]);

  const contextComplete =
    sharedContext.part_type && sharedContext.sub_product_id && sharedContext.make &&
    sharedContext.model && sharedContext.hsn_code && sharedContext.cat;

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <h2 className="font-bold text-gray-900">Bulk Part Adder</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Fill the product context once, then add all its parts (Battery, Screen, Keyboard...) in one batch.
        </p>
      </div>

      {/* Step 1: Shared context */}
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">1. Product context (fill once)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ContextSelect label="Part Type *" field="part_type" value={sharedContext.part_type}
            options={partTypeOptions} error={sharedContextErrors.part_type} onChange={handleContextChange} />
          <ContextSelect label="Sub Cat *" field="sub_product_id" value={sharedContext.sub_product_id}
            options={subCatOptions} error={sharedContextErrors.sub_product_id} onChange={handleContextChange} />
          <ContextSelect label="Brand *" field="make" value={sharedContext.make}
            options={brandOptions} error={sharedContextErrors.make} onChange={handleContextChange} />
          <ContextSelect label="Model *" field="model" value={sharedContext.model}
            options={modelOptions} error={sharedContextErrors.model}
            disabled={!sharedContext.make} onChange={handleContextChange} />
          <ContextSelect label="HSN Code *" field="hsn_code" value={sharedContext.hsn_code}
            options={hsnOptions} error={sharedContextErrors.hsn_code} onChange={handleContextChange} />
          <ContextSelect label="Stock Category *" field="cat" value={sharedContext.cat}
            options={categoryOptions} error={sharedContextErrors.cat} onChange={handleContextChange} />
          <ContextSelect label="Original/Compatible" field="part_compatible" value={sharedContext.part_compatible}
            options={compatibleOptions} error={sharedContextErrors.part_compatible} onChange={handleContextChange} />
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price</label>
            <input
              type="text"
              value={sharedContext.purchase_price}
              onChange={(e) => handleContextChange('purchase_price', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Same price for all parts (optional)"
            />
          </div>
        </div>

        <button
          onClick={handleFetchPartNames}
          disabled={!contextComplete || loadingPartNames}
          className="mt-4 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          {loadingPartNames ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {loadingPartNames ? 'Checking...' : 'Validate Context'}
        </button>
        {!contextComplete && (
          <p className="text-xs text-gray-400 mt-2">Fill in all required (*) fields above first.</p>
        )}
        {contextComplete && !isSharedContextValid && !loadingPartNames && checklistLoaded && (
          <p className="text-xs text-amber-600 mt-2">
            Some fields didn't validate — check the errors above. You can still add parts below, but submission is blocked until this passes.
          </p>
        )}
      </div>

      {/* Step 2: Add parts — multi-select from your saved library, with search
          and inline "add new name to library" for anything not there yet. */}
      {contextComplete && (
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            2. Select parts {isSharedContextValid && <span className="text-green-600 font-normal">(context validated)</span>}
          </h3>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search your part library..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg p-3 mb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredLibrary.map((name) => (
                <label key={name} className="group flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedPartNames.has(name)}
                    onChange={() => togglePartName(name)}
                    className="rounded shrink-0"
                  />
                  <span className="flex-1 truncate">{name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); removeFromLibrary(name); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 shrink-0"
                    title="Remove from library"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </label>
              ))}
              {filteredLibrary.length === 0 && (
                <p className="col-span-full text-xs text-gray-400 py-2">No matches — add it below.</p>
              )}
            </div>
          </div>

          <button
            onClick={handleAddSelected}
            disabled={selectedPartNames.size === 0}
            className="flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors mb-4"
          >
            <PlusCircle className="w-4 h-4" />
            Add {selectedPartNames.size || ''} Selected to Batch
          </button>

          {/* New name not in the library yet */}
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              New part name not in your library? (comma separated for multiple)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewToLibrary();
                  }
                }}
                placeholder="e.g. Processor, Fan Assembly"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={handleAddNewToLibrary}
                disabled={newNameInput.trim().length === 0}
                className="flex items-center gap-2 bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <ListPlus className="w-4 h-4" />
                Save & Select
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Saves to your library (checkbox appears above) and pre-selects it — click "Add Selected to Batch" above to include it.
            </p>
          </div>

          {/* Load the CRM's own live list for this exact model, so anything
              already added shows as gone (not offered) — an extra check,
              not required to use the library above. */}
          <button
            onClick={handleFetchPartNames}
            disabled={loadingPartNames}
            className="mt-4 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1.5 disabled:opacity-40"
          >
            {loadingPartNames ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {loadingPartNames
              ? 'Checking against CRM...'
              : checklistLoaded
                ? 'Re-check against CRM\'s live list for this model'
                : "Check CRM's live list — hides parts already added for this model"}
          </button>
          {checklistLoaded && availablePartNames.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              The CRM reports no stock parts left unadded for this exact model — everything in your library above may already exist for it. Custom names you type are still fine to add.
            </p>
          )}
        </div>
      )}

      {/* Step 3: Batch table + submit */}
      {partRows.length > 0 && (
        <div className="p-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">3. Batch ({partRows.length} parts)</h3>
            <button onClick={clearPartRows} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Clear batch
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Part Name</th>
                  <th className="px-3 py-2">OEM Part Name</th>
                  <th className="px-3 py-2">OEM Part #</th>
                  <th className="px-3 py-2">Compatible Part Name</th>
                  <th className="px-3 py-2">Compatible Part #</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {partRows.map((row) => {
                  const result = results[row.id];
                  return (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">{row.part_name}</td>
                      {(['ome_part_name', 'ome_part_number', 'comp_part_name', 'comp_part_number'] as const).map((f) => (
                        <td key={f} className="px-3 py-2">
                          <input
                            type="text"
                            value={row[f]}
                            onChange={(e) => updatePartRowField(row.id, f, e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {result ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                            result.status === 'success' ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {result.status === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {result.message}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removePartRow(row.id)} className="text-gray-300 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => submitAllParts()}
            disabled={!isSharedContextValid || isSubmitting}
            className="mt-4 flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isSubmitting
              ? `Adding ${submitProgress.current}/${submitProgress.total}...`
              : `Add All ${partRows.length} Parts`}
          </button>
          {!isSharedContextValid && (
            <p className="text-xs text-amber-600 mt-2">
              Click "Validate Context" above first — the context must pass validation before submitting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
