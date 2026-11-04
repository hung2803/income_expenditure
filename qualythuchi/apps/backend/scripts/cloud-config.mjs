const environmentNames = ['dev', 'test', 'prod'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateCloudConfig(config, environment) {
  if (!environmentNames.includes(environment)) throw new Error('Select an explicit environment: dev, test or prod.');
  const target = config.env?.[environment];
  if (!target || target.vars?.APP_ENV !== environment) throw new Error('APP_ENV must match the selected Wrangler environment.');
  const database = target.d1_databases?.find((binding) => binding.binding === 'DB');
  if (!database || !uuidPattern.test(database.database_id) || database.database_id.startsWith('00000000-')) {
    throw new Error('Replace the selected D1 placeholder with its real Cloudflare database_id first.');
  }
  if (!target.name || !database.database_name) throw new Error('Worker and database names are required.');
  for (const otherName of environmentNames.filter((name) => name !== environment)) {
    const other = config.env?.[otherName];
    const otherDatabase = other?.d1_databases?.find((binding) => binding.binding === 'DB');
    if (other?.name === target.name || otherDatabase?.database_id === database.database_id || otherDatabase?.database_name === database.database_name) {
      throw new Error('Worker name, D1 name and database_id must be distinct between environments.');
    }
  }
  const origins = target.vars?.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!origins?.length) throw new Error('Set the frontend CORS allowlist for the selected environment.');
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid frontend origin in CORS_ORIGINS.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || origin.includes('*')) {
      throw new Error('CORS_ORIGINS must contain exact HTTP/HTTPS origins without credentials, paths or wildcards.');
    }
    if (environment === 'prod' && url.protocol !== 'https:') throw new Error('Production frontend origins must use HTTPS.');
  }
  return { worker: target.name, database: database.database_name, environment };
}
