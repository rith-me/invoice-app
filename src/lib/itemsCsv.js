import Papa from "papaparse";
import { uid, num } from "@/lib/helpers";
import { ITEM_CATEGORIES, ITEM_UNITS } from "@/lib/helpers";

export const CSV_TEMPLATE = "Category,Code,Description,Supplier Name,Unit,Cost,Rate,Stock\nCurtain,LKA 328-4,Curtain Fabric 320cm,ABC Fabric Supply,m2,6.00,10.50,25\nBlinds,AW101 50mm,Wooden Blinds,Sunshade Supplies,m2,18.00,30.00,40\n";

function slugKey(k) {
  return String(k || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findField(row, candidates) {
  const entries = Object.keys(row).map((k) => [slugKey(k), row[k]]);
  for (const cand of candidates) {
    const hit = entries.find(([k]) => k === cand);
    if (hit && hit[1] !== undefined && String(hit[1]).trim() !== "") return String(hit[1]).trim();
  }
  return "";
}
function matchCategory(value) {
  const hit = ITEM_CATEGORIES.find((c) => c.toLowerCase() === value.toLowerCase());
  return hit || value || ITEM_CATEGORIES[0];
}
function matchUnit(value) {
  const hit = ITEM_UNITS.find((u) => u.value.toLowerCase() === value.toLowerCase() || u.label.toLowerCase() === value.toLowerCase());
  return hit ? hit.value : value || "m2";
}

export function parseItemsCsv(text) {
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = result.data || [];
  const parsed = [];
  let skipped = 0;
  rows.forEach((row) => {
    const desc = findField(row, ["description", "desc", "name", "item", "itemname"]);
    if (!desc) { skipped++; return; }
    parsed.push({
      id: uid(),
      desc,
      code: findField(row, ["code", "sku"]),
      category: matchCategory(findField(row, ["category", "cat"])),
      supplierName: findField(row, ["supplier", "suppliername", "vendor"]),
      unit: matchUnit(findField(row, ["unit", "uom"])),
      cost: num(findField(row, ["cost", "costprice"])),
      rate: num(findField(row, ["rate", "price", "sellprice", "sellingprice"])),
      stock: num(findField(row, ["stock", "qty", "quantity", "inventory", "stockonhand"])),
    });
  });
  return { parsed, skipped };
}