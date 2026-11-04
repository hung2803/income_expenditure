interface Env { API: Fetcher }
export const onRequest: PagesFunction<Env> = async ({ request, env }) => env.API.fetch(request);