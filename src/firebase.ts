import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth, signOut, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { deleteApp } from 'firebase/app';
// @ts-ignore
import productionFirebaseConfig from '../firebase-applet-config.json';

// Modo de teste local (npm run dev:emulador): usa o Firebase Emulator, nunca a produção.
export const USE_EMULATOR = (import.meta as any).env?.VITE_USE_EMULATOR === 'true';
const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_FIRESTORE_HOST = '127.0.0.1';
const EMULATOR_FIRESTORE_PORT = 8080;
const EMULATOR_STORAGE_PORT = 9199;

const firebaseConfig = USE_EMULATOR
	? {
		...(productionFirebaseConfig as any),
		projectId: 'demo-bm-odonto',
		apiKey: 'demo-api-key',
		authDomain: 'demo-bm-odonto.firebaseapp.com',
	}
	: productionFirebaseConfig;

const attachAuthEmulator = (target: Auth) => {
	if (USE_EMULATOR) connectAuthEmulator(target, EMULATOR_AUTH_URL, { disableWarnings: true });
};

if (USE_EMULATOR && typeof document !== 'undefined') {
	console.warn('[MODO TESTE] Conectado ao Firebase Emulator — nenhum dado de produção é usado.');
	document.title = `[TESTE] ${document.title}`;
}

const app = initializeApp(firebaseConfig);
const configuredDatabaseId = ((firebaseConfig as any).firestoreDatabaseId as string | undefined)?.trim();
const useNamedDatabase = Boolean(configuredDatabaseId && configuredDatabaseId !== '(default)');

export const db = useNamedDatabase ? getFirestore(app, configuredDatabaseId!) : getFirestore(app);
export const  auth = getAuth(app);
export const storage = getStorage(app);

if (USE_EMULATOR) {
	attachAuthEmulator(auth);
	connectFirestoreEmulator(db, EMULATOR_FIRESTORE_HOST, EMULATOR_FIRESTORE_PORT);
	connectStorageEmulator(storage, EMULATOR_FIRESTORE_HOST, EMULATOR_STORAGE_PORT);
}

const isEmailAlreadyInUseError = (error: unknown) => {
	return (error as any)?.code === 'auth/email-already-in-use';
};

const createOrRecoverAuthUid = async (email: string, password: string) => {
	const secondaryApp = initializeApp(firebaseConfig, `secondary-auth-${Date.now()}`);
	const secondaryAuth = getAuth(secondaryApp);
	attachAuthEmulator(secondaryAuth);

	try {
		const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
		await signOut(secondaryAuth);
		return credential.user.uid;
	} catch (error) {
		if (!isEmailAlreadyInUseError(error)) {
			throw error;
		}

		const existing = await signInWithEmailAndPassword(secondaryAuth, email, password);
		await signOut(secondaryAuth);
		return existing.user.uid;
	} finally {
		await deleteApp(secondaryApp);
	}
};

// Cria usuário no Firebase Auth sem alterar a sessão autenticada do app principal.
// Se o e-mail já existir, faz sign-in temporário para recuperar o UID existente.
export const createAuthUserWithSecondaryApp = async (email: string, password: string) => {
	return createOrRecoverAuthUid(email, password);
};
