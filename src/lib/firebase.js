import { initializeApp } from 'firebase/app'
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
} from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { firebaseConfig } from './firebaseConfig'

// `npm run dev:emu` points the app at the local Firebase emulators (`npm run emulators`)
export const useEmulators = !!import.meta.env.VITE_USE_EMULATORS

// False until src/lib/firebaseConfig.js has been filled in
export const configured = useEmulators || firebaseConfig.apiKey !== 'REPLACE_ME'

export const app = initializeApp(
  useEmulators ? { apiKey: 'demo', authDomain: 'demo-utskc.firebaseapp.com', projectId: 'demo-utskc', appId: 'demo' } : firebaseConfig
)

// Offline persistence: cached reads (profile, sessions, own attendance) keep working with no network
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const auth      = getAuth(app)
export const functions = getFunctions(app)

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}
