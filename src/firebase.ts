import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const configuredDatabaseId = ((firebaseConfig as any).firestoreDatabaseId as string | undefined)?.trim();
const useNamedDatabase = Boolean(configuredDatabaseId && configuredDatabaseId !== '(default)');

export const db = useNamedDatabase ? getFirestore(app, configuredDatabaseId!) : getFirestore(app);
export const  auth = getAuth(app);

// Cria usuário no Firebase Auth sem alterar a sessão autenticada do app principal.
// Se o e-mail já existir, faz sign-in temporário para recuperar o UID existente.
export const createAuthUserWithSecondaryApp = async (email: string, password: string) => {
	const secondaryApp = initializeApp(firebaseConfig, `secondary-auth-${Date.now()}`);
	try {
		const secondaryAuth = getAuth(secondaryApp);
		try {
			const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
			await signOut(secondaryAuth);
			return credential.user.uid;
		} catch (createErr: any) {
			// E-mail já cadastrado no Firebase Auth — recupera o UID fazendo sign-in temporário.
			if (createErr?.code === 'auth/email-already-in-use') {
				const existing = await signInWithEmailAndPassword(secondaryAuth, email, password);
				await signOut(secondaryAuth);
				return existing.user.uid;
			}
			throw createErr;
		}
	} finally {
		await deleteApp(secondaryApp);
	}
};
