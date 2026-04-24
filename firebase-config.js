// ============================================================
//  TaskMaster — Firebase Configuration
//  Auth: Firebase Email/Password
//  Database: Cloud Firestore
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyCxa9wQIAP7eIYySopKn5SD6IgwFc2EUS0",
    authDomain:        "to-do-list-51670.firebaseapp.com",
    projectId:         "to-do-list-51670",
    storageBucket:     "to-do-list-51670.firebasestorage.app",
    messagingSenderId: "504776383910",
    appId:             "1:504776383910:web:ea4363a4ac29ac95d88367",
    measurementId:     "G-5XD7SQRJLT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
