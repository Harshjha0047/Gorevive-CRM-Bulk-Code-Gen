import { z } from 'zod';
import {
  fetchMasterData,
  fetchDynamicMap,
  fetchPartFormBlankState,
  fetchPartFormState,
  findExactMatch,
} from './apiUtils';

// ---------------------------------------------------------------------------
// Shared context — filled ONCE, applies to every part row in the batch.
// This is exactly the set of fields that were previously being re-entered
// per part: Part Type, Sub Cat, Brand, Model, HSN Code, Category,
// Purchase Price, Original/Compatible.
// ---------------------------------------------------------------------------

export const sharedContextSchema = z.object({
  part_type: z.string().min(1, 'Part Type is required'),
  sub_product_id: z.string().min(1, 'Sub Cat is required'),
  make: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  hsn_code: z.string().min(1, 'HSN Code is required'),
  cat: z.string().min(1, 'Stock Category is required'),
  purchase_price: z.string().optional().default(''),
  part_compatible: z.string().optional().default(''),
});

export type SharedContext = z.infer<typeof sharedContextSchema>;

export const emptySharedContext: SharedContext = {
  part_type: '',
  sub_product_id: '',
  make: '',
  model: '',
  hsn_code: '',
  cat: '',
  purchase_price: '',
  part_compatible: '',
};

// ---------------------------------------------------------------------------
// Per-part row — only what actually varies part to part.
// ---------------------------------------------------------------------------

export interface PartRow {
  id: string;
  part_name: string;
  ome_part_name: string;
  ome_part_number: string;
  comp_part_name: string;
  comp_part_number: string;
}

export function newPartRow(partName = ''): PartRow {
  return {
    id: crypto.randomUUID(),
    part_name: partName,
    ome_part_name: '',
    ome_part_number: '',
    comp_part_name: '',
    comp_part_number: '',
  };
}

// ---------------------------------------------------------------------------
// Option sources for each shared-context dropdown.
// ---------------------------------------------------------------------------

/** Part Type has no dependency, and its full list is on the blank form. */
export async function getPartTypeOptions(): Promise<Record<string, string>> {
  const blank = await fetchPartFormBlankState();
  return blank.part_type || {};
}

/** Sub Cat is static (present, unfiltered, even on the blank form). */
export async function getSubCatOptions(): Promise<Record<string, string>> {
  const blank = await fetchPartFormBlankState();
  return blank.sub_product_id || {};
}

/** HSN Code is static — reuses the SAME master data already cached for Models. */
export async function getHsnCodeOptions(): Promise<Record<string, string>> {
  const master = await fetchMasterData();
  return master.hsn_code || {};
}

/** Stock Category is static — reuses the same blank-form fetch as Sub Cat/Part Type. */
export async function getCategoryOptions(): Promise<Record<string, string>> {
  const blank = await fetchPartFormBlankState();
  return blank.cat || {};
}

/** Original/Compatible is static — same blank-form fetch. */
export async function getPartCompatibleOptions(): Promise<Record<string, string>> {
  const blank = await fetchPartFormBlankState();
  return blank.part_compatible || {};
}

/** Brand — reuses the EXACT same master data already used for Models. */
export async function getBrandOptions(): Promise<Record<string, string>> {
  const master = await fetchMasterData();
  return master.make || {};
}

/** Model — reuses the EXACT same brand-dependent lookup already used for Models. */
export async function getModelOptions(brandId: string): Promise<Record<string, string>> {
  if (!brandId) return {};
  return fetchDynamicMap('getModel_masterlist', brandId);
}

/**
 * Part Name is the one field genuinely revealed only once enough context
 * is chosen — this replicates the form's own self-resubmit cascade by
 * POSTing back whatever of the shared context is filled in so far.
 */
export async function getPartNameOptions(context: SharedContext): Promise<Record<string, string>> {
  const state = await fetchPartFormState({
    part_type: context.part_type,
    sub_product_id: context.sub_product_id,
    make: context.make,
    model: context.model,
    hsn_code: context.hsn_code,
  });
  return state.part_name || {};
}

// ---------------------------------------------------------------------------
// Validation — resolves the shared context's human-readable values into
// backend ids/values, exact-match only (same philosophy as the Model flow:
// no silent fuzzy acceptance).
// ---------------------------------------------------------------------------

export interface SharedContextValidation {
  resolved: Partial<SharedContext>;
  errors: Partial<Record<keyof SharedContext, string>>;
  isValid: boolean;
}

export async function validateSharedContext(raw: SharedContext): Promise<SharedContextValidation> {
  const resolved: Partial<SharedContext> = { ...raw };
  const errors: Partial<Record<keyof SharedContext, string>> = {};

  const partTypeMap = await getPartTypeOptions();
  const matchedPartType = findExactMatch(partTypeMap, raw.part_type);
  if (matchedPartType) resolved.part_type = matchedPartType;
  else errors.part_type = `"${raw.part_type}" is not a valid Part Type.`;

  const subCatMap = await getSubCatOptions();
  const matchedSubCat = findExactMatch(subCatMap, raw.sub_product_id);
  if (matchedSubCat) resolved.sub_product_id = matchedSubCat;
  else errors.sub_product_id = `"${raw.sub_product_id}" is not a valid Sub Cat.`;

  const brandMap = await getBrandOptions();
  const matchedBrand = findExactMatch(brandMap, raw.make);
  if (matchedBrand) {
    // Submit the raw brand TEXT ("DELL"), not master.make's resolved id —
    // confirmed via a live DevTools payload comparison that addPart_new.php
    // expects Brand as plain text, unlike Sub Cat which expects its id.
    // matchedBrand (the id) is still needed internally, just for looking up
    // the Model list below — that lookup genuinely needs it.
    resolved.make = raw.make;

    const modelMap = await getModelOptions(matchedBrand);
    const matchedModel = findExactMatch(modelMap, raw.model);
    if (matchedModel) resolved.model = matchedModel;
    else errors.model = `"${raw.model}" is not a valid Model for ${raw.make}.`;
  } else {
    errors.make = `"${raw.make}" is not a valid Brand.`;
    if (raw.model) errors.model = 'Cannot verify Model — Brand did not match.';
  }

  const hsnMap = await getHsnCodeOptions();
  const matchedHsn = findExactMatch(hsnMap, raw.hsn_code);
  if (matchedHsn) resolved.hsn_code = matchedHsn;
  else errors.hsn_code = `"${raw.hsn_code}" is not a valid HSN Code.`;

  const catMap = await getCategoryOptions();
  const matchedCat = findExactMatch(catMap, raw.cat);
  if (matchedCat) resolved.cat = matchedCat;
  else errors.cat = `"${raw.cat}" is not a valid Stock Category.`;

  const compatMap = await getPartCompatibleOptions();
  if (raw.part_compatible) {
    const matchedCompat = findExactMatch(compatMap, raw.part_compatible);
    if (matchedCompat) resolved.part_compatible = matchedCompat;
    else errors.part_compatible = `"${raw.part_compatible}" is not a valid Original/Compatible value.`;
  } else {
    resolved.part_compatible = '';
  }

  return { resolved, errors, isValid: Object.keys(errors).length === 0 };
}
