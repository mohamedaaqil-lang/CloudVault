/**
 * CloudVault - Administrator Dashboard Controller
 * Enforces admin authorization, monitors system-wide documents, manages users and roles, and renders telemetry.
 */

import { apiRequest, showToast, formatBytes, formatDate } from "./api.js";
import { initAuthListener, handleLogout } from "./auth.js";

// State
let allUsers = [];
let allAdminDocuments = [];
let targetUserForRoleUpdate = null;
let adminDocToDeleteId = null;

// Chart instances
let adminCategoryChart = null;
let adminFileTypeChart = null;
let adminActivityChart = null;

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initAuthListener("protected_admin");
    setupAdminEventListeners();
    loadAdminDashboardData();
});

function setupAdminEventListeners() {
    // Mobile sidebar toggle
    const toggleBtn = document.getElementById("sidebarToggleBtn");
    const sidebar = document.getElementById("sidebar");
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
    }

    // Tab Navigation
    document.querySelectorAll("[data-tab]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const tabName = btn.getAttribute("data-tab");
            switchAdminTab(tabName);
            if (window.innerWidth <= 992 && sidebar) {
                sidebar.classList.remove("open");
            }
        });
    });

    // User Search & Filter Listeners
    const userSearch = document.getElementById("userSearchInput");
    const roleFilter = document.getElementById("userRoleFilter");
    if (userSearch) userSearch.addEventListener("input", applyUserFilters);
    if (roleFilter) roleFilter.addEventListener("change", applyUserFilters);

    // Document Search & Filter Listeners
    const docSearch = document.getElementById("adminDocSearchInput");
    const categoryFilter = document.getElementById("adminCategoryFilter");
    const fileTypeFilter = document.getElementById("adminFileTypeFilter");
    if (docSearch) docSearch.addEventListener("input", applyAdminDocFilters);
    if (categoryFilter) categoryFilter.addEventListener("change", applyAdminDocFilters);
    if (fileTypeFilter) fileTypeFilter.addEventListener("change", applyAdminDocFilters);
}

export function switchAdminTab(tabName) {
    document.querySelectorAll(".tab-content-section").forEach(sec => {
        sec.style.display = "none";
    });

    const activeSec = document.getElementById(`admin-tab-${tabName}`);
    if (activeSec) {
        activeSec.style.display = "block";
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        if (item.getAttribute("data-tab") === tabName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    if (tabName === "analytics") {
        loadAdminAnalytics();
    }
}
window.switchAdminTab = switchAdminTab;

// =========================================================================
// DATA LOADING
// =========================================================================
async function loadAdminDashboardData() {
    await Promise.all([
        loadAdminAnalytics(),
        loadAdminUsers(),
        loadAdminDocuments()
    ]);
}

async function loadAdminAnalytics() {
    try {
        const res = await apiRequest("/admin/analytics");
        if (res.success && res.analytics) {
            const data = res.analytics;
            
            // Stats
            const usersEl = document.getElementById("statAdminUsers");
            const docsEl = document.getElementById("statAdminDocs");
            const storageEl = document.getElementById("statAdminStorage");
            const foldersEl = document.getElementById("statAdminFolders");

            if (usersEl) usersEl.textContent = data.total_users || "0";
            if (docsEl) docsEl.textContent = data.total_documents || "0";
            if (storageEl) storageEl.textContent = data.total_storage_formatted || "0 B";
            if (foldersEl) foldersEl.textContent = data.total_folders || "0";

            renderAdminCharts(data);
        }
    } catch (err) {
        console.warn("Error fetching admin analytics:", err);
    }
}

async function loadAdminUsers() {
    try {
        const res = await apiRequest("/admin/users");
        if (res.success) {
            allUsers = res.users || [];
            renderAdminUsersTable(allUsers);
        }
    } catch (err) {
        console.error("Error fetching admin users:", err);
    }
}

async function loadAdminDocuments() {
    try {
        const res = await apiRequest("/admin/documents");
        if (res.success) {
            allAdminDocuments = res.documents || [];
            renderAdminDocumentsTable(allAdminDocuments);
        }
    } catch (err) {
        console.error("Error fetching admin documents:", err);
    }
}

// =========================================================================
// USER MANAGEMENT & ROLE MODIFICATION
// =========================================================================
function applyUserFilters() {
    const search = (document.getElementById("userSearchInput")?.value || "").toLowerCase().trim();
    const role = document.getElementById("userRoleFilter")?.value || "all";

    let filtered = [...allUsers];

    if (role !== "all") {
        filtered = filtered.filter(u => (u.role || "").toLowerCase() === role);
    }

    if (search) {
        filtered = filtered.filter(u => 
            (u.name || "").toLowerCase().includes(search) ||
            (u.email || "").toLowerCase().includes(search)
        );
    }

    renderAdminUsersTable(filtered);
}

function renderAdminUsersTable(users) {
    const container = document.getElementById("adminUsersTableContainer");
    const countBadge = document.getElementById("adminUsersCountBadge");
    if (countBadge) countBadge.textContent = `${users.length} Users`;
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <div class="empty-title">No Users Found</div>
                <p class="empty-desc">No registered users matched your current filter search.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User Name</th>
                        <th>Email Address</th>
                        <th>Role</th>
                        <th>Files</th>
                        <th>Storage Used</th>
                        <th>Joined</th>
                        <th style="text-align: right;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.65rem; font-weight: 600;">
                                    <div class="user-avatar" style="width: 32px; height: 32px; font-size: 0.85rem;">
                                        ${(u.name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <span>${escapeHtml(u.name || 'User')}</span>
                                </div>
                            </td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>
                                <span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-student'}">
                                    ${escapeHtml(u.role || 'student')}
                                </span>
                            </td>
                            <td>${u.document_count || 0}</td>
                            <td>${escapeHtml(u.storage_used_formatted || formatBytes(u.storage_used_bytes))}</td>
                            <td style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(u.created_at)}</td>
                            <td style="text-align: right;">
                                <button class="btn btn-secondary btn-sm" onclick="openChangeRoleModal('${u.uid}', '${escapeHtml(u.name)}', '${u.role}')">
                                    Change Role
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

export function openChangeRoleModal(uid, name, currentRole) {
    targetUserForRoleUpdate = uid;
    const modal = document.getElementById("changeRoleModal");
    const nameSpan = document.getElementById("changeRoleUserName");
    const roleSelect = document.getElementById("newRoleSelect");

    if (nameSpan) nameSpan.textContent = name;
    if (roleSelect) roleSelect.value = currentRole === "admin" ? "student" : "admin";
    if (modal) modal.classList.add("active");
}
window.openChangeRoleModal = openChangeRoleModal;

export async function submitChangeRole() {
    if (!targetUserForRoleUpdate) return;
    const roleSelect = document.getElementById("newRoleSelect");
    const newRole = roleSelect ? roleSelect.value : "student";

    try {
        const res = await apiRequest(`/admin/users/${targetUserForRoleUpdate}/role`, {
            method: "PUT",
            body: JSON.stringify({ role: newRole })
        });
        showToast(res.message || "User role updated successfully!", "success");
        closeAdminModal("changeRoleModal");
        targetUserForRoleUpdate = null;
        await loadAdminUsers();
    } catch (err) {
        showToast(err.message || "Failed to update user role.", "error");
    }
}
window.submitChangeRole = submitChangeRole;

// =========================================================================
// DOCUMENT MODERATION & MONITORING
// =========================================================================
function applyAdminDocFilters() {
    const search = (document.getElementById("adminDocSearchInput")?.value || "").toLowerCase().trim();
    const cat = document.getElementById("adminCategoryFilter")?.value || "All";
    const type = (document.getElementById("adminFileTypeFilter")?.value || "ALL").toUpperCase();

    let filtered = [...allAdminDocuments];

    if (cat !== "All") {
        filtered = filtered.filter(d => d.category === cat);
    }
    if (type !== "ALL") {
        filtered = filtered.filter(d => (d.fileType || "").toUpperCase() === type);
    }
    if (search) {
        filtered = filtered.filter(d => 
            (d.fileName || "").toLowerCase().includes(search) ||
            (d.userEmail || "").toLowerCase().includes(search) ||
            (d.userName || "").toLowerCase().includes(search)
        );
    }

    renderAdminDocumentsTable(filtered);
}

function renderAdminDocumentsTable(docs) {
    const container = document.getElementById("adminDocumentsTableContainer");
    const countBadge = document.getElementById("adminDocsCountBadge");
    if (countBadge) countBadge.textContent = `${docs.length} Documents`;
    if (!container) return;

    if (docs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <div class="empty-title">No Documents Found</div>
                <p class="empty-desc">No uploaded student documents match your current search.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Document</th>
                        <th>Owner</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Upload Date</th>
                        <th style="text-align: right;">Moderation Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${docs.map(doc => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.65rem; font-weight: 600;">
                                    <span>${getFileIcon(doc.fileType)}</span>
                                    <span title="${escapeHtml(doc.fileName)}">${escapeHtml(doc.fileName)}</span>
                                </div>
                            </td>
                            <td>
                                <div>
                                    <div style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(doc.userName || 'Student')}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(doc.userEmail || '')}</div>
                                </div>
                            </td>
                            <td><span class="category-pill">${escapeHtml(doc.category || 'General')}</span></td>
                            <td><span class="file-type-badge ${getBadgeClass(doc.fileType)}">${escapeHtml(doc.fileType)}</span></td>
                            <td>${escapeHtml(doc.fileSizeFormatted || formatBytes(doc.fileSize))}</td>
                            <td style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(doc.uploadDate)}</td>
                            <td style="text-align: right;">
                                <div style="display: inline-flex; gap: 0.35rem;">
                                    <button class="btn btn-secondary btn-sm" onclick="downloadAdminDoc('${doc.id}')">⬇️</button>
                                    <button class="btn btn-danger btn-sm" onclick="openAdminDeleteDocModal('${doc.id}', '${escapeHtml(doc.fileName)}')">🗑️ Moderate</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

export async function downloadAdminDoc(docId) {
    try {
        const res = await apiRequest(`/documents/${docId}/download`);
        if (res.success && res.download_url) {
            const link = document.createElement("a");
            link.href = res.download_url;
            link.download = res.filename || "file";
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    } catch (err) {
        showToast(err.message || "Failed to download document.", "error");
    }
}
window.downloadAdminDoc = downloadAdminDoc;

export function openAdminDeleteDocModal(docId, fileName) {
    adminDocToDeleteId = docId;
    const modal = document.getElementById("adminDeleteDocModal");
    const nameEl = document.getElementById("adminDeleteDocName");
    if (nameEl) nameEl.textContent = fileName;
    if (modal) modal.classList.add("active");
}
window.openAdminDeleteDocModal = openAdminDeleteDocModal;

export async function confirmAdminDeleteDoc() {
    if (!adminDocToDeleteId) return;
    const reasonInput = document.getElementById("adminDeleteReason");
    const reason = reasonInput ? reasonInput.value.trim() : "Moderation removal";

    try {
        const res = await apiRequest(`/admin/documents/${adminDocToDeleteId}?reason=${encodeURIComponent(reason)}`, {
            method: "DELETE"
        });
        showToast(res.message || "Document removed by Administrator.", "success");
        closeAdminModal("adminDeleteDocModal");
        adminDocToDeleteId = null;
        await loadAdminDocuments();
        await loadAdminAnalytics();
    } catch (err) {
        showToast(err.message || "Failed to delete document.", "error");
    }
}
window.confirmAdminDeleteDoc = confirmAdminDeleteDoc;

// =========================================================================
// SYSTEM TELEMETRY CHARTS
// =========================================================================
function renderAdminCharts(analytics) {
    if (typeof Chart === "undefined") return;

    // 1. Categories
    const catCanvas = document.getElementById("adminCategoryChart");
    if (catCanvas) {
        if (adminCategoryChart) adminCategoryChart.destroy();
        const labels = Object.keys(analytics.category_distribution || {});
        const data = Object.values(analytics.category_distribution || {});

        adminCategoryChart = new Chart(catCanvas, {
            type: "pie",
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: ["#2563eb", "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b", "#64748b"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom" } }
            }
        });
    }

    // 2. File Types
    const typeCanvas = document.getElementById("adminFileTypeChart");
    if (typeCanvas) {
        if (adminFileTypeChart) adminFileTypeChart.destroy();
        const labels = Object.keys(analytics.file_type_distribution || {});
        const data = Object.values(analytics.file_type_distribution || {});

        adminFileTypeChart = new Chart(typeCanvas, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Files",
                    data,
                    backgroundColor: "#6366f1",
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // 3. System Upload Timeline
    const timelineCanvas = document.getElementById("adminActivityChart");
    if (timelineCanvas) {
        if (adminActivityChart) adminActivityChart.destroy();
        const timeline = analytics.activity_timeline || { labels: [], data: [] };

        adminActivityChart = new Chart(timelineCanvas, {
            type: "line",
            data: {
                labels: timeline.labels,
                datasets: [{
                    label: "Total System Uploads",
                    data: timeline.data,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

// Utilities
export function closeAdminModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}
window.closeAdminModal = closeAdminModal;

function getBadgeClass(fileType) {
    const ft = (fileType || "").toLowerCase();
    if (ft === "pdf") return "badge-pdf";
    if (ft === "doc" || ft === "docx") return "badge-doc";
    if (ft === "txt") return "badge-txt";
    if (ft === "jpg" || ft === "jpeg" || ft === "png") return "badge-jpg";
    return "badge-other";
}

function getFileIcon(fileType) {
    const ft = (fileType || "").toLowerCase();
    if (ft === "pdf") return "📕";
    if (ft === "doc" || ft === "docx") return "📘";
    if (ft === "txt") return "📄";
    if (ft === "jpg" || ft === "jpeg" || ft === "png") return "🖼️";
    return "📁";
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
