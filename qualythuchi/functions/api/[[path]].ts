
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = async ({
  request,
  env
}) => {
  // Giữ nguyên method, path, query, headers và body.
  // Service binding chuyển request đến Worker.
  return env.API.fetch(request);
};
