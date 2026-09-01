/**
 * CloudVault - Firebase Client Configuration
 * Initializes Firebase App and Firebase Authentication services.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// =========================================================================
// REPLACE WITH YOUR FIREBASE WEB CONFIG FROM FIREBASE CONSOLE:
// Project Settings -> General -> Your apps -> Web app (</>)
// =========================================================================
export const firebaseConfig = {
    apiKey: "AIzaSyDemoKeyForCloudVaultInternship2026",
    authDomain: "cloudvault-system.firebaseapp.com",
    projectId: "cloudvault-system",
    storageBucket: "cloudvault-system.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
};
