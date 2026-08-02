// ---------- storage (Supabase) ----------
// Each row stores its full object in a `data` jsonb column, keyed by the app's own `id`.
// `settings` is a single row with id = 1.
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_SETTINGS } from "@/lib/helpers";


async function loadTable(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: true });
  if (error) { console.error(`load ${table}:`, error.message); return []; }
  return (data || []).map((row) => row.data);
}

export async function loadAll() {
  const out = { clients: [], invoices: [], settings: DEFAULT_SETTINGS, items: [], expenses: [], schedule: [], trash: [] };
  try {
    out.clients = await loadTable("clients");
  } catch (e) { console.error(e); }
  try {
    out.invoices = await loadTable("invoices");
  } catch (e) { console.error(e); }
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data) out.settings = { ...DEFAULT_SETTINGS, ...data.data };
  } catch (e) { console.error("load settings:", e); }
  try {
    out.items = await loadTable("items");
  } catch (e) { console.error(e); }
  try {
    out.expenses = await loadTable("expenses");
  } catch (e) { console.error(e); }
  try {
    out.schedule = await loadTable("schedule");
  } catch (e) { console.error(e); }
  try {
    out.trash = await loadTable("trash");
  } catch (e) { console.error(e); }
  return out;
}

// Full-replace sync: deletes everything currently in the table and re-inserts the
// given list. Simple and safe for a single-user / small-team app; if you later need
// multiple people editing at once, switch this to incremental upsert + delete-by-diff.
async function saveTable(table, rows) {
  try {
    const { error: delErr } = await supabase.from(table).delete().not("id", "is", null);
    if (delErr) throw delErr;
    if (rows.length) {
      const payload = rows.map((r) => ({ id: r.id, data: r }));
      const { error: insErr } = await supabase.from(table).upsert(payload, { onConflict: "id" }); // was .insert(payload)
      if (insErr) throw insErr;
    }
  } catch (e) { console.error(`save ${table}:`, e.message || e); }
}

export async function saveClients(clients) { await saveTable("clients", clients); }
export async function saveInvoices(invoices) { await saveTable("invoices", invoices); }
export async function saveItems(items) { await saveTable("items", items); }
export async function saveSettings(settings) {
  try {
    const { error } = await supabase.from("settings").upsert({ id: 1, data: settings });
    if (error) throw error;
  } catch (e) { console.error("save settings:", e.message || e); }
}

export async function saveExpenses(expenses) { await saveTable("expenses", expenses); }
export async function saveSchedule(schedule) { await saveTable("schedule", schedule); }
export async function saveTrash(trash) { await saveTable("trash", trash); }
