import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Handle UI redirections based on auth state
onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname;
    // Handle clean URLs (Vercel) and traditional filenames
    const isLoginPage = path.endsWith('/login') || path.endsWith('/login.html');
    const isSignupPage = path.endsWith('/signup') || path.endsWith('/signup.html');
    const isAuthPage = isLoginPage || isSignupPage;
    
    if (user) {
        // User is signed in
        localStorage.setItem('currentUser', user.email);
        
        // Update Daily Streak
        await updateStreak(user);

        if (isAuthPage) {
            window.location.href = 'index.html';
        }
    } else {
        // User is signed out
        localStorage.removeItem('currentUser');
        
        // Don't redirect from landing, login, signup or contact pages
        const isLandingPage = path === '/' || path === '/index.html';
        const isContactPage = path.includes('contact.html') || path.includes('/contact');
        
        if (!isAuthPage && !isContactPage && !isLandingPage) {
            window.location.href = 'login.html';
        }
        
        // If they are on index/root and not logged in, redirect to login
        if (isLandingPage) {
            window.location.href = 'login.html';
        }
    }
});

// Sign Up Function
export async function handleSignUp(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Initial user document creation with username
        const userDocRef = doc(db, "users", user.uid);
        const todayAtMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
        
        await setDoc(userDocRef, {
            username: username || email.split('@')[0],
            currentStreak: 1,
            lastCheckinDate: todayAtMidnight,
            lastActive: serverTimestamp(),
            badges: []
        });

        return { success: true, user: user };
    } catch (error) {
        console.error("Signup Error:", error.message);
        return { success: false, error: error.message };
    }
}

// Login Function
export async function handleLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Login Error:", error.message);
        return { success: false, error: error.message };
    }
}

// Logout Function
export async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout Error:", error.message);
    }
}

// Streak Tracking Logic (Fixed field names to match your DB screenshot)
async function updateStreak(user) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        const now = new Date();
        const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                username: user.displayName || user.email.split('@')[0],
                currentStreak: 1,
                lastCheckinDate: todayAtMidnight,
                lastActive: serverTimestamp(),
                badges: []
            });
            return;
        }
        
        const data = userDoc.data();
        const lastCheckinDate = data.lastCheckinDate;
        
        if (lastCheckinDate === todayAtMidnight) {
            // Already updated today
            return;
        }
        
        if (lastCheckinDate === todayAtMidnight - oneDayMs) {
            // Consecutive day
            await updateDoc(userDocRef, {
                currentStreak: (data.currentStreak || 0) + 1,
                lastActive: serverTimestamp(),
                lastCheckinDate: todayAtMidnight
            });
        } else {
            // Missed a day, reset streak
            await updateDoc(userDocRef, {
                currentStreak: 1,
                lastActive: serverTimestamp(),
                lastCheckinDate: todayAtMidnight
            });
        }
    } catch (error) {
        console.error("Streak Update Error:", error);
    }
}
// Auto-attach logout listener if button exists
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.onclick = async (e) => {
            e.preventDefault();
            await handleLogout();
        };
    }
});
