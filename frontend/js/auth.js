/**
 * CloudVault - Authentication Controller
 * Manages Student/Admin Registration, Login, Session Management, and Role-based Routing.
 */

import { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile 
} from "./firebase-config.js";
import { apiRequest, showToast } from "./api.js";

// =========================================================================
// REGISTER USER
// =========================================================================
export async function handleRegister(e) {
    if (e) e.preventDefault();

    const nameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const submitBtn = document.getElementById("registerBtn");

    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";

    // Field Validations
    if (!name || !email || !password || !confirmPassword) {
        showToast("Please fill in all registration fields.", "warning");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.", "warning");
        return;
    }

    if (password !== confirmPassword) {
        showToast("Passwords do not match.", "error");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
    }

    try {
        // 1. Create User in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Set Firebase Profile Display Name
        try {
            await updateProfile(user, { displayName: name });
        } catch (nameErr) {
            console.warn("Could not set profile displayName:", nameErr);
        }

        // 3. Sync User Profile with Flask Backend Firestore database
        try {
            await apiRequest("/user/create", {
                method: "POST",
                body: JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    name: name
                })
            });
        } catch (syncErr) {
            console.warn("Backend sync warning:", syncErr);
        }

        showToast("Account created successfully! Welcome to CloudVault.", "success");
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);

    } catch (error) {
        console.error("Registration error:", error);
        let msg = error.message;
        if (error.code === "auth/email-already-in-use") {
            msg = "An account with this email already exists. Please log in.";
        } else if (error.code === "auth/invalid-email") {
            msg = "Invalid email address format.";
        } else if (error.code === "auth/weak-password") {
            msg = "Password is too weak. Please use at least 6 characters.";
        }
        showToast(msg, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Create Account";
        }
    }
}

// =========================================================================
// LOGIN USER
// =========================================================================
export async function handleLogin(e) {
    if (e) e.preventDefault();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const submitBtn = document.getElementById("loginBtn");

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email || !password) {
        showToast("Please enter both email and password.", "warning");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Signing In...';
    }

    try {
        // 1. Sign In with Firebase Authentication
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Fetch User Profile to determine role
        try {
            const profileData = await apiRequest("/user/profile");
            const role = profileData.user?.role || "student";

            showToast("Login successful! Redirecting...", "success");
            setTimeout(() => {
                if (role === "admin") {
                    window.location.href = "admin.html";
                } else {
                    window.location.href = "dashboard.html";
                }
            }, 800);
        } catch (profileErr) {
            // Default to student dashboard if profile fetch fails
            window.location.href = "dashboard.html";
        }

    } catch (error) {
        console.error("Login error:", error);
        let msg = error.message;
        if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
            msg = "Invalid email or password. Please try again.";
        } else if (error.code === "auth/too-many-requests") {
            msg = "Too many failed attempts. Please try again later.";
        }
        showToast(msg, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Sign In";
        }
    }
}

// =========================================================================
// DEMO ACCOUNT QUICK LOGIN (FOR DEVELOPMENT & DEMO TESTING)
// =========================================================================
export function loginWithDemo(role = "student") {
    if (role === "admin") {
        localStorage.setItem("cloudvault_auth_token", "demo-admin-token");
        localStorage.setItem("cloudvault_demo_user", JSON.stringify({
            uid: "admin_dev_uid",
            name: "Cloud Administrator",
            email: "admin@cloudvault.edu",
            role: "admin"
        }));
        showToast("Logged in as Demo Administrator", "info");
        setTimeout(() => window.location.href = "admin.html", 600);
    } else {
        localStorage.setItem("cloudvault_auth_token", "demo-student-token");
        localStorage.setItem("cloudvault_demo_user", JSON.stringify({
            uid: "student_dev_uid",
            name: "Alex Johnson",
            email: "student@cloudvault.edu",
            role: "student"
        }));
        showToast("Logged in as Demo Student", "info");
        setTimeout(() => window.location.href = "dashboard.html", 600);
    }
}

// =========================================================================
// LOGOUT USER
// =========================================================================
export async function handleLogout() {
    try {
        localStorage.removeItem("cloudvault_auth_token");
        localStorage.removeItem("cloudvault_demo_user");
        await signOut(auth);
    } catch (e) {
        console.warn("Sign out error:", e);
    } finally {
        window.location.href = "login.html";
    }
}

// =========================================================================
// AUTH STATE LISTENER & PAGE PROTECTION
// =========================================================================
export function initAuthListener(pageType) {
    onAuthStateChanged(auth, async (user) => {
        const demoToken = localStorage.getItem("cloudvault_auth_token");
        const hasAuth = user || demoToken;

        if (pageType === "auth_page") {
            // In Login / Register page: if authenticated, redirect to app
            if (hasAuth) {
                try {
                    const profile = await apiRequest("/user/profile");
                    if (profile.user?.role === "admin") {
                        window.location.href = "admin.html";
                    } else {
                        window.location.href = "dashboard.html";
                    }
                } catch {
                    window.location.href = "dashboard.html";
                }
            }
        } else if (pageType === "protected_student" || pageType === "protected_admin") {
            // In protected pages: if unauthenticated, redirect to login
            if (!hasAuth) {
                window.location.href = "login.html";
                return;
            }

            // Check admin authorization on admin page
            if (pageType === "protected_admin") {
                try {
                    const profile = await apiRequest("/user/profile");
                    if (profile.user?.role !== "admin") {
                        showToast("Admin privileges required. Redirecting to Student Dashboard.", "warning");
                        setTimeout(() => window.location.href = "dashboard.html", 1200);
                    }
                } catch {
                    // Allowed if in demo mode with admin token
                    if (demoToken !== "demo-admin-token") {
                        window.location.href = "dashboard.html";
                    }
                }
            }
        }
    });
}

// Expose handlers to global window object for direct HTML onclick bindings
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.loginWithDemo = loginWithDemo;
