import axios from "axios";

// Cliente HTTP do navegador. Só fala com as rotas /api do próprio app: são elas
// que chamam o MCP do Belvo Panorama com o token do usuário (que fica no servidor).
export const http = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json" },
});

http.interceptors.response.use(undefined, (error) => {
  // Sessão do app expirou: o proxy responde 401 nas rotas /api. Navegação
  // completa de propósito: não há router aqui e descarta o cache das consultas.
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  return Promise.reject(error);
});

/** Mensagem legível de um erro do axios (usa o { error } que as rotas devolvem). */
export function errorMessage(error: unknown, fallback = "Algo deu errado.") {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: string } | undefined;
    return body?.error ?? error.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
