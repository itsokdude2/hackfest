// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "cmrhackfest3.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "cmrhackfest3",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "cmrhackfest3.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "262332998236",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:262332998236:web:5aaffb42ba080d09863c99",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-5FDGQTJF02"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Enable Local Persistence
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Firebase Persistence Error:", error);
  });

// Initialize Firestore with robust configuration
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true
});
const storage = getStorage(app); // Initialize Storage
const googleProvider = new GoogleAuthProvider();

export { app, analytics, auth, db, storage, googleProvider };
