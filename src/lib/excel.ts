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
export interface FieldError {
  message: string;
  suggestion?: string;
}

function buildFieldError(fieldLabel: string, rawValue: string, map: Record<string, string>): FieldError {
  if (!rawValue) {
    return { message: `${fieldLabel} is required.` };
  }

  const suggestion = suggestClosest(map, rawValue);
  if (!suggestion) {
    return { message: `"${rawValue}" was not found in the system's ${fieldLabel} list.` };
  }

  const diff = describeCharDiff(rawValue, suggestion);

  console.warn(
    `[${fieldLabel} mismatch]`,
    `\n  Your value:    "${rawValue}"  codes: [${Array.from(rawValue).map((c) => c.charCodeAt(0)).join(', ')}]`,
    `\n  Closest match: "${suggestion}"  codes: [${Array.from(suggestion).map((c) => c.charCodeAt(0)).join(', ')}]`
  );

  const message = diff
    ? `"${rawValue}" does not exactly match "${suggestion}". ${diff}`
    : `"${rawValue}" does not exactly match "${suggestion}" — check for extra/missing spaces or different capitalization.`;

  return { message, suggestion };
}

/**
 * Resolves the brand ID for a row from its raw (human-readable) brand text.
 * Returns null if the brand doesn't exactly match anything.
 */
async function resolveBrandId(original: Record<string, string>): Promise<string | null> {
  const master = await fetchMasterData();
  return findExactMatch(master.make || {}, original.make || '');
}

/**
 * Resolves the category ID for a row, given it already has a valid brand.
 */
async function resolveCategoryId(original: Record<string, string>, brandId: string): Promise<string | null> {
  const categoryMap = await fetchDynamicMap('getProductName_master', brandId);
  return findExactMatch(categoryMap, original.product_name || '');
}

/**
 * Validates + translates a SINGLE row's raw (human-readable) field values
 * into backend codes. Used both for the initial bulk parse AND for
 * re-validating a single row after an inline "apply suggestion" / "pick
 * from list" edit — same logic, one source of truth.
 *
 * NOTE: relies on fetchDynamicMap's internal cache (in apiUtils.ts), so
 * calling this repeatedly for the same brand/category costs no extra
 * network requests after the first time.
 */
export async function validateRow(rawOriginal: Record<string, string>): Promise<{
  data: Record<string, string>;
  errors: Record<string, FieldError>;
  isValid: boolean;
}> {
  const master = await fetchMasterData();
  const mappedData: Record<string, string> = { ...rawOriginal };
  const errors: Record<string, FieldError> = {};

  // --- Brand ---
  const rawBrand = mappedData.make;
  const brandId = findExactMatch(master.make || {}, rawBrand);
  if (brandId) {
    mappedData.make = brandId;
  } else {
    errors.make = buildFieldError('Brand', rawBrand, master.make || {});
  }

  // --- Category (depends on brand) ---
  let categoryId: string | null = null;
  if (brandId) {
    const categoryMap = await fetchDynamicMap('getProductName_master', brandId);
    const rawCategory = mappedData.product_name;
    categoryId = findExactMatch(categoryMap, rawCategory);
    if (categoryId) {
      mappedData.product_name = categoryId;
    } else {
      errors.product_name = buildFieldError('Category', rawCategory, categoryMap);
    }
  } else if (mappedData.product_name) {
    errors.product_name = { message: 'Cannot verify Category — Brand did not match, so the Category list is unknown.' };
  } else {
    errors.product_name = { message: 'Category Name is required.' };
  }

  // --- Model (depends on brand) ---
  if (brandId) {
    const modelMap = await fetchDynamicMap('getModel_masterlist', brandId);
    const rawModel = mappedData.model;
    const modelId = findExactMatch(modelMap, rawModel);
    if (modelId) {
      mappedData.model = modelId;
    } else {
      errors.model = buildFieldError('Model', rawModel, modelMap);
    }
  } else if (mappedData.model) {
    errors.model = { message: 'Cannot verify Model — Brand did not match, so the Model list is unknown.' };
  } else {
    errors.model = { message: 'Model Name is required.' };
  }

  // --- Sub Category (depends on category) ---
  if (categoryId) {
    const subMap = await fetchDynamicMap('getsubProductName_master', categoryId);
    const rawSub = mappedData.sub_producd;
    const subId = findExactMatch(subMap, rawSub);
    if (subId) {
      mappedData.sub_producd = subId;
    } else {
      errors.sub_producd = buildFieldError('Sub Category', rawSub, subMap);
    }
  } else if (mappedData.sub_producd) {
    errors.sub_producd = { message: 'Cannot verify Sub Category — Category did not match, so the Sub Category list is unknown.' };
  } else {
    errors.sub_producd = { message: 'Sub Category is required.' };
  }

  // --- Static dropdown fields ---
  STATIC_DROPDOWN_FIELDS.forEach((field) => {
    const rawValue = mappedData[field];
    if (!rawValue) {
      if (REQUIRED_FIELDS.has(field)) {
        errors[field] = { message: `${field} is required.` };
      }
      return;
    }
    const fieldMap = master[field] || {};
    const matchedValue = findExactMatch(fieldMap, rawValue);
    if (matchedValue) {
      mappedData[field] = matchedValue;
    } else {
      errors[field] = buildFieldError(field, rawValue, fieldMap);
    }
  });

  // --- Keyboard ---
  if (mappedData.keyboard) {
    const keyboardMap = master.keyboard || {};
    const matched = findExactMatch(keyboardMap, mappedData.keyboard);
    if (matched) {
      mappedData.keyboard = matched;
    } else {
      errors.keyboard = buildFieldError('Keyboard', mappedData.keyboard, keyboardMap);
    }
  }

  // --- Is New ---
  if (mappedData.model_typenew) {
    const isNewMap = master.model_typenew || {};
    const matched = findExactMatch(isNewMap, mappedData.model_typenew);
    if (matched) {
      mappedData.model_typenew = matched;
    } else {
      errors.model_typenew = buildFieldError('Is New', mappedData.model_typenew, isNewMap);
    }
  }

  // --- Structural validation on top (types, required-ness, etc.) ---
  const validationResult = bulkModelSchema.safeParse(mappedData);
  if (!validationResult.success) {
    validationResult.error.issues.forEach((issue) => {
      const key = String(issue.path[0]);
      if (!errors[key]) {
        errors[key] = { message: issue.message };
      }
    });
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    data: isValid ? (validationResult.data as BulkModelPayload) : mappedData,
    errors,
    isValid,
  };
}

/**
 * Returns the list of valid display-text options for a field, given the
 * row's CURRENT (possibly still-invalid) values — e.g. category options
 * depend on which brand is currently set. Used to power an inline
 * "pick from list" dropdown in the UI. Returns [] if a dependency
 * (like brand) isn't resolved yet.
 */
export async function getFieldOptions(fieldKey: string, original: Record<string, string>): Promise<string[]> {
  const master = await fetchMasterData();

  if (fieldKey === 'make' || fieldKey === 'keyboard' || fieldKey === 'model_typenew' ||
      (STATIC_DROPDOWN_FIELDS as readonly string[]).includes(fieldKey)) {
    return Object.keys(master[fieldKey] || {});
  }

  if (fieldKey === 'product_name') {
    const brandId = await resolveBrandId(original);
    if (!brandId) return [];
    const categories = await fetchDynamicMap('getProductName_master', brandId);
    return Object.keys(categories);
  }

  if (fieldKey === 'model') {
    const brandId = await resolveBrandId(original);
    if (!brandId) return [];
    const models = await fetchDynamicMap('getModel_masterlist', brandId);
    return Object.keys(models);
  }

  if (fieldKey === 'sub_producd') {
    const brandId = await resolveBrandId(original);
    if (!brandId) return [];
    const categoryId = await resolveCategoryId(original, brandId);
    if (!categoryId) return [];
    const subs = await fetchDynamicMap('getsubProductName_master', categoryId);
    return Object.keys(subs);
  }

  return []; // free-text fields (op_drive) have no fixed list
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

        const total = rawJson.length;
        const validatedRows: ValidatedRow[] = [];

        // ---- Sequential, row-by-row processing (the "queue") ----
        // fetchDynamicMap() caches internally, so repeated brands/categories
        // across rows cost no extra network calls after the first hit.
        for (let index = 0; index < rawJson.length; index++) {
          const row = rawJson[index];
          onProgress?.(index + 1, total);

          const original: Record<string, string> = {};
          Object.keys(COLUMN_MAPPING).forEach((excelHeader) => {
            const apiKey = COLUMN_MAPPING[excelHeader];
            const cell = row[excelHeader];
            // No trimming: an extra space in the Excel cell must surface
            // as a mismatch, not get silently cleaned away.
            original[apiKey] = cell !== undefined && cell !== null ? String(cell) : '';
          });

          const result = await validateRow(original);

          validatedRows.push({
            id: crypto.randomUUID(),
            rowIndex: index + 2,
            data: result.data,
            original,
            isValid: result.isValid,
            errors: result.errors,
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