import { auth } from '../firebase';
import { API_BASE } from './utils';

/**
 * fetch para as rotas /api do servidor enviando o token de login do Firebase.
 * As rotas protegidas recusam chamadas sem esse cabeçalho (401).
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const currentUser = auth.currentUser;
  if (currentUser) {
    headers.set('Authorization', `Bearer ${await currentUser.getIdToken()}`);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
