import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase configuration for project: hire-ai-fe938
const firebaseConfig = {
  apiKey: "AIzaSyD4IXrgb5NXLnNx3aJYs7f5_8FS-_kmRWY",
  authDomain: "hire-ai-fe938.firebaseapp.com",
  projectId: "hire-ai-fe938",
  storageBucket: "hire-ai-fe938.firebasestorage.app",
  messagingSenderId: "522227698872",
  appId: "1:52227698872:web:33adf5b7f04b86501d784d",
  measurementId: "G-PQKSP25YYJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);
