import * as XLSX from 'xlsx';
import { bulkModelSchema, type ValidatedRow, type BulkModelPayload } from './validation';
import {
  fetchMasterData,
  fetchDynamicMap,
  findExactMatch,
  suggestClosest,
  describeCharDiff,
  type MasterData,
} from './apiUtils';

export const COLUMN_MAPPING: Record<string, string> = {
  'Brand *': 'make',
  'Category Name *': 'product_name',
  'Sub Category *': 'sub_producd',
  'Model Name *': 'model',
  'HSN Code *': 'hsn_code',
  'RAM Capacity': 'ram_cap',
  'HDD': 'strg1',
  'SSD': 'strg2',
  'CPU Core': 'cpu_core',
  'CPU Gen': 'cpu_gen',
  'CPU Speed': 'cpu_speed',
  'Color': 'color',
  'Graphic Type': 'gpu_type',
  'Graphic Capacity': 'gpu_cap',
  'Display Type': 'display_type',
  'Display Size': 'display_size',
  'Keyboard (Y/N)': 'keyboard',
  'Optical Drive': 'op_drive',
  'Is New (Y/N)': 'model_typenew',
};

// Fields that are required (marked * in the source form). Everything else
// is optional — but if an optional field is filled in, it must STILL
// exactly match a valid option (no half-empty leniency).
const REQUIRED_FIELDS = new Set(['make', 'product_name', 'sub_producd', 'model', 'hsn_code']);

// Fields backed by a STATIC dropdown (available straight from master data,
// no brand/category dependency). Each of these must exact-match a key in
// master[field] if the cell isn't empty.
const STATIC_DROPDOWN_FIELDS = [
  'hsn_code',
  'ram_cap',
  'strg1',
  'strg2',
  'cpu_core',
  'cpu_gen',
  'cpu_speed',
  'color',
  'gpu_type',
  'gpu_cap',
  'display_type',
  'display_size',
] as const;

// Free-text fields with no dropdown behind them — no exact-match check needed.
const FREE_TEXT_FIELDS = new Set(['op_drive']);

export const downloadTemplate = () => {
  const headers = Object.keys(COLUMN_MAPPING);
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk_Upload_Template');
  XLSX.writeFile(workbook, 'GoRevive_Model_Upload_Template.xlsx');
};

/**
 * Builds a "did you mean X?" hint for the error message, or a generic
 * "no match at all" message if nothing close was found.
 */
function buildMismatchError(fieldLabel: string, rawValue: string, map: Record<string, string>): string {
  if (!rawValue) {
    return `${fieldLabel} is required.`;
  }

  const suggestion = suggestClosest(map, rawValue);
  if (!suggestion) {
    return `"${rawValue}" was not found in the system's ${fieldLabel} list.`;
  }

  const diff = describeCharDiff(rawValue, suggestion);

  // Full diagnostic in the console — includes every char code, so even
  // invisible/unicode differences (non-breaking space, en-dash, etc.) are
  // visible if you need to inspect further.
  console.warn(
    `[${fieldLabel} mismatch]`,
    `\n  Your value:    "${rawValue}"  codes: [${Array.from(rawValue).map((c) => c.charCodeAt(0)).join(', ')}]`,
    `\n  Closest match: "${suggestion}"  codes: [${Array.from(suggestion).map((c) => c.charCodeAt(0)).join(', ')}]`
  );

  return diff
    ? `"${rawValue}" does not exactly match "${suggestion}". ${diff}`
    : `"${rawValue}" does not exactly match "${suggestion}" — check for extra/missing spaces or different capitalization.`;
}

export const parseAndValidateExcel = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ValidatedRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // raw: true keeps original cell content without XLSX's own
        // string coercion touching whitespace.
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

        // Static master data (make, hsn_code, ram_cap, strg1, strg2,
        // cpu_core, cpu_gen, cpu_speed, color, gpu_type, gpu_cap,
        // display_type, display_size, keyboard, model_typenew).
        const master: MasterData = await fetchMasterData();

        // Per-brand / per-category caches, filled in as we go row by row
        // so we never call the same API twice for the same brand/category.
        const categoryMapsByBrand: Record<string, Record<string, string>> = {};
        const modelMapsByBrand: Record<string, Record<string, string>> = {};
        const subCategoryMapsByCategory: Record<string, Record<string, string>> = {};

        const total = rawJson.length;
        const validatedRows: ValidatedRow[] = [];

        // ---- Sequential, row-by-row processing (the "queue") ----
        for (let index = 0; index < rawJson.length; index++) {
          const row = rawJson[index];
          onProgress?.(index + 1, total);

          const mappedData: Record<string, string> = {};
          Object.keys(COLUMN_MAPPING).forEach((excelHeader) => {
            const apiKey = COLUMN_MAPPING[excelHeader];
            const cell = row[excelHeader];
            // No trimming: an extra space in the Excel cell must surface
            // as a mismatch, not get silently cleaned away.
            mappedData[apiKey] = cell !== undefined && cell !== null ? String(cell) : '';
          });

          // Snapshot exactly what the user typed, for display in the UI.
          const original: Record<string, string> = { ...mappedData };
          const errors: Record<string, string> = {};

          // --- Brand ---
          const rawBrand = mappedData.make;
          const brandId = findExactMatch(master.make || {}, rawBrand);
          if (brandId) {
            mappedData.make = brandId;
          } else {
            errors.make = buildMismatchError('Brand', rawBrand, master.make || {});
          }

          // --- Category (depends on brand) ---
          let categoryId: string | null = null;
          if (brandId) {
            if (!categoryMapsByBrand[brandId]) {
              categoryMapsByBrand[brandId] = await fetchDynamicMap('getProductName_master', brandId);
            }
            const categoryMap = categoryMapsByBrand[brandId];
            const rawCategory = mappedData.product_name;
            categoryId = findExactMatch(categoryMap, rawCategory);
            if (categoryId) {
              mappedData.product_name = categoryId;
            } else {
              errors.product_name = buildMismatchError('Category', rawCategory, categoryMap);
            }
          } else if (mappedData.product_name) {
            errors.product_name = 'Cannot verify Category — Brand did not match, so the Category list is unknown.';
          } else {
            errors.product_name = 'Category Name is required.';
          }

          // --- Model (depends on brand) ---
          if (brandId) {
            if (!modelMapsByBrand[brandId]) {
              modelMapsByBrand[brandId] = await fetchDynamicMap('getModel_masterlist', brandId);
            }
            const modelMap = modelMapsByBrand[brandId];
            const rawModel = mappedData.model;
            const modelId = findExactMatch(modelMap, rawModel);
            if (modelId) {
              mappedData.model = modelId;
            } else {
              errors.model = buildMismatchError('Model', rawModel, modelMap);
            }
          } else if (mappedData.model) {
            errors.model = 'Cannot verify Model — Brand did not match, so the Model list is unknown.';
          } else {
            errors.model = 'Model Name is required.';
          }

          // --- Sub Category (depends on category) ---
          if (categoryId) {
            if (!subCategoryMapsByCategory[categoryId]) {
              subCategoryMapsByCategory[categoryId] = await fetchDynamicMap('getsubProductName_master', categoryId);
            }
            const subMap = subCategoryMapsByCategory[categoryId];
            const rawSub = mappedData.sub_producd;
            const subId = findExactMatch(subMap, rawSub);
            if (subId) {
              mappedData.sub_producd = subId;
            } else {
              errors.sub_producd = buildMismatchError('Sub Category', rawSub, subMap);
            }
          } else if (mappedData.sub_producd) {
            errors.sub_producd = 'Cannot verify Sub Category — Category did not match, so the Sub Category list is unknown.';
          } else {
            errors.sub_producd = 'Sub Category is required.';
          }

          // --- Static dropdown fields (HSN, RAM, HDD, SSD, CPU*, Color, GPU*, Display*) ---
          STATIC_DROPDOWN_FIELDS.forEach((field) => {
            const rawValue = mappedData[field];
            if (!rawValue) {
              if (REQUIRED_FIELDS.has(field)) {
                errors[field] = `${field} is required.`;
              }
              return; // optional + empty is fine
            }
            const fieldMap = master[field] || {};
            const matchedValue = findExactMatch(fieldMap, rawValue);
            if (matchedValue) {
              mappedData[field] = matchedValue;
            } else {
              errors[field] = buildMismatchError(field, rawValue, fieldMap);
            }
          });

          // --- Keyboard: "Back LIT" / "Non-Back LIT" -> Y/N ---
          if (mappedData.keyboard) {
            const keyboardMap = master.keyboard || {};
            const matched = findExactMatch(keyboardMap, mappedData.keyboard);
            if (matched) {
              mappedData.keyboard = matched;
            } else {
              errors.keyboard = buildMismatchError('Keyboard', mappedData.keyboard, keyboardMap);
            }
          }

          // --- Is New: "NEW" / "Pre-Owned" -> Y/N ---
          if (mappedData.model_typenew) {
            const isNewMap = master.model_typenew || {};
            const matched = findExactMatch(isNewMap, mappedData.model_typenew);
            if (matched) {
              mappedData.model_typenew = matched;
            } else {
              errors.model_typenew = buildMismatchError('Is New', mappedData.model_typenew, isNewMap);
            }
          }

          // Free-text fields (op_drive) pass through untouched — nothing to validate.
          void FREE_TEXT_FIELDS;

          // --- Structural validation on top (types, required-ness, etc.) ---
          const validationResult = bulkModelSchema.safeParse(mappedData);
          if (!validationResult.success) {
            validationResult.error.issues.forEach((issue) => {
              const key = String(issue.path[0]);
              // Don't overwrite a more specific mismatch error we already have.
              if (!errors[key]) {
                errors[key] = issue.message;
              }
            });
          }

          const isValid = Object.keys(errors).length === 0;

          validatedRows.push({
            id: crypto.randomUUID(),
            rowIndex: index + 2,
            data: isValid ? (validationResult.data as BulkModelPayload) : mappedData,
            original,
            isValid,
            errors,
          });
        }

        resolve(validatedRows);
      } catch (error) {
        reject(error);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};