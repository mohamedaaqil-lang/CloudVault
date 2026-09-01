/**
 * CloudVault - Student Dashboard Controller
 * Manages document uploads, folders, interactive search/filters, modals, and Chart.js analytics.
 */

import { apiRequest, showToast, formatBytes, formatDate } from "./api.js";
import { initAuthListener, handleLogout } from "./auth.js";

// State
let allDocuments = [];
let allFolders = [];
let currentFolderId = null;
let currentViewMode = "table"; // 'table' | 'grid'
let userProfile = null;
let selectedUploadFile = null;
let docToDeleteId = null;
let folderToDeleteId = null;
let folderToRenameId = null;

// Chart.js Instances
let categoryChartInstance = null;
let fileTypeChartInstance = null;
let timelineChartInstance = null;

// =========================================================================
// INITIALIZATION
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initAuthListener("protected_student");
    setupEventListeners();
    setupDragAndDrop();
    loadDashboardData();
});

function setupEventListeners() {
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
            switchTab(tabName);
            if (window.innerWidth <= 992 && sidebar) {
                sidebar.classList.remove("open");
            }
        });
    });

    // Search and Filter Listeners
    const searchInput = document.getElementById("docSearchInput");
    const topNavSearch = document.getElementById("topNavSearch");
    const categorySelect = document.getElementById("categoryFilter");
    const folderSelect = document.getElementById("folderFilter");
    const fileTypeSelect = document.getElementById("fileTypeFilter");
    const sortSelect = document.getElementById("sortSelect");

    if (searchInput) searchInput.addEventListener("input", applyDocumentFilters);
    if (topNavSearch) {
        topNavSearch.addEventListener("input", (e) => {
            if (searchInput) searchInput.value = e.target.value;
            switchTab("documents");
            applyDocumentFilters();
        });
    }
    if (categorySelect) categorySelect.addEventListener("change", applyDocumentFilters);
    if (folderSelect) folderSelect.addEventListener("change", applyDocumentFilters);
    if (fileTypeSelect) fileTypeSelect.addEventListener("change", applyDocumentFilters);
    if (sortSelect) sortSelect.addEventListener("change", applyDocumentFilters);

    // View Mode Toggle (Table / Grid)
    const tableViewBtn = document.getElementById("tableViewBtn");
    const gridViewBtn = document.getElementById("gridViewBtn");
    if (tableViewBtn) {
        tableViewBtn.addEventListener("click", () => {
            currentViewMode = "table";
            tableViewBtn.classList.add("btn-primary");
            tableViewBtn.classList.remove("btn-secondary");
            if (gridViewBtn) {
                gridViewBtn.classList.add("btn-secondary");
                gridViewBtn.classList.remove("btn-primary");
            }
            renderDocuments();
        });
    }
    if (gridViewBtn) {
        gridViewBtn.addEventListener("click", () => {
            currentViewMode = "grid";
            gridViewBtn.classList.add("btn-primary");
            gridViewBtn.classList.remove("btn-secondary");
            if (tableViewBtn) {
                tableViewBtn.classList.add("btn-secondary");
                tableViewBtn.classList.remove("btn-primary");
            }
            renderDocuments();
        });
    }
}

// =========================================================================
// TAB SWITCHING
// =========================================================================
export function switchTab(tabName) {
    document.querySelectorAll(".tab-content-section").forEach(sec => {
        sec.style.display = "none";
    });

    const activeSection = document.getElementById(`tab-${tabName}`);
    if (activeSection) {
        activeSection.style.display = "block";
    }

    // Update active nav button
    document.querySelectorAll(".nav-item").forEach(item => {
        if (item.getAttribute("data-tab") === tabName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    if (tabName === "analytics") {
        loadAnalyticsData();
    }
}
window.switchTab = switchTab;

// =========================================================================
// DATA LOADING
// =========================================================================
async function loadDashboardData() {
    await Promise.all([
        fetchUserProfile(),
        fetchFolders(),
        fetchDocuments()
    ]);
    loadAnalyticsData();
}

async function fetchUserProfile() {
    try {
        const data = await apiRequest("/user/profile");
        if (data.success && data.user) {
            userProfile = data.user;
            
            // Populate UI Elements
            const nameEls = document.querySelectorAll(".user-display-name");
            const emailEls = document.querySelectorAll(".user-display-email");
            const avatarEls = document.querySelectorAll(".user-avatar-initial");
            const roleBadges = document.querySelectorAll(".user-role-text");
            const storageText = document.getElementById("sidebarStorageText");
            const storageBar = document.getElementById("sidebarStorageBar");
            const adminSwitch = document.getElementById("adminPortalLink");

            nameEls.forEach(el => el.textContent = userProfile.name || "Student");
            emailEls.forEach(el => el.textContent = userProfile.email || "");
            avatarEls.forEach(el => el.textContent = (userProfile.name || "S").charAt(0).toUpperCase());
            roleBadges.forEach(el => el.textContent = userProfile.role || "Student");

            if (adminSwitch) {
                adminSwitch.style.display = userProfile.role === "admin" ? "flex" : "none";
            }

            const usedBytes = userProfile.storage_used_bytes || 0;
            const quotaBytes = 1 * 1024 * 1024 * 1024; // 1 GB
            const pct = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

            if (storageText) storageText.textContent = `${formatBytes(usedBytes)} / 1 GB`;
            if (storageBar) storageBar.style.width = `${pct}%`;

            // Stat Cards
            const statDocs = document.getElementById("statTotalDocs");
            const statStorage = document.getElementById("statTotalStorage");
            const statFolders = document.getElementById("statTotalFolders");
            if (statDocs) statDocs.textContent = userProfile.document_count || "0";
            if (statStorage) statStorage.textContent = userProfile.storage_formatted || "0 B";
            if (statFolders) statFolders.textContent = userProfile.folder_count || "0";
        }
    } catch (err) {
        console.warn("Error loading profile:", err);
    }
}

async function fetchFolders() {
    try {
        const data = await apiRequest("/folders");
        if (data.success) {
            allFolders = data.folders || [];
            populateFolderDropdowns();
            renderFoldersGrid();
        }
    } catch (err) {
        console.error("Error fetching folders:", err);
    }
}

async function fetchDocuments() {
    try {
        const data = await apiRequest("/documents");
        if (data.success) {
            allDocuments = data.documents || [];
            renderDocuments();
            renderRecentUploadsTable();
        }
    } catch (err) {
        console.error("Error fetching documents:", err);
    }
}

// =========================================================================
// DRAG AND DROP UPLOAD HANDLER
// =========================================================================
function setupDragAndDrop() {
    const dropZone = document.getElementById("uploadDropZone");
    const fileInput = document.getElementById("fileInput");

    if (!dropZone || !fileInput) return;

    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("dragover");
        });
    });

    dropZone.addEventListener("drop", (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleSelectedFile(files[0]);
        }
    });

    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            handleSelectedFile(fileInput.files[0]);
        }
    });
}

function handleSelectedFile(file) {
    selectedUploadFile = file;
    const indicator = document.getElementById("fileSelectedIndicator");
    const fileNameSpan = document.getElementById("selectedFileName");
    const fileSizeSpan = document.getElementById("selectedFileSize");
    const startUploadBtn = document.getElementById("startUploadBtn");

    if (indicator && fileNameSpan && fileSizeSpan) {
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = formatBytes(file.size);
        indicator.style.display = "flex";
    }

    if (startUploadBtn) {
        startUploadBtn.disabled = false;
    }
}

export async function uploadDocumentSubmit() {
    if (!selectedUploadFile) {
        showToast("Please select a file to upload.", "warning");
        return;
    }

    const categorySelect = document.getElementById("uploadCategorySelect");
    const folderSelect = document.getElementById("uploadFolderSelect");
    const startUploadBtn = document.getElementById("startUploadBtn");
    const progressBox = document.getElementById("uploadProgressBox");
    const progressBar = document.getElementById("uploadProgressBar");
    const progressText = document.getElementById("uploadProgressText");

    const category = categorySelect ? categorySelect.value : "General";
    const folderId = folderSelect ? folderSelect.value : "";
    let folderName = "";
    if (folderId) {
        const f = allFolders.find(x => x.id === folderId);
        if (f) folderName = f.name;
    }

    const formData = new FormData();
    formData.append("file", selectedUploadFile);
    formData.append("category", category);
    if (folderId) formData.append("folder_id", folderId);
    if (folderName) formData.append("folder_name", folderName);

    if (startUploadBtn) {
        startUploadBtn.disabled = true;
        startUploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';
    }

    if (progressBox && progressBar && progressText) {
        progressBox.classList.add("active");
        progressBar.style.width = "40%";
        progressText.textContent = "Encrypting & uploading to Cloud Storage...";
    }

    try {
        const response = await apiRequest("/documents/upload", {
            method: "POST",
            body: formData
        });

        if (progressBar && progressText) {
            progressBar.style.width = "100%";
            progressText.textContent = "Upload complete!";
        }

        showToast(response.message || "File uploaded successfully!", "success");

        // Reset upload form
        selectedUploadFile = null;
        const fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.value = "";
        const indicator = document.getElementById("fileSelectedIndicator");
        if (indicator) indicator.style.display = "none";

        // Refresh data
        await fetchUserProfile();
        await fetchFolders();
        await fetchDocuments();

        setTimeout(() => {
            if (progressBox) progressBox.classList.remove("active");
            switchTab("documents");
        }, 800);

    } catch (err) {
        showToast(err.message || "File upload failed.", "error");
        if (progressBox) progressBox.classList.remove("active");
    } finally {
        if (startUploadBtn) {
            startUploadBtn.disabled = false;
            startUploadBtn.innerHTML = "Upload to CloudVault";
        }
    }
}
window.uploadDocumentSubmit = uploadDocumentSubmit;

// =========================================================================
// FOLDERS MANAGEMENT & RENDERING
// =========================================================================
function populateFolderDropdowns() {
    const uploadFolderSelect = document.getElementById("uploadFolderSelect");
    const filterFolderSelect = document.getElementById("folderFilter");

    const generateOptions = (includeAll) => {
        let opts = includeAll ? '<option value="all">All Folders</option><option value="root">Root (No Folder)</option>' : '<option value="">No Folder (Root)</option>';
        allFolders.forEach(f => {
            opts += `<option value="${f.id}">📁 ${escapeHtml(f.name)} (${f.document_count || 0})</option>`;
        });
        return opts;
    };

    if (uploadFolderSelect) uploadFolderSelect.innerHTML = generateOptions(false);
    if (filterFolderSelect) filterFolderSelect.innerHTML = generateOptions(true);
}

function renderFoldersGrid() {
    const container = document.getElementById("foldersGridContainer");
    if (!container) return;

    if (allFolders.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">📁</div>
                <div class="empty-title">No Folders Created Yet</div>
                <p class="empty-desc">Create folders to organize your semester notes, assignments, and certificates.</p>
                <button class="btn btn-primary btn-sm" onclick="openCreateFolderModal()">+ Create Folder</button>
            </div>
        `;
        return;
    }

    container.innerHTML = allFolders.map(folder => `
        <div class="folder-card ${currentFolderId === folder.id ? 'active-folder' : ''}" onclick="selectFolderFilter('${folder.id}')">
            <div class="folder-top">
                <span class="folder-icon" style="color: ${folder.color || '#2563eb'};">📁</span>
                <div class="folder-actions-dropdown" onclick="event.stopPropagation()">
                    <button class="btn btn-icon btn-secondary btn-sm" onclick="openFolderContextMenu('${folder.id}', '${escapeHtml(folder.name)}')">
                        ⋮
                    </button>
                </div>
            </div>
            <div>
                <div class="folder-name">${escapeHtml(folder.name)}</div>
                <div class="folder-meta">${folder.document_count || 0} files • ${folder.total_size_formatted || '0 B'}</div>
            </div>
        </div>
    `).join("");
}

export function selectFolderFilter(folderId) {
    currentFolderId = (currentFolderId === folderId) ? null : folderId;
    const filterFolderSelect = document.getElementById("folderFilter");
    if (filterFolderSelect) {
        filterFolderSelect.value = currentFolderId || "all";
    }
    renderFoldersGrid();
    switchTab("documents");
    applyDocumentFilters();
}
window.selectFolderFilter = selectFolderFilter;

export function openCreateFolderModal() {
    const modal = document.getElementById("createFolderModal");
    const nameInput = document.getElementById("newFolderName");
    if (nameInput) nameInput.value = "";
    if (modal) modal.classList.add("active");
}
window.openCreateFolderModal = openCreateFolderModal;

export async function submitCreateFolder() {
    const nameInput = document.getElementById("newFolderName");
    const colorInput = document.getElementById("newFolderColor");
    const name = nameInput ? nameInput.value.trim() : "";
    const color = colorInput ? colorInput.value : "#2563eb";

    if (!name) {
        showToast("Please provide a folder name.", "warning");
        return;
    }

    try {
        const res = await apiRequest("/folders", {
            method: "POST",
            body: JSON.stringify({ name, color })
        });
        showToast(res.message || "Folder created!", "success");
        closeModal("createFolderModal");
        await fetchFolders();
        await fetchUserProfile();
    } catch (err) {
        showToast(err.message || "Failed to create folder.", "error");
    }
}
window.submitCreateFolder = submitCreateFolder;

export function openFolderContextMenu(folderId, folderName) {
    folderToRenameId = folderId;
    folderToDeleteId = folderId;
    const modal = document.getElementById("folderOptionsModal");
    const title = document.getElementById("folderOptionsTitle");
    if (title) title.textContent = `Folder: ${folderName}`;
    if (modal) modal.classList.add("active");
}
window.openFolderContextMenu = openFolderContextMenu;

export function triggerRenameFolder() {
    closeModal("folderOptionsModal");
    const folder = allFolders.find(f => f.id === folderToRenameId);
    if (!folder) return;
    const modal = document.getElementById("renameFolderModal");
    const input = document.getElementById("renameFolderName");
    if (input) input.value = folder.name;
    if (modal) modal.classList.add("active");
}
window.triggerRenameFolder = triggerRenameFolder;

export async function submitRenameFolder() {
    const input = document.getElementById("renameFolderName");
    const name = input ? input.value.trim() : "";
    if (!name) {
        showToast("Folder name cannot be empty.", "warning");
        return;
    }

    try {
        await apiRequest(`/folders/${folderToRenameId}`, {
            method: "PUT",
            body: JSON.stringify({ name })
        });
        showToast("Folder renamed successfully.", "success");
        closeModal("renameFolderModal");
        await fetchFolders();
        await fetchDocuments();
    } catch (err) {
        showToast(err.message || "Failed to rename folder.", "error");
    }
}
window.submitRenameFolder = submitRenameFolder;

export function triggerDeleteFolder() {
    closeModal("folderOptionsModal");
    const modal = document.getElementById("deleteFolderModal");
    if (modal) modal.classList.add("active");
}
window.triggerDeleteFolder = triggerDeleteFolder;

export async function confirmDeleteFolder() {
    const keepFilesCheckbox = document.getElementById("deleteFolderKeepFiles");
    const deleteFiles = keepFilesCheckbox ? !keepFilesCheckbox.checked : false;

    try {
        const res = await apiRequest(`/folders/${folderToDeleteId}?delete_files=${deleteFiles}`, {
            method: "DELETE"
        });
        showToast(res.message || "Folder deleted.", "success");
        closeModal("deleteFolderModal");
        currentFolderId = null;
        await fetchUserProfile();
        await fetchFolders();
        await fetchDocuments();
    } catch (err) {
        showToast(err.message || "Failed to delete folder.", "error");
    }
}
window.confirmDeleteFolder = confirmDeleteFolder;

// =========================================================================
// DOCUMENTS MANAGEMENT & RENDERING
// =========================================================================
function applyDocumentFilters() {
    const searchVal = (document.getElementById("docSearchInput")?.value || "").toLowerCase().trim();
    const categoryVal = document.getElementById("categoryFilter")?.value || "All";
    const folderVal = document.getElementById("folderFilter")?.value || "all";
    const fileTypeVal = (document.getElementById("fileTypeFilter")?.value || "ALL").toUpperCase();
    const sortVal = document.getElementById("sortSelect")?.value || "newest";

    let filtered = [...allDocuments];

    // Category
    if (categoryVal !== "All") {
        filtered = filtered.filter(d => d.category === categoryVal);
    }

    // Folder
    if (folderVal !== "all") {
        if (folderVal === "root") {
            filtered = filtered.filter(d => !d.folderId);
        } else {
            filtered = filtered.filter(d => d.folderId === folderVal);
        }
    }

    // File Type
    if (fileTypeVal !== "ALL") {
        filtered = filtered.filter(d => (d.fileType || "").toUpperCase() === fileTypeVal);
    }

    // Search query
    if (searchVal) {
        filtered = filtered.filter(d => 
            (d.fileName || "").toLowerCase().includes(searchVal) ||
            (d.category || "").toLowerCase().includes(searchVal) ||
            (d.folderName || "").toLowerCase().includes(searchVal)
        );
    }

    // Sorting
    if (sortVal === "oldest") {
        filtered.sort((a, b) => new Date(a.uploadDate) - new Date(b.uploadDate));
    } else if (sortVal === "name_asc") {
        filtered.sort((a, b) => (a.fileName || "").localeCompare(b.fileName || ""));
    } else if (sortVal === "name_desc") {
        filtered.sort((a, b) => (b.fileName || "").localeCompare(a.fileName || ""));
    } else if (sortVal === "size_desc") {
        filtered.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
    } else if (sortVal === "size_asc") {
        filtered.sort((a, b) => (a.fileSize || 0) - (b.fileSize || 0));
    } else { // newest
        filtered.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    }

    renderFilteredDocuments(filtered);
}

function renderDocuments() {
    applyDocumentFilters();
}

function getBadgeClass(fileType) {
    const ft = (fileType || "").toLowerCase();
    if (ft === "pdf") return "badge-pdf";
    if (ft === "doc" || ft === "docx") return "badge-doc";
    if (ft === "txt") return "badge-txt";
    if (ft === "jpg" || ft === "jpeg" || ft === "png") return "badge-jpg";
    return "badge-other";
}

function renderFilteredDocuments(docs) {
    const tableContainer = document.getElementById("documentsTableContainer");
    const gridContainer = document.getElementById("documentsGridContainer");
    const countBadge = document.getElementById("documentsCountBadge");

    if (countBadge) countBadge.textContent = `${docs.length} Documents`;

    if (docs.length === 0) {
        const emptyHtml = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <div class="empty-title">No Documents Found</div>
                <p class="empty-desc">No academic documents match your current filter or search criteria.</p>
                <button class="btn btn-primary btn-sm" onclick="switchTab('upload')">Upload New Document</button>
            </div>
        `;
        if (tableContainer) tableContainer.innerHTML = emptyHtml;
        if (gridContainer) gridContainer.innerHTML = emptyHtml;
        return;
    }

    if (currentViewMode === "table") {
        if (tableContainer) tableContainer.style.display = "block";
        if (gridContainer) gridContainer.style.display = "none";

        tableContainer.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>File Name</th>
                            <th>Category</th>
                            <th>Folder</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Uploaded</th>
                            <th style="text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${docs.map(doc => `
                            <tr>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 0.65rem; font-weight: 600;">
                                        <span style="font-size: 1.25rem;">${getFileIcon(doc.fileType)}</span>
                                        <span title="${escapeHtml(doc.fileName)}">${escapeHtml(doc.fileName)}</span>
                                    </div>
                                </td>
                                <td><span class="category-pill">${escapeHtml(doc.category || 'General')}</span></td>
                                <td><span style="color: var(--text-muted); font-size: 0.85rem;">📁 ${escapeHtml(doc.folderName || 'Root')}</span></td>
                                <td><span class="file-type-badge ${getBadgeClass(doc.fileType)}">${escapeHtml(doc.fileType)}</span></td>
                                <td>${escapeHtml(doc.fileSizeFormatted || formatBytes(doc.fileSize))}</td>
                                <td style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(doc.uploadDate)}</td>
                                <td style="text-align: right;">
                                    <div style="display: inline-flex; gap: 0.4rem;">
                                        <button class="btn btn-secondary btn-sm" title="Preview" onclick="viewDocument('${doc.id}')">👁️ View</button>
                                        <button class="btn btn-secondary btn-sm" title="Download" onclick="downloadDocument('${doc.id}')">⬇️</button>
                                        <button class="btn btn-danger btn-sm" title="Delete" onclick="openDeleteDocModal('${doc.id}', '${escapeHtml(doc.fileName)}')">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        if (tableContainer) tableContainer.style.display = "none";
        if (gridContainer) gridContainer.style.display = "grid";

        gridContainer.innerHTML = docs.map(doc => `
            <div class="doc-card">
                <div class="doc-card-header">
                    <span class="file-type-badge ${getBadgeClass(doc.fileType)}">${escapeHtml(doc.fileType)}</span>
                    <span class="category-pill">${escapeHtml(doc.category || 'General')}</span>
                </div>
                <div style="font-size: 2.2rem; text-align: center; margin: 0.75rem 0;">
                    ${getFileIcon(doc.fileType)}
                </div>
                <div>
                    <div class="doc-card-title" title="${escapeHtml(doc.fileName)}">${escapeHtml(doc.fileName)}</div>
                    <div class="doc-card-meta">
                        <span>📁 ${escapeHtml(doc.folderName || 'Root')}</span>
                        <span>📦 ${escapeHtml(doc.fileSizeFormatted || formatBytes(doc.fileSize))} • 📅 ${formatDate(doc.uploadDate)}</span>
                    </div>
                </div>
                <div class="doc-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewDocument('${doc.id}')">👁️ View</button>
                    <div style="display: flex; gap: 0.35rem;">
                        <button class="btn btn-secondary btn-sm" onclick="downloadDocument('${doc.id}')">⬇️</button>
                        <button class="btn btn-danger btn-sm" onclick="openDeleteDocModal('${doc.id}', '${escapeHtml(doc.fileName)}')">🗑️</button>
                    </div>
                </div>
            </div>
        `).join("");
    }
}

function renderRecentUploadsTable() {
    const container = document.getElementById("recentUploadsContainer");
    if (!container) return;

    const recents = [...allDocuments].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).slice(0, 5);

    if (recents.length === 0) {
        container.innerHTML = `<p style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No recent uploads found.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Category</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th style="text-align: right;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${recents.map(doc => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
                                    <span>${getFileIcon(doc.fileType)}</span>
                                    <span>${escapeHtml(doc.fileName)}</span>
                                </div>
                            </td>
                            <td><span class="category-pill">${escapeHtml(doc.category || 'General')}</span></td>
                            <td>${escapeHtml(doc.fileSizeFormatted || formatBytes(doc.fileSize))}</td>
                            <td style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(doc.uploadDate)}</td>
                            <td style="text-align: right;">
                                <button class="btn btn-secondary btn-sm" onclick="downloadDocument('${doc.id}')">⬇️ Download</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function getFileIcon(fileType) {
    const ft = (fileType || "").toLowerCase();
    if (ft === "pdf") return "📕";
    if (ft === "doc" || ft === "docx") return "📘";
    if (ft === "txt") return "📄";
    if (ft === "jpg" || ft === "jpeg" || ft === "png") return "🖼️";
    return "📁";
}

// =========================================================================
// DOCUMENT ACTIONS: VIEW, DOWNLOAD, DELETE
// =========================================================================
export async function viewDocument(documentId) {
    try {
        showToast("Generating secure preview link...", "info");
        const res = await apiRequest(`/documents/${documentId}/view`);
        
        if (res.success) {
            const modal = document.getElementById("documentPreviewModal");
            const previewContainer = document.getElementById("previewModalBody");
            const title = document.getElementById("previewModalTitle");

            if (title) title.textContent = res.document?.fileName || "Document Preview";

            const fileType = (res.document?.fileType || "").toLowerCase();
            const url = res.preview_url;

            if (fileType === "pdf") {
                previewContainer.innerHTML = `
                    <iframe src="${url}" class="preview-frame" frameborder="0"></iframe>
                `;
            } else if (["jpg", "jpeg", "png"].includes(fileType)) {
                previewContainer.innerHTML = `
                    <img src="${url}" alt="Preview" class="preview-image" />
                `;
            } else {
                previewContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">${getFileIcon(fileType)}</div>
                        <div class="empty-title">${escapeHtml(res.document?.fileName)}</div>
                        <p class="empty-desc">Direct inline preview is not supported for .${fileType} files in the browser.</p>
                        <button class="btn btn-primary" onclick="downloadDocument('${documentId}')">Download File</button>
                    </div>
                `;
            }

            if (modal) modal.classList.add("active");
        }
    } catch (err) {
        showToast(err.message || "Failed to view document.", "error");
    }
}
window.viewDocument = viewDocument;

export async function downloadDocument(documentId) {
    try {
        showToast("Generating secure signed download link...", "info");
        const res = await apiRequest(`/documents/${documentId}/download`);

        if (res.success && res.download_url) {
            // Trigger download via hidden anchor
            const link = document.createElement("a");
            link.href = res.download_url;
            link.download = res.filename || "document";
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast("Download started!", "success");
        }
    } catch (err) {
        showToast(err.message || "Failed to download document.", "error");
    }
}
window.downloadDocument = downloadDocument;

export function openDeleteDocModal(docId, fileName) {
    docToDeleteId = docId;
    const modal = document.getElementById("deleteDocModal");
    const nameEl = document.getElementById("deleteDocName");
    if (nameEl) nameEl.textContent = fileName;
    if (modal) modal.classList.add("active");
}
window.openDeleteDocModal = openDeleteDocModal;

export async function confirmDeleteDocument() {
    if (!docToDeleteId) return;

    try {
        const res = await apiRequest(`/documents/${docToDeleteId}`, {
            method: "DELETE"
        });
        showToast(res.message || "Document deleted successfully.", "success");
        closeModal("deleteDocModal");
        docToDeleteId = null;

        await fetchUserProfile();
        await fetchFolders();
        await fetchDocuments();
    } catch (err) {
        showToast(err.message || "Failed to delete document.", "error");
    }
}
window.confirmDeleteDocument = confirmDeleteDocument;

// =========================================================================
// ANALYTICS & CHART.JS RENDERING
// =========================================================================
async function loadAnalyticsData() {
    try {
        const res = await apiRequest("/analytics");
        if (res.success && res.analytics) {
            renderCharts(res.analytics);
        }
    } catch (err) {
        console.warn("Analytics load error:", err);
    }
}

function renderCharts(analytics) {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js not loaded.");
        return;
    }

    // 1. Categories Doughnut Chart
    const catCanvas = document.getElementById("categoryChart");
    if (catCanvas) {
        if (categoryChartInstance) categoryChartInstance.destroy();
        const catLabels = Object.keys(analytics.categories || {});
        const catData = Object.values(analytics.categories || {});

        categoryChartInstance = new Chart(catCanvas, {
            type: "doughnut",
            data: {
                labels: catLabels,
                datasets: [{
                    data: catData,
                    backgroundColor: ["#2563eb", "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b", "#64748b"],
                    borderWidth: 2,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom" }
                },
                cutout: "70%"
            }
        });
    }

    // 2. File Types Bar Chart
    const typeCanvas = document.getElementById("fileTypeChart");
    if (typeCanvas) {
        if (fileTypeChartInstance) fileTypeChartInstance.destroy();
        const typeLabels = Object.keys(analytics.file_types || {});
        const typeData = Object.values(analytics.file_types || {});

        fileTypeChartInstance = new Chart(typeCanvas, {
            type: "bar",
            data: {
                labels: typeLabels.length ? typeLabels : ["None"],
                datasets: [{
                    label: "Count",
                    data: typeData.length ? typeData : [0],
                    backgroundColor: "#3b82f6",
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    // 3. Upload Activity Line Chart
    const timelineCanvas = document.getElementById("timelineChart");
    if (timelineCanvas) {
        if (timelineChartInstance) timelineChartInstance.destroy();
        const timeline = analytics.upload_timeline || { labels: [], data: [] };

        timelineChartInstance = new Chart(timelineCanvas, {
            type: "line",
            data: {
                labels: timeline.labels,
                datasets: [{
                    label: "Uploads",
                    data: timeline.data,
                    borderColor: "#2563eb",
                    backgroundColor: "rgba(37, 99, 235, 0.1)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: "#2563eb"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}

// =========================================================================
// MODAL HELPERS & UTILITIES
// =========================================================================
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}
window.closeModal = closeModal;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
