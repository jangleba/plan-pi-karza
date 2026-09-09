import { createClient } from "@supabase/supabase-js";

const bucket = "vision-videos";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY tylko dla tego polecenia.");
  process.exitCode = 1;
} else {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function listFiles(prefix = "") {
    const files = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1_000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      if (!data?.length) break;
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id) files.push(path);
        else files.push(...(await listFiles(path)));
      }
      if (data.length < 1_000) break;
      offset += data.length;
    }
    return files;
  }

  try {
    const paths = await listFiles();
    console.log(`Vision Lab: znaleziono ${paths.length} plików.`);
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw error;
      console.log(`Usunięto ${Math.min(index + batch.length, paths.length)}/${paths.length}.`);
    }
    const { error: bucketError } = await supabase.storage.deleteBucket(bucket);
    if (bucketError && !/not found/i.test(bucketError.message)) throw bucketError;
    console.log("Vision Lab: pliki i bucket zostały trwale usunięte.");
  } catch (error) {
    console.error("Nie udało się usunąć Vision Lab:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
