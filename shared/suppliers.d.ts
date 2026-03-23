export type SupplierDirectoryEntry = {
    sourceSlug: string;
    supplierSlug: string;
    label: string;
};
export declare const supplierDirectory: SupplierDirectoryEntry[];
export declare function mapSourceToSupplierSlug(source: string): string | null;
export declare function getSupplierLabel(supplierSlug: string | null | undefined): string | null;
