import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Cria usuário no Firebase Auth sem alterar a sessão autenticada do app principal.
export const createAuthUserWithSecondaryApp = async (email: string, password: string) => {
	const secondaryApp = initializeApp(firebaseConfig, `secondary-auth-${Date.now()}`);
	try {
		const secondaryAuth = getAuth(secondaryApp);
		const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
		await signOut(secondaryAuth);
		return credential.user.uid;
	} finally {
		await deleteApp(secondaryApp);
	}
};
