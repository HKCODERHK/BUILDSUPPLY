// Single source of truth for which attribute fields the smart Add/Edit form
// shows per category, and the fixed option lists for each — shared by the
// admin catalog form and the supplier's search-result labels so they never
// drift apart. Diameter/grade/vehicle/cement-type lists are fixed industry
// standards (IS-code steel grades, standard rolled diameters), not
// admin-editable data — every list carries an "Other" fallback so nothing
// is a hard blocker.

export type AttributeFieldKey = 'vehicle' | 'capacity_cft' | 'diameter_mm' | 'grade' | 'length_m' | 'cement_type' | 'pack_size_kg'

export interface AttributeFieldDef {
  key: AttributeFieldKey
  label: string
  options: string[]
  allowOther: boolean
  allowCustomValue?: boolean // free-text instead of a dropdown (e.g. length)
}

export interface CategoryAttributeConfig {
  categorySlug: string
  showBrand: boolean
  fields: AttributeFieldDef[]
  defaultUnit: string
}

export const VEHICLE_OPTIONS = ['Tractor', 'Truck']
export const CAPACITY_CFT_OPTIONS = ['400', '600']
export const DIAMETER_MM_OPTIONS = ['6', '8', '10', '12', '16', '20', '25', '28', '32', '36', '40']
export const GRADE_OPTIONS = ['Fe415', 'Fe500', 'Fe500D', 'Fe550', 'Fe550D', 'Fe600']
export const CEMENT_TYPE_OPTIONS = ['OPC', 'OPC 43', 'OPC 53', 'PPC', 'PSC']
export const PACK_SIZE_KG_OPTIONS = ['25', '50']

export const CATEGORY_ATTRIBUTE_CONFIG: Record<string, CategoryAttributeConfig> = {
  sand: {
    categorySlug: 'sand',
    showBrand: false,
    defaultUnit: 'Load',
    fields: [
      { key: 'vehicle', label: 'Vehicle', options: VEHICLE_OPTIONS, allowOther: false },
      { key: 'capacity_cft', label: 'Capacity (CFT)', options: CAPACITY_CFT_OPTIONS, allowOther: true },
    ],
  },
  'metal-gitti': {
    categorySlug: 'metal-gitti',
    showBrand: false,
    defaultUnit: 'Load',
    fields: [
      { key: 'vehicle', label: 'Vehicle', options: VEHICLE_OPTIONS, allowOther: false },
      { key: 'capacity_cft', label: 'Capacity (CFT)', options: CAPACITY_CFT_OPTIONS, allowOther: true },
    ],
  },
  'steel-tmt-rods': {
    categorySlug: 'steel-tmt-rods',
    showBrand: true,
    defaultUnit: 'KG',
    fields: [
      { key: 'diameter_mm', label: 'Diameter (mm)', options: DIAMETER_MM_OPTIONS, allowOther: true },
      { key: 'grade', label: 'Grade', options: GRADE_OPTIONS, allowOther: true },
      { key: 'length_m', label: 'Length (m)', options: ['12'], allowOther: true, allowCustomValue: true },
    ],
  },
  cement: {
    categorySlug: 'cement',
    showBrand: true,
    defaultUnit: 'Bag',
    fields: [
      { key: 'cement_type', label: 'Type', options: CEMENT_TYPE_OPTIONS, allowOther: true },
      { key: 'pack_size_kg', label: 'Packaging (KG)', options: PACK_SIZE_KG_OPTIONS, allowOther: true },
    ],
  },
}

const ATTRIBUTE_LABELS: Record<AttributeFieldKey, (value: string) => string> = {
  vehicle: (v) => v,
  capacity_cft: (v) => `${v} CFT`,
  diameter_mm: (v) => `${v}mm`,
  grade: (v) => v,
  length_m: (v) => `${v}m`,
  cement_type: (v) => v,
  pack_size_kg: (v) => `${v} KG`,
}

// Builds a short "12mm • Fe500D" / "Truck – 400 CFT" style summary from a
// variant's raw attributes object, in a fixed, predictable field order.
export function summarizeAttributes(attributes: Record<string, unknown> | null | undefined): string {
  if (!attributes) return ''
  const order: AttributeFieldKey[] = [
    'vehicle',
    'capacity_cft',
    'diameter_mm',
    'grade',
    'length_m',
    'cement_type',
    'pack_size_kg',
  ]
  const parts: string[] = []
  for (const key of order) {
    const value = attributes[key]
    if (value === undefined || value === null || value === '') continue
    parts.push(ATTRIBUTE_LABELS[key](String(value)))
  }
  return parts.join(' • ')
}
