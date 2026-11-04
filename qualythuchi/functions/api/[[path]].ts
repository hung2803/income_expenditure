
export async function onRequest(context) {
  const api = context.env.API;

  if (!api) {
    return Response.json(
      { error: "API_SERVICE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  try {
    return await api.fetch(context.request);
  } catch (error) {
    console.error("API proxy failed", error);

    return Response.json(
      { error: "API_UPSTREAM_UNAVAILABLE" },
      { status: 502 }
    );
  }
}
