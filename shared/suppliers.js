export const supplierDirectory = [
    { sourceSlug: 'jacks', supplierSlug: 'jackssmallengines', label: "Jack's Small Engines" },
    { sourceSlug: 'proautoparts', supplierSlug: 'proautopartsdirect', label: 'Pro Auto Parts Direct' },
    { sourceSlug: 'exmark', supplierSlug: 'exmark-shop', label: 'Exmark Shop' },
    { sourceSlug: 'menindsup', supplierSlug: 'menominee-industrial', label: 'Menominee Industrial Supply' },
    { sourceSlug: 'partstree', supplierSlug: 'partstree', label: 'PartsTree' },
    { sourceSlug: 'bmikarts', supplierSlug: 'bmi-karts', label: 'BMI Karts' },
    { sourceSlug: 'safford', supplierSlug: 'safford-equipment', label: 'Safford Equipment' },
    { sourceSlug: 'chicagoengines', supplierSlug: 'chicago-engines', label: 'Chicago Engines' },
    { sourceSlug: 'mowpart', supplierSlug: 'mowpart', label: 'MowPart' },
    { sourceSlug: 'repairclinic', supplierSlug: 'repairclinic', label: 'RepairClinic' },
    { sourceSlug: 'sterns', supplierSlug: 'sterns', label: 'Sterns' },
];
const slugLookup = new Map(supplierDirectory.map((entry) => [entry.sourceSlug, entry.supplierSlug]));
const labelLookup = new Map(supplierDirectory.map((entry) => [entry.label.toLowerCase(), entry.supplierSlug]));
const supplierNameLookup = new Map(supplierDirectory.map((entry) => [entry.supplierSlug, entry.label]));
export function mapSourceToSupplierSlug(source) {
    const normalized = source.trim().toLowerCase();
    if (slugLookup.has(normalized)) {
        return slugLookup.get(normalized) ?? null;
    }
    if (labelLookup.has(normalized)) {
        return labelLookup.get(normalized) ?? null;
    }
    return null;
}
export function getSupplierLabel(supplierSlug) {
    if (!supplierSlug)
        return null;
    return supplierNameLookup.get(supplierSlug) ?? null;
}
