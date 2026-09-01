/**
 * CloudVault - Centralized API Service & Notification Manager
 * Handles HTTP requests to the Flask backend with automatic Firebase Bearer token injection.
 */

import { auth } from "./firebase-config.js";

// Determine API Base URL dynamically
const getApiBaseUrl = () => {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://127.0.0.1:5000/api";
    }
    // Production default: relative or configured backend host
    return window.CLOUDVAULT_API_URL || "/api";
};

export const API_BASE = getApiBaseUrl();

/**
 * Toast Notification Utility
 * @param {string} message - Notification text
 * @param {'success'|'error'|'warning'|'info'} type - Toast type
 */
export function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";
    if (type === "info") icon = "ℹ️";

    toast.innerHTML = `
        <span style="font-size: 1.1rem;">${icon}</span>
        <div style="flex: 1; word-break: break-word;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Performs an authenticated fetch to the Flask REST API.
 * Automatically injects the Firebase Auth ID Token in Authorization header.
 */
export async function apiRequest(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers = options.headers || {};

    try {
        // Retrieve fresh ID token from Firebase Auth
        let token = null;
        if (auth.currentUser) {
            token = await auth.currentUser.getIdToken();
        } else {
            // Check for saved demo token in localStorage
            token = localStorage.getItem("cloudvault_auth_token");
        }

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // If body is NOT FormData, set application/json
        if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({
            success: false,
            message: `Server returned status ${response.status}`
        }));

        if (!response.ok) {
            const errorMsg = data.message || `Request failed (${response.status})`;
            throw new Error(errorMsg);
        }

        return data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
}

/**
 * Formats bytes to human readable format.
 */
export function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

/**
 * Formats ISO date string to readable format.
 */
export function formatDate(dateString) {
    if (!dateString) return "N/A";
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    } catch {
        return dateString;
    }
}
